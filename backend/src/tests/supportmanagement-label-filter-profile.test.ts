import { createSupportManagementLabelFilterProfile } from '@/config/supportmanagement-label-filter-profile';

describe('Support Management label-filter profiles', () => {
  it('creates separate immutable capabilities from the same application-neutral declaration', () => {
    const declaration = {
      groups: [
        {
          key: 'classification',
          label: 'Classification',
          rootResourcePath: 'CATEGORY',
          fields: [{ key: 'category', label: 'Category', classification: 'CATEGORY' }],
        },
      ],
    };
    const first = createSupportManagementLabelFilterProfile(declaration);
    const second = createSupportManagementLabelFilterProfile(declaration);

    expect(first).toEqual(declaration);
    expect(first).not.toBe(second);
    expect(first.groups).not.toBe(declaration.groups);
    expect(first.groups[0]).not.toBe(declaration.groups[0]);
    expect(first.groups[0].fields).not.toBe(declaration.groups[0].fields);
    expect(Object.isFrozen(first)).toBe(true);
    expect(first.groups.every(group => Object.isFrozen(group) && Object.isFrozen(group.fields))).toBe(true);
  });

  it('canonicalizes labels and classifications without changing declared order', () => {
    expect(
      createSupportManagementLabelFilterProfile({
        groups: [
          {
            key: ' future-group ',
            label: ' Future group ',
            rootResourcePath: ' FUTURE_ROOT ',
            fields: [
              { key: ' first ', label: ' First ', classification: ' future_category ' },
              { key: ' second ', label: ' Second ', classification: ' future_type ' },
            ],
          },
        ],
      }),
    ).toEqual({
      groups: [
        {
          key: 'future-group',
          label: 'Future group',
          rootResourcePath: 'FUTURE_ROOT',
          fields: [
            { key: 'first', label: 'First', classification: 'future_category' },
            { key: 'second', label: 'Second', classification: 'future_type' },
          ],
        },
      ],
    });
  });

  it('rejects unsafe transport keys, roots and ambiguous group definitions', () => {
    const valid = {
      groups: [
        {
          key: 'classification',
          label: 'Classification',
          rootResourcePath: 'CATEGORY',
          fields: [{ key: 'category', label: 'Category', classification: 'CATEGORY' }],
        },
      ],
    };

    expect(() => createSupportManagementLabelFilterProfile({ groups: [] })).toThrow('at least one group');
    expect(() =>
      createSupportManagementLabelFilterProfile({
        groups: [{ ...valid.groups[0], key: 'classification:crafted' }],
      }),
    ).toThrow('lowercase kebab-case identifier');
    expect(() =>
      createSupportManagementLabelFilterProfile({
        groups: [{ ...valid.groups[0], rootResourcePath: "CATEGORY/' or status:'SOLVED" }],
      }),
    ).toThrow('safe resourcePath');
    expect(() => createSupportManagementLabelFilterProfile({ groups: [valid.groups[0], valid.groups[0]] })).toThrow('duplicate group key');
    expect(() =>
      createSupportManagementLabelFilterProfile({
        groups: [
          {
            ...valid.groups[0],
            fields: [...valid.groups[0].fields, { key: 'type', label: 'Type', classification: 'category' }],
          },
        ],
      }),
    ).toThrow('duplicate classification');
  });
});
