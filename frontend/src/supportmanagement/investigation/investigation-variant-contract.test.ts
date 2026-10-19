import assert from 'node:assert/strict';

import { test } from 'vitest';

import type { SupportErrandClassificationPlacement } from './classification-placement';
import {
  type InvestigationVariantModule,
  overviewLabelFilterGroups,
  resolveInvestigationAdministration,
  resolveOverviewFilterToggle,
} from './investigation-variant';

const fixtureLabelTree = { categoryClassification: 'FIXTURE_CATEGORY', typeClassification: 'FIXTURE_TYPE' };

/** Grundinformation keeps the classification. */
const basicsPlacement: SupportErrandClassificationPlacement = { owner: 'basics', labelTree: fixtureLabelTree };

/**
 * The *shape* of the contract: which slots are optional, and the rules the shared pages apply to the
 * slots a variant fills. The fixtures below never import `avvikelse/`, so the rules are tested apart
 * from the one implementation.
 */

/** The minimum a variant must supply. That this compiles is half the assertion. */
const minimalVariant: InvestigationVariantModule = {
  id: 'fixture-minimal',
  label: 'Utredning',
  resolveClassificationPlacement: () => basicsPlacement,
  renderTab: () => null,
};

test('a variant needs only the required slots', () => {
  // The optional slots stay optional: a variant that has nothing to say above the tab strip does not have to
  // supply a stub for it.
  assert.equal(minimalVariant.renderNotice, undefined);
  assert.equal(minimalVariant.decisionTab, undefined);
  // Nothing is added to Ärendeuppgifter by a variant that does not ask for it.
  assert.equal(minimalVariant.renderDetailsHeader, undefined);
  // A variant that requires nothing before a phase holds no phase change.
  assert.equal(minimalVariant.phaseEntryRequirements, undefined);
  // A variant offering no follow-up across errands adds no section to the overview's sidebar.
  assert.equal(minimalVariant.followUp, undefined);
  // Nor does one with nothing for its administrators to set.
  assert.equal(minimalVariant.administration, undefined);
  // A variant offering no choice of notification channels adds no entry to the user menu.
  assert.equal(minimalVariant.notificationChannels, undefined);
  // Nor does one with no word of its own on what the messages are for change the Meddelanden tab.
  assert.equal(minimalVariant.messagesIntroduction, undefined);
  // A variant with nothing to say about an errand the user may only know of leaves the errand page alone.
  assert.equal(minimalVariant.limitedAccessNotice, undefined);
  // A variant that does not keep errands from closing early leaves the early close where it is.
  assert.equal(minimalVariant.closesOnlyAtWorkflowEnd, undefined);
  // Nor does one with no word on closing early hold the early close back to a phase, or ask why.
  assert.equal(minimalVariant.earlyClose, undefined);
  // Nor does one with nothing to remind the handler of add anything under the button that closes the errand.
  assert.equal(minimalVariant.closingReminder, undefined);
  // Nor does one with no names of its own for the channels rename any.
  assert.equal(minimalVariant.channelLabels, undefined);
  // Nor does one with no next step to tell put anything above the handling controls, or move the landing tab.
  assert.equal(minimalVariant.nextStep, undefined);
  // A variant with no say in who is responsible leaves the overview naming the assigned handler.
  assert.equal(minimalVariant.overviewAssignee, undefined);
  // Nor does one with no handlers to record beside the assignee change the sidebar.
  assert.equal(minimalVariant.renderHandlerFields, undefined);
  // A variant without a filter checkbox leaves the overview's filters as they are.
  assert.equal(minimalVariant.overviewFilterToggle, undefined);
  // Nor does one with no word on who is never an employee take the employee search from any stakeholder.
  assert.equal(minimalVariant.rolesWithoutEmployeeSearch, undefined);
  // Nor does one with no say in who adds and removes stakeholders keep the handler from adding or removing any.
  assert.equal(minimalVariant.handlerManagedStakeholderRoles, undefined);
  // Nor does one with nothing to conceal hide any document its access shows.
  assert.equal(minimalVariant.concealedDocumentKeys, undefined);
  // A variant whose work has no phase of its own names none, and is offered from any phase.
  assert.equal(minimalVariant.requiredPhaseName, undefined);
});

test('an administration section is offered by the variant, to the viewers it names', () => {
  const administration = {
    heading: 'Administration',
    label: 'Fixture',
    isOfferedTo: ({ superadmin }: { superadmin?: boolean }) => superadmin === true,
    render: () => null,
  };
  const administeredVariant: InvestigationVariantModule = { ...minimalVariant, administration };

  assert.equal(resolveInvestigationAdministration(administeredVariant, { superadmin: true }), administration);
  assert.equal(resolveInvestigationAdministration(administeredVariant, { superadmin: false }), undefined);
  assert.equal(resolveInvestigationAdministration(administeredVariant, { roleKeys: ['ANY'] }), undefined);
  // A variant without the slot offers nothing, to anybody.
  assert.equal(resolveInvestigationAdministration(minimalVariant, { superadmin: true }), undefined);
});

test("the overview's filter checkbox owns its label-filter group, and is offered where the variant and the profile say", () => {
  const filterToggle = {
    label: 'Fixture-ärenden',
    selection: { groupKey: 'fixture-risk', fieldKey: 'level', resourcePath: 'FIXTURE_RISK/HIGH' },
    isOfferedTo: ({ roleKeys = [] }: { roleKeys?: readonly string[] }) => roleKeys.includes('fixture-role'),
  };
  const group = (key: string) => ({ key, label: key, rootResourcePath: key.toUpperCase(), fields: [] });
  const groups = [group('fixture-category'), group('fixture-risk')];

  // No other filter offers the checkbox's group, whoever is looking; without a checkbox every group stays.
  assert.deepEqual(
    overviewLabelFilterGroups(groups, filterToggle).map(({ key }) => key),
    ['fixture-category']
  );
  assert.equal(overviewLabelFilterGroups(groups, undefined), groups);

  assert.equal(resolveOverviewFilterToggle(filterToggle, { roleKeys: ['fixture-role'] }, groups), filterToggle);
  assert.equal(resolveOverviewFilterToggle(filterToggle, { roleKeys: ['other-role'] }, groups), undefined);
  // The BFF filters on the profile's groups alone, so a profile without the group offers no checkbox.
  assert.equal(
    resolveOverviewFilterToggle(filterToggle, { roleKeys: ['fixture-role'] }, [group('fixture-category')]),
    undefined
  );
  assert.equal(resolveOverviewFilterToggle(filterToggle, { roleKeys: ['fixture-role'] }, undefined), undefined);
  assert.equal(resolveOverviewFilterToggle(undefined, { roleKeys: ['fixture-role'] }, groups), undefined);
});

/**
 * Ownership is the variant's decision, not the seam's: the same contract expresses "Grundinformation
 * keeps classification" and "the investigation owns it", and shared code reads only `owner`.
 */
test('a variant decides where classification is persisted', () => {
  const investigationOwned: InvestigationVariantModule = {
    ...minimalVariant,
    resolveClassificationPlacement: () => ({ owner: 'investigation', labelTree: fixtureLabelTree }),
  };

  assert.equal(minimalVariant.resolveClassificationPlacement(null).owner, 'basics');
  assert.equal(investigationOwned.resolveClassificationPlacement(null).owner, 'investigation');
});
