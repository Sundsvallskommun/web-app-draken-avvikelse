'use client';

import { getApplicationEnvironment } from '@common/services/application-service';
import { Disclosure } from '@sk-web-gui/react';
import { MouseEvent, useState } from 'react';

/**
 * Whether the investigation's schema debug surfaces are shown at all.
 *
 * Test and development only: every `.env.<drake>` sets NEXT_PUBLIC_ENVIRONMENT=TEST, while a
 * production deployment substitutes something else, so the panel resolves to hidden there without
 * a flag to forget. The check is exact, so an unset or unsubstituted value hides it too.
 */
export const investigationSchemaDebugIsVisible = (): boolean => getApplicationEnvironment() === 'TEST';

interface InvestigationSchemaDebugPanelProps {
  /** Unique within the page - one document tab, one panel. */
  id: string;
  /** What the JSON belongs to, for the collapsed heading and the screen reader label. */
  label: string;
  /** The document data the page already holds. This panel never fetches anything of its own. */
  formData: unknown;
}

/**
 * Collapsed raw JSON for one investigation document, for checking what a schema actually produced.
 *
 * It renders only what the caller was already handed, so it can never show more than SupportManagement
 * released to this user - the schema form beside it is drawn from the same object.
 */
export function InvestigationSchemaDebugPanel({ id, label, formData }: Readonly<InvestigationSchemaDebugPanelProps>) {
  const [isOpen, setIsOpen] = useState(false);

  if (!investigationSchemaDebugIsVisible()) return null;

  const handleButtonClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setIsOpen((currentOpen) => !currentOpen);
  };

  return (
    <Disclosure
      id={id}
      variant="alt"
      // Deliberately not `schema-boundary-disclosure`: that class marks the schema's own sections,
      // and a debug panel wearing it would count as a collapsed section of the form.
      className="mt-32 min-w-0 max-w-full"
      open={isOpen}
      onToggleOpen={setIsOpen}
      data-cy="investigation-schema-debug"
    >
      <Disclosure.Header>
        <Disclosure.Title id={`${id}-title`}>
          <h3>Visa JSON-värde (endast test och utveckling)</h3>
        </Disclosure.Title>
        <Disclosure.Button aria-labelledby={`${id}-title`} onClick={handleButtonClick} />
      </Disclosure.Header>
      <Disclosure.Content>
        <pre
          className="max-w-full overflow-auto rounded-8 bg-background-100 p-16 text-small"
          data-cy="schema-form-data-preview"
          tabIndex={0}
          aria-label={`JSON-värde för ${label}`}
        >
          {JSON.stringify(formData, null, 2)}
        </pre>
      </Disclosure.Content>
    </Disclosure>
  );
}
