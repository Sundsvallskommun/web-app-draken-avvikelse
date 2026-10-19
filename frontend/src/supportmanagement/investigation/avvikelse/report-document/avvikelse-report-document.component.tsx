'use client';

import SchemaForm from '@common/components/json/schema/schema-form.component';
import { getLatestRjsfSchema, getRjsfSchema, getUiSchemaForSchema } from '@common/components/json/utils/schema-utils';
import { getToastOptions } from '@common/utils/toast-message-settings';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { Alert, Spinner, useSnackbar } from '@sk-web-gui/react';
import { useConfigStore, useMetadataStore, useSupportStore } from '@stores/index';
import { isSupportErrandLocked } from '@supportmanagement/services/support-errand-service';
import { useAdvanceErrandVersion } from '@supportmanagement/services/use-advance-errand-version';
import { isAxiosError } from 'axios';
import { FC, useEffect, useState } from 'react';

import type { InvestigationReportDocument } from '../../investigation-profile';
import { useInvestigationProfileStore } from '../../investigation-profile-store';
import type { InvestigationDetailsHeaderProps } from '../../investigation-variant';
import type { InvestigationFormData } from '../investigation-document';
import {
  getSupportInvestigationDocument,
  saveSupportInvestigationDocument,
  type SupportInvestigationDocument,
} from '../support-investigation-service';
import {
  findReportPlaceProperty,
  registeredPlaceName,
  reportSaveErrorMessage,
  resolveReportDocumentEditability,
  withPlainTextAreas,
  withReadonlyPlace,
  withRegisteredPlace,
} from './report-document';

interface LoadedReport {
  readonly schema: RJSFSchema;
  readonly schemaId: string;
  readonly uiSchema: UiSchema;
  readonly formData: InvestigationFormData;
  /** Absent until the report has been saved once; the first save creates it. */
  readonly etag?: string;
}

/** The stored report with its bound schema, or the latest schema and the registered place for a new one. */
const loadReport = async (
  municipalityId: string,
  errandId: string,
  reportDocument: InvestigationReportDocument,
  placeName: string | undefined
): Promise<LoadedReport> => {
  const stored = await getSupportInvestigationDocument(municipalityId, errandId, reportDocument.key);
  const { schema, schemaId } = stored
    ? { schema: await getRjsfSchema(municipalityId, stored.document.schemaId), schemaId: stored.document.schemaId }
    : await getLatestRjsfSchema(municipalityId, reportDocument.schemaName);
  const uiSchema = await getUiSchemaForSchema(municipalityId, schemaId);
  const placeProperty = findReportPlaceProperty(uiSchema);

  return {
    schema,
    schemaId,
    uiSchema: withPlainTextAreas(withReadonlyPlace(uiSchema, placeProperty), schema),
    formData: withRegisteredPlace(stored?.document.value ?? {}, placeProperty, placeName),
    etag: stored?.etag,
  };
};

/**
 * The report of an errand registered in Draken, at the top of Ärendeuppgifter.
 *
 * Katla's report is the record of what was reported and is shown read-only below with the errand's
 * other data. An errand registered in Draken has no such record, so its unit manager writes it here,
 * in Katla's own form, until the errand reaches Utredning. From then on it is shown read-only like
 * any other report.
 */
export const AvvikelseReportDocument: FC<InvestigationDetailsHeaderProps> = () => {
  const municipalityId = useConfigStore((s) => s.municipalityId);
  const supportErrand = useSupportStore((s) => s.supportErrand);
  const phases = useMetadataStore((s) => s.supportMetadata?.phases);
  const reportDocument = useInvestigationProfileStore((state) => state.profile?.reportDocument);
  const setJsonParameterHandled = useInvestigationProfileStore((state) => state.setJsonParameterHandled);
  const advanceErrandVersion = useAdvanceErrandVersion(supportErrand?.id);
  const [report, setReport] = useState<LoadedReport>();
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const toastMessage = useSnackbar();

  const errandId = supportErrand?.id;
  const editableKey =
    reportDocument &&
    supportErrand &&
    !isSupportErrandLocked(supportErrand) &&
    resolveReportDocumentEditability(supportErrand, phases, reportDocument) === 'editable'
      ? reportDocument.key
      : undefined;

  // The form shows the report, so the read-only list of the errand's data must not show it again.
  useEffect(() => {
    if (!editableKey) return;
    setJsonParameterHandled(editableKey, true);
    return () => setJsonParameterHandled(editableKey, false);
  }, [editableKey, setJsonParameterHandled]);

  useEffect(() => {
    if (!editableKey || !reportDocument || !municipalityId || !errandId) return;
    let current = true;
    setReport(undefined);
    setLoadFailed(false);
    loadReport(municipalityId, errandId, reportDocument, registeredPlaceName(supportErrand?.labels))
      .then((loaded) => current && setReport(loaded))
      .catch(() => current && setLoadFailed(true));
    return () => {
      current = false;
    };
    // The report is loaded once per errand; the errand's own changes do not reload what is being written.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableKey, municipalityId, errandId]);

  if (!editableKey || !reportDocument || !errandId) return null;

  const recordSavedReport = (document: SupportInvestigationDocument) =>
    useSupportStore.setState((state) =>
      state.supportErrand?.id !== errandId
        ? state
        : {
            supportErrand: {
              ...state.supportErrand,
              jsonParameters: [
                ...(state.supportErrand.jsonParameters ?? []).filter((parameter) => parameter.key !== document.key),
                document,
              ],
            },
          }
    );

  const save = async (formData: InvestigationFormData) => {
    if (!report) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const expectedVersion = supportErrand?.version;
      const saved = await saveSupportInvestigationDocument(
        municipalityId,
        errandId,
        reportDocument.key,
        { schemaId: report.schemaId, value: formData },
        expectedVersion,
        report.etag
      );
      setReport({ ...report, formData: saved.document.value, etag: saved.etag });
      recordSavedReport(saved.document);
      advanceErrandVersion(expectedVersion, saved.parentErrandVersion);
      toastMessage(getToastOptions({ message: 'Rapporten har sparats.', status: 'success' }));
    } catch (error) {
      setSaveError(reportSaveErrorMessage(isAxiosError(error) ? error.response?.status : undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="mb-32 flex flex-col gap-16"
      aria-labelledby="avvikelse-report-heading"
      data-cy="avvikelse-report-document"
    >
      <div className="flex flex-col gap-8">
        <h2 id="avvikelse-report-heading" className="text-h4-sm md:text-h4-md">
          Rapport
        </h2>
        <p>
          Ärendet registrerades i Draken, så rapporten om vad som hänt fylls i här. Den kan ändras tills ärendet går
          vidare till utredning.
        </p>
      </div>
      {saveError && (
        <Alert type="error" data-cy="avvikelse-report-notice">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>{saveError}</Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}
      {loadFailed ? (
        <Alert type="error">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>
              Rapporten kunde inte hämtas. Ladda om sidan och försök igen.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      ) : !report ? (
        <div aria-busy="true">
          <Spinner size={3} /> <span className="ml-8">Hämtar rapporten..</span>
        </div>
      ) : (
        <SchemaForm
          schema={report.schema}
          uiSchema={report.uiSchema}
          formData={report.formData}
          idPrefix={reportDocument.key}
          onChange={(formData) => setReport((current) => (current ? { ...current, formData } : current))}
          onSubmit={(formData) => void save(formData)}
          readonly={saving}
          submitButtonOptions={{ label: 'Spara rapport' }}
        />
      )}
    </section>
  );
};
