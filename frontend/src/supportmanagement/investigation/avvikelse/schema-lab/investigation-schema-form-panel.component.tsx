'use client';

import { ArrayObjectFieldTemplate } from '@common/components/json/fields/array-object-field-template.componant';
import SchemaForm from '@common/components/json/schema/schema-form.component';
import { Alert, Button, Disclosure, Label } from '@sk-web-gui/react';
import { Save, Trash2 } from 'lucide-react';
import { MouseEvent, ReactNode, useMemo, useState } from 'react';

import { InvestigationFormData } from '../investigation-document';
import {
  getHslRiskValue,
  getInvestigationRenderingSchema,
  investigationDefaultFormStateBehavior,
  investigationRequiredIndicator,
} from '../investigation-form-data';
import { InvestigationLabNotice, InvestigationSchemaAccess } from './investigation-schema-lab.types';
import { formatInvestigationLabTimestamp } from './investigation-schema-lab-time';
import { InvestigationSchemaDefinition } from './investigation-schema-registry';

interface InvestigationSchemaFormPanelProps {
  definition: InvestigationSchemaDefinition;
  access: InvestigationSchemaAccess;
  formData: InvestigationFormData;
  savedAt?: string;
  notice?: InvestigationLabNotice;
  externalFields?: Readonly<Record<string, ReactNode>>;
  onChange: (formData: InvestigationFormData) => void;
  onSaveDraft: () => void;
  onValidatedSave: (formData: InvestigationFormData) => void;
  onRemoveDraft: () => void;
}

function LabAlert({ notice }: Readonly<{ notice: InvestigationLabNotice }>) {
  return (
    <div
      role={notice.type === 'error' ? 'alert' : 'status'}
      aria-live={notice.type === 'error' ? 'assertive' : 'polite'}
    >
      <Alert type={notice.type} className="mb-24" data-cy="investigation-lab-notice">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>{notice.message}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}

export function InvestigationSchemaFormPanel({
  definition,
  access,
  formData,
  savedAt,
  notice,
  externalFields,
  onChange,
  onSaveDraft,
  onValidatedSave,
  onRemoveDraft,
}: Readonly<InvestigationSchemaFormPanelProps>) {
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const hslRiskValue = definition.schemaName === 'utredning-enhetschef' ? getHslRiskValue(formData) : undefined;
  const renderingSchema = useMemo(
    () => getInvestigationRenderingSchema(definition.schemaName, definition.schema, formData),
    [definition, formData]
  );
  const jsonPreviewId = `${definition.key}-json-preview`;

  const handleJsonPreviewButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setJsonPreviewOpen((currentOpen) => !currentOpen);
  };

  if (!access.canRead) {
    return (
      <Alert type="warning">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Title>Ingen läsbehörighet</Alert.Content.Title>
          <Alert.Content.Description>Den valda testrollen får inte läsa den här utredningen.</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <section className="min-w-0 max-w-full p-16 sm:p-24 md:p-32" aria-labelledby={`${definition.key}-heading`}>
      <div className="mb-24 flex min-w-0 max-w-full flex-wrap items-start justify-between gap-16">
        <div className="min-w-0 max-w-[76rem]">
          <div className="flex flex-wrap items-center gap-8 mb-8">
            <h2 id={`${definition.key}-heading`} className="text-h3-md">
              {definition.tabLabel}
            </h2>
            <Label rounded inverted color={access.canWrite ? 'gronsta' : 'bjornstigen'}>
              {access.canWrite ? 'Redigerbar' : 'Skrivskyddad'}
            </Label>
          </div>
          <p className="text-small text-dark-secondary">{definition.description}</p>
          <p className="mt-8 break-words text-small">
            Schema-ID: <code className="break-all">{definition.schemaId}</code> · Ansvarig roll: {definition.ownerLabel}
          </p>
          {savedAt && <p className="text-small mt-4">Lokalt sparad: {formatInvestigationLabTimestamp(savedAt)}</p>}
        </div>
      </div>

      {notice && <LabAlert notice={notice} />}

      {!access.canWrite && (
        <Alert type="info" className="mb-24">
          <Alert.Icon />
          <Alert.Content>
            <Alert.Content.Title>Förhandsvisning med mockad behörighet</Alert.Content.Title>
            <Alert.Content.Description>
              Byt testroll ovanför flikarna för att redigera det här schemat.
            </Alert.Content.Description>
          </Alert.Content>
        </Alert>
      )}

      {hslRiskValue !== undefined && hslRiskValue >= 4 && (
        <div role="alert">
          <Alert type="warning" className="mb-24" data-cy="hsl-risk-threshold-alert">
            <Alert.Icon />
            <Alert.Content>
              <Alert.Content.Title>HSL-riskvärde {hslRiskValue}</Alert.Content.Title>
              <Alert.Content.Description>
                Gränsen 4 är uppnådd. I det kommande ärendeflödet ska detta initiera parallell notifiering och hantering
                hos MAS/MAR.
              </Alert.Content.Description>
            </Alert.Content>
          </Alert>
        </div>
      )}

      <SchemaForm
        schema={renderingSchema}
        defaultFormStateBehavior={investigationDefaultFormStateBehavior}
        uiSchema={definition.uiSchema}
        idPrefix={definition.key}
        arrayFieldTemplate={ArrayObjectFieldTemplate}
        formData={formData}
        onChange={onChange}
        onSubmit={onValidatedSave}
        readonly={!access.canWrite}
        externalFields={externalFields}
        requiredIndicator={investigationRequiredIndicator}
        submitButtonOptions={{ label: 'Validera och spara lokalt', leadingIcon: false }}
        extraContent={
          access.canWrite ? (
            <div className="mt-32 flex min-w-0 max-w-full flex-wrap items-center gap-12">
              <Button
                type="button"
                className="h-auto max-w-full whitespace-normal"
                variant="secondary"
                leftIcon={<Save />}
                onClick={onSaveDraft}
              >
                Spara utkast lokalt
              </Button>
              <Button
                type="button"
                className="h-auto max-w-full whitespace-normal"
                variant="tertiary"
                leftIcon={<Trash2 />}
                onClick={onRemoveDraft}
              >
                Återställ exempeldata
              </Button>
            </div>
          ) : undefined
        }
      />

      <Disclosure
        id={jsonPreviewId}
        variant="alt"
        className="schema-boundary-disclosure mt-32 min-w-0 max-w-full"
        open={jsonPreviewOpen}
        onToggleOpen={setJsonPreviewOpen}
      >
        <Disclosure.Header>
          <Disclosure.Title id={`${jsonPreviewId}-title`}>
            <h3>Visa lokalt JSON-värde</h3>
          </Disclosure.Title>
          <Disclosure.Button aria-labelledby={`${jsonPreviewId}-title`} onClick={handleJsonPreviewButtonClick} />
        </Disclosure.Header>
        <Disclosure.Content>
          <pre
            className="max-w-full overflow-auto rounded-8 bg-background-100 p-16 text-small"
            data-cy="schema-form-data-preview"
            tabIndex={0}
            aria-label={`Lokalt JSON-värde för ${definition.tabLabel}`}
          >
            {JSON.stringify(formData, null, 2)}
          </pre>
        </Disclosure.Content>
      </Disclosure>
    </section>
  );
}
