import type { Page, Request, Route } from '@playwright/test';

import lexAssessmentSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/bedomning-sol-lss.schema-request.json';
import lexAssessmentUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/bedomning-sol-lss.ui-schema-request.json';
import hslDecisionSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/beslut-hsl.schema-request.json';
import hslDecisionUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/beslut-hsl.ui-schema-request.json';
import solLssDecisionSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/beslut-sol-lss.schema-request.json';
import solLssDecisionUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/beslut-sol-lss.ui-schema-request.json';
import investigationCases from '../../../src/supportmanagement/investigation/avvikelse/schemas/fixtures/investigation-schema-cases.json';
import managerSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-enhetschef.schema-request.json';
import managerUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-enhetschef.ui-schema-request.json';
import hslSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-hsl.schema-request.json';
import hslUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-hsl.ui-schema-request.json';
import solLssSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-sol-lss.schema-request.json';
import solLssUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/utredning-sol-lss.ui-schema-request.json';
import hslCommentSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/vc-kommentar-hsl.schema-request.json';
import hslCommentUiSchemaRequest from '../../../src/supportmanagement/investigation/avvikelse/schemas/vc-kommentar-hsl.ui-schema-request.json';
import { mockHandlerRoles } from '../../fixtures/mockAdmins';

const backendOrigin = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').origin;
const municipalityId = '2281';
export const errandId = 'ca97b2be-dc37-4707-b5bb-bae98936a183';
/**
 * The deployment the specs name their errands, namespace and Katla report after. IAF and VOF run the same app and
 * differ only in the backend's configuration, so one of them stands for both.
 */
export const errandNumberPrefix = 'VOF';
const deploymentSlug = errandNumberPrefix.toLowerCase();
/** The handler `/me` signs in as. */
const signedInUsername = 'iaf.test';
export const errandNumber = `${errandNumberPrefix}-2026-0001`;
/** The JSON parameter Katla's report arrives in; Ärendeuppgifter prefixes the report's field ids with it. */
export const katlaParameterKey = `katla-${deploymentSlug}-report`;
export const katlaSchemaId = `2281_${katlaParameterKey}_1.0`;

export const investigationKeys = [
  'utredning-enhetschef',
  'utredning-sol-lss',
  'utredning-hsl',
  'beslut-hsl',
  'beslut-sol-lss',
  'bedomning-sol-lss',
  'vc-kommentar-hsl',
] as const;
export type InvestigationKey = (typeof investigationKeys)[number];
/** LEX-ansvarig's initial assessment, in Ärendeuppgifter. Only a scenario that configures it has it. */
export const lexAssessmentKey = 'bedomning-sol-lss' satisfies InvestigationKey;
/** The comment on MAS/MAR's event analysis by the one who commissioned it, beside the analysis under Utredning. */
export const hslCommentKey = 'vc-kommentar-hsl' satisfies InvestigationKey;
/** The IVO decision on an ordinary deviation under HSL. */
export const hslDecisionKey = 'beslut-hsl' satisfies InvestigationKey;
/** The lex Sarah decision on a reported misconduct. */
export const misconductDecisionKey = 'beslut-sol-lss' satisfies InvestigationKey;
const decisionKeys: readonly InvestigationKey[] = [hslDecisionKey, misconductDecisionKey];
/**
 * The documents the Utredning tab offers; the decisions live on their own tab, the assessment in Ärendeuppgifter, and
 * VC kommentar HSL opens only once MAS/MAR has asked for the comment.
 */
export const investigationTabKeys = investigationKeys.filter(
  (key) => !decisionKeys.includes(key) && key !== lexAssessmentKey && key !== hslCommentKey
);

export interface MockInvestigationProfile {
  state: 'active' | 'inactive' | 'unavailable';
  registration: { mode: 'enabled' | 'disabled' };
  reportDocument?: { key: string; schemaName: string; editableChannel: string; lockedFromPhase: string };
  documents: Array<{
    key: string;
    schemaName: InvestigationKey;
    tabLabel: string;
    ownerLabel: string;
    placement?: 'investigation' | 'decision' | 'details';
    appliesTo?: 'all' | 'reported-misconduct' | 'hsl-deviation' | 'deviation';
    prerequisiteDocumentKey?: InvestigationKey;
  }>;
}

export const defaultInvestigationProfile = (): MockInvestigationProfile => ({
  state: 'active',
  registration: { mode: 'disabled' },
  documents: [
    {
      key: 'utredning-enhetschef',
      schemaName: 'utredning-enhetschef',
      tabLabel: 'Utredning enhetschef',
      ownerLabel: 'Enhetschef',
    },
    {
      key: 'utredning-sol-lss',
      schemaName: 'utredning-sol-lss',
      tabLabel: 'Utredning Lex Sarah',
      ownerLabel: 'Lex Sarah',
    },
    {
      key: 'utredning-hsl',
      schemaName: 'utredning-hsl',
      tabLabel: 'Händelseanalys HSL',
      ownerLabel: 'MAS/MAR',
      // As the BFF's profile: MAS/MAR's analysis and the comment on it belong to deviations, never to a misconduct.
      appliesTo: 'deviation',
    },
    {
      key: hslCommentKey,
      schemaName: hslCommentKey,
      tabLabel: 'VC kommentar HSL',
      ownerLabel: 'Verksamhetschef',
      appliesTo: 'deviation',
    },
    {
      key: hslDecisionKey,
      schemaName: hslDecisionKey,
      tabLabel: 'Beslut HSL',
      ownerLabel: 'MAS/MAR',
      placement: 'decision',
      appliesTo: 'hsl-deviation',
    },
    {
      key: misconductDecisionKey,
      schemaName: misconductDecisionKey,
      tabLabel: 'Beslut SoL/LSS',
      ownerLabel: 'LEX-ansvarig',
      placement: 'decision',
      appliesTo: 'reported-misconduct',
      // As the BFF's profile: the lex Sarah decision answers the SoL/LSS investigation, which is saved first.
      prerequisiteDocumentKey: 'utredning-sol-lss',
    },
  ],
});

type JsonObject = Record<string, unknown>;

interface SchemaRequest {
  // Imported JSON carries string names; the registry below constrains the supported document keys.
  name: string;
  version: string;
  value: JsonObject;
  description: string;
}

interface UiSchemaRequest {
  value: JsonObject;
  description: string;
}

interface InvestigationDocument {
  key: string;
  schemaId: string;
  value: JsonObject;
  version: number;
  etag: string;
}

interface PutTrace {
  key: string;
  headers: Record<string, string>;
  body: unknown;
}

interface ClassificationPatchTrace {
  headers: Record<string, string>;
  body: unknown;
}

export interface IafApiTrace {
  profileGets: number;
  exactSchemaIds: string[];
  latestSchemaNames: string[];
  documentGets: string[];
  puts: PutTrace[];
  classificationPatches: ClassificationPatchTrace[];
  errandPatches: unknown[];
  writes: Array<'document' | 'classification'>;
  /** Report requests, in order; a preview renders without attaching or recording. */
  reports: Array<{ key: string; preview: boolean }>;
  /** Phase transition requests, in order, as the BFF received them. */
  phasePatches: Array<{ transitionId?: string; expectedActivePhaseId?: string | null }>;
  /** Handover steps, in order, exactly as the client named them. */
  handovers: Array<{
    step: string;
    seenFacts?: Record<string, string>;
    assignedUserId?: string;
    locationLabelId?: string;
  }>;
  /** Assignee changes through the admin route, in order: who the errand was given to. */
  adminPatches: Array<string | undefined>;
  /** Places whose managers were previewed, by label id. */
  locationManagerGets: string[];
  /** Errand parameters written one by one, in order, with the precondition each was sent on. */
  parameterPuts: Array<{ key: string; values?: string[]; ifMatch?: string; ifNoneMatch?: string }>;
  /** Registration requests, in order, exactly as the form sent them. */
  registrations: Array<{ reportTypeLabelId?: string; locationLabelId?: string; priority?: string }>;
  /** Errands whose notifications the user acknowledged, in order: one per errand page that opened. */
  notificationAcknowledgements: string[];
  /** The request group id every write carried, in order; undefined where a write carried none. */
  writeRequestGroupIds: Array<string | undefined>;
}

/** One phase of the namespace's workflow, as `supportmetadata` describes it. */
export interface MockPhase {
  id: string;
  name: string;
  displayName?: string;
  phaseOrder: number;
  deprecated?: boolean;
}

/**
 * The IAF/VOF workflow as the specs use it. The Utredning tab opens in Utredning, the Beslut tab in
 * Beslut and the Uppföljning tab in Uppföljning, so a scenario places the errand in one of these to say
 * how far it has got.
 */
export const investigationPhases: MockPhase[] = [
  // Named the way Support Management names them: the technical key in `name`, what handlers read in
  // `displayName`. The tab gates match the key, so a Swedish `name` would leave every tab ungated.
  { id: 'phase-received', name: 'ACTUALIZATION', displayName: 'Registrerat', phaseOrder: 1 },
  { id: 'phase-investigation', name: 'INVESTIGATION', displayName: 'Utredning', phaseOrder: 2 },
  { id: 'phase-decision', name: 'DECISION', displayName: 'Beslut', phaseOrder: 3 },
  { id: 'phase-follow-up', name: 'FOLLOW_UP', displayName: 'Uppföljning', phaseOrder: 4 },
];

export type WorkflowPhaseName = 'ACTUALIZATION' | 'REVIEW' | 'INVESTIGATION' | 'DECISION' | 'FOLLOW_UP';

interface WorkflowPhase {
  id: string;
  name: WorkflowPhaseName;
  displayName: string;
  phaseOrder: number;
  allowedStatuses: string[];
  transitions: Array<{
    id: string;
    targetPhaseId: string;
    targetPhaseName: WorkflowPhaseName;
    targetPhaseDisplayName: string;
    description: string;
  }>;
}

export const workflowPhaseId = (name: WorkflowPhaseName) => `phase-${name.toLowerCase().replace('_', '-')}`;
export const workflowTransitionId = (target: WorkflowPhaseName) =>
  `transition-to-${target.toLowerCase().replace('_', '-')}`;

const workflowChain: Array<[WorkflowPhaseName, string, string, string]> = [
  ['ACTUALIZATION', 'Registrerat', 'NEW', 'Skicka till granskning'],
  ['REVIEW', 'Granskning', 'REVIEW', 'Inled utredning'],
  ['INVESTIGATION', 'Utredning', 'INQUIRY', 'Redo för beslut'],
  ['DECISION', 'Beslut', 'DECISION', 'Inled uppföljning'],
  ['FOLLOW_UP', 'Uppföljning', 'FOLLOW_UP', ''],
];

/**
 * The avvikelse workflow as the test namespace declares it (read 2026-09-15): one linear chain where
 * each phase allows its own status and offers one transition on. The last phase, Uppföljning, has no
 * transition and allows SOLVED instead, so the errand is closed from there. Ids are fixed so a spec
 * can name the transition it expects the BFF to receive.
 */
const workflowPhases: WorkflowPhase[] = workflowChain.map(
  ([name, displayName, status, transitionDescription], index) => {
    const next = workflowChain[index + 1];
    return {
      id: workflowPhaseId(name),
      name,
      displayName,
      phaseOrder: index,
      allowedStatuses: next ? [status] : [status, 'SOLVED'],
      transitions: next
        ? [
            {
              id: workflowTransitionId(next[0]),
              targetPhaseId: workflowPhaseId(next[0]),
              targetPhaseName: next[0],
              targetPhaseDisplayName: next[1],
              description: transitionDescription,
            },
          ]
        : [],
    };
  }
);

/** What the registration form is told it may choose. Omitted, registration is not exercised. */
interface RegistrationOptionsScenario {
  reportTypes: Array<{ labelId: string; displayName: string; resourcePath: string }>;
  locations: Array<{ labelId: string; displayName: string; resourcePath: string }>;
  locationSource?: 'employment' | 'access';
  priorities: string[];
}

export interface IafApiScenario {
  registrationOptions?: RegistrationOptionsScenario;
  documentAccess?: Readonly<Record<string, 'edit' | 'read' | 'hidden'>>;
  investigationAccessStatus?: number;
  canEdit?: boolean;
  errandStatus?: string;
  /** null leaves the errand unassigned, which is how it arrives before anyone has taken it. */
  assignedUserId?: string | null;
  /** Taking an errand assigns it and then moves it to Pågående; the two can fail separately. */
  statusTransitionResult?: 'success' | 'bad-request';
  administrators?: Array<{ name: string; displayName: string; guid: string; roleKeys: string[] }>;
  /**
   * Who `assignable-handlers` offers for this errand, as the BFF answers it. Left out, the route is not
   * served and the sidebar keeps the full directory, as it does when the route fails.
   */
  assignableHandlers?: AssignableHandlersAnswer & {
    /** What the BFF answers once a document has been saved, as it does when the saved errand changes who may have it. */
    afterDocumentSave?: AssignableHandlersAnswer;
  };
  /** When the errand's handler took it up after it was given to them, as the history answers it. */
  assigneeResumedAt?: string;
  /** Who gave the errand to its handler, as the history answers it. Left out, the history names nobody. */
  assignedBy?: string;
  /** Why the errand may not be closed yet, as the measures snapshot says it. Left out, nothing stands in the way. */
  measuresCloseRefusal?: string;
  /** Why the errand may not go on to the follow-up yet, as the measures snapshot says it: proposals not decided on. */
  measuresFollowUpRefusal?: string;
  /** Errand parameters beside the reported event type, each with its own version. */
  parameters?: Array<{ key: string; displayName?: string; values: string[]; version?: number }>;
  eventType?: 'AVVIKELSE' | 'MISSFORHALLANDE';
  documents?: Record<string, InvestigationDocument>;
  documentReadAccessDeniedFor?: string;
  putResult?: 'success' | 'conflict';
  classificationPatchResult?: 'success' | 'bad-request' | 'conflict' | 'server-error' | 'server-error-once';
  classificationDeclarationMissingFor?: InvestigationKey;
  classificationSlotMisplacedFor?: InvestigationKey;
  schemaFailureFor?: InvestigationKey;
  classification?: { category: string; type: string };
  labels?: MockLabel[];
  labelStructure?: MockLabel[];
  omitLabelResourcePaths?: boolean;
  investigationProfile?: MockInvestigationProfile;
  investigationProfileResponse?: unknown;
  investigationProfileStatus?: number;
  /**
   * The workflow the namespace runs. Omitted by default, which is a namespace with no phase model -
   * the errand is then in no phase and nothing that waits for one is gated.
   */
  metadataPhases?: MockPhase[];
  /** The phase the errand is in: `activePhaseId` never comes back on a read, the history does. */
  activePhaseId?: string;
  /**
   * Puts the errand in this workflow phase, with the phases before it in its history, and makes the
   * metadata carry the whole avvikelse workflow. Left out, neither the metadata nor the errand has
   * any phase at all, which is what every spec that is not about phases expects.
   */
  activePhaseName?: WorkflowPhaseName;
  /** The managers AccessMapper knows for a place, by the place's label id. Absent places have none. */
  locationManagers?: Record<string, Array<{ adAccount: string; displayName: string; roleKey: string }>>;
  /** What a handover step answers; a conflict is what a stale errand version gets. */
  handoverResult?: 'success' | 'conflict';
  /** Investigation text templates in the Templating API, by identifier. Left out, there are none. */
  investigationTextTemplates?: Record<string, string>;
  /** How the errand came in. Left out, it was registered in Draken. */
  errandChannel?: string;
  /** The user's level on the errand itself, as Support Management's /access answers it. Left out, RW. */
  errandAccessLevel?: 'LR' | 'R' | 'RW';
  /** The handler roles `/me` names for the signed-in user. Left out, the user holds none. */
  roleKeys?: string[];
  /** The statuses the namespace's metadata names. Left out, Pågående and Avslutat. */
  statuses?: Array<{ name: string; displayName: string }>;
  /** The person the report concerns, as the errand's PRIMARY stakeholder. Left out, the errand names none. */
  brukare?: { partyId: string; firstName: string; lastName: string };
  /** Another party the report names, as a CONTACT stakeholder. Left out, the errand names none. */
  otherParty?: { firstName: string; lastName: string };
}

const schemaRequests: Record<InvestigationKey, SchemaRequest> = {
  'utredning-enhetschef': managerSchemaRequest,
  'utredning-sol-lss': solLssSchemaRequest,
  'utredning-hsl': hslSchemaRequest,
  'beslut-hsl': hslDecisionSchemaRequest,
  'beslut-sol-lss': solLssDecisionSchemaRequest,
  'bedomning-sol-lss': lexAssessmentSchemaRequest,
  'vc-kommentar-hsl': hslCommentSchemaRequest,
};

const uiSchemaRequests: Record<InvestigationKey, UiSchemaRequest> = {
  'utredning-enhetschef': managerUiSchemaRequest,
  'utredning-sol-lss': solLssUiSchemaRequest,
  'utredning-hsl': hslUiSchemaRequest,
  'beslut-hsl': hslDecisionUiSchemaRequest,
  'beslut-sol-lss': solLssDecisionUiSchemaRequest,
  'bedomning-sol-lss': lexAssessmentUiSchemaRequest,
  'vc-kommentar-hsl': hslCommentUiSchemaRequest,
};

const validValues: Record<InvestigationKey, JsonObject> = {
  'utredning-enhetschef': investigationCases['utredning-enhetschef'].valid,
  'utredning-sol-lss': investigationCases['utredning-sol-lss'].valid,
  'utredning-hsl': investigationCases['utredning-hsl'].valid,
  'beslut-hsl': investigationCases['beslut-hsl'].valid,
  'beslut-sol-lss': investigationCases['beslut-sol-lss'].valid,
  'bedomning-sol-lss': investigationCases['bedomning-sol-lss'].valid,
  'vc-kommentar-hsl': investigationCases['vc-kommentar-hsl'].valid,
};

/** Derived from the artifacts the mock serves, so a published version never drifts from its id. */
/** Who `assignable-handlers` offers for the errand, and under which roles. */
interface AssignableHandlersAnswer {
  handlers: Array<{ name: string; displayName: string; guid: string; roleKeys?: string[]; handoverStep?: string }>;
  roles?: Array<{ key: string; label: string }>;
}

export const latestSchemaIds = Object.fromEntries(
  investigationKeys.map((key) => [key, `${municipalityId}_${key}_${schemaRequests[key].version}`])
) as Record<InvestigationKey, string>;

export const existingManagerDocument = (): InvestigationDocument => ({
  key: 'utredning-enhetschef',
  schemaId: '2281_utredning-enhetschef_0.9',
  value: structuredClone(validValues['utredning-enhetschef']),
  version: 7,
  etag: '"7"',
});

export const allExistingInvestigationDocuments = (): Record<InvestigationKey, InvestigationDocument> =>
  Object.fromEntries(
    investigationKeys.map((key, index) => [
      key,
      {
        key,
        schemaId: latestSchemaIds[key],
        value: structuredClone(validValues[key]),
        version: index + 1,
        etag: `"${index + 1}"`,
      },
    ])
  ) as Record<InvestigationKey, InvestigationDocument>;

export interface MockLabel {
  id: string;
  classification: string;
  displayName: string;
  resourceName: string;
  resourcePath?: string;
  labels?: MockLabel[];
}

export const iafLabelFixture = {
  namespace: `HEALTHCAREDEVIATION${errandNumberPrefix}`,
  provision: {
    hsl: { id: 'provision-hsl-id', resourcePath: 'PROVISION/HSL' },
    sol: { id: 'provision-sol-id', resourcePath: 'PROVISION/SOL' },
    lss: { id: 'provision-lss-id', resourcePath: 'PROVISION/LSS' },
  },
  reportType: {
    deviation: { id: 'report-type-deviation-id', resourcePath: 'REPORT_TYPE/DEVIATION' },
    misconduct: { id: 'report-type-misconduct-id', resourcePath: 'REPORT_TYPE/ABUSE' },
  },
  classification: {
    hslOwner: { id: 'category-hsl-owner-id', resourcePath: 'CATEGORY/HSL' },
    rehab: {
      id: 'category-hsl-rehab-id',
      displayName: 'Rehab',
      resourcePath: 'CATEGORY/HSL/REHAB',
    },
    missedAssessment: {
      id: 'type-hsl-rehab-assessment-id',
      displayName: 'Utebliven bedömning/behandling',
      resourcePath: 'CATEGORY/HSL/REHAB/ASSESSMENT_TREATMENT_NOT_PERFORMED',
    },
    medication: {
      id: 'category-hsl-medication-id',
      displayName: 'Läkemedelshantering',
      resourcePath: 'CATEGORY/HSL/MEDICATION',
    },
    incorrectAdministration: {
      id: 'type-hsl-medication-administration-id',
      displayName: 'Felaktig administrering',
      resourcePath: 'CATEGORY/HSL/MEDICATION/INCORRECT_ADMINISTRATION',
    },
    solLssOwner: { id: 'category-sol-lss-owner-id', resourcePath: 'CATEGORY/SOL_LSS' },
    legalCertainty: {
      id: 'category-sol-lss-legal-certainty-id',
      displayName: 'Brister i rättssäkerhet vid handläggning och genomförande',
      resourcePath: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY',
    },
    deficientHandling: {
      id: 'type-sol-lss-legal-certainty-handling-id',
      displayName: 'Brister vid handläggning',
      resourcePath: 'CATEGORY/SOL_LSS/LEGAL_CERTAINTY/DEFICIENT_HANDLING',
    },
    executionDeficiency: {
      id: 'category-sol-lss-execution-id',
      displayName: 'Brister i utförandet av insatser',
      resourcePath: 'CATEGORY/SOL_LSS/EXECUTION_DEFICIENCY',
    },
    supportNotProvided: {
      id: 'type-sol-lss-execution-support-id',
      displayName: 'Beviljad insats har inte utförts',
      resourcePath: 'CATEGORY/SOL_LSS/EXECUTION_DEFICIENCY/SUPPORT_NOT_PROVIDED',
    },
  },
} as const;

const label = (
  id: string,
  classification: string,
  displayName: string,
  resourceName: string,
  resourcePath: string,
  labels?: MockLabel[]
): MockLabel => ({ id, classification, displayName, resourceName, resourcePath, labels });

const provisionHsl = label(
  iafLabelFixture.provision.hsl.id,
  'PROVISION',
  'HSL',
  'HSL',
  iafLabelFixture.provision.hsl.resourcePath
);
const provisionSol = label(
  iafLabelFixture.provision.sol.id,
  'PROVISION',
  'SoL',
  'SOL',
  iafLabelFixture.provision.sol.resourcePath
);
const provisionLss = label(
  iafLabelFixture.provision.lss.id,
  'PROVISION',
  'LSS',
  'LSS',
  iafLabelFixture.provision.lss.resourcePath
);
const reportDeviation = label(
  iafLabelFixture.reportType.deviation.id,
  'REPORT_TYPE',
  'Avvikelse',
  'DEVIATION',
  iafLabelFixture.reportType.deviation.resourcePath
);
const reportMisconduct = label(
  iafLabelFixture.reportType.misconduct.id,
  'REPORT_TYPE',
  'Missförhållande',
  'ABUSE',
  iafLabelFixture.reportType.misconduct.resourcePath
);
const missedAssessment = label(
  iafLabelFixture.classification.missedAssessment.id,
  'TYPE',
  iafLabelFixture.classification.missedAssessment.displayName,
  'ASSESSMENT_TREATMENT_NOT_PERFORMED',
  iafLabelFixture.classification.missedAssessment.resourcePath
);
const rehab = label(
  iafLabelFixture.classification.rehab.id,
  'CATEGORY',
  iafLabelFixture.classification.rehab.displayName,
  'REHAB',
  iafLabelFixture.classification.rehab.resourcePath,
  [missedAssessment]
);
const incorrectAdministration = label(
  iafLabelFixture.classification.incorrectAdministration.id,
  'TYPE',
  iafLabelFixture.classification.incorrectAdministration.displayName,
  'INCORRECT_ADMINISTRATION',
  iafLabelFixture.classification.incorrectAdministration.resourcePath
);
const medication = label(
  iafLabelFixture.classification.medication.id,
  'CATEGORY',
  iafLabelFixture.classification.medication.displayName,
  'MEDICATION',
  iafLabelFixture.classification.medication.resourcePath,
  [incorrectAdministration]
);
const hslOwner = label(
  iafLabelFixture.classification.hslOwner.id,
  'PROVISION_CATEGORY',
  'HSL',
  'HSL',
  iafLabelFixture.classification.hslOwner.resourcePath,
  [rehab, medication]
);
const deficientHandling = label(
  iafLabelFixture.classification.deficientHandling.id,
  'TYPE',
  iafLabelFixture.classification.deficientHandling.displayName,
  'DEFICIENT_HANDLING',
  iafLabelFixture.classification.deficientHandling.resourcePath
);
const legalCertainty = label(
  iafLabelFixture.classification.legalCertainty.id,
  'CATEGORY',
  iafLabelFixture.classification.legalCertainty.displayName,
  'LEGAL_CERTAINTY',
  iafLabelFixture.classification.legalCertainty.resourcePath,
  [deficientHandling]
);
const supportNotProvided = label(
  iafLabelFixture.classification.supportNotProvided.id,
  'TYPE',
  iafLabelFixture.classification.supportNotProvided.displayName,
  'SUPPORT_NOT_PROVIDED',
  iafLabelFixture.classification.supportNotProvided.resourcePath
);
const executionDeficiency = label(
  iafLabelFixture.classification.executionDeficiency.id,
  'CATEGORY',
  iafLabelFixture.classification.executionDeficiency.displayName,
  'EXECUTION_DEFICIENCY',
  iafLabelFixture.classification.executionDeficiency.resourcePath,
  [supportNotProvided]
);
const solLssOwner = label(
  iafLabelFixture.classification.solLssOwner.id,
  'PROVISION_CATEGORY',
  'SoL/LSS',
  'SOL_LSS',
  iafLabelFixture.classification.solLssOwner.resourcePath,
  [legalCertainty, executionDeficiency]
);

const labelStructure: MockLabel[] = [
  label('provision-root-id', 'PROVISION_ROOT', 'Lagrum', 'PROVISION', 'PROVISION', [
    provisionHsl,
    provisionSol,
    provisionLss,
  ]),
  label('category-root-id', 'CATEGORY_ROOT', 'Kategori', 'CATEGORY', 'CATEGORY', [hslOwner, solLssOwner]),
  label('report-type-root-id', 'REPORT_TYPE_ROOT', 'Rapporttyp', 'REPORT_TYPE', 'REPORT_TYPE', [
    reportDeviation,
    reportMisconduct,
  ]),
];

/**
 * An ordinary deviation under HSL and SoL, classified in both groups: an HSL path and a SoL/LSS path.
 */
const deviationLabelsSource = [
  provisionHsl,
  reportDeviation,
  hslOwner,
  rehab,
  missedAssessment,
  solLssOwner,
  legalCertainty,
  deficientHandling,
];

/**
 * The place structure the way Katla's reporter sees it, and the way Support Management stores it:
 * one top node, departments beneath it, and the units at the bottom as the places an errand can be
 * at. Ids and paths are what the tests assert on; "Blå" exists under both homes on purpose, since a
 * name is not an identity.
 */
export const iafPlaceFixture = {
  root: { id: 'place-root-id', resourcePath: 'LOCATION' },
  area: { id: 'place-area-id', resourcePath: 'LOCATION/NORTH' },
  operation: { id: 'place-operation-id', resourcePath: 'LOCATION/NORTH/ELDERLY_CARE' },
  unit: { id: 'place-unit-id', resourcePath: 'LOCATION/NORTH/ELDERLY_CARE/UNIT_1' },
  northHome: {
    id: 'place-north-home-id',
    displayName: 'Norra hemmet',
    resourcePath: 'LOCATION/NORTH/ELDERLY_CARE/UNIT_1/NORTH_HOME',
  },
  northBlue: {
    id: 'place-north-blue-id',
    displayName: 'Blå',
    resourcePath: 'LOCATION/NORTH/ELDERLY_CARE/UNIT_1/NORTH_HOME/BLUE',
  },
  southHome: {
    id: 'place-south-home-id',
    displayName: 'Södra hemmet',
    resourcePath: 'LOCATION/NORTH/ELDERLY_CARE/UNIT_1/SOUTH_HOME',
  },
  southBlue: {
    id: 'place-south-blue-id',
    displayName: 'Blå',
    resourcePath: 'LOCATION/NORTH/ELDERLY_CARE/UNIT_1/SOUTH_HOME/BLUE',
  },
  accessLex: { id: 'access-lex-id', resourcePath: 'ACCESS/LEX' },
} as const;

const northBlue = label(
  iafPlaceFixture.northBlue.id,
  'LOCATION',
  'Blå',
  'BLUE',
  iafPlaceFixture.northBlue.resourcePath
);
const northHome = label(
  iafPlaceFixture.northHome.id,
  'LOCATION',
  'Norra hemmet',
  'NORTH_HOME',
  iafPlaceFixture.northHome.resourcePath,
  [northBlue]
);
const southBlue = label(
  iafPlaceFixture.southBlue.id,
  'LOCATION',
  'Blå',
  'BLUE',
  iafPlaceFixture.southBlue.resourcePath
);
const southHome = label(
  iafPlaceFixture.southHome.id,
  'LOCATION',
  'Södra hemmet',
  'SOUTH_HOME',
  iafPlaceFixture.southHome.resourcePath,
  [southBlue]
);
const placeUnit = label(iafPlaceFixture.unit.id, 'DEPARTMENT', 'Enhet 1', 'UNIT_1', iafPlaceFixture.unit.resourcePath, [
  northHome,
  southHome,
]);
const placeOperation = label(
  iafPlaceFixture.operation.id,
  'DEPARTMENT',
  'Äldreomsorg',
  'ELDERLY_CARE',
  iafPlaceFixture.operation.resourcePath,
  [placeUnit]
);
const placeArea = label(
  iafPlaceFixture.area.id,
  'DEPARTMENT',
  'Norra området',
  'NORTH',
  iafPlaceFixture.area.resourcePath,
  [placeOperation]
);
const placeRoot = label(
  iafPlaceFixture.root.id,
  'LOCATION_ROOT',
  'Platsstruktur',
  'platsstruktur',
  iafPlaceFixture.root.resourcePath,
  [placeArea]
);
const accessLex = label(iafPlaceFixture.accessLex.id, 'ACCESS', 'LEX', 'LEX', iafPlaceFixture.accessLex.resourcePath);
const accessRoot = label('access-root-id', 'ACCESS_ROOT', 'Åtkomst', 'ACCESS', 'ACCESS', [accessLex]);

/** The chain an errand at Norra hemmet / Blå carries: every level below the top node, one label each. */
const northBlueChain = [placeArea, placeOperation, placeUnit, northHome, northBlue];

const metadata = {
  categories: [],
  types: [],
  // SupportManagement names the stakeholder roles, and IAF/VOF's metadata calls the errand owner
  // "Brukare". Nothing in the frontend decides this - the section is named by whatever comes back.
  roles: [
    { name: 'PRIMARY', displayName: 'Brukare' },
    { name: 'CONTACT', displayName: 'Övrig part' },
  ],
  statuses: [
    { name: 'ONGOING', displayName: 'Pågående' },
    { name: 'SOLVED', displayName: 'Avslutat' },
  ],
  labels: { labelStructure },
};

const withoutChildren = ({ labels: _labels, ...selectedLabel }: MockLabel): MockLabel => selectedLabel;

/**
 * A deviation errand that Katla routed to Norra hemmet, with the place structure in the metadata.
 * The default fixtures carry no place at all, which is what every spec not about places expects.
 */
export const withPlaceStructure = ({ withLex = false } = {}): Pick<IafApiScenario, 'labels' | 'labelStructure'> => ({
  labelStructure: [...labelStructure, placeRoot, accessRoot],
  labels: [...deviationLabelsSource, ...northBlueChain, ...(withLex ? [accessLex] : [])].map(withoutChildren),
});

const highHslRisk = label('risk-high-hsl-id', 'RISK', 'Hög risk HSL', 'HIGH_HSL', 'RISK/HIGH_HSL');
const riskRoot = label('risk-root-id', 'RISK_ROOT', 'Risk', 'RISK', 'RISK', [highHslRisk]);
/** Set when MAS/MAR asks the head of operations for their comment on the HSL analysis. It opens VC kommentar HSL. */
const vcCommentRequested = label(
  'analysis-vc-comment-id',
  'analysis',
  'Yttrande verksamhetschef HSL',
  'VC_COMMENT_HSL',
  'ANALYSIS/VC_COMMENT_HSL'
);
const analysisRoot = label('analysis-root-id', 'analysis-root', 'Analys', 'ANALYSIS', 'ANALYSIS', [vcCommentRequested]);

/**
 * The default deviation without the legal base it was reported under. Reports rarely name one - the unit manager's
 * investigation does - so this is the errand as it usually is.
 */
const deviationLabelsWithoutLegalBase = deviationLabelsSource.filter((reported) => reported !== provisionHsl);

/**
 * An ordinary deviation the BFF has marked with a high HSL risk, the label in the metadata too. It was reported
 * under HSL unless the scenario says otherwise, and MAS/MAR has asked the head of operations for their comment only
 * where it says so.
 */
export const withHighHslRisk = ({ reportedUnderHsl = true, commentRequested = false } = {}): Pick<
  IafApiScenario,
  'labels' | 'labelStructure'
> => ({
  labelStructure: [...labelStructure, riskRoot, analysisRoot],
  labels: [
    ...(reportedUnderHsl ? deviationLabelsSource : deviationLabelsWithoutLegalBase),
    highHslRisk,
    ...(commentRequested ? [vcCommentRequested] : []),
  ].map(withoutChildren),
});

/** An ordinary deviation nobody reported a legal base for, and no investigation has assessed a high HSL risk on. */
export const deviationWithoutReportedLegalBase = (): Pick<IafApiScenario, 'labels'> => ({
  labels: deviationLabelsWithoutLegalBase.map(withoutChildren),
});

const withoutResourcePaths = (labels: readonly MockLabel[]): MockLabel[] =>
  labels.map(({ resourcePath: _resourcePath, labels: children, ...currentLabel }) => ({
    ...currentLabel,
    ...(children ? { labels: withoutResourcePaths(children) } : {}),
  }));

const deviationLabels = deviationLabelsSource.map(withoutChildren);
const misconductLabels = [
  provisionSol,
  provisionLss,
  reportMisconduct,
  solLssOwner,
  legalCertainty,
  deficientHandling,
].map(withoutChildren);

/**
 * A reported misconduct that MAS/MAR asked the head of operations to comment on while it was taken for a deviation.
 * The request stays on the errand once the investigation finds a misconduct, as the labels notified from do.
 */
export const misconductWithVcCommentRequested = (): Pick<
  IafApiScenario,
  'eventType' | 'labels' | 'labelStructure'
> => ({
  eventType: 'MISSFORHALLANDE',
  labelStructure: [...labelStructure, analysisRoot],
  labels: [...misconductLabels, withoutChildren(vcCommentRequested)],
});

/**
 * An ordinary deviation under SoL only. The default deviation is under HSL, so this is the errand
 * that takes no decision at all.
 */
export const solDeviationScenario = (): Pick<IafApiScenario, 'labels' | 'classification'> => ({
  labels: [provisionSol, reportDeviation, solLssOwner, legalCertainty, deficientHandling].map(withoutChildren),
  classification: {
    category: iafLabelFixture.classification.solLssOwner.resourcePath,
    type: iafLabelFixture.classification.legalCertainty.resourcePath,
  },
});

const allLabelsById = new Map<string, MockLabel>();
const collectLabels = (labels: readonly MockLabel[]) => {
  labels.forEach((currentLabel) => {
    allLabelsById.set(currentLabel.id, withoutChildren(currentLabel));
    if (currentLabel.labels) collectLabels(currentLabel.labels);
  });
};
collectLabels(labelStructure);
collectLabels([placeRoot, accessRoot, riskRoot, analysisRoot]);

/** The avvikelse report as the profile names it: Katla's record, written in Draken on errands registered there. */
export const reportDocumentProfile = {
  key: 'avvikelse-plats-handelse',
  schemaName: 'avvikelse-plats-handelse',
  editableChannel: 'WEB_UI',
  lockedFromPhase: 'INVESTIGATION',
};

const reportSchemaId = '2281_avvikelse-plats-handelse_1.5';

/** A reduced report schema: the place, when it happened and what happened. */
const reportSchema = {
  id: reportSchemaId,
  name: reportDocumentProfile.schemaName,
  version: '1.5',
  value: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    required: ['facilityInfo', 'eventDescription'],
    properties: {
      facilityInfo: {
        type: 'object',
        title: 'Plats',
        properties: { orgName: { type: 'string', title: 'Enhet' } },
      },
      eventDate: { type: 'string', format: 'date', title: 'Datum för händelsen' },
      eventDescription: { type: 'string', title: 'Beskriv händelsen' },
    },
  },
};

const reportUiSchema = {
  facilityInfo: { 'ui:field': 'FacilitySearchWidget' },
  eventDate: { 'ui:widget': 'date' },
  eventDescription: { 'ui:widget': 'textarea' },
};

const katlaParameter = {
  key: katlaParameterKey,
  schemaId: katlaSchemaId,
  value: { reportedEvent: 'Katla från web-app-katla-sm' },
};

const katlaSchema = {
  id: katlaSchemaId,
  name: katlaParameterKey,
  version: '1.0',
  value: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Inrapporterade uppgifter',
    type: 'object',
    additionalProperties: false,
    properties: {
      reportedEvent: {
        type: 'string',
        title: 'Händelse från Katla',
      },
    },
  },
  description: 'Readonly-data som rapporterats från Katla.',
};

const apiResponse = (data: unknown) => ({ data, message: 'success' });

const isInvestigationKey = (value: string): value is InvestigationKey => investigationKeys.some((key) => key === value);

const requestBody = (request: Request): unknown => {
  const body = request.postData();
  if (!body) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
};

const fulfillJson = (route: Route, json: unknown, status = 200, headers?: Record<string, string>) =>
  route.fulfill({ status, json, headers });

/** The facts the BFF fingerprints of an errand's own fields, each the field as Support Management holds it. */
const OWN_FIELD_FACTS = [
  'title',
  'priority',
  'contactReason',
  'contactReasonDescription',
  'businessRelated',
  'escalationEmail',
  'channel',
  'description',
  'stakeholders',
  'externalTags',
] as const;
const ROUTING_LABEL_ROOTS: ReadonlySet<string> = new Set(['ACCESS', 'REPORT_TYPE', 'LOCATION']);
/** The root of the label tree the classification is kept in. */
const CLASSIFICATION_LABEL_ROOT = 'CATEGORY';

/** The root of a label's resource path, read from the label tree where the errand's copy leaves the path out. */
const labelRoot = (candidate: MockLabel): string =>
  (allLabelsById.get(candidate.id)?.resourcePath ?? candidate.resourcePath ?? '').split('/')[0].toUpperCase();

const labelIds = (labels: readonly MockLabel[]): string[] => labels.map(({ id }) => id).sort();

interface MockUpstreamErrand {
  readonly assignedUserId?: string;
  readonly status?: string;
  readonly classification?: unknown;
  readonly labels: MockLabel[];
  readonly phases?: ReadonlyArray<{ readonly phaseId?: string; readonly ended?: string }>;
}

/**
 * Like the BFF's `errandFacts`: one fingerprint per fact of the errand an errand-level command may depend on. The
 * client only carries them back, so here they are simply the facts written out.
 */
const mockErrandFacts = (errand: MockUpstreamErrand): Record<string, string> => {
  const fingerprint = (value: unknown) => JSON.stringify(value ?? null);
  const fields = errand as unknown as Record<string, unknown>;
  return {
    ...Object.fromEntries(OWN_FIELD_FACTS.map((field) => [field, fingerprint(fields[field])])),
    labels: fingerprint(labelIds(errand.labels)),
    routingLabels: fingerprint(
      labelIds(errand.labels.filter((candidate) => ROUTING_LABEL_ROOTS.has(labelRoot(candidate))))
    ),
    classification: fingerprint([
      errand.classification,
      labelIds(errand.labels.filter((candidate) => labelRoot(candidate) === CLASSIFICATION_LABEL_ROOT)),
    ]),
    assignedUserId: fingerprint(errand.assignedUserId?.trim().toLowerCase()),
    status: fingerprint(errand.status),
    activePhase: fingerprint(errand.phases?.find((phase) => !phase.ended)?.phaseId),
  };
};

const schemaVersionFromId = (schemaId: string): string => schemaId.split('_').at(-1) ?? '';

const isLegacySchemaVersion = (version: string): boolean => {
  const [major = Number.NaN, minor = Number.NaN] = version.split('.').map(Number);
  return major < 1 || (major === 1 && minor <= 0);
};

const schemaValueForId = (request: SchemaRequest, schemaId: string): JsonObject => {
  const value = structuredClone(request.value);
  const version = schemaVersionFromId(schemaId) || request.version;
  const publishedId = value.$id;
  value.$id =
    typeof publishedId === 'string'
      ? `${publishedId.slice(0, publishedId.lastIndexOf('/') + 1)}${version}`
      : `https://schemas.sundsvall.se/${municipalityId}/${request.name}/${version}`;

  if (isLegacySchemaVersion(version)) delete value['x-draken-external-fields'];
  return value;
};

const uiSchemaValueForId = (request: UiSchemaRequest, schemaId: string): JsonObject => {
  const value = structuredClone(request.value);
  if (!isLegacySchemaVersion(schemaVersionFromId(schemaId))) return value;

  const sections = value['ui:sections'];
  if (Array.isArray(sections)) {
    value['ui:sections'] = sections.map((section) => {
      if (!section || typeof section !== 'object' || Array.isArray(section)) return section;
      const fields = (section as JsonObject).fields;
      return {
        ...(section as JsonObject),
        fields: Array.isArray(fields)
          ? fields.filter((field) => typeof field !== 'string' || !field.startsWith('$external:'))
          : fields,
      };
    });
  }
  return value;
};

interface ClassificationPatchSelection {
  classification: { category: string; type: string };
  categoryLabels: Array<{ id: string }>;
}

interface ClassificationPatchBody {
  seenFacts: Record<string, string>;
  classifications: ClassificationPatchSelection[];
  documentKey: string;
  documentETag: string;
}

const hasOnlyKeys = (value: JsonObject, keys: readonly string[]): boolean =>
  Object.keys(value).length === keys.length && keys.every((key) => key in value);

const isClassificationPatchSelection = (selection: unknown): selection is ClassificationPatchSelection => {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return false;
  const value = selection as JsonObject;
  if (!hasOnlyKeys(value, ['classification', 'categoryLabels'])) return false;
  if (!value.classification || typeof value.classification !== 'object' || Array.isArray(value.classification)) {
    return false;
  }

  const classification = value.classification as JsonObject;
  return (
    hasOnlyKeys(classification, ['category', 'type']) &&
    typeof classification.category === 'string' &&
    typeof classification.type === 'string' &&
    Array.isArray(value.categoryLabels) &&
    value.categoryLabels.length > 0 &&
    value.categoryLabels.every(
      (labelReference) =>
        Boolean(labelReference) &&
        typeof labelReference === 'object' &&
        !Array.isArray(labelReference) &&
        hasOnlyKeys(labelReference as JsonObject, ['id']) &&
        typeof (labelReference as JsonObject).id === 'string'
    )
  );
};

const isClassificationPatchBody = (body: unknown): body is ClassificationPatchBody => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const value = body as JsonObject;
  if (!hasOnlyKeys(value, ['seenFacts', 'classifications', 'documentKey', 'documentETag'])) return false;

  return (
    Boolean(value.seenFacts) &&
    typeof value.seenFacts === 'object' &&
    !Array.isArray(value.seenFacts) &&
    typeof value.documentKey === 'string' &&
    typeof value.documentETag === 'string' &&
    Array.isArray(value.classifications) &&
    value.classifications.length > 0 &&
    value.classifications.every(isClassificationPatchSelection)
  );
};

/** Like the BFF: every classification is kept as labels, and the errand's own field takes the SoL/LSS one. */
const errandClassificationOf = (selections: readonly ClassificationPatchSelection[]) =>
  (selections.find(({ classification }) => /(^|\/)SOL_LSS$/iu.test(classification.category)) ?? selections[0])
    .classification;

export async function installIafApiMock(page: Page, scenario: IafApiScenario = {}): Promise<IafApiTrace> {
  const investigationProfile = scenario.investigationProfile ?? defaultInvestigationProfile();
  const configuredDocumentKeys = new Set(investigationProfile.documents.map(({ key }) => key));
  // The report is served through the same JSON parameter route as the investigation documents.
  if (investigationProfile.reportDocument) configuredDocumentKeys.add(investigationProfile.reportDocument.key);
  const documents: Record<string, InvestigationDocument> = structuredClone(
    scenario.documents ?? { 'utredning-enhetschef': existingManagerDocument() }
  );
  const eventType = scenario.eventType ?? 'AVVIKELSE';
  let errandClassification: { category: string; type: string } = structuredClone(
    scenario.classification ??
      (eventType === 'MISSFORHALLANDE'
        ? {
            category: scenario.omitLabelResourcePaths
              ? 'SOL_LSS'
              : iafLabelFixture.classification.solLssOwner.resourcePath,
            type: scenario.omitLabelResourcePaths
              ? 'LEGAL_CERTAINTY'
              : iafLabelFixture.classification.legalCertainty.resourcePath,
          }
        : {
            category: scenario.omitLabelResourcePaths ? 'HSL' : iafLabelFixture.classification.hslOwner.resourcePath,
            type: scenario.omitLabelResourcePaths ? 'REHAB' : iafLabelFixture.classification.rehab.resourcePath,
          })
  );
  let errandLabels: MockLabel[] = structuredClone(
    scenario.labels ??
      (scenario.omitLabelResourcePaths
        ? withoutResourcePaths(eventType === 'MISSFORHALLANDE' ? misconductLabels : deviationLabels)
        : eventType === 'MISSFORHALLANDE'
        ? misconductLabels
        : deviationLabels)
  );
  let classificationPatchAttempts = 0;
  let errandParameters: Array<{ key: string; displayName?: string; values?: string[]; version?: number }> = [
    { key: 'eventType', displayName: 'Rapporttyp', values: [eventType] },
    ...structuredClone(scenario.parameters ?? []),
  ];
  let errandVersion = 7;
  let errandStatus = scenario.errandStatus ?? 'ONGOING';
  let errandAssignedUserId =
    // An errand is the signed-in handler's unless the scenario says otherwise, the same under IAF and VOF.
    scenario.assignedUserId === null ? undefined : scenario.assignedUserId ?? signedInUsername;
  let activePhaseName = scenario.activePhaseName;
  const scenarioPhases = scenario.metadataPhases ?? (activePhaseName ? workflowPhases : undefined);
  const trace: IafApiTrace = {
    profileGets: 0,
    exactSchemaIds: [],
    latestSchemaNames: [],
    documentGets: [],
    puts: [],
    classificationPatches: [],
    errandPatches: [],
    writes: [],
    reports: [],
    phasePatches: [],
    adminPatches: [],
    handovers: [],
    locationManagerGets: [],
    parameterPuts: [],
    registrations: [],
    notificationAcknowledgements: [],
    writeRequestGroupIds: [],
  };

  // Support Management reports the phase an errand is in as the one entry of its history that has
  // started but not ended; `activePhaseId` itself never comes back on a read.
  const phaseHistory = () => {
    if (!activePhaseName) return {};
    const activeIndex = workflowPhases.findIndex(({ name }) => name === activePhaseName);
    return {
      phases: workflowPhases.slice(0, activeIndex + 1).map((phase, index) => ({
        phaseId: phase.id,
        name: phase.name,
        displayName: phase.displayName,
        started: `2026-08-0${index + 1}T10:00:00.000+02:00`,
        ...(index < activeIndex ? { ended: `2026-08-0${index + 2}T10:00:00.000+02:00` } : {}),
      })),
    };
  };

  const buildUpstreamErrand = () => ({
    id: errandId,
    errandNumber,
    title: `${errandNumberPrefix}-avvikelse för test`,
    description: '<p>Inrapporterad avvikelse.</p>',
    priority: 'MEDIUM',
    status: errandStatus,
    resolution: 'NONE',
    channel: scenario.errandChannel ?? 'WEB_UI',
    ...(errandAssignedUserId ? { assignedUserId: errandAssignedUserId } : {}),
    reporterUserId: `${deploymentSlug}.reporter`,
    created: '2026-08-01T10:00:00.000+02:00',
    modified: '2026-08-12T09:00:00.000+02:00',
    version: errandVersion,
    ...(scenario.activePhaseId
      ? {
          phases: [
            { phaseId: scenario.activePhaseId, name: scenario.activePhaseId, started: '2026-08-01T10:00:00.000+02:00' },
          ],
        }
      : {}),
    classification: structuredClone(errandClassification),
    labels: structuredClone(errandLabels),
    ...phaseHistory(),
    actions: [],
    parameters: structuredClone(errandParameters),
    stakeholders: [
      {
        externalId: 'reporter-id',
        externalIdType: 'EMPLOYEE',
        role: 'REPORTER',
        firstName: 'Rita',
        lastName: 'Rapportör',
        contactChannels: [],
      },
      ...(scenario.brukare
        ? [
            {
              externalId: scenario.brukare.partyId,
              externalIdType: 'PRIVATE',
              role: 'PRIMARY',
              firstName: scenario.brukare.firstName,
              lastName: scenario.brukare.lastName,
              contactChannels: [],
            },
          ]
        : []),
      ...(scenario.otherParty
        ? [
            {
              externalIdType: 'PRIVATE',
              role: 'CONTACT',
              firstName: scenario.otherParty.firstName,
              lastName: scenario.otherParty.lastName,
              contactChannels: [],
            },
          ]
        : []),
    ],
    jsonParameters: [
      katlaParameter,
      ...Object.values(documents).map((document) => ({
        key: document.key,
        schemaId: document.schemaId,
        value: structuredClone(document.value),
      })),
    ],
  });

  /** The errand as the BFF hands it out: with the facts the commands made on it send back. */
  const buildErrand = () => {
    const errand = buildUpstreamErrand();
    return { ...errand, facts: mockErrandFacts(errand) };
  };

  /**
   * Like the BFF's `assertErrandFactsUnchanged`: a command sends what the handler saw of the errand, and the facts it
   * depends on have to be as they saw them. Answers whether the command was refused, and refuses it when it is.
   */
  const refusesUnseenChange = async (route: Route, seen: unknown, facts: readonly string[]): Promise<boolean> => {
    const seenFacts = seen && typeof seen === 'object' && !Array.isArray(seen) ? (seen as Record<string, unknown>) : {};
    const missing = facts.filter((fact) => typeof seenFacts[fact] !== 'string');
    if (missing.length > 0) {
      await fulfillJson(
        route,
        { message: `The command must send what the handler saw of: ${missing.join(', ')}` },
        400
      );
      return true;
    }
    const current = mockErrandFacts(buildUpstreamErrand());
    if (facts.some((fact) => seenFacts[fact] !== current[fact])) {
      await fulfillJson(
        route,
        {
          message:
            'Ändringen sparades inte: någon annan har ändrat ärendet sedan du öppnade det. Ladda om ärendet och gör om ändringen.',
        },
        409
      );
      return true;
    }
    return false;
  };

  // The handler `/me` answers for is signed in, so the protected pages (Översikt, Registrera) open without a login.
  await page
    .context()
    .addCookies([{ name: 'connect.sid', value: 'test-session', domain: new URL(backendOrigin).hostname, path: '/' }]);

  await page.route(`${backendOrigin}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method !== 'GET') trace.writeRequestGroupIds.push(request.headers()['x-request-group-id']);

    // Support Management's subscriber model: the user's notifications and their acknowledgement when an
    // errand opens.
    if (method === 'GET' && path.endsWith(`/supportnotifications`)) {
      await fulfillJson(route, []);
      return;
    }
    const acknowledgeAll = path.match(/\/supportnotifications\/([^/]+)\/acknowledge-all$/u);
    if (method === 'PUT' && acknowledgeAll) {
      trace.notificationAcknowledgements.push(acknowledgeAll[1]);
      await fulfillJson(route, { acknowledged: [], failed: [] });
      return;
    }

    if (method === 'GET' && path.endsWith('/errand-access')) {
      await fulfillJson(route, { level: scenario.errandAccessLevel ?? 'RW' });
      return;
    }

    if (method === 'GET' && path.endsWith('/investigation-access')) {
      await fulfillJson(
        route,
        {
          municipalityId,
          errandId,
          documents: investigationProfile.documents.map(({ key }) => ({
            key,
            access: scenario.documentAccess ? scenario.documentAccess[key] ?? 'hidden' : 'edit',
          })),
        },
        scenario.investigationAccessStatus ?? 200
      );
      return;
    }

    if (method === 'GET' && path.endsWith('/supportmanagement/investigation-profile')) {
      trace.profileGets += 1;
      const response =
        scenario.investigationProfileResponse === undefined
          ? investigationProfile
          : scenario.investigationProfileResponse;
      await fulfillJson(route, response, scenario.investigationProfileStatus ?? 200);
      return;
    }

    if (method === 'GET' && /\/newerrand\/options$/u.test(path)) {
      // The BFF answers with the options themselves, not wrapped in `{ data }` - wrapping them here
      // once hid a client that read the wrapper and failed against every real backend.
      await fulfillJson(route, scenario.registrationOptions ?? { reportTypes: [], locations: [], priorities: [] });
      return;
    }

    if (method === 'POST' && /\/newerrand$/u.test(path)) {
      const body = request.postDataJSON() as {
        reportTypeLabelId?: string;
        locationLabelId?: string;
        priority?: string;
      };
      trace.registrations.push(body);
      // The BFF sends Support Management's created errand straight back, not wrapped in an envelope.
      await fulfillJson(route, { id: errandId, errandNumber }, 201);
      return;
    }

    if (method === 'GET' && path.endsWith('/me')) {
      await fulfillJson(
        route,
        apiResponse({
          name: 'Iaf Testare',
          firstName: 'Iaf',
          lastName: 'Testare',
          email: `${signedInUsername}@example.test`,
          username: signedInUsername,
          permissions: {
            canEditSupportManagement: scenario.canEdit ?? true,
          },
          roleKeys: scenario.roleKeys ?? [],
          superadmin: false,
        })
      );
      return;
    }

    if (method === 'GET' && path.endsWith('/users/admins')) {
      await fulfillJson(route, { ...apiResponse(scenario.administrators ?? []), roles: mockHandlerRoles });
      return;
    }

    if (method === 'GET' && path.endsWith(`/supportmetadata`)) {
      await fulfillJson(route, {
        ...metadata,
        ...(scenario.statuses ? { statuses: scenario.statuses } : {}),
        ...(scenarioPhases ? { phases: scenarioPhases } : {}),
        labels: {
          labelStructure:
            scenario.labelStructure ??
            (scenario.omitLabelResourcePaths ? withoutResourcePaths(labelStructure) : labelStructure),
        },
      });
      return;
    }

    if (method === 'PATCH' && path.endsWith(`/supporterrands/${errandId}/phase`)) {
      const body = requestBody(request) as { transitionId?: string; expectedActivePhaseId?: string | null } | undefined;
      trace.phasePatches.push({ transitionId: body?.transitionId, expectedActivePhaseId: body?.expectedActivePhaseId });
      // Like the BFF: the precondition is the phase the client saw, not the errand's version.
      const currentPhaseId = activePhaseName ? workflowPhaseId(activePhaseName) : null;
      if ((body?.expectedActivePhaseId ?? null) !== currentPhaseId) {
        await fulfillJson(route, { message: 'Support errand phase has changed since it was loaded' }, 409);
        return;
      }
      const activePhase = workflowPhases.find(({ name }) => name === activePhaseName);
      const transition = activePhase?.transitions.find(({ id }) => id === body?.transitionId);
      if (!transition) {
        await fulfillJson(route, { message: 'Unknown phase transition' }, 400);
        return;
      }
      activePhaseName = transition.targetPhaseName;
      errandVersion += 1;
      await fulfillJson(route, buildErrand());
      return;
    }

    if (method === 'PATCH' && path.endsWith(`/supporterrands/${errandId}/classification`)) {
      const body = requestBody(request);
      classificationPatchAttempts += 1;
      trace.classificationPatches.push({ headers: request.headers(), body });
      trace.writes.push('classification');

      if (scenario.classificationPatchResult === 'bad-request') {
        await fulfillJson(route, { message: 'Klassificeringen kunde inte valideras.' }, 400);
        return;
      }
      if (scenario.classificationPatchResult === 'conflict') {
        await fulfillJson(
          route,
          {
            message:
              'Ändringen sparades inte: någon annan har ändrat ärendet sedan du öppnade det. Ladda om ärendet och gör om ändringen.',
          },
          409
        );
        return;
      }
      if (
        scenario.classificationPatchResult === 'server-error' ||
        (scenario.classificationPatchResult === 'server-error-once' && classificationPatchAttempts === 1)
      ) {
        await fulfillJson(route, { message: 'Support Management kunde inte spara klassificeringen.' }, 500);
        return;
      }
      if (!isClassificationPatchBody(body)) {
        await fulfillJson(route, { message: 'Invalid classification body' }, 400);
        return;
      }
      if (await refusesUnseenChange(route, body.seenFacts, ['classification'])) return;
      if (documents[body.documentKey]?.etag !== body.documentETag) {
        await fulfillJson(route, { message: 'Utredningsdokumentet har ändrats.' }, 409);
        return;
      }

      const resolvedCategoryLabels = body.classifications
        .flatMap(({ categoryLabels }) => categoryLabels)
        .map(({ id }) => allLabelsById.get(id));
      if (resolvedCategoryLabels.some((resolvedLabel) => !resolvedLabel)) {
        await fulfillJson(route, { message: 'Unknown label id' }, 400);
        return;
      }

      errandClassification = structuredClone(errandClassificationOf(body.classifications));
      errandLabels = [
        ...errandLabels.filter(({ resourcePath }) => !resourcePath?.toUpperCase().startsWith('CATEGORY/')),
        ...resolvedCategoryLabels.map((resolvedLabel) => structuredClone(resolvedLabel!)),
      ];
      errandVersion += 1;
      await fulfillJson(route, buildErrand());
      return;
    }

    if (method === 'PATCH' && path.endsWith(`/supporterrands/${errandId}/admin`)) {
      const body = requestBody(request) as { assignedUserId?: string; seenFacts?: unknown } | undefined;
      // Like the BFF: the errand is given away from the handler the handler saw holding it.
      if (await refusesUnseenChange(route, body?.seenFacts, ['assignedUserId'])) return;
      errandAssignedUserId = body?.assignedUserId;
      trace.adminPatches.push(body?.assignedUserId);
      errandVersion += 1;
      await fulfillJson(route, buildErrand());
      return;
    }

    if (method === 'PATCH' && path.endsWith(`/supporterrands/${errandId}/status`)) {
      if (scenario.statusTransitionResult === 'bad-request') {
        await fulfillJson(route, { message: 'Target status is not available in Support Management metadata' }, 400);
        return;
      }
      const body = requestBody(request) as { status?: string; seenFacts?: unknown } | undefined;
      // Like the BFF: the transition starts from the status and the phase the handler saw.
      if (await refusesUnseenChange(route, body?.seenFacts, ['status', 'activePhase'])) return;
      if (body?.status) errandStatus = body.status;
      errandVersion += 1;
      await fulfillJson(route, buildErrand());
      return;
    }

    if (
      method === 'GET' &&
      scenario.assignableHandlers &&
      path.endsWith(`/supporterrands/${errandId}/assignable-handlers`)
    ) {
      const answer =
        scenario.assignableHandlers.afterDocumentSave && trace.puts.length > 0
          ? scenario.assignableHandlers.afterDocumentSave
          : scenario.assignableHandlers;
      await fulfillJson(route, { ...apiResponse(answer.handlers), ...(answer.roles ? { roles: answer.roles } : {}) });
      return;
    }

    if (method === 'GET' && path.endsWith(`/supporthistory/${errandId}/assignee-resumed`)) {
      await fulfillJson(route, { resumedAt: scenario.assigneeResumedAt ?? null });
      return;
    }

    if (method === 'GET' && path.endsWith(`/supporthistory/${errandId}/assigned-by`)) {
      await fulfillJson(route, { assignedBy: scenario.assignedBy ?? null });
      return;
    }

    const parameterMatch = path.match(new RegExp(`/supporterrands/${errandId}/parameters/([^/]+)$`, 'u'));
    if (method === 'PUT' && parameterMatch) {
      // One parameter, conditioned on its own version - or, when new, on there being none.
      const key = decodeURIComponent(parameterMatch[1]);
      const body = (requestBody(request) ?? {}) as { values?: string[]; displayName?: string };
      const headers = request.headers();
      trace.parameterPuts.push({
        key,
        values: body.values,
        ...(headers['if-match'] ? { ifMatch: headers['if-match'] } : {}),
        ...(headers['if-none-match'] ? { ifNoneMatch: headers['if-none-match'] } : {}),
      });
      const existing = errandParameters.find((parameter) => parameter.key === key);
      const saved = {
        key,
        displayName: body.displayName ?? existing?.displayName,
        values: body.values ?? [],
        version: (existing?.version ?? 0) + 1,
      };
      errandParameters = existing
        ? errandParameters.map((parameter) => (parameter.key === key ? saved : parameter))
        : [...errandParameters, saved];
      // Versions roll up: a parameter written moves the errand's version too.
      errandVersion += 1;
      await fulfillJson(route, saved);
      return;
    }

    // An errand with no measures, as the BFF answers it. A spec about measures routes its own in front of this.
    if (method === 'GET' && path.endsWith(`/supporterrands/${errandId}/measures`)) {
      await fulfillJson(route, {
        measures: [],
        metadata: { measureTypes: [], roles: [] },
        creationRoles: [],
        registration: { status: 'unconfigured', roleTypes: [] },
        canWrite: true,
        // The unit's managers follow up measures, as the BFF answers by role.
        mayFollowUp: (scenario.roleKeys ?? []).some((roleKey) => ['enhetschef', 'verksamhetschef'].includes(roleKey)),
        ...(scenario.measuresCloseRefusal ? { closeRefusal: scenario.measuresCloseRefusal } : {}),
        ...(scenario.measuresFollowUpRefusal ? { followUpRefusal: scenario.measuresFollowUpRefusal } : {}),
      });
      return;
    }

    if (method === 'GET' && path.endsWith(`/supporterrands/${errandId}/unit-manager`)) {
      // The deepest place the errand carries, as the BFF resolves it for the return to a manager.
      const place = [...errandLabels].reverse().find((candidate) => candidate.classification === 'LOCATION');
      await fulfillJson(route, {
        candidates: (place && scenario.locationManagers?.[place.id]) ?? [],
        roles: [
          { key: 'UNIT_MANAGER', label: 'Enhetschef' },
          { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
        ],
        locationResourcePath: place?.resourcePath ?? '',
        locationDisplayName: place?.displayName ?? '',
      });
      return;
    }

    const locationManagersMatch = path.match(new RegExp(`/supporterrands/${errandId}/location-managers/([^/]+)$`, 'u'));
    if (method === 'GET' && locationManagersMatch) {
      const labelId = decodeURIComponent(locationManagersMatch[1]);
      trace.locationManagerGets.push(labelId);
      const place = allLabelsById.get(labelId);
      if (!place) {
        await fulfillJson(route, { message: 'The selected place does not exist in Support Management metadata' }, 400);
        return;
      }
      await fulfillJson(route, {
        candidates: scenario.locationManagers?.[labelId] ?? [],
        roles: [
          { key: 'UNIT_MANAGER', label: 'Enhetschef' },
          { key: 'HEAD_OF_OPERATIONS', label: 'Verksamhetschef' },
        ],
        locationResourcePath: place.resourcePath,
        locationDisplayName: place.displayName,
      });
      return;
    }

    const handoverMatch = path.match(new RegExp(`/supporterrands/${errandId}/investigation-handover/([^/]+)$`, 'u'));
    if (method === 'POST' && handoverMatch) {
      const step = decodeURIComponent(handoverMatch[1]);
      const body = (requestBody(request) ?? {}) as {
        seenFacts?: Record<string, string>;
        assignedUserId?: string;
        locationLabelId?: string;
      };
      trace.handovers.push({ step, ...body });
      if (scenario.handoverResult === 'conflict') {
        await fulfillJson(route, { message: 'If-Match does not match the current support errand version' }, 412);
        return;
      }
      // Like the BFF: the errand is handed over from the handler, the status and the routing the handler saw.
      if (await refusesUnseenChange(route, body.seenFacts, ['assignedUserId', 'status', 'routingLabels'])) return;
      if (step === 'move-location') {
        // The BFF's rule, mirrored: every label under the place structure goes, the target's whole
        // chain comes, everything else stays. The JSON parameters are never touched.
        const target = body.locationLabelId ? allLabelsById.get(body.locationLabelId) : undefined;
        if (!target) {
          await fulfillJson(
            route,
            { message: 'The selected place does not exist in Support Management metadata' },
            400
          );
          return;
        }
        const placeIds = new Set<string>();
        const collectIds = (nodes: readonly MockLabel[]) =>
          nodes.forEach((node) => {
            placeIds.add(node.id);
            if (node.labels) collectIds(node.labels);
          });
        collectIds(placeRoot.labels ?? []);
        const chain: MockLabel[] = [];
        const findChain = (nodes: readonly MockLabel[], ancestors: MockLabel[]): boolean =>
          nodes.some((node) => {
            const path = [...ancestors, node];
            if (node.id === target.id) {
              chain.push(...path);
              return true;
            }
            return node.labels ? findChain(node.labels, path) : false;
          });
        findChain(placeRoot.labels ?? [], []);
        errandLabels = [...errandLabels.filter(({ id }) => !placeIds.has(id)), ...chain.map(withoutChildren)];
      }
      if (step === 'request-vc-comment' && !errandLabels.some(({ id }) => id === vcCommentRequested.id)) {
        // Like the BFF: the request label is all the step writes. Nobody is assigned.
        errandLabels = [...errandLabels, withoutChildren(vcCommentRequested)];
      }
      if (body.assignedUserId) errandAssignedUserId = body.assignedUserId;
      errandVersion += 1;
      await route.fulfill({ status: 204 });
      return;
    }

    if (method === 'PATCH' && path.endsWith(`/supporterrands/${errandId}`)) {
      const body = requestBody(request);
      trace.errandPatches.push(body);
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        // Like the BFF: each field written is checked against what the handler saw of it, and nothing else of the errand.
        const { seenFacts, ...changes } = body as Record<string, unknown>;
        if (await refusesUnseenChange(route, seenFacts, Object.keys(changes))) return;
        if ('classification' in body && body.classification && typeof body.classification === 'object') {
          errandClassification = structuredClone(body.classification as { category: string; type: string });
        }
        if ('labels' in body && Array.isArray(body.labels)) {
          const labelIds = body.labels
            .map((candidate) =>
              candidate && typeof candidate === 'object' && 'id' in candidate ? String(candidate.id) : undefined
            )
            .filter((id): id is string => Boolean(id));
          errandLabels = labelIds
            .map((id) => allLabelsById.get(id))
            .filter((candidate): candidate is MockLabel => Boolean(candidate))
            .map((candidate) => structuredClone(candidate));
        }
      }
      errandVersion += 1;
      await fulfillJson(route, buildErrand());
      return;
    }

    if (
      method === 'GET' &&
      (path.endsWith(`/supporterrands/errandnumber/${errandNumber}`) || path.endsWith(`/supporterrands/${errandId}`))
    ) {
      await fulfillJson(route, buildErrand());
      return;
    }

    const reportMatch = path.match(/\/json-parameters\/([^/]+)\/reports$/u);
    if (method === 'POST' && reportMatch) {
      const key = decodeURIComponent(reportMatch[1]);
      const body = requestBody(request) as { preview?: boolean } | undefined;
      const preview = body?.preview === true;
      trace.reports.push({ key, preview });
      const document = documents[key];
      if (!document) {
        await fulfillJson(route, { message: 'JSON parameter not found' }, 404);
        return;
      }
      if (document.value.completed !== 'yes') {
        await fulfillJson(route, { message: 'Mark the investigation as completed before generating a report' }, 409);
        return;
      }
      const existingReports = Array.isArray(document.value.reports) ? (document.value.reports as JsonObject[]) : [];
      const sequence = existingReports.length + 1;
      const fileName = `Rapport_${sequence}.pdf`;
      if (preview) {
        await fulfillJson(route, { data: { fileName, pdfBase64: 'JVBERi0xLjQK' }, message: 'rendered' }, 200);
        return;
      }
      const entry = {
        generatedAt: '2026-09-11T12:30:00.000Z',
        generatedBy: `${deploymentSlug}.test`,
        fileName,
        attachmentId: `attachment-${sequence}`,
      };
      const nextVersion = document.version + 1;
      const updated: InvestigationDocument = {
        ...document,
        value: { ...document.value, reports: [...existingReports, entry] },
        version: nextVersion,
        etag: `"${nextVersion}"`,
      };
      documents[key] = updated;
      // The reservation, the upload and the confirmation each move the errand's version upstream.
      errandVersion += 3;
      const { etag, ...responseDocument } = updated;
      await fulfillJson(route, { data: { document: responseDocument, report: entry }, message: 'attached' }, 201, {
        etag,
        'access-control-expose-headers': 'ETag',
      });
      return;
    }

    const documentMatch = path.match(/\/json-parameters\/([^/]+)$/u);
    if (documentMatch) {
      const key = decodeURIComponent(documentMatch[1]);
      if (!configuredDocumentKeys.has(key)) {
        await fulfillJson(route, { message: 'Unsupported investigation document' }, 400);
        return;
      }

      if (method === 'GET') {
        trace.documentGets.push(key);
        if (scenario.documentReadAccessDeniedFor === key) {
          await fulfillJson(route, { message: 'Forbidden' }, 403);
          return;
        }
        const document = documents[key];
        if (!document) {
          await fulfillJson(route, { message: 'JSON parameter not found' }, 404);
          return;
        }

        const { etag, ...responseDocument } = document;
        await fulfillJson(route, responseDocument, 200, {
          etag,
          'access-control-expose-headers': 'ETag',
        });
        return;
      }

      if (method === 'PUT') {
        const body = requestBody(request);
        trace.puts.push({ key, headers: request.headers(), body });
        trace.writes.push('document');

        if (scenario.putResult === 'conflict') {
          await fulfillJson(route, { message: 'Utredningen har en nyare version.' }, 412);
          return;
        }

        if (
          !body ||
          typeof body !== 'object' ||
          !('schemaId' in body) ||
          typeof body.schemaId !== 'string' ||
          !('value' in body) ||
          !body.value ||
          typeof body.value !== 'object' ||
          Array.isArray(body.value)
        ) {
          await fulfillJson(route, { message: 'Invalid JSON parameter body' }, 400);
          return;
        }

        const existingDocument = documents[key];
        const previousVersion = existingDocument?.version ?? -1;
        const nextVersion = previousVersion + 1;
        const updated: InvestigationDocument = {
          key,
          schemaId: body.schemaId,
          value: structuredClone(body.value as JsonObject),
          version: nextVersion,
          etag: `"${nextVersion}"`,
        };
        documents[key] = updated;
        errandVersion += 1;
        // The BFF marks the errand with a high HSL risk in the same call, when the unit manager's investigation
        // assesses one, the namespace has the label and the errand does not carry it yet.
        const hslRisk = updated.value.riskAssessmentHsl as { calculatedRiskValue?: unknown } | undefined;
        const marksHighHslRisk =
          key === 'utredning-enhetschef' &&
          typeof hslRisk?.calculatedRiskValue === 'number' &&
          hslRisk.calculatedRiskValue >= 4 &&
          JSON.stringify(scenario.labelStructure ?? []).includes(`"${highHslRisk.id}"`) &&
          !errandLabels.some(({ id }) => id === highHslRisk.id);
        if (marksHighHslRisk) {
          // Like the BFF, the label is added with the level above it, as registration adds a label.
          const riskChain = [riskRoot, highHslRisk].filter(
            ({ id }) => !errandLabels.some((carried) => carried.id === id)
          );
          errandLabels = [...errandLabels, ...riskChain.map(withoutChildren)];
          errandVersion += 1;
        }
        const { etag, ...responseDocument } = updated;
        await fulfillJson(route, responseDocument, existingDocument ? 200 : 201, {
          etag,
          'access-control-expose-headers': 'ETag',
        });
        return;
      }
    }

    const latestSchemaMatch = path.match(new RegExp(`/schemas/([^/]+)/latest$`, 'u'));
    if (method === 'GET' && latestSchemaMatch && decodeURIComponent(latestSchemaMatch[1]) === reportSchema.name) {
      trace.latestSchemaNames.push(reportSchema.name);
      await fulfillJson(route, apiResponse(reportSchema));
      return;
    }
    if (method === 'GET' && latestSchemaMatch) {
      const name = decodeURIComponent(latestSchemaMatch[1]);
      if (!isInvestigationKey(name)) {
        await fulfillJson(route, { message: 'Schema not found' }, 404);
        return;
      }

      trace.latestSchemaNames.push(name);
      if (scenario.schemaFailureFor === name) {
        await fulfillJson(route, { message: 'Schema service unavailable' }, 503);
        return;
      }

      const schemaRequest = schemaRequests[name];
      const schemaValue = schemaValueForId(schemaRequest, latestSchemaIds[name]);
      if (scenario.classificationDeclarationMissingFor === name) {
        delete schemaValue['x-draken-external-fields'];
      }
      await fulfillJson(
        route,
        apiResponse({
          id: latestSchemaIds[name],
          name,
          version: schemaRequest.version,
          value: schemaValue,
          description: schemaRequest.description,
        })
      );
      return;
    }

    const uiSchemaMatch = path.match(new RegExp(`/schemas/([^/]+)/ui-schema$`, 'u'));
    if (method === 'GET' && uiSchemaMatch) {
      const schemaId = decodeURIComponent(uiSchemaMatch[1]);
      if (schemaId === katlaSchemaId) {
        await fulfillJson(route, apiResponse({ id: schemaId, value: {} }));
        return;
      }
      if (schemaId === reportSchemaId) {
        await fulfillJson(route, apiResponse({ id: schemaId, value: reportUiSchema }));
        return;
      }

      const key = investigationKeys.find((candidate) => schemaId.includes(candidate));
      if (!key) {
        await fulfillJson(route, { message: 'UI schema not found' }, 404);
        return;
      }

      const uiSchemaValue = uiSchemaValueForId(uiSchemaRequests[key], schemaId);
      if (scenario.classificationSlotMisplacedFor === key && Array.isArray(uiSchemaValue['ui:sections'])) {
        uiSchemaValue['ui:sections'] = uiSchemaValue['ui:sections'].map((section, index) => {
          if (!section || typeof section !== 'object' || Array.isArray(section)) return section;
          const fields = (section as JsonObject).fields;
          if (!Array.isArray(fields)) return section;
          const fieldsWithoutClassification = fields.filter((field) => field !== '$external:errandClassification');
          return {
            ...(section as JsonObject),
            fields:
              index === 0
                ? ['$external:errandClassification', ...fieldsWithoutClassification]
                : fieldsWithoutClassification,
          };
        });
      }

      await fulfillJson(
        route,
        apiResponse({
          id: schemaId,
          value: uiSchemaValue,
          description: uiSchemaRequests[key].description,
        })
      );
      return;
    }

    const exactSchemaMatch = path.match(new RegExp(`/schemas/([^/]+)$`, 'u'));
    if (method === 'GET' && exactSchemaMatch) {
      const schemaId = decodeURIComponent(exactSchemaMatch[1]);
      trace.exactSchemaIds.push(schemaId);
      if (schemaId === katlaSchemaId) {
        await fulfillJson(route, apiResponse(katlaSchema));
        return;
      }
      if (schemaId === reportSchemaId) {
        await fulfillJson(route, apiResponse(reportSchema));
        return;
      }

      const key = investigationKeys.find((candidate) => schemaId.includes(candidate));
      if (!key) {
        await fulfillJson(route, { message: 'Schema not found' }, 404);
        return;
      }

      if (scenario.schemaFailureFor === key) {
        await fulfillJson(route, { message: 'Schema service unavailable' }, 503);
        return;
      }

      const schemaRequest = schemaRequests[key];
      const version = schemaVersionFromId(schemaId) || schemaRequest.version;
      const schemaValue = schemaValueForId(schemaRequest, schemaId);
      if (scenario.classificationDeclarationMissingFor === key) {
        delete schemaValue['x-draken-external-fields'];
      }
      await fulfillJson(
        route,
        apiResponse({
          id: schemaId,
          name: key,
          version,
          value: schemaValue,
          description: schemaRequest.description,
        })
      );
      return;
    }

    if (method === 'GET' && path.includes('/supportattachments/')) {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'GET' && path.includes('/supportmessage/')) {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'GET' && path.includes('/supportnotes/')) {
      await fulfillJson(route, { notes: [] });
      return;
    }

    if (method === 'GET' && path.includes('/communication/conversations/count-read-by')) {
      await fulfillJson(route, []);
      return;
    }

    if (method === 'GET' && path.includes('/communication/conversations')) {
      // The BFF conversation endpoint wraps its payload twice and the existing
      // frontend service returns the inner ApiResponse to its consumers.
      await fulfillJson(route, apiResponse(apiResponse([])));
      return;
    }

    if (method === 'GET' && path.includes('/relations/referredfrom/')) {
      await fulfillJson(route, apiResponse([]));
      return;
    }

    if (method === 'GET' && path.endsWith('/templates') && scenario.investigationTextTemplates) {
      const prefix = new URL(request.url()).searchParams.get('prefix') ?? '';
      const templates = Object.entries(scenario.investigationTextTemplates)
        .filter(([identifier]) => identifier.startsWith(prefix))
        .map(([identifier, text]) => ({ identifier, name: identifier, content: Buffer.from(text).toString('base64') }));
      await fulfillJson(route, apiResponse(templates));
      return;
    }

    await fulfillJson(route, {});
  });

  return trace;
}
