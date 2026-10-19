import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import { test } from 'vitest';

import { projectLabelFilterGroups } from './label-filter-projector';

const label = (classification: string, resourcePath: string, displayName: string, labels: Label[] = []): Label => ({
  classification,
  displayName,
  resourceName: resourcePath.split('/').at(-1) ?? resourcePath,
  resourcePath,
  labels,
});

const metadata = [
  label('PROVISION_ROOT', 'PROVISION', 'Lagrum', [
    label('PROVISION', 'PROVISION/HSL', 'HSL'),
    label('PROVISION', 'PROVISION/SOL', 'SoL'),
  ]),
  label('CATEGORY_ROOT', 'CATEGORY', 'Kategori', [
    label('PROVISION_CATEGORY', 'CATEGORY/HSL', 'HSL', [
      label('CATEGORY', 'CATEGORY/HSL/REHAB', 'Rehabilitering', [
        label('TYPE', 'CATEGORY/HSL/REHAB/ASSESSMENT', 'Bedömning'),
        label('TYPE', 'CATEGORY/HSL/REHAB/GENERAL', 'Gemensam etikett'),
      ]),
    ]),
    label('PROVISION-CATEGORY', 'CATEGORY/SOL_LSS', 'SoL/LSS', [
      label('CATEGORY', 'CATEGORY/SOL_LSS/PROCESS', 'Handläggning', [
        label('TYPE', 'CATEGORY/SOL_LSS/PROCESS/GENERAL', 'Gemensam etikett'),
      ]),
    ]),
  ]),
  label('REPORT_TYPE_ROOT', 'REPORT_TYPE', 'Rapporttyp', [
    label('REPORT_TYPE', 'REPORT_TYPE/DEVIATION', 'Avvikelse'),
    label('REPORT-TYPE', 'REPORT_TYPE/ABUSE', 'Missförhållande'),
  ]),
];

const definitions = [
  {
    key: 'provision',
    label: 'Lagrum',
    rootResourcePath: 'PROVISION',
    fields: [{ key: 'provision', label: 'Lagrum', classification: 'PROVISION' }],
  },
  {
    key: 'reportType',
    label: 'Rapporttyp',
    rootResourcePath: 'REPORT_TYPE',
    fields: [{ key: 'reportType', label: 'Rapporttyp', classification: 'REPORT-TYPE' }],
  },
  {
    key: 'classification',
    label: 'Klassificering',
    rootResourcePath: 'CATEGORY',
    fields: [
      { key: 'category', label: 'Avvikelsetyp', classification: 'CATEGORY' },
      { key: 'type', label: 'Underkategori', classification: 'TYPE' },
    ],
  },
];

test('projects independent IAF/VOF roots with stable selection identities', () => {
  const projected = projectLabelFilterGroups(definitions, metadata);

  assert.deepEqual(
    projected.map((group) => ({
      key: group.key,
      fields: group.fields.map((field) => ({
        key: field.key,
        paths: field.choices.map((choice) => choice.resourcePath),
      })),
    })),
    [
      {
        key: 'provision',
        fields: [{ key: 'provision', paths: ['PROVISION/HSL', 'PROVISION/SOL'] }],
      },
      {
        key: 'reportType',
        fields: [{ key: 'reportType', paths: ['REPORT_TYPE/DEVIATION', 'REPORT_TYPE/ABUSE'] }],
      },
      {
        key: 'classification',
        fields: [
          { key: 'category', paths: ['CATEGORY/HSL/REHAB', 'CATEGORY/SOL_LSS/PROCESS'] },
          {
            key: 'type',
            paths: ['CATEGORY/HSL/REHAB/ASSESSMENT', 'CATEGORY/HSL/REHAB/GENERAL', 'CATEGORY/SOL_LSS/PROCESS/GENERAL'],
          },
        ],
      },
    ]
  );

  assert.deepEqual(projected[1].fields[0].choices[0], {
    groupKey: 'reportType',
    fieldKey: 'reportType',
    resourcePath: 'REPORT_TYPE/DEVIATION',
    displayName: 'Avvikelse',
    ancestors: [],
  });
});

test('traverses hidden provision-category nodes and records the visible field ancestry', () => {
  const projected = projectLabelFilterGroups(definitions, metadata);
  const classificationGroup = projected.find(({ key }) => key === 'classification');
  assert.ok(classificationGroup);
  const typeChoices = classificationGroup.fields[1].choices;

  assert.deepEqual(typeChoices[0].ancestors, [
    {
      groupKey: 'classification',
      fieldKey: 'category',
      resourcePath: 'CATEGORY/HSL/REHAB',
    },
  ]);
  assert.equal(
    typeChoices.some(({ resourcePath }) => resourcePath.includes('PROVISION_CATEGORY')),
    false
  );
});

test('keeps duplicate display names as separate resource-path choices', () => {
  const projected = projectLabelFilterGroups(definitions, metadata);
  const generalChoices = projected[2].fields[1].choices.filter(({ displayName }) => displayName === 'Gemensam etikett');

  assert.deepEqual(
    generalChoices.map(({ groupKey, fieldKey, resourcePath }) => ({ groupKey, fieldKey, resourcePath })),
    [
      {
        groupKey: 'classification',
        fieldKey: 'type',
        resourcePath: 'CATEGORY/HSL/REHAB/GENERAL',
      },
      {
        groupKey: 'classification',
        fieldKey: 'type',
        resourcePath: 'CATEGORY/SOL_LSS/PROCESS/GENERAL',
      },
    ]
  );
});

test('fails closed when a configured root or field classification is absent', () => {
  assert.throws(
    () =>
      projectLabelFilterGroups(
        [{ key: 'missing', label: 'Saknas', rootResourcePath: 'UNKNOWN', fields: definitions[0].fields }],
        metadata
      ),
    /expected exactly one metadata root UNKNOWN, found 0/
  );

  assert.throws(
    () =>
      projectLabelFilterGroups(
        [
          {
            key: 'provision',
            label: 'Lagrum',
            rootResourcePath: 'PROVISION',
            fields: [{ key: 'category', label: 'Kategori', classification: 'CATEGORY' }],
          },
        ],
        metadata
      ),
    /found no metadata labels with classification CATEGORY/
  );
});
