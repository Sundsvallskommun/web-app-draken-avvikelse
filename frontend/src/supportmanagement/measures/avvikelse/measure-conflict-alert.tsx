import { Alert } from '@sk-web-gui/react';

/** Why a measure dialog stopped, when somebody else changed the measure first. */
export const MEASURE_CONFLICT_DESCRIPTION =
  'Någon annan har ändrat åtgärden sedan du öppnade den, och din ändring skulle skriva över deras. Kopiera det du vill behålla, stäng och gör om ändringen på åtgärden som den ser ut nu.';

/**
 * Said in a measure dialog whose write was refused because somebody else changed the measure first. Nothing was saved
 * and nothing will be: what the user wrote stays in the dialog, locked, for them to copy before they close it.
 */
export function MeasureConflictAlert({
  title,
  description = MEASURE_CONFLICT_DESCRIPTION,
}: {
  /** What was not saved, for example "Slutdatumet sparades inte". */
  title: string;
  description?: string;
}) {
  return (
    <div role="alert" data-cy="measure-conflict">
      <Alert type="warning">
        <Alert.Icon />
        <Alert.Content>
          <Alert.Content.Title>{title}</Alert.Content.Title>
          <Alert.Content.Description>{description}</Alert.Content.Description>
        </Alert.Content>
      </Alert>
    </div>
  );
}
