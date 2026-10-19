'use client';

import { useJsonSchema } from '@common/components/json/hooks/useJsonSchema';
import SchemaForm from '@common/components/json/schema/schema-form.component';
import { Alert, Spinner } from '@sk-web-gui/react';
import { FC } from 'react';

interface DisplayJsonParameter {
  key: string;
  value?: unknown;
  schemaId: string;
  version?: number;
}

interface JsonParameterItemProps {
  param: DisplayJsonParameter;
  municipalityId: string;
}

const JsonParameterItem: FC<JsonParameterItemProps> = ({ param, municipalityId }) => {
  const { schema, uiSchema, loading, error } = useJsonSchema(municipalityId, param.schemaId);

  if (loading) {
    return (
      <div className="flex items-center gap-md py-md">
        <Spinner size={2} />
        <span>Laddar schema...</span>
      </div>
    );
  }

  if (error || !schema) {
    return (
      <Alert type="error" className="mb-16">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Description>
            Uppgifterna för {param.key} kunde inte visas eftersom schemat {param.schemaId} inte kunde laddas.
          </Alert.Content.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <div className="mb-16">
      <SchemaForm
        schema={schema}
        uiSchema={uiSchema ?? undefined}
        formData={param.value}
        idPrefix={param.key.replace(/[^\w-]/g, '_')}
        disabled
        // The answers are shown, not asked for: the schema's instructions belong to the form that collected them.
        withoutFieldHelp
      />
    </div>
  );
};

interface JsonParametersDisplayProps {
  jsonParameters: DisplayJsonParameter[];
  municipalityId: string;
}

export const JsonParametersDisplay: FC<JsonParametersDisplayProps> = ({ jsonParameters, municipalityId }) => {
  if (!jsonParameters || jsonParameters.length === 0) {
    return null;
  }

  return (
    <div className="mt-16">
      {jsonParameters.map((param, idx) => (
        <JsonParameterItem
          key={`${param.key}-${param.schemaId}-${idx}`}
          param={param}
          municipalityId={municipalityId}
        />
      ))}
    </div>
  );
};
