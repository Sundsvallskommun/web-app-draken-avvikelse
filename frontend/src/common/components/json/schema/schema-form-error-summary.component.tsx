import { Alert } from '@sk-web-gui/react';
import { useEffect, useId, useRef } from 'react';

import type { SchemaFormError } from '../utils/schema-form-error-handling';

export interface SchemaErrorNavigation {
  fieldId: string;
  /** Ids of the fields enclosing the target, outermost first, so a section can tell whether it holds it. */
  ancestorIds: readonly string[];
}

export function SchemaFormErrorSummary({
  errors,
  onNavigate,
}: Readonly<{ errors: readonly SchemaFormError[]; onNavigate: (target: SchemaErrorNavigation) => void }>) {
  const headingId = useId();
  const summaryRef = useRef<HTMLDivElement>(null);

  // Callers may derive the list during render; focus only when its content changes, not its identity.
  const errorSignature = errors.map((error) => `${error.fieldId}\n${error.message}`).join('\n\n');

  useEffect(() => {
    if (!errorSignature) return;
    summaryRef.current?.focus({ preventScroll: true });
    summaryRef.current?.scrollIntoView({ block: 'start' });
  }, [errorSignature]);

  if (errors.length === 0) return null;

  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      aria-labelledby={headingId}
      className="mb-24 scroll-mt-24"
      data-cy="schema-form-error-summary"
    >
      <Alert type="error">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Title>
            <h3 id={headingId}>Uppgifterna kunde inte sparas</h3>
          </Alert.Content.Title>
          <p>Kontrollera följande uppgifter och spara igen. Välj ett fel för att gå till fältet.</p>
          <ul className="mt-12 list-disc pl-24">
            {errors.map((error) => (
              <li key={`${error.fieldId}:${error.message}`}>
                <a
                  href={`#${error.fieldId}`}
                  className="underline"
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate({ fieldId: error.fieldId, ancestorIds: error.ancestorIds });
                  }}
                >
                  {error.label}: {error.message}
                </a>
              </li>
            ))}
          </ul>
        </Alert.Content>
      </Alert>
    </div>
  );
}
