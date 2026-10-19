import dayjs, { type Dayjs } from 'dayjs';

import type { UnitFollowUpPeriod } from './unit-follow-up-service';

const DEFAULT_MONTHS = 12;
const CALENDAR_DAY = 'YYYY-MM-DD';

/** The follow-up opens on the last twelve months, up to and including today. */
export const defaultUnitFollowUpPeriod = (today: Dayjs = dayjs()): UnitFollowUpPeriod => ({
  from: today.subtract(DEFAULT_MONTHS, 'month').format(CALENDAR_DAY),
  to: today.format(CALENDAR_DAY),
});

/** The line under the heading saying which registrations the lists cover. */
export const describeUnitFollowUpPeriod = (period: UnitFollowUpPeriod, today: Dayjs = dayjs()): string => {
  const range = `${period.from} – ${period.to}`;
  const isDefault =
    period.from === defaultUnitFollowUpPeriod(today).from && period.to === defaultUnitFollowUpPeriod(today).to;
  return isDefault ? `Visar de senaste 12 månaderna (${range})` : `Visar perioden ${range}`;
};
