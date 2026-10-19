import { ArrayMaxSize, IsArray, IsString, MinLength } from 'class-validator';
import { Body, Controller, Get, Param, Post, Put, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { findInvestigationManagerRole } from '@/config/investigation-manager-roles';
import type { AccessUser } from '@/data-contracts/access-mapper/data-contracts';
import type { MetadataResponse as SupportMetadata } from '@/data-contracts/supportmanagement/data-contracts';
import { HttpException } from '@/exceptions/HttpException';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import { hasPermissions } from '@/middlewares/permissions.middleware';
import { validationMiddleware } from '@/middlewares/validation.middleware';
import { AccessMapperService, readAccessMapperRoles } from '@/services/access-mapper.service';
import ApiService from '@/services/api.service';
import { HandlerDirectoryService } from '@/services/handler-directory.service';
import {
  applyPlaceChanges,
  type PlaceManagerAssignment,
  readPlaceManagerAssignment,
  requirePlaceRootPath,
  resolveAdministeredPlace,
} from '@/services/place-manager-assignments';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { type ManagerRoleOption, managerRoleOptions } from '@/services/unit-manager-resolution';
import { logger } from '@/utils/logger';
import { apiURL } from '@/utils/util';

/** How many people one lookup answers for: enough for the managers of a whole area, and no open-ended fan-out. */
const MAX_LOOKED_UP_ACCOUNTS = 150;
/** How many of them are asked about at a time, so one lookup does not flood AccessMapper and the directory. */
const LOOKUP_BATCH_SIZE = 10;

export class PlaceManagerLookupDto {
  @IsArray()
  @ArrayMaxSize(MAX_LOOKED_UP_ACCOUNTS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  adAccounts!: string[];
}

export class PlaceManagerPlacesDto {
  /** Places to give the person, as label ids from the place structure. An area stands for every unit beneath it. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  add!: string[];

  /** Places to take from the person, named the same way. */
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  remove!: string[];
}

export interface PlaceManagerAssignmentsResponse {
  assignments: PlaceManagerAssignment[];
  /** The manager roles, in the order they are shown. */
  roles: ManagerRoleOption[];
}

export interface PlaceManagerPerson {
  adAccount: string;
  /** Absent when the directory does not know the account, which is what a mistyped one looks like. */
  displayName?: string;
  /** The manager roles the person holds in AccessMapper. Empty until the AD group that carries one is in place. */
  roleKeys: string[];
}

export interface PlaceManagerPeopleResponse {
  people: PlaceManagerPerson[];
}

/**
 * Which places each manager has: the half of "who is the manager for this place" that is set per person.
 *
 * AccessMapper holds it as label patterns on the person, one per unit. The other half - that the person is a manager
 * at all - is a role that comes with an AD group, ordered outside Draken together with the role's rights; this
 * controller shows it and never writes it. A person given a place without the role is therefore not yet a manager
 * there, and the answer says so.
 *
 * Changing a person's places changes which errands they reach, so every route is the superadmin's. AccessMapper
 * itself does not ask who is calling: the permission check here is the only guard there is.
 */
@Controller()
@UseBefore(hasPermissions(['canAdministerPlaceManagers']))
export class SupportPlaceManagerController {
  private apiService = new ApiService();
  private accessMapperService = new AccessMapperService();
  private handlerDirectory = new HandlerDirectoryService();
  private investigationPolicyService = new SupportInvestigationPolicyService();
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  SERVICE = apiServiceName('supportmanagement');

  @Get('/supportplacemanagers/:municipalityId')
  @OpenAPI({ summary: 'The places every manager has' })
  @UseBefore(authMiddleware)
  async getAssignments(@Req() req: RequestWithUser, @Param('municipalityId') municipalityId: string): Promise<PlaceManagerAssignmentsResponse> {
    this.assertAdministersPlaceManagers();
    const [placeRootPath, accessUsers] = await Promise.all([
      this.readPlaceRootPath(req, municipalityId),
      this.accessMapperService.listAccessUsers(req.user, municipalityId, this.namespace!),
    ]);

    return {
      assignments: accessUsers
        .map(accessUser => readPlaceManagerAssignment(accessUser, placeRootPath))
        .filter((assignment): assignment is PlaceManagerAssignment => assignment !== undefined),
      roles: managerRoleOptions(),
    };
  }

  /**
   * Names and manager roles for the people at a place, asked for when the place is opened rather than for everybody
   * up front. A POST because the question is a list of accounts, which does not belong in a URL.
   */
  @Post('/supportplacemanagers/:municipalityId/people')
  @OpenAPI({ summary: 'Names and manager roles for a list of accounts' })
  @UseBefore(authMiddleware, validationMiddleware(PlaceManagerLookupDto, 'body'))
  async lookupPeople(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Body() data: PlaceManagerLookupDto,
  ): Promise<PlaceManagerPeopleResponse> {
    this.assertAdministersPlaceManagers();
    const adAccounts = [...new Map(data.adAccounts.map(account => [account.trim().toLowerCase(), account.trim()])).values()].filter(Boolean);
    return { people: await this.describePeople(req, municipalityId, adAccounts) };
  }

  @Put('/supportplacemanagers/:municipalityId/people/:adAccount/places')
  @OpenAPI({ summary: 'Give places to a manager, or take them away' })
  @UseBefore(authMiddleware, validationMiddleware(PlaceManagerPlacesDto, 'body'))
  async changePlaces(
    @Req() req: RequestWithUser,
    @Param('municipalityId') municipalityId: string,
    @Param('adAccount') adAccount: string,
    @Body() data: PlaceManagerPlacesDto,
  ): Promise<PlaceManagerAssignment> {
    this.assertAdministersPlaceManagers();
    const account = adAccount.trim();
    if (!account) throw new HttpException(400, 'An AD account is required');

    const labelStructure = (await this.readMetadata(req, municipalityId)).labels?.labelStructure;
    const placeRootPath = requirePlaceRootPath(labelStructure);
    const placesOf = (labelIds: readonly string[]) => labelIds.map(labelId => resolveAdministeredPlace(labelStructure, labelId));
    const addPaths = placesOf(data.add).flatMap(place => place.unitPaths);
    // Taking an area away also takes a pattern written on the area itself, which is how a few people hold theirs.
    const removePaths = placesOf(data.remove).flatMap(place => [...place.unitPaths, place.resourcePath]);

    // Read right before the write: the entry is replaced whole, and AccessMapper has no version to condition it on.
    const accessUsers = await this.accessMapperService.listAccessUsers(req.user, municipalityId, this.namespace!);
    const existing = accessUsers.find(accessUser => accessUser.userId?.trim().toLowerCase() === account.toLowerCase());
    // A person not yet in AccessMapper has to be in the directory: a mistyped account would otherwise become an
    // entry that grants places to nobody, and looks like a manager who never answers.
    const userId = existing?.userId ?? (addPaths.length > 0 ? await this.requireDirectoryAccount(req, account) : account);
    const change = applyPlaceChanges(existing, userId, { placeRootPath, addPaths, removePaths });

    if (change.kind === 'create') {
      await this.accessMapperService.createAccessUser(req.user, municipalityId, this.namespace!, change.accessUser);
    } else if (change.kind === 'update') {
      await this.accessMapperService.updateAccessUser(req.user, municipalityId, this.namespace!, this.requireEntryId(existing), change.accessUser);
    } else if (change.kind === 'delete') {
      await this.accessMapperService.deleteAccessUser(req.user, municipalityId, this.namespace!, this.requireEntryId(existing));
    }
    if (change.kind !== 'none') {
      // AccessMapper keeps no history, so who changed whose places is recorded here.
      logger.info(
        `Place managers: ${req.user.username} changed the places of ${userId} (${change.kind}, +${addPaths.length} -${removePaths.length})`,
      );
    }

    const written = change.kind === 'create' || change.kind === 'update' ? change.accessUser : change.kind === 'delete' ? undefined : existing;
    return (written && readPlaceManagerAssignment(written, placeRootPath)) ?? { adAccount: userId, origin: written?.origin ?? '', placePaths: [] };
  }

  /** Other applications have no place structure with managers to set, and no reason to reach AccessMapper this way. */
  private assertAdministersPlaceManagers(): void {
    if (!this.investigationPolicyService.iafVofClassificationPolicy) {
      throw new HttpException(404, 'Place managers are not administered in this application');
    }
  }

  private requireEntryId(accessUser: AccessUser | undefined): string {
    if (!accessUser?.id) throw new HttpException(502, 'AccessMapper returned an access entry without an id');
    return accessUser.id;
  }

  private async readMetadata(req: RequestWithUser, municipalityId: string): Promise<SupportMetadata> {
    const response = await this.apiService.get<SupportMetadata>(
      {
        url: `${municipalityId}/${this.namespace}/metadata`,
        baseURL: apiURL(this.SERVICE),
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      req.user,
    );
    return response.data;
  }

  private async readPlaceRootPath(req: RequestWithUser, municipalityId: string): Promise<string> {
    return requirePlaceRootPath((await this.readMetadata(req, municipalityId)).labels?.labelStructure);
  }

  /** The account a new entry is written for, in lower case as most are. One the directory cannot name is refused. */
  private async requireDirectoryAccount(req: RequestWithUser, adAccount: string): Promise<string> {
    const account = adAccount.toLowerCase();
    const names = await this.handlerDirectory.lookupDisplayNames(req.user, [account]);
    if (!names.has(account)) {
      throw new HttpException(400, `The account ${adAccount} could not be found in the directory`);
    }
    return account;
  }

  private async describePeople(req: RequestWithUser, municipalityId: string, adAccounts: readonly string[]): Promise<PlaceManagerPerson[]> {
    const people: PlaceManagerPerson[] = [];
    for (let start = 0; start < adAccounts.length; start += LOOKUP_BATCH_SIZE) {
      const batch = adAccounts.slice(start, start + LOOKUP_BATCH_SIZE);
      const [names, roles] = await Promise.all([
        this.handlerDirectory.lookupDisplayNames(req.user, batch),
        Promise.all(batch.map(account => readAccessMapperRoles(this.apiService, req.user, municipalityId, this.namespace!, account))),
      ]);
      batch.forEach((adAccount, index) => {
        const displayName = names.get(adAccount.toLowerCase());
        const roleKeys = roles[index].map(role => findInvestigationManagerRole(role)?.key).filter((key): key is string => key !== undefined);
        people.push({ adAccount, ...(displayName ? { displayName } : {}), roleKeys: [...new Set(roleKeys)] });
      });
    }
    return people;
  }
}
