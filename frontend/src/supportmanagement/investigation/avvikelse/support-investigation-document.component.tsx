'use client';

import { ArrayObjectFieldTemplate } from '@common/components/json/fields/array-object-field-template.componant';
import SchemaForm from '@common/components/json/schema/schema-form.component';
import { getSchemaFormErrors, type SchemaFormError } from '@common/components/json/utils/schema-form-error-handling';
import { getLatestRjsfSchema, getRjsfSchema, getUiSchemaForSchema } from '@common/components/json/utils/schema-utils';
import { withRequestGroup } from '@common/services/api-service';
import { deploymentStorageKey } from '@common/utils/persisted-store-key';
import { getToastOptions } from '@common/utils/toast-message-settings';
import type { RJSFSchema, RJSFValidationError, UiSchema } from '@rjsf/utils';
import { Alert, Button, Label, Spinner, useSnackbar } from '@sk-web-gui/react';
import { useMetadataStore, useSupportStore, useUserStore } from '@stores/index';
import { useErrandSaveParticipant } from '@supportmanagement/components/support-errand/errand-save/use-errand-save-participant';
import { AvvikelseGroupedLabelCategorization } from '@supportmanagement/investigation/avvikelse/avvikelse-grouped-label-categorization.component';
import {
  applyAvvikelseGroupedClassificationSelection,
  getAvvikelseGroupedClassificationSelection,
} from '@supportmanagement/investigation/avvikelse/label-classification';
import { useErrandMeasureSummary } from '@supportmanagement/measures/measure-summary';
import { getSupportAttachments } from '@supportmanagement/services/support-attachment-service';
import {
  CLASSIFICATION_FACTS,
  LABEL_FACTS,
  takeSupportErrandFacts,
} from '@supportmanagement/services/support-errand-facts';
import { getSupportErrandById, type SupportErrand } from '@supportmanagement/services/support-errand-service';
import { isAxiosError } from 'axios';
import dayjs from 'dayjs';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormProvider, useForm, useFormContext } from 'react-hook-form';

import { useInvestigationProfileStore } from '../investigation-profile-store';
import { HSL_RISK_ESCALATION_THRESHOLD } from './assignment/avvikelse-access-labels';
import { isWithLexInvestigation, shouldPromptLexAssignment } from './assignment/avvikelse-assignment-policy';
import { LexAssignmentPrompt } from './assignment/lex-assignment-prompt.component';
import { actsAsMasMar } from './assignment/mas-mar-handler';
import { ReturnToManagerButton } from './assignment/return-to-manager-button.component';
import { AVVIKELSE_CLASSIFICATION_POLICY } from './avvikelse-classification-policy';
import {
  HSL_INVESTIGATION_SCHEMA_NAME,
  LEX_ASSESSMENT_SCHEMA_NAME,
  LEX_DECISION_SCHEMA_NAME,
  LEX_INVESTIGATION_SCHEMA_NAME,
  UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME,
} from './avvikelse-schema-names';
import { investigationAfterCompletion } from './investigation-after-completion';
import {
  getInvestigationClassificationSchemaContract,
  getInvestigationClassificationUiSchema,
  getInvestigationLegalBaseRules,
  getInvestigationLegalBases,
  isInvestigationClassificationOwner,
  isReportedMisconductErrand,
  normalizeContextualInvestigationFormData,
} from './investigation-classification';
import {
  AVVIKELSE_DECISION_PROPOSAL_SOURCE,
  readInvestigationDecisionProposal,
  resolveDecisionProposalDegreeTitle,
} from './investigation-decision-proposal';
import { InvestigationDecisionProposal } from './investigation-decision-proposal.component';
import type { InvestigationDocumentDefinition, InvestigationFormData } from './investigation-document';
import { resolveInvestigationDocumentAuthor } from './investigation-document-author';
import { InvestigationDocumentAuthor } from './investigation-document-author.component';
import {
  getHslRiskValue,
  getInvestigationCompletion,
  getInvestigationRenderingSchema,
  getInvestigationReports,
  getInvestigationServerTimestamps,
  investigationDefaultFormStateBehavior,
  investigationRequiredIndicator,
  isInvestigationCompleted,
} from './investigation-form-data';
import { InvestigationReportControls } from './investigation-report-controls.component';
import {
  investigationSchemaDebugIsVisible,
  InvestigationSchemaDebugPanel,
} from './investigation-schema-debug-panel.component';
import {
  changedInvestigationTemplate,
  chosenInvestigationTemplate,
  followsLegalBasesTemplate,
  investigationTextIsReplaceable,
  offersInvestigationTextTemplates,
  readInvestigationText,
  withInvestigationText,
} from './investigation-text-template';
import { declinesLexInvestigation, hasLexDeclinedInvestigation } from './lex-initial-assessment';
import { prefillNewInvestigationDocument } from './new-investigation-document-prefill';
import { awaitsPrerequisiteDocument, readSavedInvestigationDocument } from './saved-investigation-document';
import { type SupportInvestigationClassificationResponse } from './support-investigation-classification-service';
import {
  decisionDocumentWording,
  type InvestigationClassificationDraft,
  investigationClassificationWriteBlock,
  investigationDocumentWording,
  investigationSaveErrorMessage,
  type PreparedInvestigationClassification,
  prepareInvestigationClassification,
  saveInvestigationClassificationStep,
  saveInvestigationDocumentStep,
} from './support-investigation-save-workflow';
import {
  createSupportInvestigationReport,
  getSupportInvestigationDocument,
  isSupportInvestigationAccessDenied,
  type LoadedSupportInvestigationDocument,
  previewSupportInvestigationReport,
  saveSupportInvestigationDocument,
  type SupportInvestigationDocument as SavedInvestigationDocument,
} from './support-investigation-service';
import { useInvestigationTextTemplate } from './use-investigation-text-template';
import { VcCommentRequest } from './vc-comment-request.component';

type LoadState = 'loading' | 'ready' | 'error';

interface InvestigationDocumentState {
  schema: RJSFSchema;
  uiSchema: UiSchema;
  schemaId: string;
  formData: InvestigationFormData;
  /** The document as Support Management holds it; the lock and the report log read this, not the draft. */
  persistedFormData: InvestigationFormData;
  persisted: boolean;
  etag?: string;
}

/** Opens a rendered PDF in a new tab; the object URL is released once the tab has had time to load it. */
const openPdfInNewTab = (pdfBase64: string): void => {
  const bytes = Uint8Array.from(atob(pdfBase64), (character) => character.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
};

/** The draft as it was before a change, so that undoing the change puts all of it back. */
interface InvestigationDraftBeforeChange {
  readonly formData: InvestigationFormData;
  readonly dirty: boolean;
  // A change of the legal bases also clears the categorization they no longer reach.
  readonly classification: InvestigationClassificationDraft;
  readonly classificationDirty: boolean;
}

const getClassificationDraft = (errand: SupportErrand | undefined): InvestigationClassificationDraft => ({
  labels: errand?.labels ?? [],
  category: errand?.category ?? '',
  type: errand?.type ?? '',
  subType: errand?.subType ?? '',
  classificationHasSubTypes: errand?.classificationHasSubTypes ?? false,
});

interface SupportInvestigationDocumentProps {
  definition: InvestigationDocumentDefinition;
  readable: boolean;
  readonly: boolean;
  /** The viewer may hand the errand back from this document: they write in it, and the errand is open to a handover. */
  canHandBack: boolean;
  classificationReadonly: boolean;
  refreshAccess: () => void;
  onDirtyChange: (isDirty: boolean) => void;
  onSaved: (document: SavedInvestigationDocument) => void;
  /** Brings the document into view: its tab, and the document's own tab within it. */
  onReveal: () => void;
}

/**
 * What stands in the way of the document, at its top: an error, which is brought into view, or a warning. That
 * something was saved is not told here - Spara ärende says so in its toast - so the form never jumps on a save.
 */
function InvestigationAlert({
  type,
  message,
  dataCy = 'investigation-document-notice',
}: Readonly<{ type: 'error' | 'warning'; message: string; dataCy?: string }>) {
  const noticeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (type !== 'error') return;
    noticeRef.current?.focus({ preventScroll: true });
    noticeRef.current?.scrollIntoView({ block: 'start' });
  }, [message, type]);

  return (
    <div
      ref={noticeRef}
      tabIndex={-1}
      role={type === 'error' ? 'alert' : 'status'}
      aria-live={type === 'error' ? 'assertive' : 'polite'}
    >
      <Alert type={type} className="mb-24" data-cy={dataCy}>
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>{message}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

export function SupportInvestigationDocument({
  definition,
  readable,
  readonly,
  canHandBack,
  classificationReadonly,
  refreshAccess,
  onDirtyChange,
  onSaved,
  onReveal,
}: Readonly<SupportInvestigationDocumentProps>) {
  const supportErrand = useSupportStore((state) => state.supportErrand);
  const setActiveTabKey = useSupportStore((state) => state.setActiveTabKey);
  const supportMetadata = useMetadataStore((state) => state.supportMetadata);
  const userName = useUserStore((state) => state.user.name);
  const user = useUserStore((state) => state.user);
  const { register: registerErrandField, resetField: resetErrandField } = useFormContext<SupportErrand>();
  const errandId = supportErrand?.id;
  const profile = useInvestigationProfileStore((state) => state.profile);
  const reportedMisconduct = isReportedMisconductErrand(supportErrand);
  const isDecision = (definition.placement ?? 'investigation') === 'decision';
  // The decision on a reported misconduct answers the investigator's proposal, so it is shown first.
  const showsDecisionProposal = isDecision && definition.appliesTo === 'reported-misconduct';
  // A document that answers another one waits for it: the BFF refuses the write, and the form
  // says why instead of offering a save that would fail.
  const prerequisite = definition.prerequisiteDocumentKey
    ? profile?.documents.find((document) => document.key === definition.prerequisiteDocumentKey)
    : undefined;
  const prerequisiteMissing = awaitsPrerequisiteDocument(supportErrand, definition);
  // What the handler is told the document is. The investigation wording predates the decision tab.
  const wording = isDecision ? decisionDocumentWording : investigationDocumentWording;
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [documentState, setDocumentState] = useState<InvestigationDocumentState>();
  const [notice, setNotice] = useState<{ type: 'error' | 'warning'; message: string }>();
  const toastMessage = useSnackbar();
  const toastSuccess = (message: string) => toastMessage(getToastOptions({ message, status: 'success' }));
  const [isSaving, setIsSaving] = useState(false);
  const [isReporting, setIsReporting] = useState(false);
  // Skapa rapport on an unsaved form submits the form first; the report follows the save.
  const reportAfterSave = useRef(false);
  const [validationErrors, setValidationErrors] = useState<SchemaFormError[]>([]);
  const classificationFieldId = `${definition.key}_external_errandClassification`;
  const [isDirty, setIsDirty] = useState(false);
  const [classificationDirty, setClassificationDirty] = useState(false);
  const [documentSavedPendingClassification, setDocumentSavedPendingClassification] = useState(false);
  const [showLexAssignmentPrompt, setShowLexAssignmentPrompt] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  // Spara ärende in the sidebar submits this document's form and waits here for the save to finish.
  const pendingSidebarSave = useRef<(saved: boolean) => void>(undefined);
  const [revealRequest, setRevealRequest] = useState(0);

  const classificationMethods = useForm<InvestigationClassificationDraft>({
    defaultValues: getClassificationDraft(supportErrand),
    mode: 'onChange',
  });
  const {
    getValues: getClassificationValues,
    reset: resetClassification,
    trigger: triggerClassification,
  } = classificationMethods;
  const persistedClassification = useMemo(() => getClassificationDraft(supportErrand), [supportErrand]);

  const setDocumentDirty = useCallback((nextDirty: boolean) => setIsDirty(nextDirty), []);

  const applyInvestigationTemplateText = useCallback(
    (template: string, text: string) => {
      setDocumentState((current) =>
        current && chosenInvestigationTemplate(current.schema, current.formData) === template
          ? { ...current, formData: withInvestigationText(current.formData, text) }
          : current
      );
      setDocumentDirty(true);
    },
    [setDocumentDirty]
  );
  const investigationTextTemplate = useInvestigationTextTemplate(documentState, applyInvestigationTemplateText);
  /** Puts the draft back as it was before a change the investigator undid. */
  const restoreDraft = useCallback(
    (before: InvestigationDraftBeforeChange) => {
      setDocumentState((current) => (current ? { ...current, formData: before.formData } : current));
      setDocumentDirty(before.dirty);
      resetClassification(before.classification, { keepDefaultValues: true });
      setClassificationDirty(before.classificationDirty);
    },
    [resetClassification, setDocumentDirty]
  );
  const startingInvestigationTemplateText = investigationTextTemplate.startingText;

  useEffect(() => {
    onDirtyChange(isDirty || classificationDirty);
  }, [classificationDirty, isDirty, onDirtyChange]);

  useEffect(
    () => () => {
      onDirtyChange(false);
    },
    [onDirtyChange]
  );

  useEffect(() => {
    // Access may disappear during a refresh or be revoked. Keep the draft and RHF state;
    // only a component identity change (user/errand/document) ends their lifetime.
    if (!readable || documentState || loadState === 'error') return;
    let cancelled = false;

    const loadDocument = async () => {
      if (!errandId) return;

      setLoadState('loading');
      setNotice(undefined);
      setValidationErrors([]);
      setDocumentDirty(false);
      setClassificationDirty(false);
      setDocumentSavedPendingClassification(false);

      try {
        const storedDocument = await getSupportInvestigationDocument(errandId, definition.key);
        const loadedSchema = storedDocument
          ? {
              schema: await getRjsfSchema(storedDocument.document.schemaId),
              schemaId: storedDocument.document.schemaId,
            }
          : await getLatestRjsfSchema(definition.schemaName);
        const uiSchema = await getUiSchemaForSchema(loadedSchema.schemaId);

        if (cancelled) return;
        // A document not yet saved starts where the errand leaves it: the decision from the assessment, the lex
        // Sarah investigation from the errand's background. Read when the document loads, not as a dependency:
        // the start is decided once, by what is saved then.
        const startingData =
          storedDocument?.document.value ??
          (await prefillNewInvestigationDocument({
            schemaName: definition.schemaName,
            schema: loadedSchema.schema,
            errand: useSupportStore.getState().supportErrand,
            profile: useInvestigationProfileStore.getState().profile,
            administrators: useUserStore.getState().administrators,
          }));
        if (cancelled) return;
        const normalizedStartingData = normalizeContextualInvestigationFormData(
          definition.key,
          definition.schemaName,
          loadedSchema.schema,
          startingData,
          reportedMisconduct
        );
        // A misconduct's lagrum are set before anyone opens the new document, so they call for its template
        // before anything happens that would fill the text. Its text is part of the start instead.
        const preselectedTemplate = storedDocument
          ? undefined
          : chosenInvestigationTemplate(loadedSchema.schema, normalizedStartingData);
        const templateText =
          preselectedTemplate && investigationTextIsReplaceable(readInvestigationText(normalizedStartingData), [])
            ? await startingInvestigationTemplateText(preselectedTemplate)
            : undefined;
        if (cancelled) return;
        // Normalized again with the text in it: the start has to be in the same canonical shape as every later
        // change, or the form's first report of its own data reads as an edit.
        const loadedFormData = templateText
          ? normalizeContextualInvestigationFormData(
              definition.key,
              definition.schemaName,
              loadedSchema.schema,
              withInvestigationText(normalizedStartingData, templateText),
              reportedMisconduct
            )
          : normalizedStartingData;
        setDocumentState({
          schema: loadedSchema.schema,
          uiSchema,
          schemaId: loadedSchema.schemaId,
          formData: loadedFormData,
          // The stored document as is, server-owned values included; the form data above is
          // the client's normalized view of it.
          persistedFormData: storedDocument?.document.value ?? {},
          persisted: Boolean(storedDocument),
          etag: storedDocument?.etag,
        });
        setLoadState('ready');
      } catch (error) {
        if (cancelled) return;
        console.error(`Failed to load investigation document ${definition.key}`, error);
        setLoadState('error');
        if (isSupportInvestigationAccessDenied(error)) refreshAccess();
        setNotice({
          type: isSupportInvestigationAccessDenied(error) ? 'warning' : 'error',
          message: isSupportInvestigationAccessDenied(error)
            ? `Support Management nekade åtkomst till det här ${wording.kind}.`
            : `${wording.noun} kunde inte laddas. Försök igen eller kontakta support om felet kvarstår.`,
        });
      }
    };

    void loadDocument();
    return () => {
      cancelled = true;
    };
  }, [
    definition.key,
    definition.schemaName,
    errandId,
    reportedMisconduct,
    setDocumentDirty,
    wording,
    readable,
    documentState,
    loadState,
    refreshAccess,
    startingInvestigationTemplateText,
  ]);

  useEffect(() => {
    if (!classificationDirty) resetClassification(persistedClassification);
  }, [classificationDirty, persistedClassification, resetClassification]);

  useEffect(() => {
    useInvestigationProfileStore.getState().setJsonParameterHandled(definition.key, readable && loadState === 'ready');
    return () => useInvestigationProfileStore.getState().setJsonParameterHandled(definition.key, false);
  }, [definition.key, readable, loadState]);

  // Schema documentation - the schema's own description, its owning role and its id - is for working on
  // the schemas, not on the errand. Test and development show it, production does not. Whether the
  // handler may edit the document is about the errand, and is shown everywhere.
  const showSchemaMetadata = investigationSchemaDebugIsVisible();

  const renderingSchema = useMemo(() => {
    if (!documentState) return undefined;

    const schema = getInvestigationRenderingSchema(definition.schemaName, documentState.schema, documentState.formData);
    if (showSchemaMetadata) return schema;

    // FieldTemplate renders the root description above the form, so the schema's own documentation
    // is dropped here rather than hidden in the markup.
    const { description: _schemaDescription, ...schemaWithoutRootDescription } = schema;
    return schemaWithoutRootDescription;
  }, [definition.schemaName, documentState, showSchemaMetadata]);
  const hslRiskValue =
    definition.schemaName === UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME && documentState
      ? getHslRiskValue(documentState.formData)
      : undefined;
  // The errand goes back to the manager once LEX has decided on it, so the handover sits at the foot of
  // the lex Sarah decision - and at the foot of LEX-ansvarig's initial assessment, once a saved assessment
  // declines to lex-investigate it. Only while the errand is actually with LEX, which the access label says.
  // The backend authorizes each step on write access to the same document. An errand handed to LEX waits as
  // ASSIGNED, and handing it back needs no resume first.
  const handsBackToManager =
    (definition.schemaName === LEX_DECISION_SCHEMA_NAME || definition.schemaName === LEX_ASSESSMENT_SCHEMA_NAME) &&
    canHandBack &&
    Boolean(errandId) &&
    isWithLexInvestigation(supportErrand?.labels, supportMetadata?.labels?.labelStructure);
  const returnStep =
    definition.schemaName === LEX_ASSESSMENT_SCHEMA_NAME
      ? declinesLexInvestigation(readSavedInvestigationDocument(supportErrand, definition.key))
        ? ('decline-lex' as const)
        : undefined
      : ('return-to-manager' as const);
  const canReturnToManager = handsBackToManager && returnStep !== undefined;
  const classificationOwner = isInvestigationClassificationOwner(definition.key, supportErrand);
  const classificationLabelTree = classificationOwner ? AVVIKELSE_CLASSIFICATION_POLICY.labelTree : undefined;
  const classificationSchemaContract = documentState
    ? getInvestigationClassificationSchemaContract(definition.key, documentState.schema)
    : undefined;
  const legalBases = documentState ? getInvestigationLegalBases(documentState.formData) : [];
  const legalBaseRules = getInvestigationLegalBaseRules();
  const { classificationGroups, errandClassificationGroupPriority } = AVVIKELSE_CLASSIFICATION_POLICY;
  // The errand's classification is demanded when the investigation is marked finished, not while it
  // is being written; the schema's own requirements wait for the same answer.
  const markedComplete = documentState ? isInvestigationCompleted(documentState.schema, documentState.formData) : false;
  // The unit manager's investigation is where the unit's measures are decided on, so finishing it without any is
  // worth saying - once, as information: nothing requires a measure.
  const measureCount = useErrandMeasureSummary(
    supportErrand,
    definition.schemaName === UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME && markedComplete,
    'any'
  )?.count;
  const classificationPrerequisites = {
    required: classificationOwner,
    completed: markedComplete,
    canEditClassification: !classificationReadonly,
    dirty: classificationDirty,
    labelTree: classificationLabelTree,
    labelStructure: supportMetadata?.labels?.labelStructure,
    legalBases,
    legalBaseRules,
    classificationGroups,
    errandClassificationGroupPriority,
    persistedClassification,
  };
  const classificationWriteBlock = investigationClassificationWriteBlock(classificationPrerequisites);
  // A document saved as completed is locked: the form turns read-only and only the report
  // controls act on it, until the owner unlocks it.
  const completion = documentState ? getInvestigationCompletion(documentState.schema) : undefined;
  const locked = Boolean(
    completion && documentState?.persisted && documentState.persistedFormData[completion.field] === 'yes'
  );
  const reports =
    documentState && completion ? getInvestigationReports(documentState.schema, documentState.persistedFormData) : [];
  const formReadonly = readonly || Boolean(classificationWriteBlock) || prerequisiteMissing || locked;
  // Who the document is by is the server's to record. Until it is saved, somebody who may write it sees what
  // saving will record: their own name, in the role that answers for the document.
  const documentAuthor = documentState
    ? resolveInvestigationDocumentAuthor(
        documentState.schema,
        documentState.persistedFormData,
        !documentState.persisted && !readonly && userName ? { name: userName, role: definition.ownerLabel } : undefined
      )
    : undefined;
  const classificationUiSchema = useMemo(
    () =>
      documentState
        ? getInvestigationClassificationUiSchema(
            definition.key,
            documentState.schema,
            documentState.uiSchema,
            reportedMisconduct
          )
        : undefined,
    [definition.key, documentState, reportedMisconduct]
  );
  const serverTimestamps = documentState
    ? getInvestigationServerTimestamps(documentState.schema, documentState.persistedFormData)
    : [];

  useEffect(() => {
    if (!classificationOwner) return;

    registerErrandField('classification');
    registerErrandField('labels');
    registerErrandField('category');
    registerErrandField('type');
    registerErrandField('subType');
    registerErrandField('classificationHasSubTypes');
  }, [classificationOwner, registerErrandField]);

  // A document saved as completed whose classification did not follow: the document is stored and locked, and
  // only the classification it was saved with is left to write. That retry writes nothing of the document, so the
  // lock does not stand in its way - for whoever could have edited the document.
  const retriesClassificationOnly =
    locked &&
    documentSavedPendingClassification &&
    classificationDirty &&
    !readonly &&
    !prerequisiteMissing &&
    !classificationWriteBlock;
  // The document is saved with Spara ärende in the sidebar. A draft that cannot be shown or written -
  // a document out of reach, read-only or locked - is no draft the sidebar could save.
  const savableDraft =
    readable && loadState === 'ready' && (formReadonly ? retriesClassificationOnly : isDirty || classificationDirty);
  useErrandSaveParticipant(`investigation-document:${definition.key}`, savableDraft, {
    label: definition.tabLabel,
    // Submitted through the form, so it is validated exactly as it always was before it is saved.
    save: () =>
      new Promise<boolean>((resolve) => {
        const form = sectionRef.current?.querySelector('form');
        if (!form) {
          resolve(false);
          return;
        }
        pendingSidebarSave.current?.(false);
        pendingSidebarSave.current = resolve;
        form.requestSubmit();
      }),
    reveal: () => {
      onReveal();
      setRevealRequest((count) => count + 1);
    },
  });

  // Once the document is in view, the handler is taken to why it was not saved. The tabs show it a
  // render or two after they are asked to, so this waits - a few frames at most - until it is shown.
  useEffect(() => {
    if (revealRequest === 0) return;
    let frame = 0;
    let framesLeft = 10;
    const revealWhenShown = () => {
      const section = sectionRef.current;
      if (!section) return;
      if (section.getClientRects().length === 0 && framesLeft-- > 0) {
        frame = requestAnimationFrame(revealWhenShown);
        return;
      }
      const problem = section.querySelector<HTMLElement>('[data-cy="schema-form-error-summary"], [role="alert"]');
      (problem ?? section).scrollIntoView({ block: 'start' });
      problem?.focus({ preventScroll: true });
    };
    frame = requestAnimationFrame(revealWhenShown);
    return () => cancelAnimationFrame(frame);
  }, [revealRequest]);

  // Do not leave a revoked document's values in the DOM. Hooks above keep its in-memory draft.
  if (!readable) return null;

  if (loadState === 'loading') {
    return (
      <div className="flex items-center gap-12 p-32" role="status">
        <Spinner size={2} />
        <span>Laddar {definition.tabLabel.toLocaleLowerCase('sv')}...</span>
      </div>
    );
  }

  if (loadState === 'error' || !documentState || !renderingSchema) {
    return (
      <div className="p-32">
        {notice && <InvestigationAlert {...notice} />}
        <Button
          variant="secondary"
          onClick={() => {
            setLoadState('loading');
            refreshAccess();
          }}
        >
          Försök igen
        </Button>
      </div>
    );
  }

  const applySavedDocument = (saved: LoadedSupportInvestigationDocument) => {
    setDocumentState((current) =>
      current
        ? {
            ...current,
            // Normalized like a load, so the server's own properties do not read as edits.
            formData: normalizeContextualInvestigationFormData(
              definition.key,
              definition.schemaName,
              current.schema,
              saved.document.value,
              reportedMisconduct
            ),
            persistedFormData: saved.document.value,
            schemaId: saved.document.schemaId,
            persisted: true,
            etag: saved.etag,
          }
        : current
    );
    onSaved(saved.document);
    setDocumentDirty(false);
  };

  const applySavedClassification = (
    savedErrand: SupportInvestigationClassificationResponse,
    prepared: PreparedInvestigationClassification
  ) => {
    const savedSelections = getAvvikelseGroupedClassificationSelection(
      prepared.model,
      savedErrand.labels,
      savedErrand.classification
    );
    const savedErrandClassification = applyAvvikelseGroupedClassificationSelection(
      prepared.model,
      savedErrand.labels,
      savedSelections
    ).errandClassification;
    const savedDraft: InvestigationClassificationDraft = {
      labels: savedErrand.labels,
      category: savedErrandClassification?.category ?? '',
      type: savedErrandClassification?.type ?? '',
      subType: savedErrandClassification?.subType ?? '',
      classificationHasSubTypes: savedErrandClassification?.requiresSubType ?? false,
    };

    useSupportStore.setState((state) => {
      if (!state.supportErrand || state.supportErrand.id !== errandId) return state;
      return {
        supportErrand: {
          ...state.supportErrand,
          classification: savedErrand.classification,
          labels: savedErrand.labels,
          category: savedDraft.category,
          type: savedDraft.type,
          subType: savedDraft.subType,
          classificationHasSubTypes: savedDraft.classificationHasSubTypes,
          // The page now shows the classification and the labels as saved, so it has seen them as they are.
          facts: takeSupportErrandFacts(state.supportErrand.facts, savedErrand.facts, CLASSIFICATION_FACTS),
        },
      };
    });
    resetClassification(savedDraft);
    resetErrandField('classification', { defaultValue: savedErrand.classification });
    resetErrandField('labels', { defaultValue: savedDraft.labels });
    resetErrandField('category', { defaultValue: savedDraft.category });
    resetErrandField('type', { defaultValue: savedDraft.type });
    resetErrandField('subType', { defaultValue: savedDraft.subType });
    resetErrandField('classificationHasSubTypes', { defaultValue: savedDraft.classificationHasSubTypes });
  };

  /**
   * Takes over the labels the errand has now, and nothing else of it: the BFF marks the errand with what follows from
   * a saved document - a high HSL risk - in the same call. What is shown by the errand's labels - the HSL investigation
   * for a manager, once the risk is high - then follows the save without the page being loaded again.
   */
  const refreshErrandLabels = async () => {
    if (!errandId) return;
    const { errand: reread } = await getSupportErrandById(errandId);
    // The document is saved either way. Labels that could not be read show when the errand is next loaded.
    if (!reread?.labels) return;
    useSupportStore.setState((state) =>
      state.supportErrand?.id === errandId
        ? {
            supportErrand: {
              ...state.supportErrand,
              labels: reread.labels,
              facts: takeSupportErrandFacts(state.supportErrand.facts, reread.facts, LABEL_FACTS),
            },
          }
        : state
    );
    resetErrandField('labels', { defaultValue: reread.labels });
  };

  /**
   * A saved unit manager investigation that assesses a suspected misconduct has to be handed to a
   * LEX manager, and the dialog that does it opens here rather than during the save itself - the
   * investigation is already stored, and the handover is a separate write on the errand.
   */
  const promptLexAssignmentIfNeeded = async (savedFormData: InvestigationFormData) => {
    if (definition.schemaName !== UNIT_MANAGER_INVESTIGATION_SCHEMA_NAME) return;

    const needsLexAssignment = shouldPromptLexAssignment({
      formData: savedFormData,
      labels: useSupportStore.getState().supportErrand?.labels,
      labelStructure: supportMetadata?.labels?.labelStructure,
      lexDeclined: hasLexDeclinedInvestigation(useSupportStore.getState().supportErrand, profile),
    });
    if (!needsLexAssignment) return;
    setShowLexAssignmentPrompt(true);
  };

  const reportFailureNotice = (error: unknown, fallback: string) => {
    if (isSupportInvestigationAccessDenied(error)) {
      refreshAccess();
      setNotice({ type: 'warning', message: `Support Management nekade åtkomst till det här ${wording.kind}.` });
      return;
    }
    const serverMessage = isAxiosError<{ message?: unknown }>(error) ? error.response?.data?.message : undefined;
    const message =
      typeof serverMessage === 'string' && serverMessage.trim()
        ? serverMessage
        : !isAxiosError(error) && error instanceof Error && error.message
        ? error.message
        : fallback;
    setNotice({ type: 'error', message });
  };

  const unlockDocument = async () => {
    if (!errandId || !completion || !documentState.persisted || isReporting || isSaving) return;
    setIsReporting(true);
    setNotice(undefined);
    try {
      const saved = await saveSupportInvestigationDocument(
        errandId,
        definition.key,
        { schemaId: documentState.schemaId, value: { ...documentState.persistedFormData, [completion.field]: 'no' } },
        documentState.etag
      );
      applySavedDocument(saved);
      toastSuccess(`${wording.noun} är upplåst och kan ändras igen.`);
    } catch (error) {
      reportFailureNotice(error, `${wording.noun} kunde inte låsas upp. Försök igen.`);
    } finally {
      setIsReporting(false);
    }
  };

  const generateReportNow = async () => {
    if (!errandId || isReporting) return;
    setIsReporting(true);
    setNotice(undefined);
    try {
      // Survives a reload after a lost response. Clear only after the BFF confirms publication.
      const publicationKey = deploymentStorageKey(`investigation-report:${errandId}:${definition.key}`);
      const operationId = sessionStorage.getItem(publicationKey) ?? crypto.randomUUID();
      sessionStorage.setItem(publicationKey, operationId);
      const created = await createSupportInvestigationReport(errandId, definition.key, operationId);
      sessionStorage.removeItem(publicationKey);
      applySavedDocument(created);
      toastSuccess(`Rapporten ${created.report.fileName} har skapats och lagts som en bilaga på ärendet.`);
      try {
        const attachments = await getSupportAttachments(errandId);
        useSupportStore.getState().setSupportAttachments(attachments);
      } catch {
        // Publication is already confirmed. A failed list refresh must not invite another upload.
        setNotice({
          type: 'warning',
          message: `Rapporten ${created.report.fileName} har skapats, men bilagelistan kunde inte uppdateras. Öppna fliken Bilagor för att läsa rapporten.`,
        });
      }
    } catch (error) {
      reportFailureNotice(error, 'Rapporten kunde inte skapas. Försök igen eller kontakta support om felet kvarstår.');
    } finally {
      setIsReporting(false);
    }
  };

  /**
   * One click: a locked document is reported at once; anything else is submitted through the form
   * so it is validated and saved as completed first, and the report follows in `save`.
   */
  const generateReport = (form: HTMLFormElement | null) => {
    if (isReporting || isSaving) return;
    if (locked && !isDirty) {
      void generateReportNow();
      return;
    }
    reportAfterSave.current = true;
    form?.requestSubmit();
  };

  const previewReport = async () => {
    if (!errandId || isReporting) return;
    setIsReporting(true);
    setNotice(undefined);
    try {
      const preview = await previewSupportInvestigationReport(errandId, definition.key, {
        schemaId: documentState.schemaId,
        value: normalizeContextualInvestigationFormData(
          definition.key,
          definition.schemaName,
          documentState.schema,
          documentState.formData,
          reportedMisconduct
        ),
      });
      openPdfInNewTab(preview.pdfBase64);
    } catch (error) {
      reportFailureNotice(error, 'Rapporten kunde inte förhandsgranskas. Försök igen.');
    } finally {
      setIsReporting(false);
    }
  };

  /** Validates and saves the draft; answers whether it was saved. A refusal is told in the document. */
  const save = async (formData: InvestigationFormData, schemaErrors: RJSFValidationError[] = []): Promise<boolean> => {
    const reportRequested = reportAfterSave.current;
    reportAfterSave.current = false;
    if (!errandId || !readable || (formReadonly && !retriesClassificationOnly) || isSaving) {
      return false;
    }

    const normalizedData = normalizeContextualInvestigationFormData(
      definition.key,
      definition.schemaName,
      documentState.schema,
      formData,
      reportedMisconduct
    );
    setDocumentState((current) => (current ? { ...current, formData: normalizedData } : current));
    setIsSaving(true);
    setNotice(undefined);
    let documentSavedForClassification = documentSavedPendingClassification;

    try {
      const errors = getSchemaFormErrors(renderingSchema, schemaErrors, definition.key);
      let preparedClassification: PreparedInvestigationClassification | undefined;
      try {
        preparedClassification = await prepareInvestigationClassification({
          required: classificationOwner,
          completed: isInvestigationCompleted(documentState.schema, normalizedData),
          canEditClassification: !classificationReadonly,
          dirty: classificationDirty,
          labelTree: classificationLabelTree,
          labelStructure: supportMetadata?.labels?.labelStructure,
          legalBases: getInvestigationLegalBases(normalizedData),
          legalBaseRules,
          classificationGroups,
          errandClassificationGroupPriority,
          persistedClassification,
          triggerValidation: () => triggerClassification('labels'),
          getDraft: getClassificationValues,
        });
      } catch (error) {
        errors.push({
          fieldId: classificationFieldId,
          ancestorIds: [],
          label: 'Kategorisering',
          message: error instanceof Error ? error.message : 'Kontrollera typ och underkategori.',
        });
      }
      setValidationErrors(errors);
      if (errors.length > 0) return false;

      const savedDocument = await saveInvestigationDocumentStep({
        errandId,
        documentKey: definition.key,
        schemaId: documentState.schemaId,
        value: normalizedData,
        persisted: documentState.persisted,
        etag: documentState.etag,
        documentDirty: isDirty,
        classificationDirty,
        documentSavedPendingClassification,
      });
      if (savedDocument) applySavedDocument(savedDocument);

      if (savedDocument && classificationDirty) {
        documentSavedForClassification = true;
        setDocumentSavedPendingClassification(true);
      }

      const savedClassification = await saveInvestigationClassificationStep({
        errandId,
        documentKey: definition.key,
        prepared: preparedClassification,
        // Read now rather than from this render: a save from the sidebar can follow the errand's own save before the
        // document has rendered the errand that save left.
        seen: useSupportStore.getState().supportErrand,
        documentETag: savedDocument?.etag ?? documentState.etag,
      });
      if (savedClassification && preparedClassification) {
        applySavedClassification(savedClassification, preparedClassification);
      } else if (savedDocument) {
        // A saved classification answers with the errand's labels; without one they are read again.
        await refreshErrandLabels();
      }

      setDocumentSavedPendingClassification(false);
      setClassificationDirty(false);
      setDocumentDirty(false);

      if (reportRequested) await generateReportNow();
      await promptLexAssignmentIfNeeded(normalizedData);
      return true;
    } catch (error) {
      if (isSupportInvestigationAccessDenied(error)) refreshAccess();
      setNotice({
        type: 'error',
        message: investigationSaveErrorMessage({
          error,
          documentSavedForClassification,
          classificationDirty,
          classificationRequired: classificationOwner,
          wording,
        }),
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Submits through the form - from the sidebar or Skapa rapport - and tells the sidebar how it went.
   *
   * The document, its classification and the report that may follow are one action for Support Management: one
   * notification, not one for each write. From the sidebar the save joins the group Spara ärende already runs in.
   */
  const submitDocument = (formData: InvestigationFormData, schemaErrors?: RJSFValidationError[]) => {
    void withRequestGroup(() => save(formData, schemaErrors)).then((saved) => {
      const settle = pendingSidebarSave.current;
      pendingSidebarSave.current = undefined;
      settle?.(saved);
    });
  };

  return (
    <section
      ref={sectionRef}
      className="min-w-0 max-w-full p-16 sm:p-24 md:p-32"
      aria-labelledby={`${definition.key}-heading`}
      data-cy={`investigation-document-${definition.key}`}
    >
      {investigationTextTemplate.dialog}
      <div className="mb-24 flex min-w-0 max-w-full flex-wrap items-start justify-between gap-16">
        <div className="min-w-0 max-w-[76rem]">
          <div className="mb-8 flex flex-wrap items-center gap-8">
            <h2 id={`${definition.key}-heading`} className="text-h3-md">
              {definition.tabLabel}
            </h2>
            <Label rounded inverted color={formReadonly ? 'bjornstigen' : 'gronsta'}>
              {formReadonly ? 'Skrivskyddad' : 'Redigerbar'}
            </Label>
            {(isDirty || classificationDirty) && (
              <Label rounded inverted color="vattjom">
                Osparade ändringar
              </Label>
            )}
          </div>
          {showSchemaMetadata && (
            <p className="mt-8 break-words text-small">
              Ansvarig roll: {definition.ownerLabel} · Schema:{' '}
              <code className="break-all">{documentState.schemaId}</code>
            </p>
          )}
          {serverTimestamps.map((timestamp) => (
            <p key={timestamp.name} className="mt-8 text-small" data-cy={`investigation-document-${timestamp.name}`}>
              {timestamp.label}:{' '}
              <time dateTime={timestamp.value}>{dayjs(timestamp.value).format('YYYY-MM-DD HH:mm')}</time>
            </p>
          ))}
        </div>
      </div>

      {notice && <InvestigationAlert {...notice} />}

      {locked && (
        <InvestigationAlert
          type="warning"
          dataCy="investigation-document-locked"
          message={`${wording.noun} är markerad som klar och är låst för ändringar. Lås upp den om du behöver ändra något.`}
        />
      )}

      {prerequisiteMissing && (
        <InvestigationAlert
          type="warning"
          dataCy="investigation-document-prerequisite"
          message={`${wording.noun} kan fattas först när ${
            prerequisite?.tabLabel ?? definition.prerequisiteDocumentKey
          } har sparats i ärendet.`}
        />
      )}

      {classificationWriteBlock && <InvestigationAlert type="warning" message={classificationWriteBlock} />}
      {!readonly && classificationOwner && classificationReadonly && !classificationWriteBlock && (
        <InvestigationAlert
          type="warning"
          message="Du kan ändra dokumentet men inte ärendets kategorisering. Ändringar av lagrum måste stämma med den befintliga kategoriseringen."
        />
      )}

      {classificationOwner && classificationSchemaContract === 'missing-declaration' && (
        <Alert type="warning" className="mb-24" data-cy="investigation-classification-schema-warning">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>
              Schemat saknar deklarationen för ärendeklassificering. Draken använder den centrala utredningsplaceringen
              så att kategoriseringen fortfarande kan läsas och sparas.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      {readonly && (
        <Alert type="info" className="mb-24">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Description>
              {wording.noun} kan läsas men inte ändras med din behörighet eller i ärendets nuvarande status.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      {showsDecisionProposal &&
        !prerequisiteMissing &&
        (() => {
          const proposal = readInvestigationDecisionProposal(supportErrand, profile);
          return (
            <InvestigationDecisionProposal
              proposal={proposal}
              degreeTitle={resolveDecisionProposalDegreeTitle(
                documentState.schema,
                AVVIKELSE_DECISION_PROPOSAL_SOURCE.decisionDegreeField,
                proposal?.degree
              )}
            />
          );
        })()}

      {hslRiskValue !== undefined && hslRiskValue >= HSL_RISK_ESCALATION_THRESHOLD && (
        <Alert type="warning" className="mb-24" data-cy="hsl-risk-threshold-alert">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Title>HSL-riskvärde {hslRiskValue}</Alert.Content.Title>
            <Alert.Content.Description>
              Gränsen {HSL_RISK_ESCALATION_THRESHOLD} är uppnådd och ska hanteras vidare enligt verksamhetens process.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      <SchemaForm
        schema={renderingSchema}
        validationErrors={validationErrors}
        onError={(errors) => submitDocument(documentState.formData, errors)}
        defaultFormStateBehavior={investigationDefaultFormStateBehavior}
        uiSchema={classificationUiSchema}
        idPrefix={definition.key}
        requiredIndicator={investigationRequiredIndicator}
        arrayFieldTemplate={ArrayObjectFieldTemplate}
        formData={documentState.formData}
        onChange={(formData) => {
          if (formReadonly || isSaving) return;
          const normalizedData = normalizeContextualInvestigationFormData(
            definition.key,
            definition.schemaName,
            documentState.schema,
            formData,
            reportedMisconduct
          );
          const writeBlock = investigationClassificationWriteBlock({
            ...classificationPrerequisites,
            legalBases: getInvestigationLegalBases(normalizedData),
          });
          if (writeBlock) {
            setDocumentState((current) => (current ? { ...current, formData: { ...current.formData } } : current));
            setNotice({ type: 'warning', message: writeBlock });
            return;
          }
          if (JSON.stringify(normalizedData) === JSON.stringify(documentState.formData)) return;
          if (documentSavedPendingClassification) setDocumentSavedPendingClassification(false);
          setDocumentState((current) => (current ? { ...current, formData: normalizedData } : current));
          setDocumentDirty(true);
          setValidationErrors([]);
          setNotice(undefined);
          const chosenTemplate = changedInvestigationTemplate(
            documentState.schema,
            documentState.formData,
            normalizedData
          );
          if (chosenTemplate && followsLegalBasesTemplate(documentState.schema)) {
            // The legal bases chose it. Undoing puts the draft back as it was, the legal bases with it.
            const before: InvestigationDraftBeforeChange = {
              formData: documentState.formData,
              dirty: isDirty,
              classification: getClassificationValues(),
              classificationDirty,
            };
            void investigationTextTemplate.follow(chosenTemplate, () => restoreDraft(before));
          } else if (chosenTemplate && offersInvestigationTextTemplates(documentState.schema)) {
            void investigationTextTemplate.offer(chosenTemplate);
          }
        }}
        onSubmit={(formData) => submitDocument(formData)}
        readonly={formReadonly || isSaving}
        // Saved with Spara ärende in the sidebar, together with the rest of the errand.
        withoutSubmitButton
        externalFields={{
          // Ä4. Where the analysis has got far enough, MAS/MAR asks the head of operations for their comment.
          ...(definition.schemaName === HSL_INVESTIGATION_SCHEMA_NAME && actsAsMasMar(user)
            ? { vcCommentRequest: <VcCommentRequest /> }
            : {}),
          ...(documentAuthor
            ? { [documentAuthor.field]: <InvestigationDocumentAuthor author={documentAuthor} /> }
            : {}),
          ...(completion
            ? {
                investigationReport: (
                  <InvestigationReportControls
                    documentKey={definition.key}
                    completedInDraft={completion !== undefined && documentState.formData[completion.field] === 'yes'}
                    locked={locked}
                    dirty={isDirty || classificationDirty}
                    busy={isReporting || isSaving}
                    canEdit={!readonly && !prerequisiteMissing}
                    reports={reports}
                    onGenerate={generateReport}
                    onPreview={() => void previewReport()}
                    onUnlock={() => void unlockDocument()}
                    onGoToMeasures={() => setActiveTabKey('measures')}
                    proposesMeasures={definition.schemaName === LEX_INVESTIGATION_SCHEMA_NAME}
                    withoutMeasures={measureCount === 0}
                    afterCompletion={investigationAfterCompletion({
                      schemaName: definition.schemaName,
                      // As the draft now stands: the notice says what finishing it this way leads to.
                      needsLexAssignment: shouldPromptLexAssignment({
                        formData: documentState.formData,
                        labels: supportErrand?.labels,
                        labelStructure: supportMetadata?.labels?.labelStructure,
                        lexDeclined: hasLexDeclinedInvestigation(supportErrand, profile),
                      }),
                    })}
                  />
                ),
              }
            : {}),
          ...(classificationOwner && classificationLabelTree
            ? {
                errandClassification: (
                  <div id={classificationFieldId} tabIndex={-1}>
                    <FormProvider {...classificationMethods}>
                      <AvvikelseGroupedLabelCategorization
                        supportMetadata={supportMetadata}
                        reportKind={reportedMisconduct ? 'misconduct' : 'deviation'}
                        labelTree={classificationLabelTree}
                        disabled={formReadonly || classificationReadonly || isSaving}
                        legalBases={legalBases}
                        legalBaseRules={legalBaseRules}
                        groups={classificationGroups}
                        errandClassificationGroupPriority={errandClassificationGroupPriority}
                        onClassificationChange={() => {
                          setClassificationDirty(true);
                          setValidationErrors([]);
                          setNotice(undefined);
                        }}
                      />
                    </FormProvider>
                  </div>
                ),
              }
            : {}),
        }}
        // Handing the errand back belongs at the foot of the document, not above it: the investigator
        // reaches it once the document is written, and it stays disabled while anything is unsaved.
        submitButtonActions={
          canReturnToManager ? (
            <ReturnToManagerButton
              step={returnStep}
              errandId={errandId!}
              seen={supportErrand}
              disabled={isSaving || isDirty || classificationDirty}
            />
          ) : undefined
        }
      />

      <InvestigationSchemaDebugPanel
        id={`${definition.key}-json-debug`}
        label={definition.tabLabel}
        formData={documentState.formData}
      />

      {showLexAssignmentPrompt && (
        <LexAssignmentPrompt
          show
          errandId={errandId!}
          seen={supportErrand}
          onClose={() => setShowLexAssignmentPrompt(false)}
        />
      )}
    </section>
  );
}
