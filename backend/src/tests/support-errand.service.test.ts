import { Label, Phase } from '@/data-contracts/supportmanagement/data-contracts';
import {
  buildErrandFilter,
  buildSupportErrandClassificationUpdateBody,
  NEW_ERRAND_DEFAULTS,
  resolveClosingPhaseId,
  resolveClosingPhaseSteps,
  resolveSupportErrandClassification,
  resolveSupportErrandPhaseTransition,
  resolveSupportErrandStatusTransition,
  sanitizeQuery,
  stripErrandVersions,
  stripParameterVersions,
  SupportErrandClassificationSelection,
} from '@/services/support-errand.service';

import {
  mockAdUsername,
  mockFirstName,
  mockOrganizationPartyId,
  mockPhoneNumberCountryCode,
  mockPropertyDesignation,
  mockStreet,
  mockSupportErrandId,
} from './helpers/mock-data';

/**
 * A CATEGORY tree shaped like the SupportManagement metadata: one CATEGORY root, an owning
 * PROVISION_CATEGORY, one CATEGORY under it and two TYPE leaves, plus an unrelated REPORT_TYPE root
 * that must never be treated as part of the classification.
 */
const classificationLabelStructure: Label[] = [
  {
    id: 'category-root-id',
    classification: 'CATEGORY_ROOT',
    resourceName: 'CATEGORY',
    resourcePath: 'CATEGORY',
    labels: [
      {
        id: 'category-owner-id',
        classification: 'PROVISION_CATEGORY',
        resourceName: 'HSL',
        resourcePath: 'CATEGORY/HSL',
        labels: [
          {
            id: 'category-label-id',
            classification: 'CATEGORY',
            resourceName: 'REHAB',
            resourcePath: 'CATEGORY/HSL/REHAB',
            labels: [
              {
                id: 'type-label-id',
                classification: 'TYPE',
                resourceName: 'MISSED',
                resourcePath: 'CATEGORY/HSL/REHAB/MISSED',
              },
              {
                id: 'other-type-label-id',
                classification: 'TYPE',
                resourceName: 'OTHER',
                resourcePath: 'CATEGORY/HSL/REHAB/OTHER',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'report-type-id',
    classification: 'REPORT_TYPE_ROOT',
    resourceName: 'REPORT_TYPE',
    resourcePath: 'REPORT_TYPE',
    labels: [
      {
        id: 'deviation-id',
        classification: 'REPORT_TYPE',
        resourceName: 'DEVIATION',
        resourcePath: 'REPORT_TYPE/DEVIATION',
      },
    ],
  },
];

const classificationLabelTree = {
  root: { resource: 'CATEGORY', classification: 'CATEGORY_ROOT' },
  ownerClassification: 'PROVISION_CATEGORY',
  categoryClassification: 'CATEGORY',
  typeClassification: 'TYPE',
};

describe('support-errand.service', () => {
  describe('sanitizeQuery', () => {
    it('returns an empty string for undefined', () => {
      expect(sanitizeQuery(undefined)).toBe('');
    });

    it("strips characters that would break out of the filter's quoted literal", () => {
      // The result is interpolated into `description~'*<query>*'`, so quotes, stars,
      // tildes, parens and percent signs must not survive.
      expect(sanitizeQuery("' or 1:'1")).toBe('or 1:1');
      expect(sanitizeQuery('a*b(c)d%e~f')).toBe('abcdef');
    });

    it('keeps Swedish letters, digits and the allowed punctuation', () => {
      expect(sanitizeQuery('Åsa Öberg-Ekström, 851 85: nr_1.2')).toBe('Åsa Öberg-Ekström, 851 85: nr_1.2');
    });

    it('normalizes full-width input to NFKC', () => {
      expect(sanitizeQuery('Ａｎｎａ')).toBe('Anna');
    });

    it('collapses runs of whitespace and trims', () => {
      expect(sanitizeQuery('  Anna   Andersson \n ')).toBe('Anna Andersson');
    });

    it('is stable across repeated calls despite the shared /g regex', () => {
      // SAFE_CHARS_REGEX is module-level and g-flagged; String.replace resets lastIndex,
      // but pin the behaviour so a future switch to .test()/.exec() cannot regress it.
      expect(sanitizeQuery('a*b')).toBe('ab');
      expect(sanitizeQuery('a*b')).toBe('ab');
    });
  });

  describe('buildErrandFilter', () => {
    it('returns an empty string when nothing is filtered on', () => {
      expect(buildErrandFilter({})).toBe('');
    });

    it('expands a free-text query into the full disjunction', () => {
      const q = mockFirstName;
      expect(buildErrandFilter({ query: q })).toBe(
        `&filter=(description~'*${q}*'` +
          ` or title~'*${q}*'` +
          ` or errandNumber~'*${q}*'` +
          ` or exists(stakeholders.firstName~'*${q}*')` +
          ` or exists(stakeholders.lastName~'*${q}*')` +
          ` or exists(stakeholders.address~'*${q}*')` +
          ` or exists(stakeholders.zipCode~'*${q}*')` +
          ` or exists(stakeholders.contactChannels.value~'*${q}*' and stakeholders.contactChannels.type~'EMAIL')` +
          ` or exists(stakeholders.contactChannels.value~'*${q}*' and stakeholders.contactChannels.type~'PHONE')` +
          ` or exists(stakeholders.organizationName~'*${q}*')` +
          ` or exists(stakeholders.externalId~'*${q}*')` +
          ` or exists(parameters.values~'*${q}*'))`,
      );
    });

    it('sanitizes the query before interpolating it', () => {
      // The quotes, tilde and star in the query are all stripped, so the injected
      // fragment cannot terminate the literal it is placed inside.
      const filter = buildErrandFilter({ query: "A' or title~'*" });
      expect(filter).toContain("description~'*A or title*'");
      expect(filter).not.toContain("~'*'");
    });

    it('drops the country-code plus so the contains-match still finds a stored +46 number', () => {
      // sanitizeQuery removes '+', leaving '46701740635'. The clause is a *contains* match, so it
      // matches a stored '+46701740635' as well as a stored '46701740635'.
      const stripped = mockPhoneNumberCountryCode.replace('+', '');
      const filter = buildErrandFilter({ query: mockPhoneNumberCountryCode });
      expect(filter).toContain(`stakeholders.contactChannels.value~'*${stripped}*' and stakeholders.contactChannels.type~'PHONE'`);
      expect(filter).toContain(`stakeholders.contactChannels.value~'*${stripped}*' and stakeholders.contactChannels.type~'EMAIL'`);
      expect(filter).not.toContain('+');
    });

    it('appends an externalId clause when a party id was resolved', () => {
      expect(buildErrandFilter({ query: mockFirstName, partyId: mockOrganizationPartyId })).toContain(
        ` or exists(stakeholders.externalId~'*${mockOrganizationPartyId}*'))`,
      );
    });

    it('ignores the party id when there is no query', () => {
      expect(buildErrandFilter({ partyId: mockOrganizationPartyId })).toBe('');
    });

    it('matches an assigned stakeholder, falling back to the reporter when unassigned', () => {
      expect(buildErrandFilter({ stakeholders: mockAdUsername })).toBe(
        `&filter=(assignedUserId:'${mockAdUsername}' or (assignedUserId is null and reporterUserId:'${mockAdUsername}' ))`,
      );
      // No handler parameters is no change at all.
      expect(buildErrandFilter({ stakeholders: mockAdUsername, stakeholderParameterKeys: [] })).toBe(
        buildErrandFilter({ stakeholders: mockAdUsername }),
      );
    });

    it('also matches the errands a handler parameter names the stakeholder on, key and value in one parameter', () => {
      expect(buildErrandFilter({ stakeholders: mockAdUsername, stakeholderParameterKeys: ['masMarHandler'] })).toBe(
        `&filter=(assignedUserId:'${mockAdUsername}' or (assignedUserId is null and reporterUserId:'${mockAdUsername}' )` +
          ` or exists(parameters.key:'masMarHandler' and parameters.values:'${mockAdUsername}'))`,
      );
    });

    it('wraps a single-valued priority/category/type/status in an or group', () => {
      expect(buildErrandFilter({ priority: 'HIGH' })).toBe("&filter=(priority:'HIGH')");
      expect(buildErrandFilter({ category: 'SALARY' })).toBe("&filter=(category:'SALARY')");
      expect(buildErrandFilter({ type: 'SALARY.UNCATEGORIZED' })).toBe("&filter=(type:'SALARY.UNCATEGORIZED')");
      expect(buildErrandFilter({ status: 'NEW' })).toBe("&filter=(status:'NEW')");
    });

    it('splits comma-separated values into an or group', () => {
      expect(buildErrandFilter({ status: 'NEW,ONGOING,SOLVED' })).toBe("&filter=(status:'NEW' or status:'ONGOING' or status:'SOLVED')");
    });

    it('emits channel and resolution as bare clauses', () => {
      expect(buildErrandFilter({ channel: 'EMAIL' })).toBe("&filter=channel:'EMAIL'");
      expect(buildErrandFilter({ resolution: 'INFORMED' })).toBe("&filter=resolution:'INFORMED'");
    });

    it('reduces a full label path to its leaf', () => {
      expect(
        buildErrandFilter({
          labelCategory: 'SALARY',
          labelType: 'SALARY/UNCATEGORIZED',
          labelSubType: 'SALARY/UNCATEGORIZED/VACATION',
        }),
      ).toBe("&filter=(exists(labels.metadataLabel.resourcePath:'SALARY/UNCATEGORIZED/VACATION'))");
    });

    it('drops a label whose parent is not part of the selection', () => {
      // 'IAF/WORK' has no ancestor in the selected categories, so only SALARY survives.
      expect(buildErrandFilter({ labelCategory: 'SALARY', labelType: 'IAF/WORK' })).toBe(
        "&filter=(exists(labels.metadataLabel.resourcePath:'SALARY'))",
      );
    });

    it('adds no clause when the label selection reduces to nothing', () => {
      expect(buildErrandFilter({ labelCategory: '', labelType: '', labelSubType: '' })).toBe('');
    });

    it('converts start to the beginning and end to the end of the local day', () => {
      // TZ is pinned to Europe/Stockholm in vitest.config.ts, so the offset is stable.
      expect(buildErrandFilter({ start: '2026-01-15' })).toBe("&filter=created>'2026-01-15T00%3A00%3A00.000%2B01%3A00'");
      expect(buildErrandFilter({ end: '2026-01-15' })).toBe("&filter=created<'2026-01-15T23%3A59%3A59.999%2B01%3A00'");
    });

    it('joins multiple filters with and, in the builder’s own order', () => {
      // Order follows the order of the checks in buildErrandFilter, not the input object.
      expect(buildErrandFilter({ status: 'NEW', channel: 'EMAIL', priority: 'HIGH' })).toBe(
        "&filter=(priority:'HIGH') and channel:'EMAIL' and (status:'NEW')",
      );
    });
  });

  describe('NEW_ERRAND_DEFAULTS', () => {
    it('registers an errand in Draken as an ordinary deviation, asking what happened and where', () => {
      expect(NEW_ERRAND_DEFAULTS).toEqual({
        channel: 'WEB_UI',
        parameters: [{ key: 'eventType', displayName: 'Rapporttyp', values: ['AVVIKELSE'] }],
        form: {
          reportTypes: ['REPORT_TYPE/DEVIATION', 'REPORT_TYPE/ABUSE'],
          location: true,
          // The handler is not asked for a priority; every errand starts at Medel.
          priority: false,
        },
      });
      expect(Object.isFrozen(NEW_ERRAND_DEFAULTS)).toBe(true);
    });
  });

  describe('stripErrandVersions', () => {
    // SupportManagement returns `version` on reads but answers "must be null" when it is sent back.
    it('removes the version from the errand and all parameter lists it carries', () => {
      const errand = {
        id: mockSupportErrandId,
        version: 3,
        parameters: [{ key: 'propertyDesignation', values: [mockPropertyDesignation], version: 1 }],
        jsonParameters: [{ key: 'form', value: {}, schemaId: 'schema', version: 2 }],
        stakeholders: [{ firstName: mockFirstName, parameters: [{ key: 'username', values: [mockAdUsername], version: 4 }] }],
      };
      expect(stripErrandVersions(errand)).toEqual({
        id: mockSupportErrandId,
        parameters: [{ key: 'propertyDesignation', values: [mockPropertyDesignation] }],
        jsonParameters: [{ key: 'form', value: {}, schemaId: 'schema' }],
        stakeholders: [{ firstName: mockFirstName, parameters: [{ key: 'username', values: [mockAdUsername] }] }],
      });
    });

    it('leaves absent lists absent instead of introducing empty ones', () => {
      expect(stripErrandVersions({ id: mockSupportErrandId, version: 1 })).toEqual({ id: mockSupportErrandId });
    });

    it('does not mutate the input', () => {
      const errand = { parameters: [{ key: 'street', values: [mockStreet], version: 1 }], version: 2 };
      stripErrandVersions(errand);
      expect(errand).toEqual({ parameters: [{ key: 'street', values: [mockStreet], version: 1 }], version: 2 });
    });
  });

  describe('stripParameterVersions', () => {
    it('removes the version from every parameter while keeping the rest intact', () => {
      const parameters = [
        { key: 'street', displayName: 'Adress', values: [mockStreet], version: 1 },
        { key: 'other', displayName: 'Annat', values: [] },
      ];
      expect(stripParameterVersions(parameters)).toEqual([
        { key: 'street', displayName: 'Adress', values: [mockStreet] },
        { key: 'other', displayName: 'Annat', values: [] },
      ]);
    });
  });

  describe('resolveSupportErrandStatusTransition', () => {
    const statuses = [{ name: 'ONGOING' }, { name: 'SOLVED' }, { name: 'RETIRED', deprecated: true }];

    it('keeps optional resolution and suspension inside the resolved status command', () => {
      expect(
        resolveSupportErrandStatusTransition({ status: 'ONGOING' }, statuses, {
          expectedStatus: 'ONGOING',
          status: 'SOLVED',
          resolution: 'CLOSED',
          suspension: { suspendedFrom: undefined, suspendedTo: undefined },
        }),
      ).toEqual({
        status: 'SOLVED',
        resolution: 'CLOSED',
        suspension: { suspendedFrom: undefined, suspendedTo: undefined },
      });
    });

    it('rejects a command whose source status no longer matches', () => {
      expect(() => resolveSupportErrandStatusTransition({ status: 'SOLVED' }, statuses, { expectedStatus: 'ONGOING', status: 'ONGOING' })).toThrow(
        expect.objectContaining({ status: 409, message: 'Support errand status has changed since it was loaded' }),
      );
    });

    it('rejects unknown and deprecated target statuses without inventing app-specific rules', () => {
      for (const status of ['UNKNOWN', 'RETIRED']) {
        expect(() =>
          resolveSupportErrandStatusTransition({ status: 'ONGOING' }, statuses, {
            expectedStatus: 'ONGOING',
            status,
          }),
        ).toThrow(expect.objectContaining({ status: 400 }));
      }
    });

    it('fails explicitly when upstream state or metadata is incomplete', () => {
      expect(() => resolveSupportErrandStatusTransition({}, statuses, { expectedStatus: 'ONGOING', status: 'SOLVED' })).toThrow(
        expect.objectContaining({ status: 502 }),
      );
      expect(() => resolveSupportErrandStatusTransition({ status: 'ONGOING' }, undefined, { expectedStatus: 'ONGOING', status: 'SOLVED' })).toThrow(
        expect.objectContaining({ status: 502 }),
      );
    });
  });

  describe('resolveSupportErrandPhaseTransition', () => {
    const phases: Phase[] = [
      {
        id: 'received',
        name: 'RECEIVED',
        transitions: [
          { id: 'start-investigation', targetPhaseId: 'investigation' },
          { id: 'close-directly', targetPhaseId: 'closed' },
        ],
      },
      { id: 'investigation', name: 'INVESTIGATION' },
      { id: 'closed', name: 'CLOSED' },
    ];

    it('resolves the submitted transition id instead of relying on metadata order', () => {
      expect(resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'ONGOING' }, phases, 'close-directly')).toEqual({
        transitionId: 'close-directly',
        targetPhaseId: 'closed',
      });
    });

    it('rejects unavailable transitions and locked errands', () => {
      expect(() => resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'ONGOING' }, phases, 'unknown')).toThrow(
        expect.objectContaining({ status: 400 }),
      );
      expect(() =>
        resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'SOLVED' }, phases, 'start-investigation'),
      ).toThrow(expect.objectContaining({ status: 409 }));
    });

    it('requires a transition id from an errand that is already in a phase', () => {
      expect(() => resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'ONGOING' }, phases, undefined)).toThrow(
        expect.objectContaining({ status: 400 }),
      );
    });

    // An errand created outside the workflow - Katla sets the phase at intake, and anything older
    // has none - can still join it. Entering is the only move it has, so it names no transition.
    it('enters the first phase when the errand has none, and refuses a transition on the way in', () => {
      expect(resolveSupportErrandPhaseTransition({ status: 'ONGOING' }, phases, undefined)).toEqual({ targetPhaseId: 'received' });
      expect(() => resolveSupportErrandPhaseTransition({ status: 'ONGOING' }, phases, 'start-investigation')).toThrow(
        expect.objectContaining({ status: 400 }),
      );
      expect(() => resolveSupportErrandPhaseTransition({ status: 'ONGOING' }, [], undefined)).toThrow(expect.objectContaining({ status: 409 }));
    });

    it('picks the first phase by phaseOrder rather than by metadata order', () => {
      const unordered: Phase[] = [
        { id: 'second', name: 'SECOND', phaseOrder: 1 },
        { id: 'first', name: 'FIRST', phaseOrder: 0 },
      ];

      expect(resolveSupportErrandPhaseTransition({ status: 'ONGOING' }, unordered, undefined)).toEqual({ targetPhaseId: 'first' });
    });

    // A phase declares the statuses it allows, so the two move together - otherwise the errand ends
    // up in a combination its own workflow does not have.
    it('moves the status with the phase, and leaves an already allowed status alone', () => {
      const withStatuses: Phase[] = [
        {
          id: 'received',
          name: 'RECEIVED',
          allowedStatuses: ['NEW'],
          transitions: [{ id: 'start-investigation', targetPhaseId: 'investigation' }],
        },
        { id: 'investigation', name: 'INVESTIGATION', allowedStatuses: ['INQUIRY', 'PENDING'] },
      ];

      expect(resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'NEW' }, withStatuses, 'start-investigation')).toEqual({
        transitionId: 'start-investigation',
        targetPhaseId: 'investigation',
        status: 'INQUIRY',
      });
      expect(
        resolveSupportErrandPhaseTransition({ phases: [{ phaseId: 'received' }], status: 'PENDING' }, withStatuses, 'start-investigation'),
      ).toEqual({
        transitionId: 'start-investigation',
        targetPhaseId: 'investigation',
      });
    });

    it('fails explicitly when metadata points at a missing or deprecated target', () => {
      expect(() =>
        resolveSupportErrandPhaseTransition(
          { phases: [{ phaseId: 'received' }], status: 'ONGOING' },
          phases.map(phase => (phase.id === 'closed' ? { ...phase, deprecated: true } : phase)),
          'close-directly',
        ),
      ).toThrow(expect.objectContaining({ status: 502 }));
    });
  });

  describe('resolveSupportErrandClassification', () => {
    it('resolves only the exact owner/category/type ids from the metadata CATEGORY tree', () => {
      expect(
        resolveSupportErrandClassification(
          {
            classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
            categoryLabels: [{ id: 'type-label-id' }, { id: 'category-owner-id' }, { id: 'category-label-id' }],
          },
          classificationLabelStructure,
          classificationLabelTree,
        ),
      ).toEqual({
        classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
        categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
        managedCategoryLabelIds: ['category-root-id', 'category-owner-id', 'category-label-id', 'type-label-id', 'other-type-label-id'],
        managedRootResource: 'CATEGORY',
      });
    });

    it('returns canonical metadata paths instead of persisting normalized client strings', () => {
      expect(
        resolveSupportErrandClassification(
          {
            classification: { category: '  category/hsl ', type: '/category/hsl/rehab/' },
            categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
          },
          classificationLabelStructure,
          classificationLabelTree,
        ).classification,
      ).toEqual({ category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' });
    });

    it('uses resource names when classification metadata omits optional resource paths', () => {
      const structureWithoutPaths = structuredClone(classificationLabelStructure);
      const removePaths = (labels: Label[]) => {
        labels.forEach(label => {
          delete label.resourcePath;
          if (label.labels) removePaths(label.labels);
        });
      };
      removePaths(structureWithoutPaths);

      const resolved = resolveSupportErrandClassification(
        {
          classification: { category: 'HSL', type: 'REHAB' },
          categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
        },
        structureWithoutPaths,
        classificationLabelTree,
      );

      expect(resolved.classification).toEqual({ category: 'HSL', type: 'REHAB' });
      expect(resolved.categoryLabels).toEqual([{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }]);
    });

    it('ignores CATEGORY-classified labels outside the CATEGORY metadata root', () => {
      const structureWithForeignCategory = [
        ...classificationLabelStructure,
        {
          id: 'foreign-category-id',
          classification: 'CATEGORY',
          resourceName: 'FOREIGN',
          resourcePath: 'CATEGORY/FOREIGN',
        },
      ];

      expect(() =>
        resolveSupportErrandClassification(
          {
            classification: { category: 'CATEGORY/FOREIGN', type: 'CATEGORY/FOREIGN' },
            categoryLabels: [{ id: 'foreign-category-id' }],
          },
          structureWithForeignCategory,
          classificationLabelTree,
        ),
      ).toThrow(expect.objectContaining({ status: 400 }));
    });

    it('rejects non-category ids and classification paths that do not match metadata', () => {
      expect(() =>
        resolveSupportErrandClassification(
          {
            classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
            categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'deviation-id' }],
          },
          classificationLabelStructure,
          classificationLabelTree,
        ),
      ).toThrow(expect.objectContaining({ status: 400 }));

      expect(() =>
        resolveSupportErrandClassification(
          {
            classification: { category: 'CATEGORY/SOL_LSS', type: 'CATEGORY/HSL/REHAB' },
            categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
          },
          classificationLabelStructure,
          classificationLabelTree,
        ),
      ).toThrow(expect.objectContaining({ status: 400 }));
    });

    it('rejects a known category without exactly one valid undercategory', () => {
      for (const categoryLabels of [
        [{ id: 'category-owner-id' }, { id: 'category-label-id' }],
        [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }, { id: 'other-type-label-id' }],
      ]) {
        expect(() =>
          resolveSupportErrandClassification(
            {
              classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
              categoryLabels,
            },
            classificationLabelStructure,
            classificationLabelTree,
          ),
        ).toThrow(expect.objectContaining({ status: 400 }));
      }
    });

    it('projects a future application custom root and classification vocabulary', () => {
      const futureTree = {
        root: { resource: 'INCIDENTS', classification: 'INCIDENT_ROOT' },
        ownerClassification: 'ACT_BRANCH',
        categoryClassification: 'INCIDENT_CLASS',
        typeClassification: 'INCIDENT_DETAIL',
      };
      const futureStructure: Label[] = [
        {
          id: 'future-root',
          classification: 'INCIDENT_ROOT',
          resourceName: 'INCIDENTS',
          resourcePath: 'INCIDENTS',
          labels: [
            {
              id: 'future-owner',
              classification: 'ACT_BRANCH',
              resourceName: 'FUTURE_ACT',
              resourcePath: 'INCIDENTS/FUTURE_ACT',
              labels: [
                {
                  id: 'future-category',
                  classification: 'INCIDENT_CLASS',
                  resourceName: 'SAFETY',
                  resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY',
                  labels: [
                    {
                      id: 'future-type',
                      classification: 'INCIDENT_DETAIL',
                      resourceName: 'FALL',
                      resourcePath: 'INCIDENTS/FUTURE_ACT/SAFETY/FALL',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      expect(
        resolveSupportErrandClassification(
          {
            classification: { category: 'INCIDENTS/FUTURE_ACT', type: 'INCIDENTS/FUTURE_ACT/SAFETY' },
            categoryLabels: [{ id: 'future-owner' }, { id: 'future-category' }, { id: 'future-type' }],
          },
          futureStructure,
          futureTree,
        ),
      ).toEqual({
        classification: { category: 'INCIDENTS/FUTURE_ACT', type: 'INCIDENTS/FUTURE_ACT/SAFETY' },
        categoryLabels: [{ id: 'future-owner' }, { id: 'future-category' }, { id: 'future-type' }],
        managedCategoryLabelIds: ['future-root', 'future-owner', 'future-category', 'future-type'],
        managedRootResource: 'INCIDENTS',
      });
    });

    it('fails closed when the configured classification root is missing or duplicated', () => {
      const request = {
        classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
        categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
      };

      expect(() => resolveSupportErrandClassification(request, [], classificationLabelTree)).toThrow(
        expect.objectContaining({
          status: 502,
          message: 'Support Management classification metadata expected one configured root CATEGORY/CATEGORY_ROOT, found 0',
        }),
      );
      expect(() =>
        resolveSupportErrandClassification(
          request,
          [
            ...classificationLabelStructure,
            { id: 'duplicate-root', classification: 'CATEGORY_ROOT', resourceName: 'CATEGORY', resourcePath: 'CATEGORY' },
          ],
          classificationLabelTree,
        ),
      ).toThrow(
        expect.objectContaining({
          status: 502,
          message: 'Support Management classification metadata expected one configured root CATEGORY/CATEGORY_ROOT, found 2',
        }),
      );
      for (const nearMiss of [
        [{ id: 'wrong-resource', classification: 'CATEGORY_ROOT', resourceName: 'CATEGORY', resourcePath: 'OTHER' }],
        [{ id: 'wrong-classification', classification: 'OTHER_ROOT', resourceName: 'CATEGORY', resourcePath: 'CATEGORY' }],
      ] as Label[][]) {
        expect(() => resolveSupportErrandClassification(request, nearMiss, classificationLabelTree)).toThrow(
          expect.objectContaining({
            status: 502,
            message: 'Support Management classification metadata expected one configured root CATEGORY/CATEGORY_ROOT, found 0',
          }),
        );
      }
    });

    it('treats duplicate ids in classification metadata as an upstream contract error', () => {
      const duplicateIdStructure = structuredClone(classificationLabelStructure);
      const firstType = duplicateIdStructure[0]?.labels?.[0]?.labels?.[0]?.labels?.[0];
      expect(firstType).toBeDefined();
      firstType!.id = 'category-label-id';

      expect(() =>
        resolveSupportErrandClassification(
          {
            classification: { category: 'CATEGORY/HSL', type: 'CATEGORY/HSL/REHAB' },
            categoryLabels: [{ id: 'category-owner-id' }, { id: 'category-label-id' }, { id: 'type-label-id' }],
          },
          duplicateIdStructure,
          classificationLabelTree,
        ),
      ).toThrow(
        expect.objectContaining({
          status: 502,
          message: 'Support Management classification metadata contains duplicate label ids',
        }),
      );
    });
  });

  describe('buildSupportErrandClassificationUpdateBody', () => {
    it('replaces CATEGORY labels while preserving fresh unrelated labels in the exact upstream body', () => {
      const body = buildSupportErrandClassificationUpdateBody(
        {
          classification: { category: 'HSL', type: 'REHAB', displayName: 'Not writable' },
          categoryLabels: [
            { id: 'new-category-id', displayName: 'Not writable' },
            { id: 'new-category-id', displayName: 'Duplicate' },
            { id: 'new-type-id' },
          ],
          title: 'Not writable',
        } as unknown as SupportErrandClassificationSelection,
        [
          { id: 'provision-id', resourcePath: 'PROVISION/HSL' },
          { id: 'report-type-id', resourcePath: 'REPORT_TYPE/DEVIATION' },
          { id: 'concurrent-location-id', resourcePath: 'LOCATION/NEW_SINCE_PAGE_LOAD' },
          { id: 'old-category-id', resourcePath: 'CATEGORY/HSL/OLD' },
          { id: 'old-type-id', classification: 'TYPE' },
          { id: 'location-type-id', classification: 'TYPE', resourcePath: 'LOCATION/SCHOOL/TYPE' },
        ],
        [{ id: 'new-category-id' }, { id: 'new-category-id' }, { id: 'new-type-id' }],
        { category: 'HSL', type: 'REHAB' },
        ['old-category-id', 'old-type-id', 'new-category-id', 'new-type-id'],
        classificationLabelTree.root.resource,
      );

      expect(body).toEqual({
        classification: { category: 'HSL', type: 'REHAB' },
        labels: [
          { id: 'provision-id' },
          { id: 'report-type-id' },
          { id: 'concurrent-location-id' },
          { id: 'location-type-id' },
          { id: 'new-category-id' },
          { id: 'new-type-id' },
        ],
      });
    });

    it('stops instead of dropping a fresh unrelated label without an id', () => {
      expect(() =>
        buildSupportErrandClassificationUpdateBody(
          {
            classification: { category: 'HSL', type: 'REHAB' },
            categoryLabels: [{ id: 'new-category-id' }],
          },
          [{ resourcePath: 'LOCATION/NEW_SINCE_PAGE_LOAD' } as Label],
        ),
      ).toThrow(
        expect.objectContaining({
          status: 502,
          message: 'Support Management response contains an unrelated label without id',
        }),
      );
    });
  });
});

describe('resolveClosingPhaseId', () => {
  // The last phase of the avvikelse workflow allows closing alongside its own statuses.
  const workflow: Phase[] = [
    {
      id: 'review',
      name: 'REVIEW',
      allowedStatuses: ['REVIEW', 'ASSIGNED', 'AWAITING_RESPONSE'],
      transitions: [{ id: 'to-follow-up', targetPhaseId: 'follow-up' }],
    },
    { id: 'follow-up', name: 'FOLLOW_UP', allowedStatuses: ['FOLLOW_UP', 'ASSIGNED', 'AWAITING_RESPONSE', 'SOLVED'] },
  ];
  // The avvikelse chain, where Support Management only lets an errand move one transition at a time.
  const chain: Phase[] = [
    { id: 'review', name: 'REVIEW', allowedStatuses: ['REVIEW', 'ASSIGNED'], transitions: [{ id: 't1', targetPhaseId: 'investigation' }] },
    {
      id: 'investigation',
      name: 'INVESTIGATION',
      allowedStatuses: ['INQUIRY', 'ASSIGNED'],
      transitions: [{ id: 't2', targetPhaseId: 'decision' }],
    },
    { id: 'decision', name: 'DECISION', allowedStatuses: ['DECISION', 'ASSIGNED'], transitions: [{ id: 't3', targetPhaseId: 'follow-up' }] },
    { id: 'follow-up', name: 'FOLLOW_UP', allowedStatuses: ['FOLLOW_UP', 'ASSIGNED', 'SOLVED'] },
  ];

  it('steps a closed errand along the transitions, each phase setting the status it requires', () => {
    expect(
      resolveSupportErrandStatusTransition(
        { status: 'REVIEW', phases: [{ phaseId: 'review' }] },
        [{ name: 'SOLVED' }],
        { expectedStatus: 'REVIEW', status: 'SOLVED' },
        chain,
      ),
    ).toEqual({
      status: 'SOLVED',
      activePhaseId: 'follow-up',
      phaseSteps: [
        { activePhaseId: 'investigation', status: 'INQUIRY' },
        { activePhaseId: 'decision', status: 'DECISION' },
      ],
    });
    // A status every phase on the way allows is left as it is.
    expect(resolveClosingPhaseSteps({ phases: [{ phaseId: 'decision' }] }, chain, 'SOLVED')).toEqual(['follow-up']);
  });

  it('enters an errand outside the workflow at its first phase and steps on from there', () => {
    expect(resolveClosingPhaseSteps({ phases: [] }, chain, 'SOLVED')).toEqual(['review', 'investigation', 'decision', 'follow-up']);
  });

  it('refuses to close into a phase the workflow cannot reach from the active phase', () => {
    const disconnected = chain.map(phase => (phase.id === 'decision' ? { ...phase, transitions: [] } : phase));
    expect(() => resolveClosingPhaseSteps({ phases: [{ phaseId: 'review' }] }, disconnected, 'SOLVED')).toThrow(
      expect.objectContaining({ status: 409 }),
    );
  });

  it('moves an errand closed in another phase into the phase that allows closing', () => {
    expect(resolveClosingPhaseId({ phases: [{ phaseId: 'review' }] }, workflow, 'SOLVED')).toBe('follow-up');
    // An errand outside the workflow is closed into it as well.
    expect(resolveClosingPhaseId({ phases: [] }, workflow, 'SOLVED')).toBe('follow-up');
  });

  it('moves nothing where closing is already allowed, for other statuses, or without a workflow', () => {
    expect(resolveClosingPhaseId({ phases: [{ phaseId: 'follow-up' }] }, workflow, 'SOLVED')).toBeUndefined();
    expect(resolveClosingPhaseId({ phases: [{ phaseId: 'review' }] }, workflow, 'ASSIGNED')).toBeUndefined();
    expect(resolveClosingPhaseId({ phases: [{ phaseId: 'review' }] }, [], 'SOLVED')).toBeUndefined();
    expect(resolveClosingPhaseId({ phases: [{ phaseId: 'review' }] }, undefined, 'SOLVED')).toBeUndefined();
  });

  it('does not guess between several phases that allow closing', () => {
    const twoEnds: Phase[] = [...workflow, { id: 'archive', name: 'ARCHIVE', allowedStatuses: ['SOLVED'] }];
    expect(() => resolveClosingPhaseId({ phases: [{ phaseId: 'review' }] }, twoEnds, 'SOLVED')).toThrow(expect.objectContaining({ status: 409 }));
  });

  it('carries the move in the same status write that closes the errand', () => {
    expect(
      resolveSupportErrandStatusTransition(
        { status: 'REVIEW', phases: [{ phaseId: 'review' }] },
        [{ name: 'SOLVED' }],
        { expectedStatus: 'REVIEW', status: 'SOLVED' },
        workflow,
      ),
    ).toEqual({ status: 'SOLVED', activePhaseId: 'follow-up' });
  });
});
