import assert from 'node:assert/strict';

import { test } from 'vitest';

import { parseInvestigationProfile } from './investigation-profile';

const validProfile = () => ({
  state: 'active',
  registration: { mode: 'disabled' },
  documents: [
    {
      key: 'manager-document',
      schemaName: 'utredning-enhetschef',
      tabLabel: 'Utredning enhetschef',
      ownerLabel: 'Enhetschef',
    },
    {
      key: 'misconduct-document',
      schemaName: 'utredning-sol-lss',
      tabLabel: 'Utredning Lex Sarah',
      ownerLabel: 'Lex Sarah',
    },
  ],
});

test('parses, normalizes and freezes a valid document profile', () => {
  const profile = parseInvestigationProfile(validProfile());

  assert.equal(profile.documents[0].schemaName, 'utredning-enhetschef');
  assert.ok(Object.isFrozen(profile));
  assert.ok(Object.isFrozen(profile.documents));
  assert.deepEqual(Object.keys(profile.documents[0]).sort(), [
    'appliesTo',
    'key',
    'ownerLabel',
    'placement',
    'schemaName',
    'tabLabel',
  ]);
  assert.deepEqual(Object.keys(profile).sort(), ['documents', 'registration', 'state']);
});

test('accepts a valid inactive empty document profile', () => {
  assert.deepEqual(parseInvestigationProfile({ state: 'inactive', registration: { mode: 'enabled' }, documents: [] }), {
    state: 'inactive',
    registration: { mode: 'enabled' },
    documents: [],
  });
});

// A BFF that predates placement and applicability sends neither; every document then stays on the
// investigation tab and on every errand, which is exactly what those deployments had.
test('defaults placement and applicability to the investigation tab on every errand', () => {
  const profile = parseInvestigationProfile(validProfile());

  assert.equal(profile.documents[0].placement, 'investigation');
  assert.equal(profile.documents[0].appliesTo, 'all');
});

test('reads a decision document restricted to reported misconduct', () => {
  const withDecision = validProfile();
  withDecision.documents.push({
    key: 'decision-document',
    schemaName: 'beslut-missforhallande',
    tabLabel: 'Beslut',
    ownerLabel: 'Beslutsfattare',
    placement: 'decision',
    appliesTo: 'reported-misconduct',
  } as (typeof withDecision.documents)[number]);

  const profile = parseInvestigationProfile(withDecision);

  assert.equal(profile.documents[2].placement, 'decision');
  assert.equal(profile.documents[2].appliesTo, 'reported-misconduct');
});

test('reads a document restricted to deviations', () => {
  const withAnalysis = validProfile();
  withAnalysis.documents.push({
    key: 'utredning-hsl',
    schemaName: 'utredning-hsl',
    tabLabel: 'Händelseanalys HSL',
    ownerLabel: 'MAS/MAR',
    placement: 'investigation',
    appliesTo: 'deviation',
  } as (typeof withAnalysis.documents)[number]);

  assert.equal(parseInvestigationProfile(withAnalysis).documents[2].appliesTo, 'deviation');
});

test('reads a prerequisite only when it names another document of the profile', () => {
  const withPrerequisite = validProfile();
  withPrerequisite.documents.push({
    key: 'decision-document',
    schemaName: 'beslut-sol-lss',
    tabLabel: 'Beslut',
    ownerLabel: 'LEX-ansvarig',
    placement: 'decision',
    appliesTo: 'reported-misconduct',
    prerequisiteDocumentKey: withPrerequisite.documents[0].key,
  } as (typeof withPrerequisite.documents)[number]);
  assert.equal(
    parseInvestigationProfile(withPrerequisite).documents[2].prerequisiteDocumentKey,
    withPrerequisite.documents[0].key
  );
  assert.equal(parseInvestigationProfile(withPrerequisite).documents[0].prerequisiteDocumentKey, undefined);

  for (const prerequisiteDocumentKey of ['decision-document', 'missing-document', '../unsafe']) {
    const invalid = validProfile();
    invalid.documents.push({
      ...withPrerequisite.documents[2],
      prerequisiteDocumentKey,
    } as (typeof invalid.documents)[number]);
    assert.throws(() => parseInvestigationProfile(invalid), /prerequisiteDocumentKey/u);
  }
});

test('rejects unknown placements and applicabilities rather than guessing', () => {
  const unknownPlacement = validProfile();
  Object.assign(unknownPlacement.documents[0], { placement: 'sidebar' });
  assert.throws(() => parseInvestigationProfile(unknownPlacement), /documents\[0\]\.placement är ogiltig/u);

  const unknownApplicability = validProfile();
  Object.assign(unknownApplicability.documents[0], { appliesTo: 'hsl' });
  assert.throws(() => parseInvestigationProfile(unknownApplicability), /documents\[0\]\.appliesTo är ogiltig/u);
});

test('rejects duplicate document keys but permits a shared schema template', () => {
  const duplicateKey = validProfile();
  duplicateKey.documents[1].key = duplicateKey.documents[0].key;
  assert.throws(() => parseInvestigationProfile(duplicateKey), /duplicerade document keys/u);

  const sharedSchemaName = validProfile();
  sharedSchemaName.documents[1].schemaName = sharedSchemaName.documents[0].schemaName;
  assert.equal(parseInvestigationProfile(sharedSchemaName).documents[1].schemaName, 'utredning-enhetschef');
});

test('drops classification policy extension data from the generic profile', () => {
  const profile = parseInvestigationProfile({
    ...validProfile(),
    classificationPolicy: {
      strategy: 'reported-misconduct',
      defaultOwnerDocumentKey: 'manager-document',
      reportedMisconductOwnerDocumentKey: 'misconduct-document',
    },
  });

  assert.equal('classificationPolicy' in profile, false);
});

test('parses and deeply freezes a declarative label filter', () => {
  const profile = parseInvestigationProfile({
    ...validProfile(),
    labelFilter: {
      groups: [
        {
          key: 'classification',
          label: 'Klassificering',
          rootResourcePath: 'CATEGORY',
          fields: [
            { key: 'category', label: 'Avvikelsetyp', classification: 'CATEGORY' },
            { key: 'type', label: 'Underkategori', classification: 'TYPE' },
          ],
        },
      ],
    },
  });

  assert.equal(profile.labelFilter?.groups[0].key, 'classification');
  assert.ok(Object.isFrozen(profile.labelFilter));
  assert.ok(Object.isFrozen(profile.labelFilter?.groups[0].fields));
});

test('rejects ambiguous or unsafe label-filter definitions', () => {
  const profile = validProfile();
  Object.assign(profile, {
    labelFilter: {
      groups: [
        {
          key: 'first',
          label: 'First',
          rootResourcePath: 'CATEGORY',
          fields: [{ key: 'category', label: 'Category', classification: 'CATEGORY' }],
        },
        {
          key: 'second',
          label: 'Second',
          rootResourcePath: 'CATEGORY',
          fields: [{ key: 'type', label: 'Type', classification: 'TYPE' }],
        },
      ],
    },
  });
  assert.throws(() => parseInvestigationProfile(profile), /duplicerade grupper eller rötter/u);
});

test('rejects malformed documents, states and registration capabilities', () => {
  const missingLabel = validProfile();
  missingLabel.documents[0].tabLabel = '   ';
  assert.throws(() => parseInvestigationProfile(missingLabel), /documents\[0\]\.tabLabel/u);

  const unsafeKey = validProfile();
  unsafeKey.documents[0].key = '../manager-document';
  assert.throws(() => parseInvestigationProfile(unsafeKey), /lowercase kebab-case-id/u);

  const unknownState = validProfile();
  unknownState.state = 'enabled';
  assert.throws(() => parseInvestigationProfile(unknownState), /state är ogiltig/u);

  const unknownRegistration = validProfile();
  unknownRegistration.registration.mode = 'automatic';
  assert.throws(() => parseInvestigationProfile(unknownRegistration), /registration är ogiltig/u);
});

test('does not carry global profile grants into an errand', () => {
  const source = validProfile();
  const profile = parseInvestigationProfile({
    ...source,
    documents: source.documents.map((document) => ({ ...document, access: 'edit' })),
  });
  assert.equal('access' in profile.documents[0], false);
});

test('reads the report an errand arrives with, and leaves it out when the profile has none', () => {
  const reportDocument = {
    key: 'avvikelse-plats-handelse',
    schemaName: 'avvikelse-plats-handelse',
    editableChannel: 'WEB_UI',
    lockedFromPhase: 'INVESTIGATION',
  };

  assert.deepEqual(parseInvestigationProfile({ ...validProfile(), reportDocument }).reportDocument, reportDocument);
  assert.equal('reportDocument' in parseInvestigationProfile(validProfile()), false);
  assert.throws(
    () =>
      parseInvestigationProfile({ ...validProfile(), reportDocument: { ...reportDocument, key: 'manager-document' } }),
    /reportDocument\.key är redan ett utredningsdokument/u
  );
  assert.throws(
    () => parseInvestigationProfile({ ...validProfile(), reportDocument: { ...reportDocument, lockedFromPhase: '' } }),
    /reportDocument\.lockedFromPhase/u
  );
});
