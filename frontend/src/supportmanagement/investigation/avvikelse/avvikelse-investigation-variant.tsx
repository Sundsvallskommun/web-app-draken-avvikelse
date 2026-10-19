'use client';

import { Spinner } from '@sk-web-gui/react';
import { MEASURE_FOLLOW_UP_PHASE_NAME } from '@supportmanagement/measures/measure-phases';
import dynamic from 'next/dynamic';

import type { InvestigationProfile } from '../investigation-profile';
import type {
  InvestigationDetailsHeaderProps,
  InvestigationErrandContext,
  InvestigationHandlerFieldsProps,
  InvestigationPhaseEntryContext,
  InvestigationPhaseEntryRequirementProps,
  InvestigationTabProps,
  InvestigationVariantModule,
  InvestigationViewer,
} from '../investigation-variant';
import {
  handsErrandToLexManager,
  leavesFollowUpToTheUnit,
  lexOverviewAssignee,
  requiresLexAssignment,
} from './assignment/avvikelse-assignment-policy';
import { actsAsMasMar } from './assignment/mas-mar-handler';
import { masMarOverviewFilter } from './assignment/mas-mar-overview-filter';
import { resolveAvvikelseClassificationPlacement } from './avvikelse-classification-placement';
import {
  isAvvikelseReportedMisconductErrand,
  resolveAvvikelseDocumentApplicability,
} from './avvikelse-classification-policy';
import { isDecisionInvestigationCompleted } from './avvikelse-decision-investigation';
import { AvvikelseInvestigationNotice } from './avvikelse-investigation-notice.component';
import { resolveAvvikelseNextStep, REVIEW_PHASE_NAME } from './avvikelse-next-step';
import { unitFollowUpMenuLabel } from './follow-up/unit-follow-up-scope';
import { concealedAvvikelseDocumentKeys } from './hsl-investigation-visibility';

/**
 * Loaded lazily on purpose. A static import would close a module cycle - the registry imports this
 * variant, whose tab renders documents whose classification code asks the registry which variant
 * owns classification. The dynamic import breaks that edge, and splits the tab into its own chunk.
 */
const SupportErrandInvestigationTab = dynamic(
  () => import('./support-errand-investigation-tab').then((module) => module.SupportErrandInvestigationTab),
  {
    loading: () => (
      <div className="flex justify-center p-24">
        <Spinner size={4} aria-label="Utredningen laddas" />
      </div>
    ),
  }
);

/**
 * Lazy for code-splitting only - unlike the tab it closes no cycle. The registry is imported statically by
 * the shared errand pages, so anything this module imports statically lands in every one of their bundles.
 */
const ErrandLocationCard = dynamic(
  () => import('./assignment/errand-location-card.component').then((module) => module.ErrandLocationCard),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const AvvikelseReportDocument = dynamic(
  () =>
    import('./report-document/avvikelse-report-document.component').then((module) => module.AvvikelseReportDocument),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const MasMarHandlerSelect = dynamic(
  () => import('./assignment/mas-mar-handler-select.component').then((module) => module.MasMarHandlerSelect),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const LexInitialAssessment = dynamic(
  () => import('./lex-initial-assessment.component').then((module) => module.LexInitialAssessment),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const InvestigationCompletionRequirement = dynamic(
  () =>
    import('./investigation-completion-requirement.component').then(
      (module) => module.InvestigationCompletionRequirement
    ),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const UndecidedProposalsRequirement = dynamic(
  () => import('./undecided-proposals-requirement.component').then((module) => module.UndecidedProposalsRequirement),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const UnitFollowUp = dynamic(
  () => import('./follow-up/unit-follow-up.component').then((module) => module.UnitFollowUp),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const PlaceManagers = dynamic(
  () => import('./place-managers/place-managers.component').then((module) => module.PlaceManagers),
  { loading: () => null }
);

/** Lazy for the same bundle reason as the location card. */
const LexAssignmentRequirement = dynamic(
  () => import('./assignment/lex-assignment-requirement.component').then((module) => module.LexAssignmentRequirement),
  { loading: () => null }
);
const LexManagerHandoverRequirement = dynamic(
  () =>
    import('./assignment/lex-manager-handover-requirement.component').then(
      (module) => module.LexManagerHandoverRequirement
    ),
  { loading: () => null }
);

/**
 * The phases the avvikelse process runs through, named as the namespace's phase metadata names them.
 * The documents belong to one phase each: the investigations are written while the errand is being
 * investigated, the decision once it has moved on to being decided. Naming the phases here is what
 * keeps the tabs from being reachable before the errand is there - a namespace whose phase model
 * does not use these names simply runs ungated, as it did before the phases existed.
 */
const INVESTIGATION_PHASE_NAME = 'INVESTIGATION';
const DECISION_PHASE_NAME = 'DECISION';

/**
 * The avvikelse utredning: the Utredning tab and its documents, the avvikelse label tree, and
 * classification owned by the investigation document rather than by Grundinformation. One
 * functional package, enabled by one capability flag.
 *
 * IAF and VOF happen to enable it today. Nothing in this module knows that.
 */
export const avvikelseInvestigationVariant: InvestigationVariantModule = Object.freeze({
  id: 'avvikelse',
  label: 'Utredning',
  requiredPhaseName: INVESTIGATION_PHASE_NAME,
  resolveClassificationPlacement: (profile: InvestigationProfile | null | undefined) =>
    resolveAvvikelseClassificationPlacement(profile),
  renderTab: (props: InvestigationTabProps) => <SupportErrandInvestigationTab {...props} />,
  renderNotice: () => <AvvikelseInvestigationNotice />,
  // Ärendets plats: a wrongly routed errand is moved from Ärendeuppgifter, not from inside an investigation.
  // Beneath it the report of an errand registered in Draken, which its unit manager fills in there.
  renderDetailsHeader: (props: InvestigationDetailsHeaderProps) => (
    <>
      <ErrandLocationCard {...props} />
      <AvvikelseReportDocument {...props} />
      <LexInitialAssessment {...props} />
    </>
  ),
  /**
   * The decision that closes the investigation: lex Sarah for a reported misconduct, the IVO
   * decision for an HSL deviation. The tab is always offered once the errand is being decided. When
   * there is nothing for this user to decide it says only that: that the errand calls for no decision
   * and moves on to the follow-up, or which role takes the decision.
   */
  decisionTab: {
    label: 'Beslut',
    requiredPhaseName: DECISION_PHASE_NAME,
    // Ä6. MAS/MAR decides on reporting an HSL deviation to IVO under the delegation, and does not hold the errand:
    // they are offered Beslut HSL from the moment it applies, whatever phase the handler has moved the errand to.
    isOfferedBeforePhase: ({ errand, viewer }: InvestigationErrandContext) =>
      actsAsMasMar(viewer) && resolveAvvikelseDocumentApplicability(errand) === 'hsl-deviation',
    isVisible: () => true,
    render: (props: InvestigationTabProps) => <SupportErrandInvestigationTab {...props} placement="decision" />,
  },
  phaseEntryRequirements: [
    /**
     * A suspected misconduct is handed to a LEX manager before it is decided. The dialog after saving
     * the unit manager's investigation can be put off; sending the errand to the decision cannot.
     */
    {
      phaseName: DECISION_PHASE_NAME,
      // The handler hands the errand over; the LEX manager sends it to the decision, as before.
      actionLabel: 'Tilldela LEX-ansvarig',
      isMet: (context: InvestigationPhaseEntryContext) => !requiresLexAssignment(context),
      render: (props: InvestigationPhaseEntryRequirementProps) => <LexAssignmentRequirement {...props} />,
    },
    /**
     * A LEX investigator does not send the errand to the decision: they hand it to a LEX manager, who does.
     * Before the investigation's own requirement, since finishing it would not let the investigator through.
     */
    {
      phaseName: DECISION_PHASE_NAME,
      actionLabel: 'Tilldela LEX-ansvarig',
      isMet: (context: InvestigationPhaseEntryContext) => !handsErrandToLexManager(context.viewer),
      render: (props: InvestigationPhaseEntryRequirementProps) => <LexManagerHandoverRequirement {...props} />,
    },
    /**
     * The errand is decided on a finished investigation: LEX's for a lex Sarah matter, the unit
     * manager's otherwise. Second, because a suspected misconduct has to reach LEX before LEX can
     * finish anything. The BFF holds the same rule.
     */
    {
      phaseName: DECISION_PHASE_NAME,
      actionLabel: 'Utredningen är inte klar',
      isMet: isDecisionInvestigationCompleted,
      render: (props: InvestigationPhaseEntryRequirementProps) => <InvestigationCompletionRequirement {...props} />,
    },
    /**
     * The unit follows up the measures, not LEX: a LEX handler hands the decided errand back to its manager, who
     * starts the follow-up, so the move is not offered to them at all. The BFF holds the same rule, for the close
     * that passes through the follow-up too.
     */
    {
      phaseName: MEASURE_FOLLOW_UP_PHASE_NAME,
      hidesTransition: true as const,
      isMet: (context: InvestigationPhaseEntryContext) => !leavesFollowUpToTheUnit(context.viewer),
    },
    /**
     * The follow-up follows up what was approved, so the unit decides on every proposal before the errand goes
     * there. The BFF says whether any waits, and refuses the move on the same rule.
     */
    {
      phaseName: MEASURE_FOLLOW_UP_PHASE_NAME,
      actionLabel: 'Bedöm åtgärdsförslagen',
      isMet: (context: InvestigationPhaseEntryContext) => !context.measuresFollowUpRefusal,
      render: (props: InvestigationPhaseEntryRequirementProps) => <UndecidedProposalsRequirement {...props} />,
    },
  ],
  /**
   * Verksamhetsuppföljning: the errands and measures of the units the user reaches, filtered on what the
   * investigations and decisions say. The entry is named for the viewer's role: Enhet, Enheter or
   * Verksamhetsområde.
   */
  followUp: {
    heading: 'Verksamhetsuppföljning',
    label: unitFollowUpMenuLabel,
    render: () => <UnitFollowUp />,
  },
  /**
   * Chefer per plats: which places each manager has, set in AccessMapper. It changes who reaches which errands, so
   * it is the administrators' alone - the BFF refuses everybody else.
   */
  administration: {
    heading: 'Administration',
    label: 'Chefer per plats',
    isOfferedTo: (viewer: InvestigationViewer) => viewer.superadmin === true,
    render: () => <PlaceManagers />,
  },
  /** The messages are how the handler asks the errand's parties for what the report left out. */
  messagesIntroduction:
    'Använd denna meddelandefunktion för att inhämta kompletterande uppgifter om ärendet med berörda parter',
  /** A manager or LEX handler may want to hear of an errand away from Draken: by e-mail, by SMS, or both. */
  notificationChannels: Object.freeze(['EMAIL', 'SMS'] as const),
  /**
   * `ACCESS/LEX` leaves the unit manager and head of operations with limited read on the errand while LEX
   * has it: the errand is shown locked, with this alert.
   */
  limitedAccessNotice: 'Du har begränsad behörighet till detta ärende.',
  /** MAS/MAR record who of them answers for the errand, beside the assignee. */
  renderHandlerFields: (props: InvestigationHandlerFieldsProps) => <MasMarHandlerSelect {...props} />,
  /** MAS/MAR narrow the overview to the errands with a high HSL risk. */
  overviewFilterToggle: masMarOverviewFilter,
  /** The errand's owner is the brukare the deviation concerns, never an employee. */
  rolesWithoutEmployeeSearch: Object.freeze(['PRIMARY']),
  /** The handler looks up and removes the brukare alone. The other parties come with the report and stay with it. */
  handlerManagedStakeholderRoles: Object.freeze(['PRIMARY']),
  /** MAS/MAR's HSL investigation is kept from the managers until the errand carries a high HSL risk. */
  concealedDocumentKeys: concealedAvvikelseDocumentKeys,
  /** While `ACCESS/LEX` is on the errand the overview says LEX has it, not which of LEX. */
  overviewAssignee: lexOverviewAssignee,
  /**
   * A reported misconduct goes to LEX, is decided and is followed up before it closes. Nobody closes it early; the
   * close from the follow-up stays. The BFF refuses the early close as well.
   */
  closesOnlyAtWorkflowEnd: (context: InvestigationErrandContext) => isAvvikelseReportedMisconductErrand(context.errand),
  /** A deviation closes early once its handling has started in the review, and the handler says why. */
  earlyClose: { fromPhaseName: REVIEW_PHASE_NAME },
  /** The manager who closes the errand tells the reporter what came of the report. */
  closingReminder: 'Återkoppla till rapportören hur det har gått med rapporten.',
  /** Reports come in through Katla, Draken's own e-service, which is not to be taken for an OpenE e-service. */
  channelLabels: { ESERVICE: 'Draken e-tjänst' },
  /** The handler is told what to do next and taken to where it is done: the report, a document, the decision. */
  nextStep: resolveAvvikelseNextStep,
});
