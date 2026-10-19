export function formatInvestigationLabTimestamp(savedAt: string): string {
  const timestamp = new Date(savedAt);
  if (Number.isNaN(timestamp.getTime())) return 'okänd tidpunkt';

  return new Intl.DateTimeFormat('sv-SE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp);
}
