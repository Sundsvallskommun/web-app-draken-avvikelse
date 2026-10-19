import { SUPPORTMANAGEMENT_NAMESPACE } from '@/config';
import { apiServiceName } from '@/config/api-config';
import { HandlerGroupRole, resolveHandlerGroupRoles } from '@/config/handler-group-roles';
import { mayFollowUpMeasuresByRole } from '@/config/measure-follow-up-roles';
import { Errand, Measure, MeasureType, MetadataResponse, PageErrand, Phase, Role } from '@/data-contracts/supportmanagement/data-contracts';
import {
  CreateSupportMeasureDto,
  DecideSupportMeasureDto,
  FollowUpSupportMeasureDto,
  PlannedCompleteSupportMeasureDto,
  UpdateSupportMeasureDto,
} from '@/dtos/support-measure.dto';
import { HttpException } from '@/exceptions/HttpException';
import { User } from '@/interfaces/users.interface';
import { supportMetadataCache } from '@/services/support-metadata-cache';

import ApiService from './api.service';
import { assertSupportErrandWritable, getActiveErrandPhaseId, getErrandVersion } from './support-errand.service';
import { MEASURE_ACCESS_RESOURCE, SupportInvestigationAccessService } from './support-investigation-access.service';
import { undecidedProposalsMessage, unhandledMeasuresMessage } from './support-measure-closing';
import {
  changesApprovedEndDate,
  changesStartDate,
  isApprovedMeasure,
  isPlannedApprovedMeasure,
  measureFollowUpAnswers,
  measureHoldsFollowUp,
} from './support-measure-follow-up';
import {
  assertMeasureRegistration,
  assertMeasureTypeForRole,
  MeasureRegistrationPolicy,
  measureRoleDecides,
  resolveSupportMeasureRegistration,
} from './support-measure-registration';
import { collectOpenPlannedMeasures, OPEN_PLANNED_MEASURES_FILTER, type PlannedSupportMeasure } from './support-planned-measures';

export interface SupportMeasuresSnapshot {
  measures: Measure[];
  errandVersion: number;
  metadata: { measureTypes: MeasureType[]; roles: Role[] };
  creationRoles: Role[];
  registration: MeasureRegistrationPolicy;
  /** Whether Support Management lets the user write the errand's measures. The list stays readable without it. */
  canWrite: boolean;
  /** Whether the user's role follows up approved measures. */
  mayFollowUp: boolean;
  /**
   * Why the errand may not be closed yet, in the words the close refusal itself uses. Absent once every measure
   * is handled, and in an application that closes errands whatever their measures.
   */
  closeRefusal?: string;
  /**
   * Why the errand may not go on to the follow-up yet: proposals that wait for their decision. In the words the
   * phase change itself is refused with, and absent where nothing waits or the application has no such rule.
   */
  followUpRefusal?: string;
}

export interface PlannedSupportMeasuresSnapshot {
  measures: PlannedSupportMeasure[];
  metadata: { measureTypes: MeasureType[]; roles: Role[] };
  /** More errands matched than the read covers, so the list is incomplete. */
  truncated: boolean;
}

/**
 * Åtgärder are worked out while the errand is investigated. Until it moves on, a decided measure's type, description
 * and goal may still be put right, and whoever registered a measure may remove it; after that the measures are the
 * record of what was decided.
 */
const MEASURES_PHASE_NAME = 'INVESTIGATION';

const isInvestigated = (errand: Pick<Errand, 'phases'>, phases: readonly Phase[] | undefined): boolean => {
  const activePhaseId = getActiveErrandPhaseId(errand);
  return Boolean(activePhaseId) && (phases ?? []).some(phase => phase.id === activePhaseId && phase.name === MEASURES_PHASE_NAME);
};

// The errand list is paged per errand, not per measure. An overview of one person's planned work is small,
// so the pages are walked up to a cap that still keeps a runaway namespace from turning into a thousand reads.
const PLANNED_MEASURES_PAGE_SIZE = 100;
const PLANNED_MEASURES_MAX_PAGES = 10;

function requireMeasureVersion(ifMatch: string | undefined): number {
  if (ifMatch === undefined) throw new HttpException(428, 'If-Match is required when updating a measure');
  const match = /^"(0|[1-9]\d*)"$/.exec(ifMatch);
  const version = match ? Number(match[1]) : Number.NaN;
  if (!Number.isSafeInteger(version)) throw new HttpException(400, 'If-Match must contain one strong numeric measure ETag');
  return version;
}

/** Measures, their decisions and their follow-ups are all written to the protected measure resource. */
export class SupportMeasureService {
  constructor(
    private readonly apiService = new ApiService(),
    private readonly handlerRoles: readonly HandlerGroupRole[] = resolveHandlerGroupRoles(),
    // Members of the superadmin group hold every measure registration role.
    private readonly superadminGroup: string | undefined = process.env.SUPERADMIN_GROUP,
    private access?: SupportInvestigationAccessService,
  ) {}

  private errandAccess(): SupportInvestigationAccessService {
    return (this.access ??= new SupportInvestigationAccessService({ apiService: this.apiService }));
  }

  private baseUrl(municipalityId: string): string {
    return `${apiServiceName('supportmanagement')}/${municipalityId}/${SUPPORTMANAGEMENT_NAMESPACE}`;
  }

  private errandUrl(municipalityId: string, errandId: string): string {
    return `${this.baseUrl(municipalityId)}/errands/${encodeURIComponent(errandId)}`;
  }

  private async readCurrentWritableMeasure(url: string, measureId: string, user: User): Promise<Measure> {
    const current = await this.apiService.get<Errand>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, user);
    assertSupportErrandWritable(current.data, 'measure changes');
    const existing = (
      await this.apiService.get<Measure>(
        { url: `${url}/measures/${encodeURIComponent(measureId)}`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    if (existing.version === undefined || !Number.isSafeInteger(existing.version) || existing.version < 0) {
      throw new HttpException(502, 'Support Management response is missing a valid measure version');
    }
    return existing;
  }

  private async readWritableMeasure(url: string, measureId: string, ifMatch: string | undefined, user: User): Promise<Measure> {
    const version = requireMeasureVersion(ifMatch);
    const existing = await this.readCurrentWritableMeasure(url, measureId, user);
    if (existing.version !== version) throw new HttpException(412, 'If-Match does not match the current measure version');
    return existing;
  }

  private async errandIsInvestigated(municipalityId: string, errand: Errand, user: User): Promise<boolean> {
    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    return isInvestigated(errand, metadata.phases);
  }

  /** The unit's managers follow up a measure, whoever registered it. */
  private assertMayFollowUp(user: User): void {
    if (!mayFollowUpMeasuresByRole(this.handlerRoles, user.groups ?? [])) {
      throw new HttpException(403, 'Det är enhetschefen eller verksamhetschefen som följer upp åtgärder.');
    }
  }

  async read(municipalityId: string, errandId: string, user: User): Promise<SupportMeasuresSnapshot> {
    const url = this.errandUrl(municipalityId, errandId);
    // Parent version is only used to synchronize the surrounding errand form after our own edit.
    // Each measure carries the version used for its own writes.
    const errand = await this.apiService.get<Errand>(
      { url, includeResponseHeaders: true, propagateClientError: true, mapUnauthorizedToForbidden: true },
      user,
    );
    const result = await this.apiService.get<Measure[]>(
      { url: `${url}/measures`, propagateClientError: true, mapUnauthorizedToForbidden: true },
      user,
    );
    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    const registration = resolveSupportMeasureRegistration(metadata, user.groups ?? [], this.handlerRoles, this.superadminGroup);
    const mayFollowUp = mayFollowUpMeasuresByRole(this.handlerRoles, user.groups ?? []);
    // Whether measures can be added, edited and followed up is Support Management's call; the role catalogue only
    // says which role and types a writer registers with. A failed lookup offers no writes but keeps the list readable.
    const canWrite = await this.errandAccess()
      .getResourceLevel(user, municipalityId, errandId, MEASURE_ACCESS_RESOURCE)
      .then(
        level => level === 'RW',
        () => false,
      );
    // The same rule the close itself is refused by, so the client offers no close the BFF would turn down.
    const closeRefusal = unhandledMeasuresMessage(result.data ?? []);
    const followUpRefusal = undecidedProposalsMessage(result.data ?? []);
    return {
      measures: result.data,
      errandVersion: getErrandVersion(errand.data, errand.headers?.etag),
      metadata: { measureTypes: metadata.measureTypes ?? [], roles: metadata.roles ?? [] },
      ...registration,
      canWrite,
      mayFollowUp,
      ...(closeRefusal ? { closeRefusal } : {}),
      ...(followUpRefusal ? { followUpRefusal } : {}),
    };
  }

  /**
   * Open planned measures on every errand the user reaches, for an overview outside the errand. Upstream applies
   * its access control to the list, so the result is exactly the errands the overview already shows this user.
   * Follow-up answers are not joined in: they are one read per errand, and an unexecuted measure is planned
   * whether or not its answers were saved.
   */
  async readPlanned(municipalityId: string, user: User): Promise<PlannedSupportMeasuresSnapshot> {
    const errands: Errand[] = [];
    let truncated = false;
    // Sorted by creation so paging stays stable while others write; a page walk over `touched` would skip
    // errands that were edited between two reads.
    for (let page = 0; ; page++) {
      if (page >= PLANNED_MEASURES_MAX_PAGES) {
        truncated = true;
        break;
      }
      const query = new URLSearchParams({
        filter: OPEN_PLANNED_MEASURES_FILTER,
        page: String(page),
        size: String(PLANNED_MEASURES_PAGE_SIZE),
        sort: 'created,asc',
      });
      const result = await this.apiService.get<PageErrand>(
        { url: `${this.baseUrl(municipalityId)}/errands?${query.toString()}`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      );
      const content = result.data.content ?? [];
      errands.push(...content);
      if (content.length === 0 || result.data.last !== false) break;
    }
    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    return {
      measures: collectOpenPlannedMeasures(errands),
      metadata: { measureTypes: metadata.measureTypes ?? [], roles: metadata.roles ?? [] },
      truncated,
    };
  }

  async create(municipalityId: string, errandId: string, data: CreateSupportMeasureDto, user: User): Promise<void> {
    const url = this.errandUrl(municipalityId, errandId);
    const current = await this.apiService.get<Errand>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, user);
    assertSupportErrandWritable(current.data, 'measure changes');

    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    const resolved = resolveSupportMeasureRegistration(metadata, user.groups ?? [], this.handlerRoles, this.superadminGroup);
    assertMeasureRegistration(resolved, data.addedByRole, data.type);
    assertMeasureDates(data);
    // Executed measures are facts, not proposals, so only a deciding role may report them.
    if (data.executed !== undefined && !measureRoleDecides(resolved.registration, data.addedByRole)) {
      throw new HttpException(400, 'Förslag kan bara registreras som planerade åtgärder. Genomförda åtgärder registreras av den beslutande rollen.');
    }
    if (!user.username?.trim()) throw new HttpException(401, 'En inloggad användare krävs för att registrera åtgärden.');

    // Attribution and the decision come from the session and Draken's role policy, never from the browser:
    // a deciding role's own measure is accepted at once, any other role registers a proposal.
    const decision: Pick<Measure, 'accept'> = measureRoleDecides(resolved.registration, data.addedByRole) ? { accept: 'TRUE' } : {};
    await this.apiService.post<void, CreateSupportMeasureDto & Pick<Measure, 'addedByUser' | 'accept'>>(
      {
        url: `${url}/measures`,
        data: { ...data, ...decision, addedByUser: user.username },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
  }

  async update(
    municipalityId: string,
    errandId: string,
    measureId: string,
    ifMatch: string | undefined,
    data: UpdateSupportMeasureDto,
    user: User,
  ): Promise<void> {
    const url = this.errandUrl(municipalityId, errandId);
    const measureUrl = `${url}/measures/${encodeURIComponent(measureId)}`;
    const existing = await this.readWritableMeasure(url, measureId, ifMatch, user);
    assertOwnMeasure(existing, user);

    const changesDecidedContent =
      Boolean(existing.accept) && (['type', 'description', 'goal'] as const).some(key => data[key] !== undefined && data[key] !== existing[key]);
    if (changesStartDate(existing, data.plannedStart)) {
      throw new HttpException(409, 'Startdatumet kan inte ändras.');
    }
    if (changesApprovedEndDate(existing, data.plannedComplete)) {
      throw new HttpException(409, 'Slutdatumet på en godkänd åtgärd ändras med Ändra slutdatum, av den som följer upp åtgärden.');
    }

    const changesType = data.type !== undefined && data.type !== existing.type;
    const reportsExecuted = data.executed !== undefined && !existing.executed;
    if (changesType && data.type !== undefined) {
      const metadata = (
        await supportMetadataCache.read<MetadataResponse>(
          this.apiService,
          { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
          user,
        )
      ).data;
      // Membership may have changed since creation; type choices follow the saved registration role.
      const { registration } = resolveSupportMeasureRegistration(metadata, user.groups ?? [], this.handlerRoles, this.superadminGroup);
      assertMeasureTypeForRole(registration, existing.addedByRole, data.type);
    }
    if (reportsExecuted && !isApprovedMeasure(existing)) {
      throw new HttpException(400, 'Ett förslag kan inte markeras som genomfört förrän det har godkänts helt eller delvis.');
    }
    if (existing.result && data.executed !== undefined && Date.parse(data.executed) !== Date.parse(existing.executed ?? '')) {
      throw new HttpException(409, 'Genomförandet hör till en sparad uppföljning och kan inte ändras här.');
    }
    assertMeasureDates(data, existing);

    // Recheck status after dependent reads. Unrelated errand edits do not invalidate this measure's ETag.
    const latest = await this.apiService.get<Errand>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, user);
    assertSupportErrandWritable(latest.data, 'measure changes');
    if (changesDecidedContent && !(await this.errandIsInvestigated(municipalityId, latest.data, user))) {
      throw new HttpException(409, 'Typ, beskrivning och mål är låsta efter beslut när ärendet har lämnat Utredning.');
    }

    // Forward the caller's original version so upstream also catches changes after the checks above.
    await this.apiService.patch<Measure, UpdateSupportMeasureDto>(
      {
        url: measureUrl,
        data,
        headers: { 'If-Match': ifMatch },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
  }

  /**
   * Removes a measure its registrar added and has not carried out, while the errand is investigated. Conditioned on
   * the measure's own version, so a measure somebody changed meanwhile is not removed unseen.
   */
  async remove(municipalityId: string, errandId: string, measureId: string, ifMatch: string | undefined, user: User): Promise<void> {
    const url = this.errandUrl(municipalityId, errandId);
    const existing = await this.readWritableMeasure(url, measureId, ifMatch, user);
    assertOwnMeasure(existing, user, 'ta bort');
    if (existing.executed) throw new HttpException(409, 'En genomförd åtgärd kan inte tas bort.');

    const latest = await this.apiService.get<Errand>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, user);
    assertSupportErrandWritable(latest.data, 'measure changes');
    if (!(await this.errandIsInvestigated(municipalityId, latest.data, user))) {
      throw new HttpException(409, 'Åtgärder kan bara tas bort medan ärendet utreds.');
    }

    await this.apiService.delete(
      {
        url: `${url}/measures/${encodeURIComponent(measureId)}`,
        headers: { 'If-Match': ifMatch },
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
  }

  async decide(
    municipalityId: string,
    errandId: string,
    measureId: string,
    ifMatch: string | undefined,
    data: DecideSupportMeasureDto,
    user: User,
  ): Promise<void> {
    const url = this.errandUrl(municipalityId, errandId);
    const existing = await this.readWritableMeasure(url, measureId, ifMatch, user);
    const metadata = (
      await supportMetadataCache.read<MetadataResponse>(
        this.apiService,
        { url: `${this.baseUrl(municipalityId)}/metadata`, propagateClientError: true, mapUnauthorizedToForbidden: true },
        user,
      )
    ).data;
    const resolved = resolveSupportMeasureRegistration(metadata, user.groups ?? [], this.handlerRoles, this.superadminGroup);
    if (resolved.registration.status !== 'ready') throw new HttpException(503, 'Beslutsbehörigheten för åtgärder är inte tillgänglig.');
    if (!resolved.creationRoles.some(role => measureRoleDecides(resolved.registration, role.name))) {
      throw new HttpException(403, 'Du saknar behörighet att fatta beslut om åtgärdsförslag.');
    }
    if (!user.username?.trim()) throw new HttpException(401, 'En inloggad användare krävs för att fatta beslut.');
    if (existing.accept || existing.executed) throw new HttpException(409, 'Åtgärden är redan beslutad eller genomförd. Ladda om åtgärderna.');
    const motivation = data.acceptMotivation?.trim();
    if (data.accept !== 'TRUE' && !motivation) throw new HttpException(400, 'En kommentar krävs vid avslag eller delvis godkännande.');

    const latest = await this.apiService.get<Errand>({ url, propagateClientError: true, mapUnauthorizedToForbidden: true }, user);
    assertSupportErrandWritable(latest.data, 'measure decisions');
    // A proposal leaves its dates open, so the one who approves it decides when it starts and ends. Without them an
    // approved measure would never come up for follow-up.
    const approves = data.accept !== 'FALSE';
    if (approves && (!data.plannedStart || !data.plannedComplete)) {
      throw new HttpException(400, 'Ange start- och slutdatum för en godkänd åtgärd.');
    }
    if (approves) assertMeasureDates({ plannedStart: data.plannedStart, plannedComplete: data.plannedComplete });
    // The decision and the dates it sets: the proposal's own content and its creator/role are never replaced by the
    // decision maker. This is independent of the deciding role's own selectable measure types.
    await this.apiService.patch<Measure, DecideSupportMeasureDto>(
      {
        url: `${url}/measures/${encodeURIComponent(measureId)}`,
        data: {
          accept: data.accept,
          acceptMotivation: motivation ?? '',
          ...(approves ? { plannedStart: data.plannedStart, plannedComplete: data.plannedComplete } : {}),
        },
        headers: { 'If-Match': ifMatch },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
  }

  /**
   * Moves an approved measure's end date. The start never changes, but the end may slip, and only the one who follows
   * the measure up moves it - not whoever registered it. A measure already followed up is done, and keeps the end it
   * had. The description, otherwise locked once the measure is approved, may be rewritten in the same step: it is
   * where the one moving the date says why.
   */
  async changePlannedComplete(
    municipalityId: string,
    errandId: string,
    measureId: string,
    ifMatch: string | undefined,
    data: PlannedCompleteSupportMeasureDto,
    user: User,
  ): Promise<void> {
    const url = this.errandUrl(municipalityId, errandId);
    const existing = await this.readWritableMeasure(url, measureId, ifMatch, user);
    this.assertMayFollowUp(user);
    if (!isPlannedApprovedMeasure(existing) || existing.result) {
      throw new HttpException(409, 'Slutdatumet kan bara ändras på en planerad och godkänd åtgärd som inte är uppföljd.');
    }
    assertMeasureDates({ plannedComplete: data.plannedComplete }, existing);
    await this.apiService.patch<Measure, Pick<Measure, 'plannedComplete' | 'description'>>(
      {
        url: `${url}/measures/${encodeURIComponent(measureId)}`,
        // One write: the date and the words explaining it are saved together or not at all.
        data: {
          plannedComplete: data.plannedComplete,
          ...(data.description !== undefined ? { description: data.description } : {}),
        },
        headers: { 'If-Match': ifMatch },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
  }

  async followUp(
    municipalityId: string,
    errandId: string,
    measureId: string,
    ifMatch: string | undefined,
    data: FollowUpSupportMeasureDto,
    user: User,
  ): Promise<void> {
    const expectedVersion = requireMeasureVersion(ifMatch);
    const url = this.errandUrl(municipalityId, errandId);
    const existing = await this.readCurrentWritableMeasure(url, measureId, user);
    this.assertMayFollowUp(user);
    if (!isPlannedApprovedMeasure(existing)) throw new HttpException(409, 'Endast planerade och godkända åtgärder kan följas upp.');
    const description = data.followUpDescription?.trim();
    if (typeof data.desiredEffectAchieved !== 'boolean' || !description || description.length > 4000) {
      throw new HttpException(400, 'Ange om åtgärden lett till önskad effekt och beskriv vad som har hänt (högst 4000 tecken).');
    }
    const answers = measureFollowUpAnswers(data.desiredEffectAchieved, description);
    if (existing.result) {
      // A lost response to an accepted follow-up is retried with the version it started from; it is saved, not stale.
      if (measureHoldsFollowUp(existing, answers)) return;
      throw new HttpException(409, 'Åtgärden är redan uppföljd. Ladda om åtgärderna för att läsa svaren.');
    }
    if (existing.version !== expectedVersion) throw new HttpException(412, 'If-Match does not match the current measure version');

    // Answers and execution are one write to the measure, conditioned on the version the user followed up.
    const now = new Date().toISOString();
    const saved = await this.apiService.patch<Measure, Pick<Measure, 'executed' | 'result' | 'resultText' | 'completedAt'>>(
      {
        url: `${url}/measures/${encodeURIComponent(measureId)}`,
        data: { ...(existing.executed ? {} : { executed: now }), ...answers, completedAt: now },
        headers: { 'If-Match': ifMatch },
        followLocation: false,
        propagateClientError: true,
        mapUnauthorizedToForbidden: true,
      },
      user,
    );
    if (!measureHoldsFollowUp(saved.data, answers) || !saved.data.executed) {
      throw new HttpException(502, 'Uppföljningen kunde inte bekräftas. Ladda om åtgärderna.');
    }
  }
}

function assertMeasureDates(data: UpdateSupportMeasureDto, existing?: Measure): void {
  // An executed measure is a report of something that happened, so the date cannot lie ahead.
  if (data.executed && Date.parse(data.executed) > Date.now()) {
    throw new HttpException(400, 'Genomfört datum kan inte ligga i framtiden.');
  }
  const start = data.plannedStart ?? existing?.plannedStart;
  const complete = data.plannedComplete ?? existing?.plannedComplete;
  if (start && complete && Date.parse(complete) < Date.parse(start)) {
    throw new HttpException(400, 'Åtgärdens slutdatum får inte vara före startdatumet.');
  }
}

/** Only the person who registered a measure may change it; the session identity is the only source of "own". */
function assertOwnMeasure(existing: Pick<Measure, 'addedByUser'>, user: User, action: 'redigera' | 'ta bort' = 'redigera'): void {
  const owner = existing.addedByUser?.trim().toLowerCase();
  const editor = user.username?.trim().toLowerCase();
  if (!owner || !editor || owner !== editor) {
    throw new HttpException(403, `Du kan bara ${action} åtgärder som du själv har registrerat.`);
  }
}
