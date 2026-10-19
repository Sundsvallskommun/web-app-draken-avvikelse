import { getRjsfSchema, getUiSchemaForSchema } from '@common/components/json/utils/schema-utils';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { useCallback, useEffect, useState } from 'react';

interface UseJsonSchemaResult {
  schema: RJSFSchema | null;
  uiSchema: UiSchema | null;
  loading: boolean;
  error: string | null;
}

export function useJsonSchema(municipalityId: string, schemaId: string): UseJsonSchemaResult {
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [uiSchema, setUiSchema] = useState<UiSchema | null>(null);
  const [loading, setLoading] = useState(Boolean(municipalityId && schemaId));
  const [error, setError] = useState<string | null>(null);

  const fetchSchemas = useCallback(async () => {
    if (!municipalityId || !schemaId) return;

    setLoading(true);
    setError(null);

    try {
      const rjsfSchema = await getRjsfSchema(municipalityId, schemaId);
      setSchema(rjsfSchema);

      try {
        const ui = await getUiSchemaForSchema(municipalityId, schemaId);
        setUiSchema(ui);
      } catch {
        // No UI schema available, SchemaForm will auto-generate one
        setUiSchema(null);
      }
    } catch (e) {
      console.error('Failed to load schema:', schemaId, e);
      setError(`Failed to load schema: ${schemaId}`);
    } finally {
      setLoading(false);
    }
  }, [municipalityId, schemaId]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  return { schema, uiSchema, loading, error };
}
