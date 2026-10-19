import type { Measure } from '@common/data-contracts/supportmanagement/data-contracts';

/** Only the user who registered a measure may edit it. The BFF applies the same rule on write. */
export const isOwnMeasure = (measure: Pick<Measure, 'addedByUser'>, username: string | undefined): boolean => {
  const owner = measure.addedByUser?.trim().toLowerCase();
  const current = username?.trim().toLowerCase();
  return Boolean(owner && current && owner === current);
};
