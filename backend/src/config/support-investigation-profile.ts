import { createSupportManagementLabelFilterProfile } from '@/config/supportmanagement-label-filter-profile';
import {
  SUPPORT_INVESTIGATION_DOCUMENT_APPLICABILITIES,
  SUPPORT_INVESTIGATION_DOCUMENT_PLACEMENTS,
  SupportInvestigationProfileDto,
  SupportInvestigationReportDocumentDto,
  SupportManagementLabelFilterProfileDto,
} from '@/dtos/support-investigation-profile.dto';

import { SUPPORT_MANAGEMENT_API_TARGETS, SupportManagementApiTarget } from './api-config';
import { DRAKEN_REGISTRATION_CHANNEL } from './support-errand-channels';

/**
 * An errand parameter that names a handler beside the assignee, and the handler role whose holders it names -
 * MAS/MAR, recorded in `masMarHandler`. Mina ärenden for a holder of the role also lists the errands the
 * parameter names them on.
 */
export interface SupportInvestigationHandlerParameter {
  readonly key: string;
  readonly roleKey: string;
}

export interface SupportInvestigationProfile extends SupportInvestigationProfileDto {
  readonly requiredSupportManagementApiTarget?: SupportManagementApiTarget;
  readonly labelFilter?: SupportManagementLabelFilterProfileDto;
  readonly handlerParameters?: readonly SupportInvestigationHandlerParameter[];
  /**
   * The errand is followed by its assignee alone, and only while they are it: a new assignee is subscribed to it,
   * and the previous one stops following it, Bevaka included.
   */
  readonly assigneeFollowsErrand?: boolean;
}

export type SupportInvestigationProfileInput = SupportInvestigationProfileDto &
  Readonly<{
    requiredSupportManagementApiTarget?: SupportManagementApiTarget;
    labelFilter?: SupportManagementLabelFilterProfileDto;
    handlerParameters?: readonly SupportInvestigationHandlerParameter[];
    assigneeFollowsErrand?: boolean;
  }>;

const requireNonEmptyProfileField = (value: string, field: string): string => {
  const canonical = value.trim();
  if (canonical.length === 0) {
    throw new Error(`Support investigation profile field ${field} must not be empty`);
  }
  return canonical;
};

// Document keys are used as URL path segments and schema names are embedded in
// JsonSchema identifiers. Keeping both in one conservative, canonical format
// makes profile additions safe without requiring application-specific escaping.
const SUPPORT_INVESTIGATION_IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

const requireProfileIdentifier = (value: string, field: string): string => {
  const canonical = requireNonEmptyProfileField(value, field);
  if (!SUPPORT_INVESTIGATION_IDENTIFIER_PATTERN.test(canonical)) {
    throw new Error(`Support investigation profile field ${field} must be a lowercase kebab-case identifier`);
  }
  return canonical;
};

const requireProfileChoice = <T extends string>(value: T | undefined, choices: readonly T[], field: string): T | undefined => {
  if (value === undefined) return undefined;
  if (!choices.includes(value)) {
    throw new Error(`Support investigation profile field ${field} must be one of ${choices.join(', ')}`);
  }
  return value;
};

/**
 * Canonical owner for static investigation documents and transport requirements.
 * Application-specific classification behavior deliberately lives outside this
 * generic profile.
 */
export const createSupportInvestigationProfile = (profile: SupportInvestigationProfileInput): SupportInvestigationProfile => {
  const requiredSupportManagementApiTarget = profile.requiredSupportManagementApiTarget;
  if (
    requiredSupportManagementApiTarget !== undefined &&
    !(SUPPORT_MANAGEMENT_API_TARGETS as readonly string[]).includes(requiredSupportManagementApiTarget)
  ) {
    throw new Error(`Support investigation profile requires unsupported Support Management API target ${requiredSupportManagementApiTarget}`);
  }
  const documentKeys = new Set<string>();
  const documents = profile.documents.map((document, index) => {
    const placement = requireProfileChoice(document.placement, SUPPORT_INVESTIGATION_DOCUMENT_PLACEMENTS, `documents[${index}].placement`);
    const appliesTo = requireProfileChoice(document.appliesTo, SUPPORT_INVESTIGATION_DOCUMENT_APPLICABILITIES, `documents[${index}].appliesTo`);
    const prerequisiteDocumentKey =
      document.prerequisiteDocumentKey === undefined
        ? undefined
        : requireProfileIdentifier(document.prerequisiteDocumentKey, `documents[${index}].prerequisiteDocumentKey`);
    // The optional fields are only carried when configured, so a profile that never mentions them
    // serializes exactly as before and their defaults stay a reader's decision.
    const canonicalDocument = {
      key: requireProfileIdentifier(document.key, `documents[${index}].key`),
      schemaName: requireProfileIdentifier(document.schemaName, `documents[${index}].schemaName`),
      tabLabel: requireNonEmptyProfileField(document.tabLabel, `documents[${index}].tabLabel`),
      ownerLabel: requireNonEmptyProfileField(document.ownerLabel, `documents[${index}].ownerLabel`),
      ...(placement ? { placement } : {}),
      ...(appliesTo ? { appliesTo } : {}),
      ...(prerequisiteDocumentKey ? { prerequisiteDocumentKey } : {}),
    };

    if (documentKeys.has(canonicalDocument.key)) {
      throw new Error(`Support investigation profile contains duplicate document key ${canonicalDocument.key}`);
    }
    documentKeys.add(canonicalDocument.key);

    return Object.freeze(canonicalDocument);
  });
  // A prerequisite names another document of the same profile, so the reference is checked once
  // every key is known.
  documents.forEach((document, index) => {
    if (document.prerequisiteDocumentKey === undefined) return;
    if (document.prerequisiteDocumentKey === document.key || !documentKeys.has(document.prerequisiteDocumentKey)) {
      throw new Error(`Support investigation profile field documents[${index}].prerequisiteDocumentKey must name another document in the profile`);
    }
  });
  const frozenDocuments = Object.freeze(documents);
  const labelFilter = profile.labelFilter ? createSupportManagementLabelFilterProfile(profile.labelFilter) : undefined;
  const reportDocument = profile.reportDocument ? createReportDocument(profile.reportDocument, documentKeys) : undefined;
  const handlerParameters = profile.handlerParameters?.length ? createHandlerParameters(profile.handlerParameters) : undefined;

  return Object.freeze({
    documents: frozenDocuments,
    ...(requiredSupportManagementApiTarget ? { requiredSupportManagementApiTarget } : {}),
    ...(labelFilter ? { labelFilter } : {}),
    ...(reportDocument ? { reportDocument } : {}),
    ...(handlerParameters ? { handlerParameters } : {}),
    ...(profile.assigneeFollowsErrand ? { assigneeFollowsErrand: true } : {}),
  });
};

// A handler parameter's key is written into Support Management's filter expression, so it is held to a plain
// identifier rather than escaped there.
const HANDLER_PARAMETER_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/u;

const createHandlerParameters = (
  handlerParameters: readonly SupportInvestigationHandlerParameter[],
): readonly SupportInvestigationHandlerParameter[] =>
  Object.freeze(
    handlerParameters.map(({ key, roleKey }, index) => {
      if (!HANDLER_PARAMETER_KEY_PATTERN.test(key)) {
        throw new Error(`Support investigation profile field handlerParameters[${index}].key must be a plain identifier`);
      }
      return Object.freeze({ key, roleKey: requireProfileIdentifier(roleKey, `handlerParameters[${index}].roleKey`) });
    }),
  );

/** The report is its own JSON parameter, so it may not share a key with an investigation document. */
const createReportDocument = (
  reportDocument: SupportInvestigationReportDocumentDto,
  documentKeys: ReadonlySet<string>,
): SupportInvestigationReportDocumentDto => {
  const key = requireProfileIdentifier(reportDocument.key, 'reportDocument.key');
  if (documentKeys.has(key)) {
    throw new Error(`Support investigation profile field reportDocument.key ${key} is already an investigation document`);
  }
  return Object.freeze({
    key,
    schemaName: requireProfileIdentifier(reportDocument.schemaName, 'reportDocument.schemaName'),
    editableChannel: requireNonEmptyProfileField(reportDocument.editableChannel, 'reportDocument.editableChannel'),
    lockedFromPhase: requireNonEmptyProfileField(reportDocument.lockedFromPhase, 'reportDocument.lockedFromPhase'),
  });
};

/**
 * The avvikelse investigation. IAF and VOF are two deployments of the same application and share it: they differ
 * only in their Support Management namespace and AD groups, never in what the investigation is.
 */
const avvikelseInvestigationProfile = {
  requiredSupportManagementApiTarget: 'sprint',
  // MAS/MAR record themselves on an errand beside its assignee, in the parameter the MAS/MAR select writes, and
  // find it under Mina ärenden.
  handlerParameters: [{ key: 'masMarHandler', roleKey: 'mas-mar' }],
  // Whoever handles the errand follows it, and stops when it moves on to somebody else.
  assigneeFollowsErrand: true,
  // Katla's report of what happened and where. An errand registered in Draken has none until the unit
  // manager fills it in, which they may do until the errand reaches Utredning.
  reportDocument: {
    key: 'avvikelse-plats-handelse',
    schemaName: 'avvikelse-plats-handelse',
    editableChannel: DRAKEN_REGISTRATION_CHANNEL,
    lockedFromPhase: 'INVESTIGATION',
  },
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
    // MAS/MAR's event analysis, and the comment on it below, belong to deviations: a misconduct goes to LEX and is
    // never analysed under HSL. An errand LEX hands back is a deviation again, and has them back.
    {
      key: 'utredning-hsl',
      schemaName: 'utredning-hsl',
      tabLabel: 'Händelseanalys HSL',
      ownerLabel: 'MAS/MAR',
      appliesTo: 'deviation',
    },
    // The comment on MAS/MAR's event analysis by the one who commissioned it. A document of its own, so
    // that the head of operations writes it without being given the analysis itself to change.
    {
      key: 'vc-kommentar-hsl',
      schemaName: 'vc-kommentar-hsl',
      tabLabel: 'VC kommentar HSL',
      ownerLabel: 'Verksamhetschef',
      appliesTo: 'deviation',
    },
    // LEX-ansvarig's first assessment once the errand has been handed to LEX: whether it is reported to
    // IVO, and whether it is lex-investigated at all. In Ärendeuppgifter, ahead of any investigation.
    {
      key: 'bedomning-sol-lss',
      schemaName: 'bedomning-sol-lss',
      tabLabel: 'Lex Sarah-ansvarigs initiala bedömning',
      ownerLabel: 'LEX-ansvarig',
      placement: 'details',
    },
    // The decisions. Rendered on the Beslut tab rather than under Utredning, and each offered only
    // on the errands the IAF/VOF classification policy resolves for it: the IVO decision on an
    // ordinary deviation reported under HSL or marked with a high HSL risk, the lex Sarah decision on a
    // reported misconduct. The policy resolves one kind per errand, so an errand never gets both. The
    // lex Sarah decision answers the SoL/LSS investigation, so that investigation has to be saved first.
    {
      key: 'beslut-hsl',
      schemaName: 'beslut-hsl',
      tabLabel: 'Beslut HSL',
      ownerLabel: 'MAS/MAR',
      placement: 'decision',
      appliesTo: 'hsl-deviation',
    },
    {
      key: 'beslut-sol-lss',
      schemaName: 'beslut-sol-lss',
      tabLabel: 'Beslut SoL/LSS',
      ownerLabel: 'LEX-ansvarig',
      placement: 'decision',
      appliesTo: 'reported-misconduct',
      prerequisiteDocumentKey: 'utredning-sol-lss',
    },
  ],
  labelFilter: {
    groups: [
      {
        key: 'provision',
        label: 'Lagrum',
        rootResourcePath: 'PROVISION',
        fields: [{ key: 'provision', label: 'Lagrum', classification: 'PROVISION' }],
      },
      {
        key: 'report-type',
        label: 'Rapporttyp',
        rootResourcePath: 'REPORT_TYPE',
        fields: [{ key: 'report-type', label: 'Rapporttyp', classification: 'REPORT_TYPE' }],
      },
      {
        key: 'classification',
        label: 'Klassificering',
        rootResourcePath: 'CATEGORY',
        fields: [
          { key: 'category', label: 'Avvikelsetyp', classification: 'CATEGORY' },
          { key: 'type', label: 'Underkategori', classification: 'TYPE' },
        ],
      },
      // MAS/MAR-ärenden, the overview's checkbox for MAS/MAR: the errands with a high HSL risk. No other filter
      // offers the group.
      {
        key: 'risk',
        label: 'Risk',
        rootResourcePath: 'RISK',
        fields: [{ key: 'risk', label: 'Risk', classification: 'RISK' }],
      },
    ],
  },
} as const satisfies SupportInvestigationProfileInput;

export const AVVIKELSE_INVESTIGATION_PROFILE = createSupportInvestigationProfile(avvikelseInvestigationProfile);
