import type { Label, Labels } from '@/data-contracts/supportmanagement/data-contracts';
import {
  type SupportManagementLabelFilterErrorCode,
  type SupportManagementLabelFilterErrorSource,
  type SupportManagementLabelFilterProfile,
  SupportManagementLabelFilterService,
} from '@/services/supportmanagement-label-filter.service';

const label = (classification: string, resourcePath: string, labels: readonly Label[] = [], displayName = resourcePath): Label => ({
  classification,
  displayName,
  labels: [...labels],
  resourceName: 'FILTER_VALUE',
  resourcePath,
});

const metadata = (...labelStructure: readonly Label[]): Labels => ({ labelStructure: [...labelStructure] });

const profile = (...groups: SupportManagementLabelFilterProfile['groups']): SupportManagementLabelFilterProfile => ({ groups });

const field = (key: string, classification: string) => ({ key, label: key, classification });

const group = (key: string, rootResourcePath: string, fields: SupportManagementLabelFilterProfile['groups'][number]['fields']) => ({
  key,
  label: key,
  rootResourcePath,
  fields,
});

const selection = (groupKey: string, fieldKey: string, resourcePath: string) => ({ groupKey, fieldKey, resourcePath });

const captureError = (operation: () => unknown): unknown => {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error('Expected operation to throw');
};

const expectFilterError = (
  operation: () => unknown,
  source: SupportManagementLabelFilterErrorSource,
  code: SupportManagementLabelFilterErrorCode,
): void => {
  expect(captureError(operation)).toMatchObject({ name: 'SupportManagementLabelFilterError', source, code });
};

const legacyMetadata = metadata(
  label('SALARY_ROOT', 'SALARY', [
    label('CATEGORY', 'SALARY/UNCATEGORIZED', [label('TYPE', 'SALARY/UNCATEGORIZED/VACATION'), label('TYPE', 'SALARY/UNCATEGORIZED/SICK_LEAVE')]),
  ]),
);

const iafVofMetadata = metadata(
  label('PROVISION_ROOT', 'PROVISION', [label('PROVISION', 'PROVISION/HSL'), label('PROVISION', 'PROVISION/SOL_LSS')]),
  label('REPORT_TYPE_ROOT', 'REPORT_TYPE', [label('REPORT_TYPE', 'REPORT_TYPE/DEVIATION')]),
  label('CATEGORY_ROOT', 'CATEGORY', [
    label('PROVISION_CATEGORY', 'CATEGORY/HSL', [
      label('CATEGORY', 'CATEGORY/HSL/REHAB', [
        label('TYPE', 'CATEGORY/HSL/REHAB/ASSESSMENT', [], 'Gemensamt namn'),
        label('TYPE', 'CATEGORY/HSL/REHAB/GENERAL', [], 'Gemensamt namn'),
      ]),
    ]),
    label('PROVISION-CATEGORY', 'CATEGORY/SOL_LSS', [
      label('CATEGORY', 'CATEGORY/SOL_LSS/PROCESS', [label('TYPE', 'CATEGORY/SOL_LSS/PROCESS/GENERAL', [], 'Gemensamt namn')]),
    ]),
  ]),
);

const iafVofProfile = profile(
  group('provision', 'PROVISION', [field('provision', 'PROVISION')]),
  group('reportType', 'REPORT_TYPE', [field('reportType', 'REPORT-TYPE')]),
  group('classification', 'CATEGORY', [field('category', 'CATEGORY'), field('type', 'TYPE')]),
);

describe('SupportManagementLabelFilterService', () => {
  it('preserves the legacy single-group OR filter and reduces selected ancestors to leaves', () => {
    const service = new SupportManagementLabelFilterService(
      profile(group('legacyLabels', 'SALARY', [field('category', 'CATEGORY'), field('type', 'TYPE')])),
      legacyMetadata,
    );

    expect(
      service.buildFilter([
        selection('legacyLabels', 'type', 'SALARY/UNCATEGORIZED/VACATION'),
        selection('legacyLabels', 'category', 'SALARY/UNCATEGORIZED'),
        selection('legacyLabels', 'type', 'SALARY/UNCATEGORIZED/SICK_LEAVE'),
      ]),
    ).toBe(
      "&filter=(exists(labels.metadataLabel.resourcePath:'SALARY/UNCATEGORIZED/VACATION') or exists(labels.metadataLabel.resourcePath:'SALARY/UNCATEGORIZED/SICK_LEAVE'))",
    );
  });

  it('builds IAF/VOF filters with OR inside three groups and AND between groups in profile order', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);
    const selections = [
      selection('classification', 'type', 'CATEGORY/HSL/REHAB/ASSESSMENT'),
      selection('provision', 'provision', 'PROVISION/SOL_LSS'),
      selection('classification', 'category', 'CATEGORY/SOL_LSS/PROCESS'),
      selection('reportType', 'reportType', 'REPORT_TYPE/DEVIATION'),
      selection('classification', 'category', 'CATEGORY/HSL/REHAB'),
      selection('provision', 'provision', 'PROVISION/HSL'),
    ];
    const expected =
      "&filter=(exists(labels.metadataLabel.resourcePath:'PROVISION/HSL') or exists(labels.metadataLabel.resourcePath:'PROVISION/SOL_LSS'))" +
      " and (exists(labels.metadataLabel.resourcePath:'REPORT_TYPE/DEVIATION'))" +
      " and (exists(labels.metadataLabel.resourcePath:'CATEGORY/SOL_LSS/PROCESS') or exists(labels.metadataLabel.resourcePath:'CATEGORY/HSL/REHAB/ASSESSMENT'))";

    expect(service.buildFilter(selections)).toBe(expected);
    expect(service.buildFilter([...selections].reverse())).toBe(expected);
  });

  it('selects the same leaves per group as the filter it builds, for an endpoint that matches labels by id', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);
    const selections = [
      selection('classification', 'type', 'CATEGORY/HSL/REHAB/ASSESSMENT'),
      selection('reportType', 'reportType', 'REPORT_TYPE/DEVIATION'),
      selection('classification', 'category', 'CATEGORY/HSL/REHAB'),
      selection('classification', 'category', 'CATEGORY/SOL_LSS/PROCESS'),
    ];

    expect(service.selectLeafResourcePaths(selections)).toEqual([
      ['REPORT_TYPE/DEVIATION'],
      ['CATEGORY/SOL_LSS/PROCESS', 'CATEGORY/HSL/REHAB/ASSESSMENT'],
    ]);
    expect(service.selectLeafResourcePaths([])).toEqual([]);
  });

  it('rejects an unknown group key', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expectFilterError(() => service.buildFilter([selection('unknown', 'category', 'CATEGORY/HSL/REHAB')]), 'selection', 'UNKNOWN_GROUP');
  });

  it('rejects an unknown field key', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expectFilterError(() => service.buildFilter([selection('classification', 'unknown', 'CATEGORY/HSL/REHAB')]), 'selection', 'UNKNOWN_FIELD');
  });

  it('rejects a resourcePath absent from current metadata', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expectFilterError(
      () => service.buildFilter([selection('classification', 'type', 'CATEGORY/HSL/REHAB/REMOVED')]),
      'selection',
      'UNKNOWN_RESOURCE_PATH',
    );
  });

  it('rejects hidden and foreign metadata paths instead of trusting their prefix', () => {
    const metadataWithForeignPath = metadata(...(iafVofMetadata.labelStructure ?? []), label('CATEGORY', 'CATEGORY/FOREIGN'));
    const service = new SupportManagementLabelFilterService(iafVofProfile, metadataWithForeignPath);

    expectFilterError(
      () => service.buildFilter([selection('classification', 'category', 'CATEGORY/HSL')]),
      'selection',
      'RESOURCE_PATH_NOT_SELECTABLE',
    );
    expectFilterError(
      () => service.buildFilter([selection('classification', 'category', 'CATEGORY/FOREIGN')]),
      'selection',
      'RESOURCE_PATH_NOT_SELECTABLE',
    );
  });

  it('rejects a valid path paired with the wrong profile field', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expectFilterError(
      () => service.buildFilter([selection('classification', 'category', 'CATEGORY/HSL/REHAB/GENERAL')]),
      'selection',
      'RESOURCE_PATH_FIELD_MISMATCH',
    );
  });

  it('rejects descendants from branches excluded by selected ancestors', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expectFilterError(
      () =>
        service.buildFilter([
          selection('classification', 'category', 'CATEGORY/HSL/REHAB'),
          selection('classification', 'type', 'CATEGORY/SOL_LSS/PROCESS/GENERAL'),
        ]),
      'selection',
      'INCOMPATIBLE_SELECTION',
    );
  });

  it('deduplicates repeated selection identities without changing canonical order', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);
    const hsl = selection('provision', 'provision', 'PROVISION/HSL');
    const sol = selection('provision', 'provision', 'PROVISION/SOL_LSS');

    expect(service.buildFilter([sol, hsl, sol, hsl])).toBe(
      "&filter=(exists(labels.metadataLabel.resourcePath:'PROVISION/HSL') or exists(labels.metadataLabel.resourcePath:'PROVISION/SOL_LSS'))",
    );
  });

  it.each([
    {
      name: 'group key',
      invalidProfile: profile(
        group('same', 'PROVISION', [field('provision', 'PROVISION')]),
        group('same', 'REPORT_TYPE', [field('reportType', 'REPORT_TYPE')]),
      ),
      code: 'DUPLICATE_GROUP' as const,
    },
    {
      name: 'field key',
      invalidProfile: profile(group('classification', 'CATEGORY', [field('same', 'CATEGORY'), field('same', 'TYPE')])),
      code: 'DUPLICATE_FIELD' as const,
    },
    {
      name: 'normalized classification',
      invalidProfile: profile(group('classification', 'CATEGORY', [field('first', 'PROVISION_CATEGORY'), field('second', 'PROVISION-CATEGORY')])),
      code: 'DUPLICATE_CLASSIFICATION' as const,
    },
    {
      name: 'root ownership',
      invalidProfile: profile(
        group('first', 'CATEGORY', [field('category', 'CATEGORY')]),
        group('second', 'CATEGORY/HSL', [field('category', 'CATEGORY')]),
      ),
      code: 'DUPLICATE_ROOT_OWNERSHIP' as const,
    },
  ])('rejects duplicate profile $name', ({ invalidProfile, code }) => {
    expectFilterError(() => new SupportManagementLabelFilterService(invalidProfile, iafVofMetadata), 'profile', code);
  });

  it('rejects duplicate resourcePaths in metadata', () => {
    expectFilterError(
      () =>
        new SupportManagementLabelFilterService(
          profile(group('classification', 'CATEGORY', [field('category', 'CATEGORY')])),
          metadata(label('CATEGORY_ROOT', 'CATEGORY', [label('CATEGORY', 'CATEGORY/HSL')]), label('CATEGORY', 'CATEGORY/HSL')),
        ),
      'metadata',
      'DUPLICATE_METADATA_PATH',
    );
  });

  it('keeps labels with the same displayName distinct by resourcePath', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expect(
      service.buildFilter([
        selection('classification', 'type', 'CATEGORY/SOL_LSS/PROCESS/GENERAL'),
        selection('classification', 'type', 'CATEGORY/HSL/REHAB/GENERAL'),
      ]),
    ).toBe(
      "&filter=(exists(labels.metadataLabel.resourcePath:'CATEGORY/HSL/REHAB/GENERAL') or exists(labels.metadataLabel.resourcePath:'CATEGORY/SOL_LSS/PROCESS/GENERAL'))",
    );
  });

  it.each(["CATEGORY/O'BRIEN", 'CATEGORY/BACK\\SLASH', 'CATEGORY/LINE\nBREAK'])('fails closed for an unsafe metadata path %s', unsafePath => {
    expectFilterError(
      () =>
        new SupportManagementLabelFilterService(
          profile(group('classification', 'CATEGORY', [field('category', 'CATEGORY')])),
          metadata(label('CATEGORY_ROOT', 'CATEGORY', [label('CATEGORY', unsafePath)])),
        ),
      'metadata',
      'INVALID_RESOURCE_PATH',
    );
  });

  it('returns no query fragment when nothing is selected', () => {
    const service = new SupportManagementLabelFilterService(iafVofProfile, iafVofMetadata);

    expect(service.buildFilter([])).toBe('');
  });
});
