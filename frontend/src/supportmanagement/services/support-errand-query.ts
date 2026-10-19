type SupportErrandFilterValue = string | boolean | number;
export type SupportErrandFilterQuery = Readonly<Record<string, SupportErrandFilterValue>>;
export type SupportErrandSortQuery = Readonly<Record<string, 'asc' | 'desc'>>;

const appendFilter = (parameters: URLSearchParams, filter: SupportErrandFilterQuery): void => {
  Object.entries(filter).forEach(([key, value]) => parameters.append(key, String(value)));
};

export const buildSupportErrandsSearchParameters = (
  page: number,
  size: number,
  filter: SupportErrandFilterQuery,
  sort: SupportErrandSortQuery
): string => {
  const parameters = new URLSearchParams({ page: String(page), size: String(size) });
  appendFilter(parameters, filter);
  Object.entries(sort).forEach(([key, direction]) => parameters.append('sort', `${key},${direction}`));
  return parameters.toString();
};

/**
 * Asks for the count of each group of statuses under the same filter, in one request. The filter's own
 * status is left out, since each group stands in for it.
 */
export const buildSupportErrandStatusGroupCountParameters = (
  filter: SupportErrandFilterQuery,
  statusGroups: readonly (readonly string[])[]
): string => {
  const parameters = new URLSearchParams({ statusGroups: JSON.stringify(statusGroups) });
  appendFilter(parameters, Object.fromEntries(Object.entries(filter).filter(([key]) => key !== 'status')));
  return parameters.toString();
};
