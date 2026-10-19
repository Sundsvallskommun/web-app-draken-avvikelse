import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  defaultInvestigationProfile,
  errandNumber,
  iafLabelFixture,
  installIafApiMock,
  latestSchemaIds,
  reportDocumentProfile,
} from './fixtures/investigation-flow.mock';

/**
 * The lex Sarah investigation is built after the organisation's investigation template: its sections in their
 * order, a background Draken fills in from the errand and locks, text answers sized as the template sizes them,
 * and a motivation for every No.
 */
const key = 'utredning-sol-lss';
const reported = 'Brukaren blev utan kvällsbesök.';

async function installNewInvestigation(page: Page) {
  return installIafApiMock(page, {
    investigationProfile: { ...defaultInvestigationProfile(), reportDocument: reportDocumentProfile },
    eventType: 'MISSFORHALLANDE',
    assignedUserId: 'iaf.test',
    administrators: [{ name: 'iaf.test', displayName: 'Iaf Testare', guid: 'iaf-guid', roleKeys: ['enhetschef'] }],
    assigneeResumedAt: '2026-10-06T09:15:00+02:00',
    documents: {
      [reportDocumentProfile.key]: {
        key: reportDocumentProfile.key,
        schemaId: '2281_avvikelse-plats-handelse_1.5',
        value: { facilityInfo: { orgName: 'Norra hemmet' }, eventDescription: reported },
        version: 1,
        etag: '"1"',
      },
    },
  });
}

async function openLexInvestigation(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
  await page.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();
  const document = page.locator(`[data-cy="investigation-document-${key}"]`);
  await expect(document.locator(`#${key}_investigator`)).toBeVisible();
  return document;
}

const editorHeight = (page: Page, field: string) =>
  page.evaluate(
    (id) => document.getElementById(id)?.closest('.schema-text-editor')?.getBoundingClientRect().height ?? 0,
    `${key}_${field}`
  );

test('a new lex Sarah investigation follows the template, its background filled in and locked', async ({
  page,
  dismissCookieConsent,
}) => {
  await installNewInvestigation(page);
  const document = await openLexInvestigation(page, dismissCookieConsent);

  // The accordions' titles, in the order the page draws them.
  const sections = ['background', 'what-happened', 'why', 'decision-proposal', 'categorization', 'report'];
  await expect(document.locator(sections.map((section) => `#${key}-${section}-title`).join(', '))).toHaveText([
    'Bakgrund',
    'Vad har hänt?',
    'Varför har det hänt?',
    'Förslag till beslut',
    'Kategorisering',
    'Avsluta utredning och skapa rapport',
  ]);

  // Filled in, but nothing changed: opening the investigation leaves nothing to save.
  await expect(page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')).toBeDisabled();

  // Who investigates, what was reported, and the day the investigator took the errand up.
  await expect(document.locator(`#${key}_investigator`)).toHaveValue('Iaf Testare');
  await expect(document.locator(`#${key}_investigator`)).not.toBeEditable();
  await expect(document.locator(`#${key}_reportedEventDescription`)).toContainText(reported);
  await expect(document.locator(`#${key}_reportReceivedDate`)).toHaveValue('2026-10-06');
  await expect(document.locator(`#${key}_reportReceivedDate`)).not.toBeEditable();
  // The summary of the report starts as a copy of it, which the investigator rewrites; the report itself stays.
  const summary = document.locator(`#${key}_reportSummary`);
  await expect(summary).toContainText(reported);
  await expect(summary).toHaveAttribute('contenteditable', 'true');
  await expect(summary).toHaveAttribute('aria-readonly', 'false');

  // A large answer starts at about three times a medium one, before either grows with its text.
  const medium = await editorHeight(page, 'occurrenceTime');
  const large = await editorHeight(page, 'reportedMisconduct');
  expect(medium).toBeGreaterThan(0);
  expect(large).toBeGreaterThan(medium * 2.4);

  await expect(document).toContainText('ska bakomliggande orsaker till det inträffade identifieras.');
  await expect(document).toContainText('registreras i fliken Åtgärder.');
});

test('every stance is answered Ja or Ej aktuellt, and the background is saved with the investigation', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installNewInvestigation(page);
  const document = await openLexInvestigation(page, dismissCookieConsent);

  // From 2.4 there is no Nej, and so no motivation of one, to any of the five stances.
  const individualNotified = document.locator(`#${key}_individualNotified`);
  await expect(individualNotified.getByRole('radio')).toHaveCount(2);
  await expect(individualNotified.getByRole('radio', { name: 'Nej', exact: true })).toHaveCount(0);
  await individualNotified.getByRole('radio', { name: 'Ja', exact: true }).check();
  await document
    .locator(`#${key}_representativeNotified`)
    .getByRole('radio', { name: 'Ej aktuellt', exact: true })
    .check();
  for (const stance of [
    'individualNotified',
    'representativeNotified',
    'documentedInRecord',
    'feedbackGiven',
    'requiresPoliceReport',
  ]) {
    await expect(document.locator(`#${key}_${stance}Motivation`)).toHaveCount(0);
  }

  // A misconduct can fall under both SoL and LSS; LEX states which.
  const legalBases = document.locator(`#${key}_legalBases-group`);
  await legalBases.getByText(/^SoL –/u).click();
  await legalBases.getByText(/^LSS –/u).click();
  await document
    .locator('[data-cy="label-classification-type"]')
    .selectOption(iafLabelFixture.classification.executionDeficiency.resourcePath);
  await document
    .locator('[data-cy="label-classification-subtype"]')
    .selectOption(iafLabelFixture.classification.supportNotProvided.resourcePath);
  await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

  await expect.poll(() => trace.puts.filter((put) => put.key === key).length).toBe(1);
  expect(trace.puts.find((put) => put.key === key)?.body).toEqual({
    schemaId: latestSchemaIds[key],
    value: expect.objectContaining({
      legalBases: ['SOL', 'LSS'],
      investigator: 'Iaf Testare',
      reportedEventDescription: `<p>${reported}</p>`,
      reportSummary: `<p>${reported}</p>`,
      reportReceivedDate: '2026-10-06',
      individualNotified: 'yes',
      representativeNotified: 'not_applicable',
    }),
  });
});
