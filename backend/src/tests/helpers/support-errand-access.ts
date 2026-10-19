interface MockFieldAccess {
  field: string;
  /** The field's own level, which every key follows when `allKeys` is set. */
  level?: string;
  allKeys: boolean;
  keys: { key: string; level: string }[];
}

/** The /access response for an unrestricted handler, independent of any AD group fixture. */
export const mockErrandAccess = () => ({
  level: 'RW',
  fields: [{ field: 'jsonParameters', level: 'RW', allKeys: true, keys: [] }] as MockFieldAccess[],
  resources: [{ resource: 'errand/json-parameter', level: 'RW' }],
});
