import { ArrayMaxSize, IsArray, IsDefined, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Response } from 'express';
import { Body, Controller, HeaderParam, Param, Put, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { IAF_VOF_CLASSIFICATION_OWNER_PARAMETER_KEY } from '@/config/iaf-vof-investigation-classification';
import { Errand, Parameter } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import ApiService from '@/services/api.service';
import { assertSupportErrandWritable, getErrandVersion, stripParameterVersions } from '@/services/support-errand.service';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { apiURL } from '@/utils/util';

export class UpdateSupportErrandParameterDto {
  @IsDefined()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(3000, { each: true })
  @ArrayMaxSize(1000)
  values!: string[];

  /** Only used when the parameter is created; an existing parameter keeps the presentation it has. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  group?: string;
}

type WritableParameter = Omit<Parameter, 'version'>;

const STRONG_VERSION_ETAG_PATTERN = /^"(0|[1-9]\d*)"$/u;

/**
 * Writes one errand parameter, conditioned on that parameter's own version.
 *
 * Support Management versions each parameter separately and exposes a per-key route for it, so a
 * conflict can be detected where it actually happens. The errand's own version is a roll-up of
 * everything beneath it and is deliberately not used as the precondition here: somebody editing an
 * unrelated field must not fail a write to this parameter, and this write must not silently
 * overwrite the parameters that write touched.
 *
 * That is exactly what the three collection-level writers it replaces did - the generic errand
 * PATCH, the facilities route and the recruitment tab all sent the whole parameter array, so each
 * of them rewrote every parameter on the errand whether or not the user had touched it.
 */
@Controller()
@UseBefore(hasPermissions(['canEditSupportManagement']))
export class SupportErrandParameterController {
  private apiService = new ApiService();
  private investigationPolicyService = new SupportInvestigationPolicyService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  SERVICE = apiServiceName('supportmanagement');

  @Put('/supporterrands/:municipalityId/:id/parameters/:key')
  @OpenAPI({ summary: 'Create or update one parameter on a support errand' })
  @UseBefore(authMiddleware, validationMiddleware(UpdateSupportErrandParameterDto, 'body'))
  async writeParameter(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('id') id: string,
    @Param('key') key: string,
    @HeaderParam('If-Match') ifMatch: string,
    @HeaderParam('If-None-Match') ifNoneMatch: string,
    @Body() data: UpdateSupportErrandParameterDto,
    @Res() response: Response,
  ): Promise<Response> {
    if (!municipalityId || !id) throw new HttpException(400, 'Bad Request');
    this.assertWritableParameterKey(key);
    assertExactlyOnePrecondition(ifMatch, ifNoneMatch);

    const baseURL = apiURL(this.SERVICE);
    const errandUrl = `${municipalityId}/${this.namespace}/errands/${id}`;
    const currentErrandResponse = await this.apiService.get<Errand>(
      { url: errandUrl, baseURL, includeResponseHeaders: true, propagateClientError: true },
      req.user,
    );
    const currentErrand = currentErrandResponse.data;
    assertSupportErrandWritable(currentErrand, 'parameter changes');

    // An absent collection is not an empty one. Reading it as empty would drop every other
    // parameter on the errand the moment this parameter has to be created.
    if (!Array.isArray(currentErrand.parameters)) {
      throw new HttpException(502, 'Support Management response is missing the errand parameters');
    }

    const existing = currentErrand.parameters.find(parameter => parameter.key === key);
    const saved = existing
      ? await this.updateExistingParameter(req, baseURL, errandUrl, key, existing, ifMatch, data)
      : await this.createParameter(req, baseURL, errandUrl, key, currentErrand, currentErrandResponse.headers?.etag, ifNoneMatch, data);

    if (typeof saved.version === 'number') response.setHeader('ETag', `"${saved.version}"`);
    return response.status(existing ? 200 : 201).send(saved);
  }

  /**
   * The classification owner selector decides which investigation document owns the errand's
   * categorization. It moves through the classification command that is built to move it, never
   * through a generic parameter write.
   */
  private assertWritableParameterKey(key: string): void {
    if (!key.trim()) throw new HttpException(400, 'A parameter key is required');
    if (this.investigationPolicyService.iafVofClassificationPolicy && key.trim() === IAF_VOF_CLASSIFICATION_OWNER_PARAMETER_KEY) {
      throw new HttpException(409, `The ${key} parameter cannot be changed through the parameter endpoint`);
    }
  }

  private async updateExistingParameter(
    req: RequestWithUser,
    baseURL: string,
    errandUrl: string,
    key: string,
    existing: Parameter,
    ifMatch: string | undefined,
    data: UpdateSupportErrandParameterDto,
  ): Promise<Parameter> {
    if (ifMatch === undefined) {
      throw new HttpException(428, 'If-Match is required when updating an existing parameter');
    }
    if (typeof existing.version !== 'number' || !Number.isSafeInteger(existing.version)) {
      throw new HttpException(502, 'Support Management returned a parameter without a version');
    }
    if (ifMatch !== `"${existing.version}"`) {
      throw new HttpException(412, 'If-Match does not match the current parameter version');
    }

    // The per-key route replaces the parameter's values and takes the parameter's own ETag, so the
    // conflict is decided upstream on the parameter rather than on the errand around it.
    const saved = await this.apiService.patch<Parameter, string[]>(
      {
        url: `${errandUrl}/parameters/${encodeURIComponent(key)}`,
        baseURL,
        data: data.values,
        headers: { 'If-Match': `"${existing.version}"` },
        followLocation: false,
        propagateClientError: true,
      },
      req.user,
    );
    return saved.data;
  }

  /**
   * Support Management has no create route for a single parameter: a new key is added by writing the
   * collection, which replaces it. Every existing parameter is therefore carried over from a read
   * taken immediately before, and the errand's version conditions that write - the one place where
   * the errand-level version is the right precondition, because the collection is what changes.
   */
  private async createParameter(
    req: RequestWithUser,
    baseURL: string,
    errandUrl: string,
    key: string,
    currentErrand: Errand,
    errandETag: unknown,
    ifNoneMatch: string | undefined,
    data: UpdateSupportErrandParameterDto,
  ): Promise<Parameter> {
    if (ifNoneMatch === undefined) {
      throw new HttpException(412, 'If-Match was sent for a parameter that does not exist');
    }

    const currentVersion = getErrandVersion(currentErrand, errandETag);
    const created: WritableParameter = {
      key,
      values: data.values,
      ...(data.displayName ? { displayName: data.displayName } : {}),
      ...(data.group ? { group: data.group } : {}),
    };
    const requested = [...stripParameterVersions(currentErrand.parameters ?? []), created];

    const saved = await this.apiService.patch<Parameter[], WritableParameter[]>(
      {
        url: `${errandUrl}/parameters`,
        baseURL,
        data: requested,
        headers: { 'If-Match': `"${currentVersion}"` },
        followLocation: false,
        propagateClientError: true,
      },
      req.user,
    );

    const persisted = (saved.data ?? []).find(parameter => parameter.key === key);
    if (!persisted) throw new HttpException(502, 'Support Management did not return the created parameter');
    return persisted;
  }
}

const assertExactlyOnePrecondition = (ifMatch: string | undefined, ifNoneMatch: string | undefined): void => {
  if (ifMatch !== undefined && ifNoneMatch !== undefined) {
    throw new HttpException(400, 'If-Match and If-None-Match must not be combined');
  }
  if (ifMatch === undefined && ifNoneMatch === undefined) {
    throw new HttpException(428, 'If-Match or If-None-Match is required when writing a parameter');
  }
  if (ifMatch !== undefined && !STRONG_VERSION_ETAG_PATTERN.test(ifMatch)) {
    throw new HttpException(400, 'If-Match must contain one strong numeric ETag');
  }
  if (ifNoneMatch !== undefined && ifNoneMatch !== '*') {
    throw new HttpException(400, 'If-None-Match must be exactly *');
  }
};
