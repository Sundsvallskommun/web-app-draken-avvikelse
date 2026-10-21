/**
 * A Support Management resource's version as the strong ETag a write on that resource is conditioned on, for example
 * `"7"`. A version that is absent or not a version stops the write before any request is sent.
 */
export const toStrongETag = (version: unknown, resource: string): string => {
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new Error(`A valid ${resource} version is required before writing`);
  }
  return `"${version}"`;
};
