'use client';

import { Alert, FormControl, FormLabel, Label, Select, Tabs } from '@sk-web-gui/react';
import type {
  AvvikelseGroupedClassificationSelection,
  LabelClassificationSelection,
} from '@supportmanagement/investigation/avvikelse/label-classification';
import { FlaskConical } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AvvikelseGroupedClassificationField } from '../avvikelse-grouped-classification-fields.component';
import { INVESTIGATION_CLASSIFICATION_EXTERNAL_FIELD } from '../investigation-classification';
import { InvestigationFormData } from '../investigation-document';
import { normalizeInvestigationFormData } from '../investigation-form-data';
import { InvestigationLabelClassificationPanel } from './investigation-label-classification-panel.component';
import { InvestigationSchemaFormPanel } from './investigation-schema-form-panel.component';
import {
  InvestigationLabNotice,
  InvestigationLabRole,
  LocalInvestigationDocumentKey,
} from './investigation-schema-lab.types';
import { getInvestigationSchemaAccess, investigationLabRoleOptions } from './investigation-schema-lab-access';
import {
  defaultLabClassificationSelections,
  getLabClassificationFields,
  getLabClassificationGroupKeys,
  isSameLabClassificationSelections,
  retainLabClassificationSelections,
} from './investigation-schema-lab-classification';
import {
  loadInvestigationDraft,
  loadLabelClassificationDraft,
  removeInvestigationDraft,
  removeLabelClassificationDraft,
  saveInvestigationDraft,
  saveLabelClassificationDraft,
} from './investigation-schema-lab-storage';
import { getInvestigationSchemaDefinition, investigationSchemaDefinitions } from './investigation-schema-registry';

type DraftsBySchema = Record<LocalInvestigationDocumentKey, InvestigationFormData>;
type SavedAtBySchema = Partial<Record<LocalInvestigationDocumentKey, string>>;
type NoticesBySchema = Partial<Record<LocalInvestigationDocumentKey, InvestigationLabNotice>>;

interface InitialLabState {
  drafts: DraftsBySchema;
  savedAt: SavedAtBySchema;
  notices: NoticesBySchema;
  labelClassifications: AvvikelseGroupedClassificationSelection;
  labelClassificationSavedAt?: string;
}

const emptyDrafts: DraftsBySchema = {
  'utredning-enhetschef': {},
  'utredning-sol-lss': {},
  'utredning-hsl': {},
  'beslut-hsl': {},
  'beslut-sol-lss': {},
};

/** The unit manager's selectors; their legal bases decide which groups keep a classification, as in the errand. */
function getManagerClassificationFields(managerFormData: InvestigationFormData): AvvikelseGroupedClassificationField[] {
  return getLabClassificationFields('utredning-enhetschef', managerFormData) ?? [];
}

function readBrowserStorage(notices: NoticesBySchema): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    notices['utredning-enhetschef'] = {
      type: 'warning',
      message: 'localStorage är inte tillgängligt. Exempeldata visas, men lokala utkast kan inte återställas.',
    };
    return undefined;
  }
}

function loadInitialDocumentDrafts(
  browserStorage: Storage | undefined,
  drafts: DraftsBySchema,
  savedAt: SavedAtBySchema,
  notices: NoticesBySchema
): void {
  for (const definition of investigationSchemaDefinitions) {
    const loadedDraft = browserStorage
      ? loadInvestigationDraft(browserStorage, definition.key, definition.schemaVersion)
      : undefined;
    const initialFormData = loadedDraft?.savedAt ? loadedDraft.formData : definition.exampleFormData;
    drafts[definition.key] = normalizeInvestigationFormData(definition.schemaName, definition.schema, initialFormData);

    if (loadedDraft?.savedAt) savedAt[definition.key] = loadedDraft.savedAt;
    if (loadedDraft?.warning) notices[definition.key] = { type: 'warning', message: loadedDraft.warning };
  }
}

function loadInitialLabelClassifications(
  browserStorage: Storage | undefined,
  managerFields: readonly AvvikelseGroupedClassificationField[],
  notices: NoticesBySchema
): Pick<InitialLabState, 'labelClassifications' | 'labelClassificationSavedAt'> {
  if (!browserStorage) {
    return {
      labelClassifications: retainLabClassificationSelections(managerFields, defaultLabClassificationSelections),
    };
  }

  const loadedLabelClassifications = loadLabelClassificationDraft(browserStorage);
  const initialLabelClassifications = loadedLabelClassifications.savedAt
    ? loadedLabelClassifications.value
    : defaultLabClassificationSelections;
  const retainedLabelClassifications = retainLabClassificationSelections(managerFields, initialLabelClassifications);
  const classificationsMatch = isSameLabClassificationSelections(
    retainedLabelClassifications,
    initialLabelClassifications
  );
  if (loadedLabelClassifications.warning) {
    notices['utredning-enhetschef'] = { type: 'warning', message: loadedLabelClassifications.warning };
  } else if (loadedLabelClassifications.savedAt && !classificationsMatch) {
    notices['utredning-enhetschef'] = {
      type: 'warning',
      message: 'Den lokalt sparade labelmocken passar inte längre valda lagrum och har därför ignorerats.',
    };
  }

  return {
    labelClassifications: retainedLabelClassifications,
    labelClassificationSavedAt: classificationsMatch ? loadedLabelClassifications.savedAt : undefined,
  };
}

function createInitialLabState(): InitialLabState {
  const drafts: DraftsBySchema = { ...emptyDrafts };
  const savedAt: SavedAtBySchema = {};
  const notices: NoticesBySchema = {};
  const browserStorage = readBrowserStorage(notices);
  loadInitialDocumentDrafts(browserStorage, drafts, savedAt, notices);
  const managerFields = getManagerClassificationFields(drafts['utredning-enhetschef']);
  const labelState = loadInitialLabelClassifications(browserStorage, managerFields, notices);
  return { drafts, savedAt, notices, ...labelState };
}

export function InvestigationSchemaLab() {
  const [initialLabState] = useState(createInitialLabState);
  const [activeTab, setActiveTab] = useState(0);
  const [role, setRole] = useState<InvestigationLabRole>('unitManager');
  const [drafts, setDrafts] = useState<DraftsBySchema>(initialLabState.drafts);
  const [savedAt, setSavedAt] = useState<SavedAtBySchema>(initialLabState.savedAt);
  const [notices, setNotices] = useState<NoticesBySchema>(initialLabState.notices);
  const [labelClassifications, setLabelClassifications] = useState<AvvikelseGroupedClassificationSelection>(
    initialLabState.labelClassifications
  );
  const [labelClassificationSavedAt, setLabelClassificationSavedAt] = useState<string | undefined>(
    initialLabState.labelClassificationSavedAt
  );
  const [labelClassificationNotice, setLabelClassificationNotice] = useState<string>();

  const selectedRole = useMemo(
    () => investigationLabRoleOptions.find((roleOption) => roleOption.value === role)!,
    [role]
  );

  const updateLabelClassification = (
    schemaKey: LocalInvestigationDocumentKey,
    groupKey: string,
    selection: LabelClassificationSelection
  ) => {
    const nextLabelClassifications = { ...labelClassifications, [groupKey]: selection };
    setLabelClassifications(nextLabelClassifications);
    setLabelClassificationNotice(undefined);

    try {
      const timestamp = saveLabelClassificationDraft(window.localStorage, nextLabelClassifications);
      setLabelClassificationSavedAt(timestamp);
      setNotices((currentNotices) => ({ ...currentNotices, [schemaKey]: undefined }));
    } catch {
      setNotices((currentNotices) => ({
        ...currentNotices,
        [schemaKey]: {
          type: 'error',
          message: 'Labelmocken kunde inte sparas lokalt. Kontrollera webbläsarens lagringsinställningar.',
        },
      }));
    }
  };

  const updateDraft = (schemaKey: LocalInvestigationDocumentKey, formData: InvestigationFormData) => {
    const definition = getInvestigationSchemaDefinition(schemaKey);
    const normalizedData = normalizeInvestigationFormData(definition.schemaName, definition.schema, formData);
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [schemaKey]: normalizedData,
    }));

    if (definition.schemaName === 'utredning-enhetschef') {
      const nextFields = getManagerClassificationFields(normalizedData);
      // Only legal bases that stop reaching a group clear its classification; other edits keep every choice.
      const reachedGroupsChanged =
        getLabClassificationGroupKeys(getManagerClassificationFields(drafts[schemaKey])) !==
        getLabClassificationGroupKeys(nextFields);
      const retainedLabels = reachedGroupsChanged
        ? retainLabClassificationSelections(nextFields, labelClassifications)
        : labelClassifications;
      if (!isSameLabClassificationSelections(retainedLabels, labelClassifications)) {
        setLabelClassifications(retainedLabels);
        try {
          const timestamp = saveLabelClassificationDraft(window.localStorage, retainedLabels);
          setLabelClassificationSavedAt(timestamp);
          setLabelClassificationNotice(
            'Vald ärendeklassificering passade inte längre valda lagrum och har därför rensats.'
          );
        } catch {
          setNotices((currentNotices) => ({
            ...currentNotices,
            [schemaKey]: {
              type: 'error',
              message: 'Lagrum ändrades, men labelmocken kunde inte uppdateras i localStorage.',
            },
          }));
        }
      }
    }
  };

  const persistDraft = (
    schemaKey: LocalInvestigationDocumentKey,
    schemaVersion: string,
    formData: InvestigationFormData,
    validated: boolean
  ) => {
    try {
      const definition = getInvestigationSchemaDefinition(schemaKey);
      const normalizedData = normalizeInvestigationFormData(definition.schemaName, definition.schema, formData);
      const timestamp = saveInvestigationDraft(window.localStorage, schemaKey, schemaVersion, normalizedData);
      setDrafts((currentDrafts) => ({ ...currentDrafts, [schemaKey]: normalizedData }));
      setSavedAt((currentSavedAt) => ({ ...currentSavedAt, [schemaKey]: timestamp }));
      setNotices((currentNotices) => ({
        ...currentNotices,
        [schemaKey]: {
          type: 'success',
          message: validated
            ? 'Formuläret är validerat mot schemat och sparat i den här webbläsaren.'
            : 'Utkastet är sparat i den här webbläsaren utan fullständig validering.',
        },
      }));
    } catch {
      setNotices((currentNotices) => ({
        ...currentNotices,
        [schemaKey]: {
          type: 'error',
          message: 'Utkastet kunde inte sparas lokalt. Kontrollera webbläsarens lagringsinställningar.',
        },
      }));
    }
  };

  const resetDraft = (schemaKey: LocalInvestigationDocumentKey, exampleFormData: InvestigationFormData) => {
    const confirmed = window.confirm(
      'Rensa det lokala utkastet och återställ exempeldata för den här utredningen? Åtgärden kan inte ångras.'
    );
    if (!confirmed) return;

    try {
      removeInvestigationDraft(window.localStorage, schemaKey);
      if (getInvestigationSchemaDefinition(schemaKey).schemaName === 'utredning-enhetschef') {
        removeLabelClassificationDraft(window.localStorage);
      }
    } catch {
      setNotices((currentNotices) => ({
        ...currentNotices,
        [schemaKey]: {
          type: 'error',
          message: 'Det lokala utkastet kunde inte tas bort. Kontrollera webbläsarens lagringsinställningar.',
        },
      }));
      return;
    }

    const definition = getInvestigationSchemaDefinition(schemaKey);
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [schemaKey]: normalizeInvestigationFormData(definition.schemaName, definition.schema, exampleFormData),
    }));
    if (definition.schemaName === 'utredning-enhetschef') {
      setLabelClassifications(
        retainLabClassificationSelections(
          getManagerClassificationFields(exampleFormData),
          defaultLabClassificationSelections
        )
      );
      setLabelClassificationSavedAt(undefined);
      setLabelClassificationNotice(undefined);
    }
    setSavedAt((currentSavedAt) => ({ ...currentSavedAt, [schemaKey]: undefined }));
    setNotices((currentNotices) => ({
      ...currentNotices,
      [schemaKey]: { type: 'info', message: 'Det lokala utkastet har rensats och exempeldata har återställts.' },
    }));
  };

  return (
    <main className="min-h-screen min-w-0 bg-background-100 px-16 py-24 md:px-32 md:py-40">
      <div className="mx-auto w-full min-w-0 max-w-content" data-cy="investigation-schema-lab-content">
        <header className="mb-24">
          <div className="mb-8 flex min-w-0 flex-wrap items-center gap-12">
            <FlaskConical aria-hidden="true" />
            <h1 className="text-h2-md">Lokal schema-labb · Utredning</h1>
            <Label rounded inverted color="vattjom">
              Endast utveckling
            </Label>
          </div>
          <p className="max-w-[90rem]">
            Här kan de tre utredningsschemana provas med Drakens riktiga RJSF- och komponentlib-rendering innan de
            publiceras till JSON Schema API.
          </p>
        </header>

        <Alert type="info" className="mb-24">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Title>Isolerad från verksamhetsdata</Alert.Content.Title>
            <Alert.Content.Description>
              Inga anrop för att läsa eller skriva ärenden eller scheman görs från den här sidan. Utkast lagras endast i
              webbläsarens localStorage och kan rensas per flik.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>

        <section
          className="mb-24 min-w-0 max-w-full rounded-12 border-1 bg-background-content p-16 sm:p-20"
          aria-labelledby="mock-access-heading"
        >
          <h2 id="mock-access-heading" className="text-h4-md mb-16">
            Mockad behörighet
          </h2>
          <div className="flex flex-wrap items-end gap-16">
            <FormControl className="w-full max-w-[40rem]">
              <FormLabel>Testroll</FormLabel>
              <Select
                value={role}
                onChange={(event) => setRole(event.currentTarget.value as InvestigationLabRole)}
                data-cy="investigation-lab-role"
              >
                {investigationLabRoleOptions.map((roleOption) => (
                  <Select.Option key={roleOption.value} value={roleOption.value}>
                    {roleOption.label}
                  </Select.Option>
                ))}
              </Select>
            </FormControl>
            <p className="text-small pb-8">{selectedRole.description} Övriga scheman visas skrivskyddade.</p>
          </div>
        </section>

        <Tabs
          className="w-full min-w-0 max-w-full rounded-12 border-1 bg-background-content"
          tabslistClassName="flex-wrap px-16 pt-16"
          panelsClassName="min-w-0 max-w-full border-t-1"
          current={activeTab}
          onTabChange={setActiveTab}
          size="sm"
        >
          {investigationSchemaDefinitions.map((definition) => {
            const access = getInvestigationSchemaAccess(role, definition.key);
            const classificationFields = getLabClassificationFields(definition.schemaName, drafts[definition.key]);

            return (
              <Tabs.Item key={definition.key}>
                <Tabs.Button data-cy={`${definition.key}-tab`}>{definition.tabLabel}</Tabs.Button>
                <Tabs.Content className="min-w-0 max-w-full">
                  <InvestigationSchemaFormPanel
                    definition={definition}
                    access={access}
                    formData={drafts[definition.key]}
                    savedAt={savedAt[definition.key]}
                    notice={notices[definition.key]}
                    externalFields={{
                      investigationReport: (
                        <p className="text-small">
                          Rapporter skapas från ärendet i Draken, inte från labben. Här går det bara att prova
                          markeringen.
                        </p>
                      ),
                      ...(classificationFields
                        ? {
                            [INVESTIGATION_CLASSIFICATION_EXTERNAL_FIELD]: (
                              <InvestigationLabelClassificationPanel
                                headingId={`${definition.key}-label-classification-heading`}
                                fields={classificationFields}
                                selections={labelClassifications}
                                canWrite={access.canWrite}
                                savedAt={labelClassificationSavedAt}
                                notice={labelClassificationNotice}
                                onChange={(groupKey, selection) =>
                                  updateLabelClassification(definition.key, groupKey, selection)
                                }
                              />
                            ),
                          }
                        : {}),
                    }}
                    onChange={(formData) => updateDraft(definition.key, formData)}
                    onSaveDraft={() =>
                      persistDraft(definition.key, definition.schemaVersion, drafts[definition.key], false)
                    }
                    onValidatedSave={(formData) =>
                      persistDraft(definition.key, definition.schemaVersion, formData, true)
                    }
                    onRemoveDraft={() => resetDraft(definition.key, definition.exampleFormData)}
                  />
                </Tabs.Content>
              </Tabs.Item>
            );
          })}
        </Tabs>
      </div>
    </main>
  );
}
