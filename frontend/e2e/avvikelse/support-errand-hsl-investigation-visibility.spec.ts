import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { toast } from '../utils/toast';
import {
  allExistingInvestigationDocuments,
  defaultInvestigationProfile,
  errandNumber,
  hslCommentKey,
  iafLabelFixture,
  installIafApiMock,
  misconductWithVcCommentRequested,
  withHighHslRisk,
} from './fixtures/investigation-flow.mock';

/**
 * MAS/MAR's Händelseanalys HSL is kept out of a unit manager's and head of operations' sight until the errand
 * carries a high HSL risk - in Utredning and in Ärendeuppgifter alike. Only what is drawn changes: the access
 * the mock grants stays the same throughout.
 */
const hslKey = 'utredning-hsl';
const hslText = 'SKA BARA VISAS FÖR DEN SOM SER HÄNDELSEANALYS HSL';

async function installErrand(page: Page, { roleKeys, highHslRisk }: { roleKeys: string[]; highHslRisk: boolean }) {
  const documents = allExistingInvestigationDocuments();
  documents[hslKey].value.assignment = `<p>${hslText}</p>`;
  return installIafApiMock(page, { roleKeys, documents, ...(highHslRisk ? withHighHslRisk() : {}) });
}

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

const investigationTabs = (page: Page) => page.locator('[data-cy="support-investigation-tab"]');

async function openInvestigation(page: Page) {
  await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
  await expect(investigationTabs(page).getByRole('tab', { name: 'Utredning enhetschef', exact: true })).toBeVisible();
}

for (const roleKey of ['enhetschef', 'verksamhetschef']) {
  test(`${roleKey} is not shown Händelseanalys HSL while the errand has no high HSL risk`, async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installErrand(page, { roleKeys: [roleKey], highHslRisk: false });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toHaveCount(0);
    // The comment on the analysis has nothing to comment on yet: it stays out of sight with it.
    await expect(investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true })).toHaveCount(0);
    // Nor does Ärendeuppgifter show the document's own JSON in its place.
    await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
    const details = page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true }).locator('..');
    await expect(details.getByRole('textbox', { name: 'Händelse från Katla', exact: true })).toBeVisible();
    await expect(details).not.toContainText(hslText);
    // A concealed document is not even read.
    expect(trace.documentGets).not.toContain(hslKey);
    expect(trace.documentGets).not.toContain(hslCommentKey);
  });

  test(`${roleKey} is shown Händelseanalys HSL once the errand carries a high HSL risk`, async ({
    page,
    dismissCookieConsent,
  }) => {
    await installErrand(page, { roleKeys: [roleKey], highHslRisk: true });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toBeVisible();
    // The high risk alone does not open the comment, and only MAS/MAR is offered to ask for it.
    await expect(investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true })).toHaveCount(0);
    await investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true }).click();
    await expect(page.locator(`[data-cy="investigation-document-${hslKey}"]`)).toBeVisible();
    await expect(page.locator('[data-cy="vc-comment-request-button"]')).toHaveCount(0);
  });
}

// Ä4. MAS/MAR asks the head of operations for their comment from the analysis. The request is one handover step,
// conditioned on the errand's version; it opens VC kommentar HSL, and the page follows the version it left - here two
// steps on, as Support Management may take for a label - so the next save is not refused as somebody else's change.
test('MAS/MAR opens VC kommentar HSL from the analysis, and the errand version follows', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installIafApiMock(page, {
    roleKeys: ['mas-mar'],
    assignedUserId: 'iaf.test',
    documents: allExistingInvestigationDocuments(),
    ...withHighHslRisk(),
  });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);
  const commentTab = investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true });
  await expect(commentTab).toHaveCount(0);

  await investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true }).click();
  const analysis = page.locator(`[data-cy="investigation-document-${hslKey}"]`);
  await analysis.getByRole('button', { name: 'Aktivera VC kommentar HSL', exact: true }).click();

  await expect(commentTab).toBeVisible();
  await expect(analysis.locator('[data-cy="vc-comment-requested"]')).toContainText('Verksamhetschefen har aviserats');
  expect(trace.handovers).toEqual([{ step: 'request-vc-comment', expectedVersion: 7 }]);

  // The errand's own next save is conditioned on the version the request left.
  const errandWrite = page.waitForRequest(
    (request) => request.method() === 'PATCH' && /\/supporterrands\/2281\/[^/]+$/u.test(new URL(request.url()).pathname)
  );
  await page.locator('[data-cy="priority-input"]').selectOption('HIGH');
  await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').filter({ hasText: 'Spara ärende' }).click();
  expect((await errandWrite).headers()['if-match']).toBe('"9"');
  await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
});

test('verksamhetschef is shown VC kommentar HSL once MAS/MAR has asked for the comment', async ({
  page,
  dismissCookieConsent,
}) => {
  await installIafApiMock(page, {
    roleKeys: ['verksamhetschef'],
    documents: allExistingInvestigationDocuments(),
    ...withHighHslRisk({ commentRequested: true }),
  });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);

  await expect(investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true })).toBeVisible();
});

// The one who commissioned the analysis comments on it in a document of their own, beside the analysis: they write
// the comment without being given MAS/MAR's analysis to change.
test('verksamhetschef writes the commissioner comment in VC kommentar HSL, not in Händelseanalys HSL', async ({
  page,
  dismissCookieConsent,
}) => {
  const profile = defaultInvestigationProfile();
  const trace = await installIafApiMock(page, {
    roleKeys: ['verksamhetschef'],
    documents: {},
    investigationProfile: profile,
    documentAccess: Object.fromEntries(
      profile.documents.map(({ key }) => [key, key === hslCommentKey ? 'edit' : 'read'])
    ),
    ...withHighHslRisk({ commentRequested: true }),
  });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);

  await investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true }).click();
  const analysis = page.locator(`[data-cy="investigation-document-${hslKey}"]`);
  await expect(analysis.getByRole('textbox', { name: 'Uppdrag', exact: true })).toBeVisible();
  await expect(analysis.getByRole('textbox', { name: 'Uppdragsgivarens kommentar', exact: true })).toHaveCount(0);

  await investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true }).click();
  const comment = page.locator(`[data-cy="investigation-document-${hslCommentKey}"]`);
  await expect(comment).toContainText('Ansvarig roll: Verksamhetschef');
  // A comment is not an investigation: nothing to mark completed, and no report to create.
  await expect(comment.locator(`[data-cy="investigation-report-${hslCommentKey}"]`)).toHaveCount(0);
  const text = comment.getByRole('textbox', { name: 'Uppdragsgivarens kommentar', exact: true });
  await text.click();
  await page.keyboard.type('Analysen är mottagen.');
  await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

  await expect.poll(() => trace.puts.map(({ key }) => key)).toEqual([hslCommentKey]);
  expect(JSON.stringify(trace.puts[0].body)).toContain('Analysen är mottagen.');
});

// The BFF marks the errand with the high HSL risk in the save itself. The page has to learn of it then, not at the
// next load: the unit manager who has just assessed the risk is the one who is shown the analysis.
test('enhetschef is shown Händelseanalys HSL as soon as the investigation is saved with a high HSL risk', async ({
  page,
  dismissCookieConsent,
}) => {
  const documents = allExistingInvestigationDocuments();
  documents['utredning-enhetschef'].value.riskAssessmentHsl = {
    assessedWith: 'Anna Andersson',
    probability: 1,
    severity: 3,
    calculatedRiskValue: 3,
  };
  const trace = await installIafApiMock(page, {
    roleKeys: ['enhetschef'],
    documents,
    // The namespace has the label; the errand does not carry it yet.
    labelStructure: withHighHslRisk().labelStructure,
  });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);
  const hslTab = investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true });
  await expect(hslTab).toHaveCount(0);

  // 2 x 3 is 6: over the limit of 4.
  await page.locator('#utredning-enhetschef_riskAssessmentHsl_probability').getByLabel(/^2 –/u).check();
  await expect(page.locator('#utredning-enhetschef_riskAssessmentHsl_calculatedRiskValue')).toHaveValue('6');
  await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

  await expect.poll(() => trace.puts.length).toBe(1);
  await expect(hslTab).toBeVisible();
  // Shown on the page that saved: the errand was opened once, and not again.
  expect(page.url()).toContain(`arende/${errandNumber}`);
  await hslTab.click();
  await expect(page.locator('[data-cy="investigation-document-utredning-hsl"]')).toBeVisible();
});

// The label write is the save's own, however many of the errand's version steps it takes. The classification saved
// with the investigation is conditioned on the version after all of them, or it is refused as somebody else's change.
test('enhetschef saves the classification together with a high HSL risk', async ({ page, dismissCookieConsent }) => {
  const documents = allExistingInvestigationDocuments();
  documents['utredning-enhetschef'].value.riskAssessmentHsl = {
    assessedWith: 'Anna Andersson',
    probability: 1,
    severity: 3,
    calculatedRiskValue: 3,
  };
  const trace = await installIafApiMock(page, {
    roleKeys: ['enhetschef'],
    documents,
    labelStructure: withHighHslRisk().labelStructure,
  });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);

  const investigation = page.locator('[data-cy="investigation-document-utredning-enhetschef"]');
  const classification = investigation.locator('[data-cy="avvikelse-label-categorization-HSL"]');
  await classification
    .locator('[data-cy="label-classification-type"]')
    .selectOption(iafLabelFixture.classification.medication.resourcePath);
  await classification
    .locator('[data-cy="label-classification-subtype"]')
    .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
  await page.locator('#utredning-enhetschef_riskAssessmentHsl_probability').getByLabel(/^2 –/u).check();
  const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
  await saveButton.click();

  await expect.poll(() => trace.puts.length).toBe(1);
  await expect.poll(() => trace.classificationPatches.length).toBe(1);
  // Both were saved: nothing is left to save, and nobody is told that somebody else changed the errand.
  await expect(saveButton).toBeDisabled();
  await expect(investigation).not.toContainText('ändrats');
  await expect(classification.locator('[data-cy="label-classification-type"]')).toHaveValue(
    iafLabelFixture.classification.medication.resourcePath
  );
});

// Ä4: a misconduct goes to LEX and is never analysed under HSL, not even one MAS/MAR asked the head of operations to
// comment on before it was found a misconduct. Nobody is offered the analysis or the comment, and neither is read.
for (const roleKey of ['mas-mar', 'verksamhetschef']) {
  test(`${roleKey} is shown neither Händelseanalys HSL nor VC kommentar HSL on a reported misconduct`, async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      roleKeys: [roleKey],
      documents: allExistingInvestigationDocuments(),
      ...misconductWithVcCommentRequested(),
    });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toHaveCount(0);
    await expect(investigationTabs(page).getByRole('tab', { name: 'VC kommentar HSL', exact: true })).toHaveCount(0);
    expect(trace.documentGets).not.toContain(hslKey);
    expect(trace.documentGets).not.toContain(hslCommentKey);
  });
}

test('MAS/MAR is shown Händelseanalys HSL whatever the risk', async ({ page, dismissCookieConsent }) => {
  await installErrand(page, { roleKeys: ['mas-mar'], highHslRisk: false });
  await visitErrand(page, dismissCookieConsent);
  await openInvestigation(page);

  await expect(investigationTabs(page).getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toBeVisible();
});
