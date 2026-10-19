import assert from 'node:assert/strict';

import type { Label } from '@common/data-contracts/supportmanagement/data-contracts';
import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import { concealedAvvikelseDocumentKeys, concealsHslInvestigation } from './hsl-investigation-visibility';

const profile = {
  documents: [
    { key: 'manager-document', schemaName: 'utredning-enhetschef' },
    { key: 'hsl-document', schemaName: 'utredning-hsl' },
  ],
} as unknown as InvestigationProfile;

const highHslRisk = { id: 'high-hsl', resourcePath: 'RISK/HIGH_HSL' } as Label;
const errand = (labels: Label[]) => ({ labels } as unknown as SupportErrand);

test('a unit manager or head of operations is not shown the HSL investigation until the risk is high', () => {
  assert.equal(concealsHslInvestigation({ roleKeys: ['enhetschef'] }, false), true);
  assert.equal(concealsHslInvestigation({ roleKeys: ['verksamhetschef'] }, false), true);
  assert.equal(concealsHslInvestigation({ roleKeys: ['enhetschef'] }, true), false);
  assert.equal(concealsHslInvestigation({ roleKeys: ['verksamhetschef'] }, true), false);
});

test('MAS/MAR, an administrator and every other role are shown the HSL investigation as their access says', () => {
  assert.equal(concealsHslInvestigation({ roleKeys: ['mas-mar'] }, false), false);
  assert.equal(concealsHslInvestigation({ roleKeys: ['enhetschef', 'mas-mar'] }, false), false);
  assert.equal(concealsHslInvestigation({ roleKeys: ['enhetschef'], superadmin: true }, false), false);
  assert.equal(concealsHslInvestigation({ roleKeys: ['lex-ansvarig'] }, false), false);
  // A deployment that configured no roles names none, and so conceals nothing.
  assert.equal(concealsHslInvestigation({}, false), false);
});

test('conceals the HSL investigation by its key in the profile, and only while the errand lacks the label', () => {
  const unitManager = { roleKeys: ['enhetschef'] };
  assert.deepEqual(
    concealedAvvikelseDocumentKeys({ errand: errand([]), profile, labelStructure: [], viewer: unitManager }),
    ['hsl-document']
  );
  assert.deepEqual(
    concealedAvvikelseDocumentKeys({ errand: errand([highHslRisk]), profile, labelStructure: [], viewer: unitManager }),
    []
  );
  // A profile without the HSL investigation has nothing to conceal.
  assert.deepEqual(
    concealedAvvikelseDocumentKeys({
      errand: errand([]),
      profile: { documents: [] } as unknown as InvestigationProfile,
      labelStructure: [],
      viewer: unitManager,
    }),
    []
  );
});

// Ä4. VC kommentar HSL opens when MAS/MAR asks the head of operations for their comment, and not before - for
// everybody, MAS/MAR and the head of operations alike. The high HSL risk alone does not open it.
test('keeps VC kommentar HSL out of sight until MAS/MAR has asked for the comment', () => {
  const vcCommentRequested = { id: 'vc-comment', resourcePath: 'ANALYSIS/VC_COMMENT_HSL' } as Label;
  const withComment = {
    documents: [...profile.documents, { key: 'comment-document', schemaName: 'vc-kommentar-hsl' }],
  } as unknown as InvestigationProfile;
  const concealed = (labels: Label[], roleKeys: string[]) =>
    concealedAvvikelseDocumentKeys({
      errand: errand(labels),
      profile: withComment,
      labelStructure: [],
      viewer: { roleKeys },
    });

  assert.deepEqual(concealed([], ['verksamhetschef']), ['hsl-document', 'comment-document']);
  assert.deepEqual(concealed([highHslRisk], ['verksamhetschef']), ['comment-document']);
  assert.deepEqual(concealed([highHslRisk], ['mas-mar']), ['comment-document']);
  assert.deepEqual(concealed([highHslRisk, vcCommentRequested], ['verksamhetschef']), []);
  assert.deepEqual(concealed([highHslRisk, vcCommentRequested], ['mas-mar']), []);
});
