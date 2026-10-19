import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  findLabelByClassification,
  projectLabelCategory,
  projectMappedLabelSubType,
} from './support-label-classification-projector';

const futureLabelTree = {
  root: { resource: 'INCIDENTS', classification: 'INCIDENT_ROOT' },
  ownerClassification: 'ACT_BRANCH',
  categoryClassification: 'INCIDENT_CLASS',
  typeClassification: 'INCIDENT_DETAIL',
};

const category = {
  id: 'future-category',
  classification: 'INCIDENT_CLASS',
  resourceName: 'SAFETY',
  resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY',
  displayName: 'Safety incident',
};
const type = {
  id: 'future-type',
  classification: 'INCIDENT_DETAIL',
  resourceName: 'FALL',
  resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY/FALL',
  displayName: 'Fall',
};

test('projects an explicit label-tree vocabulary independently of application selection', () => {
  const errand = {
    classification: { category: 'INCIDENTS/FUTURE_ACT', type: category.resourcePath },
    labels: [type],
  };
  const metadata = {
    labels: {
      labelStructure: [
        {
          classification: 'INCIDENT_ROOT',
          resourceName: 'INCIDENTS',
          resourcePath: 'INCIDENTS',
          labels: [
            {
              classification: 'ACT_BRANCH',
              resourceName: 'FUTURE_ACT',
              resourcePath: 'INCIDENTS/FUTURE_ACT',
              labels: [category],
            },
          ],
        },
      ],
    },
  };

  assert.equal(projectLabelCategory(errand, metadata, futureLabelTree)?.id, 'future-category');
  assert.equal(projectMappedLabelSubType(errand, futureLabelTree)?.id, 'future-type');
});

// SupportManagement returns label classifications lowercase-hyphenated ('report-type'), while the
// profiles, the e2e fixtures and every call site spell them SCREAMING_SNAKE. Only
// normalizeClassification bridges the two, so a lookup that stopped normalizing would silently
// find nothing - and an unclassified errand renders the same as an unmatched one.
test('matches a classification across the casing the API actually returns', () => {
  const reportType = {
    id: '5798ce38-e19e-448e-a78c-87163ec67530',
    classification: 'report-type',
    resourceName: 'ABUSE',
    resourcePath: 'REPORT_TYPE/ABUSE',
    displayName: 'Missförhållande',
  };

  assert.equal(findLabelByClassification([reportType], 'REPORT_TYPE'), reportType);
  assert.equal(findLabelByClassification([reportType], 'report-type'), reportType);
  assert.equal(findLabelByClassification([reportType], 'TYPE'), undefined);
});
