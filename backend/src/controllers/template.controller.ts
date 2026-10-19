import { RequestWithUser } from '@interfaces/auth.interface';
import authMiddleware from '@middlewares/auth.middleware';
import ApiService from '@services/api.service';
import { Controller, Get, Param, QueryParam, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID, SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { DetailedTemplateResponse } from '@/data-contracts/templating/data-contracts';

interface ResponseData {
  data: any;
  message: string;
}

const compareTemplateVersion = (a?: string, b?: string): number => {
  if (a && b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }
  if (a && !b) return 1;
  if (!a && b) return -1;
  return 0;
};

const isCandidateNewer = (candidate: DetailedTemplateResponse, current: DetailedTemplateResponse): boolean => {
  const versionCompare = compareTemplateVersion(candidate.version, current.version);
  if (versionCompare !== 0) {
    return versionCompare > 0;
  }
  const candidateModified = candidate.lastModifiedAt ? new Date(candidate.lastModifiedAt).getTime() : 0;
  const currentModified = current.lastModifiedAt ? new Date(current.lastModifiedAt).getTime() : 0;
  return candidateModified > currentModified;
};

@Controller()
export class TemplateController {
  private apiService = new ApiService();
  SERVICE = apiServiceName('templating');

  @Get('/templates')
  @OpenAPI({ summary: 'Fetch templates by identifier prefix' })
  @UseBefore(authMiddleware)
  async getMessageTemplates(
    @Req() req: RequestWithUser,
    @QueryParam('prefix') prefix: string = '',
    @QueryParam('type') type: string = '',
    @QueryParam('excludeVariants') excludeVariants: string = '',
    @QueryParam('templateType') templateType: string = '',
    @QueryParam('excludeRoles') excludeRoles: string = '',
    @QueryParam('decision') decision: string = '',
  ): Promise<ResponseData> {
    // Templates live in the Support Management namespace.
    const namespace = SUPPORTMANAGEMENT_NAMESPACE;
    const baseUrl = `${this.SERVICE}/${MUNICIPALITY_ID}/templates`;
    const searchUrl = namespace ? `${baseUrl}?namespace=${namespace}` : baseUrl;

    const searchResult = await this.apiService.get<DetailedTemplateResponse[]>({ url: searchUrl }, req.user);

    const allTemplates = searchResult.data || [];

    let filteredTemplates = prefix ? allTemplates.filter((t: DetailedTemplateResponse) => t.identifier?.startsWith(prefix)) : allTemplates;

    const effectiveType = templateType || type;
    if (effectiveType) {
      filteredTemplates = filteredTemplates.filter((t: DetailedTemplateResponse) => {
        const metadataType = getMetadataValue(t, 'templateType');
        if (metadataType) return metadataType === effectiveType;
        const parts = t.identifier?.split('.') || [];
        return parts.length >= 2 && parts[1] === effectiveType;
      });
    }

    if (decision) {
      filteredTemplates = filteredTemplates.filter((t: DetailedTemplateResponse) => {
        const decisionMeta = t.metadata?.find(m => m.key === 'decision');
        const role = getMetadataValue(t, 'templateRole');
        // Exclude signatures, they are not selectable decision templates
        if (role === 'signature') return false;
        // No decision key = show in all categories, otherwise must match
        return !decisionMeta || decisionMeta.value === decision;
      });
    }

    const effectiveExcludeRoles = excludeRoles || excludeVariants;
    if (effectiveExcludeRoles) {
      const excludeList = effectiveExcludeRoles.split(',').map(v => v.trim());
      filteredTemplates = filteredTemplates.filter((t: DetailedTemplateResponse) => {
        const metadataRole = getMetadataValue(t, 'templateRole');
        if (metadataRole) return !excludeList.includes(metadataRole);
        const parts = t.identifier?.split('.') || [];
        return parts.length < 3 || !excludeList.includes(parts[2]);
      });
    }

    const latestByIdentifier = new Map<string, DetailedTemplateResponse>();
    for (const t of filteredTemplates) {
      if (!t.identifier) continue;
      const existing = latestByIdentifier.get(t.identifier);
      if (!existing || isCandidateNewer(t, existing)) {
        latestByIdentifier.set(t.identifier, t);
      }
    }
    filteredTemplates = Array.from(latestByIdentifier.values());

    const templatesWithContent = await Promise.all(
      filteredTemplates.map(async (t: DetailedTemplateResponse) => {
        if (t.content) {
          return t;
        }

        const detailUrl = `${this.SERVICE}/${MUNICIPALITY_ID}/templates/${t.identifier}`;
        const detailResult = await this.apiService.get<DetailedTemplateResponse>({ url: detailUrl }, req.user);
        return detailResult.data;
      }),
    );

    return { data: templatesWithContent, message: 'success' };
  }

  @Get('/templates/:identifier')
  @OpenAPI({ summary: 'Fetch a single template by identifier' })
  @UseBefore(authMiddleware)
  async getMessageTemplate(@Req() req: RequestWithUser, @Param('identifier') identifier: string): Promise<ResponseData> {
    const url = `${this.SERVICE}/${MUNICIPALITY_ID}/templates/${identifier}`;
    const res = await this.apiService.get<DetailedTemplateResponse>({ url }, req.user);
    return { data: res.data, message: 'success' };
  }
}

function getMetadataValue(template: DetailedTemplateResponse, key: string): string | undefined {
  return template.metadata?.find(m => m.key === key)?.value;
}
