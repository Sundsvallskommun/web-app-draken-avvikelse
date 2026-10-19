import dayjs from 'dayjs';

const TIME_OF_DAY = /^(\d{2}:\d{2})/;
const TIME_OFFSET = /(?:z|[+-]\d{2}:?\d{2})$/i;

/**
 * Ett nativt tidsfält visar bara HH:mm eller HH:mm:ss. Ett värde i JSON Schemas `time`-format bär
 * även tidszonsoffset (`10:57:00+02:00`), och ett sådant värde avvisar fältet helt — det står tomt.
 * Klockslaget visas därför som det skrevs, utan omräkning: offseten är inlämnarens, inte händelsens.
 */
export function toTimeInputValue(value: unknown): string {
  if (typeof value !== 'string') return '';

  const [, time] = TIME_OF_DAY.exec(value) ?? [];
  return time ?? '';
}

/**
 * JSON Schemas `time`-format är RFC 3339:s full-time och kräver både sekunder och tidszonsoffset —
 * `14:30` och `14:30:00` avvisas båda av API:ts validator. Offseten är webbläsarens egen, så det
 * valda klockslaget behåller sin innebörd; `Z` hade flyttat tiden till UTC. Samma kontrakt som
 * time-widgeten i web-app-katla-sm, som skriver de ärenden Draken läser.
 *
 * Kompletteringen görs bara när schemat kräver formatet, så att fält utan format behåller exakt det
 * värde användaren valde. Ett värde som redan bär offset lämnas orört.
 */
export function toSchemaTimeValue(value: string, requiresRfc3339Time: boolean): string | undefined {
  if (value === '') return undefined;
  if (!requiresRfc3339Time) return value;

  const withSeconds = value.split(':').length === 2 ? `${value}:00` : value;
  return TIME_OFFSET.test(withSeconds) ? withSeconds : `${withSeconds}${dayjs().format('Z')}`;
}
