import { Response } from 'express';
import { Controller, Get, Param, QueryParam, Req, Res, UseBefore } from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';

import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { DifferenceResponse, Errand, PageEvent } from '@/data-contracts/supportmanagement/data-contracts';
import { RequestWithUser } from '@/interfaces/auth.interface';
import authMiddleware from '@/middlewares/auth.middleware';
import ApiService from '@/services/api.service';
import {
  assignsErrandTo,
  ErrandHistoryEntry,
  readErrandEventExecutor,
  readErrandEventVersions,
  resolveAssignedBy,
  resolveAssigneeResumedAt,
} from '@/services/assignee-resume';
import { SupportInvestigationPolicyService } from '@/services/support-investigation-policy.service';
import { SupportJsonParameterService } from '@/services/support-json-parameter.service';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isAccessDenied = (error: unknown): boolean => isRecord(error) && (error.status === 401 || error.status === 403);
const isJsonParameterRevisionPath = (path: string | undefined): boolean =>
  !path || path === '/' || path === '/jsonParameters' || path.startsWith('/jsonParameters/');

const redactJsonParameterRevisionOperations = (difference: DifferenceResponse): DifferenceResponse => ({
  ...difference,
  operations: difference.operations?.filter(operation => !isJsonParameterRevisionPath(operation.path)),
});

@Controller()
export class SupportHistoryController {
  private apiService = new ApiService();
  private readonly investigationPolicyService: SupportInvestigationPolicyService;
  private readonly investigationDocumentService: SupportJsonParameterService;
  private namespace = SUPPORTMANAGEMENT_NAMESPACE;
  private SERVICE = apiServiceName('supportmanagement');

  constructor(
    investigationPolicyService = new SupportInvestigationPolicyService(),
    investigationDocumentService = new SupportJsonParameterService({ namespace: SUPPORTMANAGEMENT_NAMESPACE ?? '' }),
  ) {
    this.investigationPolicyService = investigationPolicyService;
    this.investigationDocumentService = investigationDocumentService;
  }

  @Get('/supporthistory/:municipalityId/:id')
  @OpenAPI({ summary: 'Get events for errand' })
  @UseBefore(authMiddleware)
  async fetchSupportEvents(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @QueryParam('page') page: number,
    @QueryParam('size') size: number,
    @QueryParam('sort') sort: string,
    @Res() response: Response<PageEvent, any>,
  ): Promise<Response<PageEvent, any>> {
    const query = new URLSearchParams({
      page: String(page ?? 0),
      size: String(size ?? 100),
      sort: sort || 'created,desc',
    }).toString();
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/events?${query}`;
    const res = await this.apiService.get<PageEvent>({ url }, req.user);
    return response.status(200).send(res.data);
  }

  /**
   * The errand's current handler and its history, newest first and only as far back as their latest assignment:
   * what each write changed is a request of its own. An errand without a handler has no such history.
   */
  private async readHistoryBackToAssignment(
    req: RequestWithUser,
    municipalityId: string,
    id: string,
  ): Promise<{ assignee: string; history: ErrandHistoryEntry[] } | undefined> {
    const errandUrl = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}`;
    const errand = await this.apiService.get<Errand>({ url: errandUrl }, req.user);
    const assignee = errand.data.assignedUserId?.trim();
    if (!assignee) return undefined;

    const events = await this.apiService.get<PageEvent>({ url: `${errandUrl}/events?page=0&size=100&sort=created%2Cdesc` }, req.user);
    const history: ErrandHistoryEntry[] = [];
    for (const event of events.data.content ?? []) {
      const versions = readErrandEventVersions(event);
      if (!versions) continue;
      const difference = await this.apiService.get<DifferenceResponse>(
        { url: `${errandUrl}/revisions/difference?source=${versions.previous}&target=${versions.current}` },
        req.user,
      );
      const by = readErrandEventExecutor(event);
      const entry = { at: event.created!, operations: difference.data.operations ?? [], ...(by ? { by } : {}) };
      history.push(entry);
      if (assignsErrandTo(entry, assignee)) break;
    }
    return { assignee, history };
  }

  /**
   * When the errand's current handler took it up after it was given to them, read from the errand's history. The
   * lex Sarah investigation records it as the day the report reached its investigator.
   */
  @Get('/supporthistory/:municipalityId/:id/assignee-resumed')
  @OpenAPI({ summary: "When the errand's current handler took it up after it was assigned to them" })
  @UseBefore(authMiddleware)
  async fetchAssigneeResumedAt(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
  ): Promise<{ resumedAt: string | null }> {
    const assignment = await this.readHistoryBackToAssignment(req, municipalityId, id);
    if (!assignment) return { resumedAt: null };
    return { resumedAt: resolveAssigneeResumedAt(assignment.history, assignment.assignee) ?? null };
  }

  /**
   * Who gave the errand to its current handler, read from the errand's history. A LEX investigator hands the
   * errand back to the LEX manager who gave it to them, so that is the one their handover offers first.
   */
  @Get('/supporthistory/:municipalityId/:id/assigned-by')
  @OpenAPI({ summary: 'Who assigned the errand to its current handler' })
  @UseBefore(authMiddleware)
  async fetchAssignedBy(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
  ): Promise<{ assignedBy: string | null }> {
    const assignment = await this.readHistoryBackToAssignment(req, municipalityId, id);
    if (!assignment) return { assignedBy: null };
    return { assignedBy: resolveAssignedBy(assignment.history, assignment.assignee) ?? null };
  }

  @Get('/supporthistory/:municipalityId/:id/revisions/difference/')
  @OpenAPI({ summary: 'Get diff between revisions on an errand' })
  @UseBefore(authMiddleware)
  async fetchErrandRevisionsDiff(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('municipalityId') municipalityId: string,
    @QueryParam('source') source: number,
    @QueryParam('target') target: number,
    @Res() response: Response<DifferenceResponse, any>,
  ): Promise<Response<DifferenceResponse, any>> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/revisions/difference?source=${source}&target=${target}`;
    const documents = this.investigationPolicyService.profile.documents;
    const [res, canReadInvestigationDocuments] = await Promise.all([
      this.apiService.get<DifferenceResponse>({ url, propagateClientError: true }, req.user),
      documents.length === 0
        ? Promise.resolve(true)
        : this.investigationDocumentService
            .verifyReadableDocuments({ definitions: documents, municipalityId, errandId: id, user: req.user })
            .then(() => true)
            .catch(error => {
              if (isAccessDenied(error)) return false;
              throw error;
            }),
    ]);
    return response.status(200).send(canReadInvestigationDocuments ? res.data : redactJsonParameterRevisionOperations(res.data));
  }

  @Get('/supporthistory/:municipalityId/:id/notes/:noteId/revisions/difference/')
  @OpenAPI({ summary: 'Get diff between revisions on a note' })
  @UseBefore(authMiddleware)
  async fetchNoteRevisionsDiff(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
    @Param('municipalityId') municipalityId: string,
    @QueryParam('source') source: number,
    @QueryParam('target') target: number,
    @Res() response: Response<DifferenceResponse, any>,
  ): Promise<Response<DifferenceResponse, any>> {
    const url = `${this.SERVICE}/${municipalityId}/${this.namespace}/errands/${id}/notes/${noteId}/revisions/difference?source=${source}&target=${target}`;
    const res = await this.apiService.get<DifferenceResponse>({ url }, req.user);
    return response.status(200).send(res.data);
  }
}
