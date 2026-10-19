import { AVVIKELSE_INVESTIGATION_PROFILE, createSupportInvestigationProfile } from '@/config/support-investigation-profile';
import { SupportInvestigationProfileDto } from '@/dtos/support-investigation-profile.dto';

const expectedDocuments: SupportInvestigationProfileDto['documents'][number][] = [
  { key: 'utredning-enhetschef', schemaName: 'utredning-enhetschef', tabLabel: 'Utredning enhetschef', ownerLabel: 'Enhetschef' },
  { key: 'utredning-sol-lss', schemaName: 'utredning-sol-lss', tabLabel: 'Utredning Lex Sarah', ownerLabel: 'Lex Sarah' },
  // MAS/MAR's event analysis and its comment belong to deviations, never to a reported misconduct.
  { key: 'utredning-hsl', schemaName: 'utredning-hsl', tabLabel: 'Händelseanalys HSL', ownerLabel: 'MAS/MAR', appliesTo: 'deviation' },
  // The commissioner's comment on the event analysis: beside it under Utredning, and the head of operations'.
  { key: 'vc-kommentar-hsl', schemaName: 'vc-kommentar-hsl', tabLabel: 'VC kommentar HSL', ownerLabel: 'Verksamhetschef', appliesTo: 'deviation' },
  {
    key: 'bedomning-sol-lss',
    schemaName: 'bedomning-sol-lss',
    tabLabel: 'Lex Sarah-ansvarigs initiala bedömning',
    ownerLabel: 'LEX-ansvarig',
    placement: 'details',
  },
  {
    key: 'beslut-hsl',
    schemaName: 'beslut-hsl',
    tabLabel: 'Beslut HSL',
    ownerLabel: 'MAS/MAR',
    placement: 'decision',
    appliesTo: 'hsl-deviation',
  },
  {
    key: 'beslut-sol-lss',
    schemaName: 'beslut-sol-lss',
    tabLabel: 'Beslut SoL/LSS',
    ownerLabel: 'LEX-ansvarig',
    placement: 'decision',
    appliesTo: 'reported-misconduct',
    prerequisiteDocumentKey: 'utredning-sol-lss',
  },
];

const expectDeepFrozen = (value: unknown): void => {
  if (typeof value !== 'object' || value === null) return;
  expect(Object.isFrozen(value)).toBe(true);
  Object.values(value).forEach(expectDeepFrozen);
};

describe('support investigation profiles', () => {
  it('builds one immutable avvikelse document profile, without classification policy data, for IAF and VOF alike', () => {
    expect(AVVIKELSE_INVESTIGATION_PROFILE).toMatchObject({
      requiredSupportManagementApiTarget: 'sprint',
      documents: expectedDocuments,
      reportDocument: {
        key: 'avvikelse-plats-handelse',
        schemaName: 'avvikelse-plats-handelse',
        editableChannel: 'WEB_UI',
        lockedFromPhase: 'INVESTIGATION',
      },
      // MAS/MAR's own errands under Mina ärenden include those they are recorded on.
      handlerParameters: [{ key: 'masMarHandler', roleKey: 'mas-mar' }],
      // The errand's assignee alone follows it, rather than whoever Support Management subscribes.
      assigneeFollowsErrand: true,
      labelFilter: {
        groups: [
          { key: 'provision', rootResourcePath: 'PROVISION' },
          { key: 'report-type', rootResourcePath: 'REPORT_TYPE' },
          { key: 'classification', rootResourcePath: 'CATEGORY' },
          // MAS/MAR-ärenden in the overview: the errands with a high HSL risk.
          { key: 'risk', rootResourcePath: 'RISK' },
        ],
      },
    });
    expect('classificationPolicy' in AVVIKELSE_INVESTIGATION_PROFILE).toBe(false);
    // The deployment's application name is identity toward other systems only, never part of the profile.
    expect('application' in AVVIKELSE_INVESTIGATION_PROFILE).toBe(false);
    expectDeepFrozen(AVVIKELSE_INVESTIGATION_PROFILE);
  });

  it('holds a handler parameter key to a plain identifier, since it is written into the errand filter', () => {
    const profile = (key: string) => () => createSupportInvestigationProfile({ documents: [], handlerParameters: [{ key, roleKey: 'mas-mar' }] });
    expect(profile('masMarHandler')().handlerParameters).toEqual([{ key: 'masMarHandler', roleKey: 'mas-mar' }]);
    expect(profile("x' or 1=1")).toThrow(/handlerParameters\[0\]\.key/u);
    expect(createSupportInvestigationProfile({ documents: [] })).not.toHaveProperty('handlerParameters');
  });

  it('canonicalizes advertised fields before they become document allowlist values', () => {
    expect(
      createSupportInvestigationProfile({
        documents: [{ key: ' document-key ', schemaName: ' schema-name ', tabLabel: ' Tab ', ownerLabel: ' Owner ' }],
      }),
    ).toEqual({
      documents: [{ key: 'document-key', schemaName: 'schema-name', tabLabel: 'Tab', ownerLabel: 'Owner' }],
    });
  });

  it('preserves an application-defined number and order of documents', () => {
    const documents = Array.from({ length: 5 }, (_, index) => ({
      key: `document-${index + 1}`,
      schemaName: `schema-${index + 1}`,
      tabLabel: `Document ${index + 1}`,
      ownerLabel: `Owner ${index + 1}`,
    }));
    expect(createSupportInvestigationProfile({ documents }).documents).toEqual(documents);
  });

  it('deeply clones transport and label-filter data without introducing application behavior', () => {
    const documents = [{ key: 'future-document', schemaName: 'shared-schema', tabLabel: 'Future', ownerLabel: 'Owner' }];
    const labelFilter = {
      groups: [
        {
          key: 'future-filter',
          label: 'Future filter',
          rootResourcePath: 'FUTURE',
          fields: [{ key: 'future-field', label: 'Future field', classification: 'FUTURE' }],
        },
      ],
    };
    const profile = createSupportInvestigationProfile({
      requiredSupportManagementApiTarget: 'stable',
      documents,
      labelFilter,
    });

    expect(profile.requiredSupportManagementApiTarget).toBe('stable');
    expect(profile.labelFilter).toEqual(labelFilter);
    expect(profile.documents).not.toBe(documents);
    expect(profile.labelFilter).not.toBe(labelFilter);
    expectDeepFrozen(profile);
  });

  it('rejects an unsupported runtime transport requirement', () => {
    expect(() => createSupportInvestigationProfile({ documents: [], requiredSupportManagementApiTarget: 'future' as 'sprint' })).toThrow(
      'requires unsupported Support Management API target future',
    );
  });

  it('rejects empty or unsafe document fields and duplicate keys', () => {
    const validDocument = expectedDocuments[0];
    const profile = (documents: SupportInvestigationProfileDto['documents']): SupportInvestigationProfileDto => ({ documents });

    expect(() => createSupportInvestigationProfile(profile([{ ...validDocument, tabLabel: ' ' }]))).toThrow(
      'documents[0].tabLabel must not be empty',
    );
    expect(() => createSupportInvestigationProfile(profile([validDocument, { ...validDocument, key: ` ${validDocument.key} ` }]))).toThrow(
      'duplicate document key utredning-enhetschef',
    );
    expect(() => createSupportInvestigationProfile(profile([{ ...validDocument, key: '../unsafe' }]))).toThrow(
      'documents[0].key must be a lowercase kebab-case identifier',
    );
  });

  it('carries placement and applicability only when configured, and rejects unknown values', () => {
    const decision = { key: 'decision', schemaName: 'decision', tabLabel: 'Beslut', ownerLabel: 'Owner' };
    const documents = createSupportInvestigationProfile({
      documents: [decision, { ...decision, key: 'restricted-decision', placement: 'decision', appliesTo: 'reported-misconduct' }],
    }).documents;

    expect(Object.keys(documents[0])).toEqual(['key', 'schemaName', 'tabLabel', 'ownerLabel']);
    expect(documents[1]).toEqual({ ...decision, key: 'restricted-decision', placement: 'decision', appliesTo: 'reported-misconduct' });
    expect(() => createSupportInvestigationProfile({ documents: [{ ...decision, placement: 'sidebar' as 'decision' }] })).toThrow(
      'documents[0].placement must be one of investigation, decision',
    );
    expect(() => createSupportInvestigationProfile({ documents: [{ ...decision, appliesTo: 'sol' as 'all' }] })).toThrow(
      'documents[0].appliesTo must be one of all, reported-misconduct, hsl-deviation',
    );
  });

  it('carries a prerequisite only when it names another document of the profile', () => {
    const investigation = { key: 'investigation', schemaName: 'investigation', tabLabel: 'Utredning', ownerLabel: 'Owner' };
    const decision = { key: 'decision', schemaName: 'decision', tabLabel: 'Beslut', ownerLabel: 'Owner', prerequisiteDocumentKey: 'investigation' };

    expect(createSupportInvestigationProfile({ documents: [investigation, decision] }).documents[1]).toEqual(decision);
    expect(() => createSupportInvestigationProfile({ documents: [decision] })).toThrow(
      'documents[0].prerequisiteDocumentKey must name another document in the profile',
    );
    expect(() => createSupportInvestigationProfile({ documents: [{ ...decision, prerequisiteDocumentKey: 'decision' }] })).toThrow(
      'documents[0].prerequisiteDocumentKey must name another document in the profile',
    );
    expect(() => createSupportInvestigationProfile({ documents: [investigation, { ...decision, prerequisiteDocumentKey: '../x' }] })).toThrow(
      'documents[1].prerequisiteDocumentKey must be a lowercase kebab-case identifier',
    );
  });

  it('carries a report only when configured, under a key of its own', () => {
    const investigation = { key: 'investigation', schemaName: 'investigation', tabLabel: 'Utredning', ownerLabel: 'Owner' };
    const reportDocument = { key: 'report', schemaName: 'report', editableChannel: 'WEB_UI', lockedFromPhase: 'INVESTIGATION' };

    expect(createSupportInvestigationProfile({ documents: [investigation] })).not.toHaveProperty('reportDocument');
    expect(createSupportInvestigationProfile({ documents: [investigation], reportDocument }).reportDocument).toEqual(reportDocument);
    expect(() =>
      createSupportInvestigationProfile({
        documents: [investigation],
        reportDocument: { ...reportDocument, key: 'investigation' },
      }),
    ).toThrow('reportDocument.key investigation is already an investigation document');
    expect(() =>
      createSupportInvestigationProfile({
        documents: [investigation],
        reportDocument: { ...reportDocument, schemaName: '../x' },
      }),
    ).toThrow('reportDocument.schemaName must be a lowercase kebab-case identifier');
    expect(() =>
      createSupportInvestigationProfile({
        documents: [investigation],
        reportDocument: { ...reportDocument, lockedFromPhase: ' ' },
      }),
    ).toThrow('reportDocument.lockedFromPhase must not be empty');
  });

  it('allows several document keys to reuse the same schema template', () => {
    const sharedSchemaDocuments = [expectedDocuments[0], { ...expectedDocuments[1], schemaName: expectedDocuments[0].schemaName }];
    expect(createSupportInvestigationProfile({ documents: sharedSchemaDocuments }).documents).toEqual(sharedSchemaDocuments);
  });
});
