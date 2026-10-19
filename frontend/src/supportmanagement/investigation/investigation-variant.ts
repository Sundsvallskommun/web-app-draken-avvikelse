import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import type { SelectableNotificationChannel } from '@supportmanagement/components/notification-settings/notification-channel-settings';
import type {
  LabelFilterGroupDefinition,
  LabelFilterSelection,
} from '@supportmanagement/filters/label-filter-projector';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { hasReachedSupportPhase, type SupportPhaseContext } from '@supportmanagement/services/support-phase-service';
import type { ReactNode } from 'react';

import type { SupportErrandClassificationPlacement } from './classification-placement';
import type { InvestigationAccessState } from './investigation-access';
import type { InvestigationProfile } from './investigation-profile';

export interface InvestigationTabProps {
  readonly access: InvestigationAccessState;
  readonly refreshAccess: () => void;
  onDirtyChange: (key: string, isDirty: boolean) => void;
  /**
   * Brings the tab into view. Spara ärende in the sidebar saves what the tab holds, so a part it
   * could not save is shown to the handler, wherever they are.
   */
  readonly revealTab: () => void;
}

/** The errand as one viewer meets it: the errand, the runtime profile, the label tree and who is looking. */
export interface InvestigationErrandContext {
  readonly errand: SupportErrand | undefined;
  readonly profile: InvestigationProfile | null | undefined;
  readonly labelStructure: SupportErrand['labels'];
  /** Who is looking: a variant may treat one role differently from another. */
  readonly viewer: InvestigationViewer;
}

/** What the next step is judged on: the errand and its viewer, where the errand is in the workflow, and who reads it. */
export interface InvestigationNextStepContext extends InvestigationErrandContext {
  readonly phases: SupportPhaseContext;
  /** The viewer's account, which tells the errand's handler from somebody reading along. */
  readonly viewerAccount: string | undefined;
  /** Why the errand's measures keep it from the follow-up, as the BFF says it; undefined when nothing is known to. */
  readonly measuresFollowUpRefusal?: string;
}

/** What the handler does next, and the tab of the errand page it is done in. */
export interface InvestigationNextStep {
  readonly text: string;
  /** The tab the work is done in: the errand opens on it, and the step offers to go there. */
  readonly tab?: { readonly key: string; readonly label: string };
}

/** What a phase entry requirement is judged on. A requirement may hold one role back where it lets another through. */
export interface InvestigationPhaseEntryContext extends InvestigationErrandContext {
  /**
   * Why the errand's measures keep it from the follow-up, in the words the BFF refuses the move with. Undefined
   * when nothing stands in the way, where measures are off and while it is not known.
   */
  readonly measuresFollowUpRefusal?: string;
}

export interface InvestigationPhaseEntryRequirementProps {
  /** Abandons the phase change; the requirement is asked for again on the next attempt. */
  readonly onClose: () => void;
  /** What the requirement was judged on, for a requirement that explains itself from it. */
  readonly context: InvestigationPhaseEntryContext;
}

/**
 * Something the variant requires before the errand may enter a phase. Shared code only asks; what the
 * requirement is stays the variant's.
 */
interface PhaseEntryRequirementBase {
  /** The workflow phase whose entry the requirement guards. */
  readonly phaseName: string;
  readonly isMet: (context: InvestigationPhaseEntryContext) => boolean;
}

/**
 * While unmet, the phase change is held and `render` is shown instead, so the handler can deal with it
 * or leave the errand where it is.
 */
interface HoldingPhaseEntryRequirement extends PhaseEntryRequirementBase {
  readonly hidesTransition?: false;
  /**
   * What the phase button says while the requirement is unmet. The button then does that, not the phase
   * change, so it must not promise a phase change the handler will not get.
   */
  readonly actionLabel: string;
  readonly render: (props: InvestigationPhaseEntryRequirementProps) => ReactNode;
}

/**
 * While unmet, the move is not offered at all: for a move that is never this viewer's to make, where a
 * button could only ever explain why not.
 */
interface HidingPhaseEntryRequirement extends PhaseEntryRequirementBase {
  readonly hidesTransition: true;
}

type InvestigationPhaseEntryRequirement = HoldingPhaseEntryRequirement | HidingPhaseEntryRequirement;

/**
 * A checkbox beside Mina ärenden that narrows the overview to the errands carrying one label. Whoever is offered it
 * has it checked until they uncheck it, and their choice is kept. Its label-filter group is the checkbox's own: the
 * overview's other label filters leave it out, for everybody.
 */
export interface InvestigationOverviewFilterToggleSlot {
  readonly label: string;
  /** What the checkbox adds to the overview's label filter while it is checked. */
  readonly selection: LabelFilterSelection;
  readonly isOfferedTo: (viewer: InvestigationViewer) => boolean;
}

export interface InvestigationHandlerFieldsProps {
  /**
   * True when nothing may be written to the errand: it is closed, paused or locked, or the viewer's read is
   * limited. Not whether the viewer is its handler - who may fill in the field is the variant's to say.
   */
  readonly locked: boolean;
}

export interface InvestigationDetailsHeaderProps {
  readonly access: InvestigationAccessState;
  /** True while the errand page holds unsaved changes, which an errand-moving command would discard. */
  readonly disabled: boolean;
  /** Reports a draft of an investigation document drawn in Ärendeuppgifter, so the page warns before losing it. */
  readonly onDirtyChange: (key: string, isDirty: boolean) => void;
  readonly refreshAccess: () => void;
  /** Brings Ärendeuppgifter forward, for a save that has something to show there. */
  readonly revealTab: () => void;
}

/**
 * A second errand tab a variant may fill, for the decision that closes an investigation.
 *
 * Unlike the investigation tab, which a capability flag alone turns on, a decision tab exists only
 * for the errands the variant says it does: the variant decides from the errand and the runtime
 * profile, shared code only asks. A variant with no decision omits the slot and gets no tab.
 */
interface InvestigationDecisionTabSlot {
  /** Label for the errand tab. */
  readonly label: string;
  /**
   * The workflow phase the decision is taken in. The tab is offered once the errand has reached it,
   * so a decision cannot be written while the errand is still being investigated. A slot that names
   * no phase is offered whenever `isVisible` says so, as it always was.
   */
  readonly requiredPhaseName?: string;
  /**
   * Whether this viewer is offered the decision before the errand reaches `requiredPhaseName`: somebody who
   * decides on their own, outside the phases the errand's handler moves it through. Left out, the phase holds
   * for everybody.
   */
  readonly isOfferedBeforePhase?: (context: InvestigationErrandContext) => boolean;
  readonly isVisible: (
    errand: SupportErrand | undefined,
    profile: InvestigationProfile | null | undefined,
    access: InvestigationAccessState
  ) => boolean;
  readonly render: (props: InvestigationTabProps) => ReactNode;
}

/**
 * A follow-up across errands - Verksamhetsuppföljning - offered in the overview's sidebar under its own
 * heading, for a variant whose investigations are worth following up across units. A variant without
 * one omits the slot, and the sidebar shows no such section.
 */
/** Who is looking: the handler roles they hold, and whether they administer the application. */
export interface InvestigationViewer {
  readonly roleKeys?: readonly string[];
  readonly superadmin?: boolean;
}

interface InvestigationFollowUpSlot {
  /** The sidebar heading the entry sits under. */
  readonly heading: string;
  /** The sidebar entry, named for how much of the organisation the viewer follows up. */
  readonly label: (viewer: InvestigationViewer) => string;
  readonly render: () => ReactNode;
}

/**
 * Something the variant's administrators set, offered in the overview's sidebar under its own heading - who
 * manages which place, say. Who is offered it is the variant's to say, and the BFF's to enforce: the slot only
 * decides what is shown. A variant without one omits the slot, and the sidebar shows no such section.
 */
interface InvestigationAdministrationSlot {
  /** The sidebar heading the entry sits under. */
  readonly heading: string;
  /** The sidebar entry. */
  readonly label: string;
  readonly isOfferedTo: (viewer: InvestigationViewer) => boolean;
  readonly render: () => ReactNode;
}

/** The investigation implementation: every slot the shared errand pages ask it to fill. */
export interface InvestigationVariantModule {
  readonly id: string;
  /** Label for the errand tab this variant fills. */
  readonly label: string;
  /**
   * The workflow phase the investigation is carried out in. The tab is offered once the errand has
   * reached it - a variant whose work has no phase of its own names none and is never gated.
   */
  readonly requiredPhaseName?: string;
  /** Where classification is edited, and in which vocabulary, when this variant is in play. */
  resolveClassificationPlacement: (
    profile: InvestigationProfile | null | undefined
  ) => SupportErrandClassificationPlacement;
  renderTab: (props: InvestigationTabProps) => ReactNode;
  /**
   * Notice rendered above the errand tab strip, so a broken profile is visible from any tab rather
   * than only after opening this one. Returns null when there is nothing to say.
   */
  renderNotice?: () => ReactNode;
  /**
   * Errand-level controls rendered at the top of Ärendeuppgifter. A variant with nothing to add
   * omits this and the tab stays as every other drake sees it.
   */
  renderDetailsHeader?: (props: InvestigationDetailsHeaderProps) => ReactNode;
  /** The decision tab, for a variant whose investigation ends in a recorded decision. */
  readonly decisionTab?: InvestigationDecisionTabSlot;
  /**
   * What has to be done before the errand may enter a phase, in the order it has to be done: the first
   * one unmet holds the phase change, and one that hides the move keeps it from being offered at all. A
   * variant with none omits this.
   */
  readonly phaseEntryRequirements?: readonly InvestigationPhaseEntryRequirement[];
  /** The follow-up across errands, for a variant that offers one. */
  readonly followUp?: InvestigationFollowUpSlot;
  /** What the variant's administrators set from the overview, for a variant with something to administer. */
  readonly administration?: InvestigationAdministrationSlot;
  /**
   * What the Meddelanden tab says the messages are for, where the variant uses them for one thing rather than
   * for any dialogue with the errand's parties. A variant without the slot keeps the tab's own text.
   */
  readonly messagesIntroduction?: string;
  /**
   * The channels a user may choose to be notified on beside the notifications in Draken, from Notiser in the user
   * menu. The choice is the user's own, stored on their Support Management subscriber. A variant without the slot
   * offers no choice, and the user menu has no such entry.
   */
  readonly notificationChannels?: readonly SelectableNotificationChannel[];
  /**
   * The alert the errand page shows when Support Management grants the viewer only limited read (LR) on
   * the errand: they may know it exists, not work in it, so the page also locks every field. A variant
   * without the slot leaves the page as it is - it asks for no access level at all.
   */
  readonly limitedAccessNotice?: string;
  /**
   * Fields beside Ansvarig in the sidebar, for handlers the errand records apart from its assignee - MAS/MAR,
   * say. They save with Spara ärende. A variant without the slot leaves the sidebar as it is.
   */
  readonly renderHandlerFields?: (props: InvestigationHandlerFieldsProps) => ReactNode;
  /** The overview's filter checkbox, for a variant with one. */
  readonly overviewFilterToggle?: InvestigationOverviewFilterToggleSlot;
  /**
   * The stakeholder roles that are never an employee, so Grunduppgifter offers no employee search for them. A variant
   * without the slot leaves the search wherever the deployment turns it on.
   */
  readonly rolesWithoutEmployeeSearch?: readonly string[];
  /**
   * The stakeholder roles the handler adds in Grunduppgifter - by search or by hand - and removes. A stakeholder of any
   * other role is shown and its details may be edited, but nobody adds or removes one, nor makes one the errand's owner.
   * A variant without the slot lets the handler add and remove every role.
   */
  readonly handlerManagedStakeholderRoles?: readonly string[];
  /**
   * Who the overview names as responsible when the errand's labels say more than its assigned handler -
   * a whole role holding it, say. Undefined names the handler, as every other drake does.
   */
  readonly overviewAssignee?: (labels: Label[] | undefined, labelStructure: Label[] | undefined) => string | undefined;
  /**
   * The documents, by key, the page keeps out of this viewer's sight on this errand though their access would
   * show them. It only ever conceals, and only what is drawn: what the viewer may read stays Support Management's
   * to say. A variant without the slot shows every document the access does.
   */
  readonly concealedDocumentKeys?: (context: InvestigationErrandContext) => readonly string[];
  /**
   * Whether the errand closes only at the end of its workflow, from the phase that closes it. The close offered
   * before that, which would skip the phases still ahead, is then not offered. A variant without the slot leaves
   * every errand closable as before.
   */
  readonly closesOnlyAtWorkflowEnd?: (context: InvestigationErrandContext) => boolean;
  /**
   * How an errand that may close before its workflow ends is closed early: not before it has reached
   * `fromPhaseName`, where its handling starts, and only with a motivation the BFF keeps as a service note. A variant
   * without the slot keeps the early close as it is.
   */
  readonly earlyClose?: { readonly fromPhaseName: string };
  /**
   * What the handler is reminded of under the button that closes the errand at the end of its workflow. A variant
   * without the slot shows the button alone.
   */
  readonly closingReminder?: string;
  /**
   * What the variant calls a channel whose shared name would mislead where it runs - an e-service of its own beside
   * the ones every drake means by the word. Keyed by the channel's own key, such as `ESERVICE`; the key and the
   * shared enum are untouched, so nothing that compares channels changes. A variant without the slot keeps every
   * shared name.
   */
  readonly channelLabels?: Readonly<Record<string, string>>;
  /**
   * What the errand's handler does next, and where. The sidebar says it above the handling controls, and the errand
   * opens on its tab when it is opened or its phase changes. A variant without the slot shows nothing and keeps the
   * phase's own tab.
   */
  readonly nextStep?: (context: InvestigationNextStepContext) => InvestigationNextStep | undefined;
}

/** The requirement holding a move into the phase `isTargetPhase` names, if any: the first unmet one. */
export const findHeldPhaseEntryRequirement = (
  requirements: readonly InvestigationPhaseEntryRequirement[] | undefined,
  isTargetPhase: (phaseName: string) => boolean,
  context: InvestigationPhaseEntryContext
): HoldingPhaseEntryRequirement | undefined =>
  requirements?.find(
    (requirement): requirement is HoldingPhaseEntryRequirement =>
      !requirement.hidesTransition && isTargetPhase(requirement.phaseName) && !requirement.isMet(context)
  );

/** Whether an unmet requirement keeps the move into the phase `isTargetPhase` names out of this viewer's sight. */
export const hidesPhaseEntry = (
  requirements: readonly InvestigationPhaseEntryRequirement[] | undefined,
  isTargetPhase: (phaseName: string) => boolean,
  context: InvestigationPhaseEntryContext
): boolean =>
  requirements?.some(
    (requirement) =>
      requirement.hidesTransition === true && isTargetPhase(requirement.phaseName) && !requirement.isMet(context)
  ) ?? false;

/**
 * The kept implementations live in `investigation-variant-registry.ts`; keeping them out of this module is what
 * lets these rules be unit-tested without pulling in the variant's React tree.
 *
 * The errand has to have reached the phase the variant works in, so the tab appears when the work does.
 */
export const isInvestigationTabVisible = (variant: InvestigationVariantModule, phases: SupportPhaseContext): boolean =>
  hasReachedSupportPhase(variant.requiredPhaseName, phases);

/** What the variant lets this viewer administer from the overview: its own slot decides who is offered it. */
export const resolveInvestigationAdministration = (
  variant: InvestigationVariantModule,
  viewer: InvestigationViewer
): InvestigationVariantModule['administration'] =>
  variant.administration?.isOfferedTo(viewer) ? variant.administration : undefined;

/**
 * The label-filter groups the overview's own filters offer: every one the profile declares but the group the
 * variant's filter checkbox owns, which no other filter shows to anybody.
 */
export const overviewLabelFilterGroups = (
  groups: readonly LabelFilterGroupDefinition[],
  filterToggle: InvestigationVariantModule['overviewFilterToggle']
): readonly LabelFilterGroupDefinition[] =>
  filterToggle ? groups.filter((group) => group.key !== filterToggle.selection.groupKey) : groups;

/**
 * The filter checkbox where this viewer is offered it and the profile's label filter has the group it selects in,
 * which is all the BFF filters on. Undefined otherwise.
 */
export const resolveOverviewFilterToggle = (
  filterToggle: InvestigationVariantModule['overviewFilterToggle'],
  viewer: InvestigationViewer,
  labelFilterGroups: readonly LabelFilterGroupDefinition[] | undefined
): InvestigationVariantModule['overviewFilterToggle'] =>
  filterToggle?.isOfferedTo(viewer) && labelFilterGroups?.some((group) => group.key === filterToggle.selection.groupKey)
    ? filterToggle
    : undefined;

/**
 * The phase gate applies to the decision tab exactly as it applies to the investigation tab; beyond it
 * the variant's own slot decides, per errand and profile. No slot, no tab. The slot may let a viewer
 * past the phase gate (`isOfferedBeforePhase`); who is reading is then what it is asked about.
 */
export const isDecisionTabVisible = (
  variant: InvestigationVariantModule,
  errand: SupportErrand | undefined,
  profile: InvestigationProfile | null | undefined,
  phases: SupportPhaseContext,
  access: InvestigationAccessState = { status: 'loading' },
  reader: Pick<InvestigationErrandContext, 'labelStructure' | 'viewer'> = { labelStructure: undefined, viewer: {} }
): boolean =>
  variant.decisionTab?.isVisible(errand, profile, access) === true &&
  (hasReachedSupportPhase(variant.decisionTab.requiredPhaseName, phases) ||
    variant.decisionTab.isOfferedBeforePhase?.({ errand, profile, ...reader }) === true);
