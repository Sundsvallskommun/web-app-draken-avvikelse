import dayjs from 'dayjs';
import { Body, Controller, Param, Post, QueryParam, Req, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { MUNICIPALITY_ID } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { RenderRequest, RenderResponse } from '@/data-contracts/templating/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';

interface SupportExportStakeholder {
  organizationName?: string;
  firstName?: string;
  lastName?: string;
  address?: string;
  zipCode?: string;
  city?: string;
  emails?: { value: string }[];
  phoneNumbers?: { value: string }[];
}

interface SupportExportParameter {
  key: string;
  displayName?: string;
  values?: unknown[];
}

interface SupportExportBody {
  errandNumber: string;
  applicationName?: string;
  status?: string;
  priority?: string;
  channel?: string;
  channelLabel?: string;
  title?: string;
  description?: string;
  caseLabel?: string;
  category?: string;
  subTypeLabel?: string;
  created?: string;
  modified?: string;
  customer?: SupportExportStakeholder[];
  contacts?: SupportExportStakeholder[];
  parameters?: SupportExportParameter[];
  attachments?: { fileName: string; mimeType?: string }[];
}

@Controller()
export class SupportExportController {
  private apiService = new ApiService();
  TEMPLATING_SERVICE = apiServiceName('templating');

  @Post('/:municipalityId/exportsinglesupport')
  @OpenAPI({ summary: 'Export single support errand' })
  @UseBefore(authMiddleware)
  async exportSingleSupportErrand(
    @Req() req: RequestWithUser,
    @Body() data: SupportExportBody,
    @Param('municipalityId') _municipalityId: string,
    @QueryParam('include') include: string,
  ): Promise<any> {
    const templateStakeholder = (s: SupportExportStakeholder) => ({
      // Persons have first/last name, organizations only organizationName. Prefer the name parts (organizationName
      // is polluted with firstName upstream, so it can't be used for persons); organizations fall back to it.
      name: `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim() || s.organizationName || '',
      street: s.address ?? '',
      zip: s.zipCode ?? '',
      city: s.city ?? '',
      email:
        s.emails
          ?.map(v => v.value)
          .filter(Boolean)
          .join(', ') || 'E-post saknas',
      phone:
        s.phoneNumbers
          ?.map(v => v.value)
          .filter(Boolean)
          .join(', ') || 'Telefonnummer saknas',
    });

    let basicInformation: Record<string, unknown> | undefined = undefined;
    if (include?.includes('basicInformation')) {
      basicInformation = {
        caseLabel: data.caseLabel,
        category: data.category,
        subType: data.subTypeLabel,
        channel: data.channelLabel ?? data.channel,
        status: data.status,
        priority: data.priority,
        title: data.title,
        description: data.description,
        applicants: (data.customer ?? []).map(templateStakeholder),
        contacts: (data.contacts ?? []).map(templateStakeholder),
        created: data.created ? dayjs(data.created).format('YYYY-MM-DD HH:mm:ss') : '',
        updated: data.modified ? dayjs(data.modified).format('YYYY-MM-DD HH:mm:ss') : '',
      };
    }

    let extraParameters: Record<string, unknown>[] = [];
    if (include?.includes('errandInformation')) {
      extraParameters = (data.parameters ?? []).map(p => ({
        key: p.key,
        displayName: p.displayName,
        values: p.values ?? [],
        label: p.displayName,
      }));
    }

    let attachments: { fileName: string }[] = [];
    if (include?.includes('attachments')) {
      attachments = (data.attachments ?? []).map(a => ({ fileName: a.fileName }));
    }

    const renderRequest: RenderRequest = {
      identifier: 'singlesupporterrand.export',
      parameters: {
        errand: {
          errandNumber: data.errandNumber,
          applicationName: data.applicationName,
          ...(basicInformation && { basicInformation }),
          extraParameters,
          attachments,
        },
      },
    };

    const url = `${this.TEMPLATING_SERVICE}/${MUNICIPALITY_ID}/render/pdf`;
    const response = await this.apiService.post<RenderResponse, RenderRequest>({ url, data: renderRequest }, req.user).catch(e => {
      throw e;
    });
    return { data: response.data, message: `Support export PDF rendered` };
  }
}
