import { getRjsfSchema, getUiSchemaForSchema } from '@common/components/json/utils/schema-utils';
import type { RJSFSchema, UiSchema } from '@rjsf/utils';
import { useCallback, useEffect, useState } from 'react';

interface UseJsonSchemaResult {
  schema: RJSFSchema | null;
  uiSchema: UiSchema | null;
  loading: boolean;
  error: string | null;
}

export function useJsonSchema(schemaId: string): UseJsonSchemaResult {
  const [schema, setSchema] = useState<RJSFSchema | null>(null);
  const [uiSchema, setUiSchema] = useState<UiSchema | null>(null);
  const [loading, setLoading] = useState(Boolean(schemaId));
  const [error, setError] = useState<string | null>(null);

  const fetchSchemas = useCallback(async () => {
    if (!schemaId) return;

    setLoading(true);
    setError(null);

    try {
      const rjsfSchema = await getRjsfSchema(schemaId);
      setSchema(rjsfSchema);

      try {
        const ui = await getUiSchemaForSchema(schemaId);
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
  }, [schemaId]);

  useEffect(() => {
    fetchSchemas();
  }, [fetchSchemas]);

  return { schema, uiSchema, loading, error };
}
