import type { ErrandPhase, Label, Phase } from '@common/data-contracts/supportmanagement/data-contracts';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { getActiveSupportPhaseId, getSupportPhases } from '@supportmanagement/services/support-phase-service';

import type { InvestigationReportDocument } from '../../investigation-profile';
import type { InvestigationFormData } from '../investigation-document';
import { isPlaceLabel } from '../place-label';

/**
 * Whether the report of an errand may be filled in: only on an errand registered in Draken, and only
 * until the investigation starts. The BFF decides the same way and refuses every other write.
 */
export type ReportDocumentEditability = 'editable' | 'arrived-elsewhere' | 'investigation-started';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The investigation starts in the phase the report names; an errand there or further along has a
 * locked report. A workflow without that phase, or an errand outside the workflow, cannot show that
 * the investigation has not started, so the report stays locked.
 */
export const resolveReportDocumentEditability = (
  errand: { readonly channel?: string; readonly phases?: readonly ErrandPhase[] },
  phases: readonly Phase[] | undefined,
  reportDocument: Pick<InvestigationReportDocument, 'editableChannel' | 'lockedFromPhase'>
): ReportDocumentEditability => {
  if (errand.channel !== reportDocument.editableChannel) return 'arrived-elsewhere';

  const workflow = getSupportPhases(phases).filter((phase) => phase.id);
  const lockingPhase = workflow.find((phase) => phase.name === reportDocument.lockedFromPhase);
  const activePhaseId = getActiveSupportPhaseId(errand.phases);
  const activePhase = workflow.find((phase) => phase.id === activePhaseId);
  if (!lockingPhase || !activePhase) return 'investigation-started';

  return (activePhase.phaseOrder ?? 0) < (lockingPhase.phaseOrder ?? 0) ? 'editable' : 'investigation-started';
};

/** The UI schema field Katla records the place with. */
const PLACE_FIELD = 'FacilitySearchWidget';

/**
 * The report property holding the place: the one its UI schema renders as the place search. Found by
 * the UI schema rather than by name, so the report schema is free to call it what it likes.
 */
export const findReportPlaceProperty = (uiSchema: UiSchema | undefined): string | undefined =>
  Object.entries(uiSchema ?? {}).find(
    ([key, value]) =>
      !key.startsWith('ui:') &&
      isRecord(value) &&
      (value['ui:field'] === PLACE_FIELD || value['ui:widget'] === PLACE_FIELD)
  )?.[0];

/**
 * The UI schema with the place shown but not chosen here: the errand's labels decide its place, which
 * is set at registration and moved from Ärendets plats, so the report only records it.
 */
export const withReadonlyPlace = (uiSchema: UiSchema, placeProperty: string | undefined): UiSchema => {
  if (!placeProperty) return uiSchema;
  // How to choose the place is said for Katla's reporter. Here it is already chosen, so the instruction goes.
  const { 'ui:help': _help, 'ui:description': _description, ...place } = (uiSchema[placeProperty] ?? {}) as UiSchema;
  return {
    ...uiSchema,
    [placeProperty]: {
      ...place,
      'ui:readonly': true,
      'ui:options': { ...(place['ui:options'] ?? {}), hideDescription: true },
    },
  };
};

/**
 * The UI schema with the report's plain strings written as plain text. Draken's `textarea` is the
 * rich-text editor and stores HTML, which the report's schema - and Katla, which writes the same
 * report - keep as plain text. A property declared as HTML keeps its editor.
 */
export const withPlainTextAreas = (uiSchema: UiSchema, schema: RJSFSchema): UiSchema => {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  return Object.fromEntries(
    Object.entries(uiSchema).map(([key, value]) => {
      const property = properties[key];
      const isMarkup = isRecord(property) && property.contentMediaType === 'text/html';
      return isRecord(value) && value['ui:widget'] === 'textarea' && !isMarkup
        ? [key, { ...value, 'ui:widget': 'PlainTextareaWidget' }]
        : [key, value];
    })
  );
};

/**
 * The name of the place registration put the errand at: the deepest of its labels classified as a
 * location. An errand carries every level of its place, so the deepest is the unit itself.
 */
export const registeredPlaceName = (labels: readonly Label[] | undefined): string | undefined =>
  (labels ?? [])
    .filter((label) => isPlaceLabel(label) && label.displayName)
    .reduce<Label | undefined>(
      (deepest, label) =>
        !deepest || (label.resourcePath ?? '').split('/').length > (deepest.resourcePath ?? '').split('/').length
          ? label
          : deepest,
      undefined
    )?.displayName;

/** Why a report could not be saved, in the words the unit manager is shown. */
export const reportSaveErrorMessage = (status: number | undefined): string => {
  if (status === 412)
    return 'Rapporten har ändrats av någon annan sedan du öppnade den. Ladda om sidan och försök igen.';
  if (status === 409) return 'Rapporten kan inte längre ändras, eftersom ärendet har gått vidare till utredning.';
  if (status === 403) return 'Du saknar behörighet att ändra rapporten.';
  return 'Rapporten kunde inte sparas. Försök igen.';
};

/** A report not yet written starts at the place the errand was registered at. */
export const withRegisteredPlace = (
  formData: InvestigationFormData,
  placeProperty: string | undefined,
  placeName: string | undefined
): InvestigationFormData =>
  placeProperty && placeName && !isRecord(formData[placeProperty])
    ? { ...formData, [placeProperty]: { orgName: placeName } }
    : formData;
