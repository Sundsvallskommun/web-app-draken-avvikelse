import type { SupportManagementLabelFilterProfileDto } from '@/dtos/support-investigation-profile.dto';

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const RESOURCE_PATH_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u;

const requireText = (value: string, path: string): string => {
  const canonical = value.trim();
  if (!canonical) throw new Error(`Support Management label-filter profile field ${path} must not be empty`);
  return canonical;
};

const requireIdentifier = (value: string, path: string): string => {
  const canonical = requireText(value, path);
  if (!IDENTIFIER_PATTERN.test(canonical)) {
    throw new Error(`Support Management label-filter profile field ${path} must be a lowercase kebab-case identifier`);
  }
  return canonical;
};

const requireResourcePath = (value: string, path: string): string => {
  const canonical = requireText(value, path);
  if (!RESOURCE_PATH_PATTERN.test(canonical)) {
    throw new Error(`Support Management label-filter profile field ${path} must be a safe resourcePath`);
  }
  return canonical;
};

const normalizeClassification = (value: string): string => value.replaceAll('_', '-').toUpperCase();

/**
 * Canonicalizes the declarative filter capability before it is advertised to
 * clients. Metadata-dependent hierarchy validation remains in
 * SupportManagementLabelFilterService at request time.
 */
export const createSupportManagementLabelFilterProfile = (
  profile: SupportManagementLabelFilterProfileDto,
): SupportManagementLabelFilterProfileDto => {
  if (profile.groups.length === 0) throw new Error('Support Management label-filter profile must contain at least one group');

  const groupKeys = new Set<string>();
  const rootResourcePaths = new Set<string>();
  const groups = profile.groups.map((group, groupIndex) => {
    const key = requireIdentifier(group.key, `groups[${groupIndex}].key`);
    const label = requireText(group.label, `groups[${groupIndex}].label`);
    const rootResourcePath = requireResourcePath(group.rootResourcePath, `groups[${groupIndex}].rootResourcePath`);
    if (groupKeys.has(key)) throw new Error(`Support Management label-filter profile contains duplicate group key ${key}`);
    if (rootResourcePaths.has(rootResourcePath)) {
      throw new Error(`Support Management label-filter profile contains duplicate root resourcePath ${rootResourcePath}`);
    }
    if (group.fields.length === 0) {
      throw new Error(`Support Management label-filter profile group ${key} must contain at least one field`);
    }

    groupKeys.add(key);
    rootResourcePaths.add(rootResourcePath);
    const fieldKeys = new Set<string>();
    const classifications = new Set<string>();
    const fields = group.fields.map((field, fieldIndex) => {
      const fieldKey = requireIdentifier(field.key, `groups[${groupIndex}].fields[${fieldIndex}].key`);
      const fieldLabel = requireText(field.label, `groups[${groupIndex}].fields[${fieldIndex}].label`);
      const classification = requireText(field.classification, `groups[${groupIndex}].fields[${fieldIndex}].classification`);
      const normalizedClassification = normalizeClassification(classification);
      if (fieldKeys.has(fieldKey)) throw new Error(`Support Management label-filter group ${key} contains duplicate field key ${fieldKey}`);
      if (classifications.has(normalizedClassification)) {
        throw new Error(`Support Management label-filter group ${key} contains duplicate classification ${classification}`);
      }
      fieldKeys.add(fieldKey);
      classifications.add(normalizedClassification);
      return Object.freeze({ key: fieldKey, label: fieldLabel, classification });
    });

    return Object.freeze({ key, label, rootResourcePath, fields: Object.freeze(fields) });
  });

  return Object.freeze({ groups: Object.freeze(groups) });
};
