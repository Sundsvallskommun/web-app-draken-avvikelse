import type { LabelFilterGroupDefinition } from '../filters/label-filter-projector';

const INVESTIGATION_PROFILE_STATES = ['active', 'inactive', 'unavailable'] as const;
type InvestigationProfileState = (typeof INVESTIGATION_PROFILE_STATES)[number];

const INVESTIGATION_DOCUMENT_PLACEMENTS = ['investigation', 'decision', 'details'] as const;

/**
 * Where the errand page offers the document: the investigation tab, the decision tab or Ärendeuppgifter. The BFF
 * omits the field for the ordinary investigation tab.
 */
export type InvestigationDocumentPlacement = (typeof INVESTIGATION_DOCUMENT_PLACEMENTS)[number];

const INVESTIGATION_DOCUMENT_APPLICABILITIES = ['all', 'reported-misconduct', 'hsl-deviation', 'deviation'] as const;

/**
 * Which errands the document applies to. `all` is every errand, and `deviation` every errand but a
 * reported misconduct. The other values name one kind of errand as the variant's policy resolves it -
 * `reported-misconduct` for a reported misconduct, `hsl-deviation` for an ordinary deviation under
 * HSL. The BFF refuses the document on any other errand.
 */
export type InvestigationDocumentApplicability = (typeof INVESTIGATION_DOCUMENT_APPLICABILITIES)[number];

export interface InvestigationProfileDocument {
  readonly key: string;
  readonly schemaName: string;
  readonly tabLabel: string;
  readonly ownerLabel: string;
  readonly placement: InvestigationDocumentPlacement;
  readonly appliesTo: InvestigationDocumentApplicability;
  /** Another document of the profile that must be saved on the errand before this one is written. */
  readonly prerequisiteDocumentKey?: string;
}

/**
 * The report an errand arrives with: Katla's record of what happened, where and when. It is read-only,
 * except on an errand registered in Draken, whose unit manager fills it in until the investigation
 * starts.
 */
export interface InvestigationReportDocument {
  readonly key: string;
  readonly schemaName: string;
  /** The channel of the errands whose report is filled in in Draken. */
  readonly editableChannel: string;
  /** The workflow phase, by its technical name, from which the report is locked. */
  readonly lockedFromPhase: string;
}

export interface InvestigationProfile {
  readonly state: InvestigationProfileState;
  readonly documents: readonly InvestigationProfileDocument[];
  readonly registration: { readonly mode: 'enabled' | 'disabled' };
  readonly labelFilter?: { readonly groups: readonly LabelFilterGroupDefinition[] };
  readonly reportDocument?: InvestigationReportDocument;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRequiredString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Utredningsprofilen saknar ett giltigt värde för ${path}.`);
  }

  return value.trim();
}

const profileIdentifierPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function readProfileIdentifier(value: unknown, path: string): string {
  const identifier = readRequiredString(value, path);
  if (!profileIdentifierPattern.test(identifier)) {
    throw new Error(`Utredningsprofilens ${path} måste vara ett lowercase kebab-case-id.`);
  }

  return identifier;
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    throw new Error(`Utredningsprofilen innehåller duplicerade ${path}.`);
  }
}

/**
 * Both optional fields default to the behaviour every document had before they existed: offered on
 * the investigation tab, on every errand. A BFF that never sends them therefore changes nothing.
 */
function readDocumentChoice<T extends string>(value: unknown, choices: readonly T[], fallback: T, path: string): T {
  if (value === undefined) return fallback;
  if (!choices.includes(value as T)) {
    throw new Error(`Utredningsprofilens ${path} är ogiltig.`);
  }

  return value as T;
}

function readDocument(value: unknown, index: number): InvestigationProfileDocument {
  if (!isRecord(value)) {
    throw new Error(`Utredningsprofilens documents[${index}] är ogiltigt.`);
  }

  return Object.freeze({
    key: readProfileIdentifier(value.key, `documents[${index}].key`),
    schemaName: readProfileIdentifier(value.schemaName, `documents[${index}].schemaName`),
    tabLabel: readRequiredString(value.tabLabel, `documents[${index}].tabLabel`),
    ownerLabel: readRequiredString(value.ownerLabel, `documents[${index}].ownerLabel`),
    placement: readDocumentChoice(
      value.placement,
      INVESTIGATION_DOCUMENT_PLACEMENTS,
      'investigation',
      `documents[${index}].placement`
    ),
    appliesTo: readDocumentChoice(
      value.appliesTo,
      INVESTIGATION_DOCUMENT_APPLICABILITIES,
      'all',
      `documents[${index}].appliesTo`
    ),
    ...(value.prerequisiteDocumentKey === undefined
      ? {}
      : {
          prerequisiteDocumentKey: readProfileIdentifier(
            value.prerequisiteDocumentKey,
            `documents[${index}].prerequisiteDocumentKey`
          ),
        }),
  });
}

const labelResourcePathPattern = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;

function readLabelFilter(value: unknown): InvestigationProfile['labelFilter'] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !Array.isArray(value.groups) || value.groups.length === 0) {
    throw new Error('Utredningsprofilens labelFilter är ogiltigt.');
  }

  const groupKeys = new Set<string>();
  const rootResourcePaths = new Set<string>();
  const groups = value.groups.map((candidate, groupIndex) => {
    if (!isRecord(candidate) || !Array.isArray(candidate.fields) || candidate.fields.length === 0) {
      throw new Error(`Utredningsprofilens labelFilter.groups[${groupIndex}] är ogiltig.`);
    }
    const key = readProfileIdentifier(candidate.key, `labelFilter.groups[${groupIndex}].key`);
    const label = readRequiredString(candidate.label, `labelFilter.groups[${groupIndex}].label`);
    const rootResourcePath = readRequiredString(
      candidate.rootResourcePath,
      `labelFilter.groups[${groupIndex}].rootResourcePath`
    );
    if (!labelResourcePathPattern.test(rootResourcePath)) {
      throw new Error(`Utredningsprofilens labelFilter.groups[${groupIndex}].rootResourcePath är ogiltig.`);
    }
    if (groupKeys.has(key) || rootResourcePaths.has(rootResourcePath)) {
      throw new Error('Utredningsprofilens labelFilter innehåller duplicerade grupper eller rötter.');
    }
    groupKeys.add(key);
    rootResourcePaths.add(rootResourcePath);

    const fieldKeys = new Set<string>();
    const classifications = new Set<string>();
    const fields = candidate.fields.map((fieldCandidate, fieldIndex) => {
      if (!isRecord(fieldCandidate)) {
        throw new Error(`Utredningsprofilens labelFilter.groups[${groupIndex}].fields[${fieldIndex}] är ogiltig.`);
      }
      const fieldKey = readProfileIdentifier(
        fieldCandidate.key,
        `labelFilter.groups[${groupIndex}].fields[${fieldIndex}].key`
      );
      const fieldLabel = readRequiredString(
        fieldCandidate.label,
        `labelFilter.groups[${groupIndex}].fields[${fieldIndex}].label`
      );
      const classification = readRequiredString(
        fieldCandidate.classification,
        `labelFilter.groups[${groupIndex}].fields[${fieldIndex}].classification`
      );
      const normalizedClassification = classification.replaceAll('_', '-').toUpperCase();
      if (fieldKeys.has(fieldKey) || classifications.has(normalizedClassification)) {
        throw new Error(`Utredningsprofilens labelFilter-grupp ${key} innehåller duplicerade fält.`);
      }
      fieldKeys.add(fieldKey);
      classifications.add(normalizedClassification);
      return Object.freeze({ key: fieldKey, label: fieldLabel, classification });
    });

    return Object.freeze({ key, label, rootResourcePath, fields: Object.freeze(fields) });
  });

  return Object.freeze({ groups: Object.freeze(groups) });
}

function readReportDocument(
  value: unknown,
  documentKeys: ReadonlySet<string>
): InvestigationReportDocument | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('Utredningsprofilens reportDocument är ogiltigt.');
  }
  const key = readProfileIdentifier(value.key, 'reportDocument.key');
  if (documentKeys.has(key)) {
    throw new Error('Utredningsprofilens reportDocument.key är redan ett utredningsdokument.');
  }

  return Object.freeze({
    key,
    schemaName: readProfileIdentifier(value.schemaName, 'reportDocument.schemaName'),
    editableChannel: readRequiredString(value.editableChannel, 'reportDocument.editableChannel'),
    lockedFromPhase: readRequiredString(value.lockedFromPhase, 'reportDocument.lockedFromPhase'),
  });
}

/**
 * Converts the untrusted BFF response to the canonical runtime profile. Invalid
 * data throws so the initializer can fail closed.
 */
export function parseInvestigationProfile(value: unknown): InvestigationProfile {
  if (!isRecord(value) || !Array.isArray(value.documents)) {
    throw new Error('Utredningsprofilen är ogiltig.');
  }

  const state = readRequiredString(value.state, 'state');
  if (!INVESTIGATION_PROFILE_STATES.includes(state as InvestigationProfileState)) {
    throw new Error('Utredningsprofilens state är ogiltig.');
  }

  const documents = value.documents.map((document, index) => readDocument(document, index));
  if (
    !isRecord(value.registration) ||
    (value.registration.mode !== 'enabled' && value.registration.mode !== 'disabled')
  ) {
    throw new Error('Utredningsprofilens registration är ogiltig.');
  }
  const registration = Object.freeze({ mode: value.registration.mode });
  const labelFilter = readLabelFilter(value.labelFilter);
  assertUnique(
    documents.map(({ key }) => key),
    'document keys'
  );
  const documentKeys = new Set(documents.map(({ key }) => key));
  documents.forEach((document, index) => {
    if (document.prerequisiteDocumentKey === undefined) return;
    if (document.prerequisiteDocumentKey === document.key || !documentKeys.has(document.prerequisiteDocumentKey)) {
      throw new Error(
        `Utredningsprofilens documents[${index}].prerequisiteDocumentKey pekar inte på ett annat dokument.`
      );
    }
  });
  const reportDocument = readReportDocument(value.reportDocument, documentKeys);
  return Object.freeze({
    state: state as InvestigationProfileState,
    documents: Object.freeze(documents),
    registration,
    ...(labelFilter ? { labelFilter } : {}),
    ...(reportDocument ? { reportDocument } : {}),
  });
}

export const isSupportRegistrationEnabled = (profile: InvestigationProfile | null | undefined): boolean =>
  profile?.registration.mode === 'enabled';
