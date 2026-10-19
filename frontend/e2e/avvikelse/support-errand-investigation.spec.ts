import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { CONFIRM_DIALOG } from '../utils/modal';
import { toast } from '../utils/toast';
import {
  allExistingInvestigationDocuments,
  hslDecisionKey,
  misconductDecisionKey,
  solDeviationScenario,
  defaultInvestigationProfile,
  deviationWithoutReportedLegalBase,
  errandNumber,
  existingManagerDocument,
  iafLabelFixture,
  iafPlaceFixture,
  installIafApiMock,
  investigationKeys,
  investigationTabKeys,
  katlaSchemaId,
  latestSchemaIds,
  type MockLabel,
  withHighHslRisk,
} from './fixtures/investigation-flow.mock';

const managerKey = 'utredning-enhetschef';
const solLssKey = 'utredning-sol-lss';
const managerProbabilityGroup = `#${managerKey}_riskAssessmentHsl_probability`;
const classificationFieldSelector = '[data-cy="schema-external-field-errandClassification"]';
// A manager investigation under both HSL and SoL has one categorization selector per group.
const hslClassificationSelector = '[data-cy="avvikelse-label-categorization-HSL"]';
const socialClassificationSelector = '[data-cy="avvikelse-label-categorization-SOL_LSS"]';
/** The default deviation's SoL/LSS path, which an errand the manager investigates under HSL and SoL also needs. */
const socialClassificationLabels: MockLabel[] = [
  {
    id: iafLabelFixture.classification.solLssOwner.id,
    classification: 'PROVISION_CATEGORY',
    displayName: 'SoL/LSS',
    resourceName: 'SOL_LSS',
    resourcePath: iafLabelFixture.classification.solLssOwner.resourcePath,
  },
  {
    id: iafLabelFixture.classification.legalCertainty.id,
    classification: 'CATEGORY',
    displayName: iafLabelFixture.classification.legalCertainty.displayName,
    resourceName: 'LEGAL_CERTAINTY',
    resourcePath: iafLabelFixture.classification.legalCertainty.resourcePath,
  },
  {
    id: iafLabelFixture.classification.deficientHandling.id,
    classification: 'TYPE',
    displayName: iafLabelFixture.classification.deficientHandling.displayName,
    resourceName: 'DEFICIENT_HANDLING',
    resourcePath: iafLabelFixture.classification.deficientHandling.resourcePath,
  },
];
const socialClassificationPatch = {
  classification: {
    category: iafLabelFixture.classification.solLssOwner.resourcePath,
    type: iafLabelFixture.classification.legalCertainty.resourcePath,
  },
  categoryLabels: [
    { id: iafLabelFixture.classification.solLssOwner.id },
    { id: iafLabelFixture.classification.legalCertainty.id },
    { id: iafLabelFixture.classification.deficientHandling.id },
  ],
};
// The schema debug surfaces follow NEXT_PUBLIC_ENVIRONMENT, so the same specs assert both
// directions: visible under a TEST deployment, gone under any other.
const schemaDebugIsVisible = process.env.NEXT_PUBLIC_ENVIRONMENT === 'TEST';

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

/** Spara ärende in the sidebar. */
const errandSaveButton = (page: Page) =>
  page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').filter({ hasText: 'Spara ärende' });

async function openInvestigation(page: Page) {
  await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
  await expect(page.locator('[data-cy="support-investigation-tab"]')).toBeVisible();
}

test.describe('IAF/VOF:s riktiga utredningsflöde', () => {
  for (const [key, tabName] of [
    [managerKey, 'Utredning enhetschef'],
    [solLssKey, 'Utredning Lex Sarah'],
    ['utredning-hsl', 'Händelseanalys HSL'],
  ]) {
    test(`${tabName}: obesvarade val är tomma och alla sektioner öppna från start`, async ({
      page,
      dismissCookieConsent,
    }) => {
      const trace = await installIafApiMock(page, { documents: {} });
      await visitErrand(page, dismissCookieConsent);
      await openInvestigation(page);
      await page.getByRole('tab', { name: tabName, exact: true }).click();
      const document = page.locator(`[data-cy="investigation-document-${key}"]`);
      await expect(document).toBeVisible();

      if (key === managerKey) {
        await document.getByRole('checkbox', { name: /^HSL –/u }).press('Space');
        await document.getByRole('checkbox', { name: /^SoL –/u }).press('Space');
      }

      const sectionButtons = document.locator('.schema-boundary-disclosure .sk-disclosure-header-button');
      await expect(sectionButtons.first()).toBeVisible();
      await expect(
        document.locator('.schema-boundary-disclosure .sk-disclosure-header-button[aria-expanded="false"]')
      ).toHaveCount(0);
      await expect(document.getByRole('radio').first()).toBeVisible();
      await expect(document.locator('input[type="radio"]:checked')).toHaveCount(0);

      const firstRadio = document.getByRole('radio').first();
      await firstRadio.check();
      await expect(firstRadio).toBeChecked();
      await expect(document.locator('input[type="radio"]:checked')).toHaveCount(1);

      await sectionButtons.first().click();
      await expect(sectionButtons.first()).toHaveAttribute('aria-expanded', 'false');
      await sectionButtons.first().click();
      await expect(sectionButtons.first()).toHaveAttribute('aria-expanded', 'true');
      await expect(firstRadio).toBeChecked();
      expect(trace.puts).toHaveLength(0);
    });
  }

  test('bevarar sparade radioval i samtliga utredningsformulär', async ({ page, dismissCookieConsent }) => {
    const documents = allExistingInvestigationDocuments();
    documents[managerKey].value.suspectedMisconduct = 'no';
    // Utredning Lex Sarah answers its stances Ja or Ej aktuellt.
    documents[solLssKey].value.individualNotified = 'not_applicable';
    // Händelseanalys HSL has one choice of its own since the IVO notification moved to the HSL decision.
    documents['utredning-hsl'].value.completed = 'no';
    const trace = await installIafApiMock(page, { documents });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    for (const [key, tabName, field, saved] of [
      [managerKey, 'Utredning enhetschef', 'suspectedMisconduct', 'Nej'],
      [solLssKey, 'Utredning Lex Sarah', 'individualNotified', 'Ej aktuellt'],
      ['utredning-hsl', 'Händelseanalys HSL', 'completed', 'Nej'],
    ]) {
      await page.getByRole('tab', { name: tabName, exact: true }).click();
      const group = page.locator(`#${key}_${field}`);
      await expect(group.getByRole('radio', { name: saved, exact: true })).toBeChecked();
      await expect(group.getByRole('radio', { name: 'Ja', exact: true })).not.toBeChecked();
    }
    expect(trace.puts).toHaveLength(0);
  });

  test('hämtar inte den auth-skyddade profilen på login-sidan', async ({ page }) => {
    const trace = await installIafApiMock(page);

    await page.goto('login');

    await expect(page.locator('[data-cy="loginButton"]')).toBeVisible();
    expect(trace.profileGets).toBe(0);
  });

  test('visar klassificeringen endast i utredningen när utredningsfeaturen äger den', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();

    const basics = page.locator('[role="tabpanel"]:visible');
    await expect(basics.locator('[data-cy="category-input"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="type-input"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);
    // The whole "Om ärendet" section is left out: its fields belong to the report and its categorization
    // to the investigation.
    await expect(basics.getByText('Om ärendet', { exact: true })).toHaveCount(0);
    // The stakeholder section is named by SupportManagement's metadata, which calls the errand
    // owner "Brukare" here - the frontend renders the role's displayName, it does not pick a word.
    await expect(basics.getByText('Brukare', { exact: true })).toBeVisible();
    await expect(basics.getByText('Ärendeägare', { exact: true })).toHaveCount(0);

    await openInvestigation(page);
    await expect(page.locator(classificationFieldSelector)).toHaveCount(1);
  });

  // The brukare is the one stakeholder the handler looks up, and never an employee. The other parties come with the
  // report: nobody searches for one or adds one by hand.
  test('söker bara efter brukaren, och aldrig bland anställda', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page);

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();

    const basics = page.locator('[role="tabpanel"]:visible');
    await expect(basics.locator('[data-cy="search-person-form-PRIMARY"]')).toBeChecked();
    await expect(basics.locator('[data-cy="search-employee-form-PRIMARY"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="registered-applicants"] [data-cy="contact-form"]')).toHaveCount(1);
    await expect(basics.locator('[data-cy="registered-contacts"] [data-cy="contact-form"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="search-person-form-CONTACT"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="search-employee-form-CONTACT"]')).toHaveCount(0);
    await expect(basics.locator('[data-cy="add-manually-button-person"]')).toHaveCount(0);
  });

  // The handler removes the brukare, and edits but never removes another party.
  test('tar bort brukaren men aldrig en övrig part', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      brukare: { partyId: 'brukare-party-id', firstName: 'Britt', lastName: 'Brukare' },
      otherParty: { firstName: 'Olle', lastName: 'Övrig' },
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();

    const basics = page.locator('[role="tabpanel"]:visible');
    const brukare = basics.locator('[data-cy="rendered-PRIMARY"]');
    const otherParty = basics.locator('[data-cy="rendered-CONTACT"]');
    await expect(otherParty).toContainText('Olle Övrig');
    await expect(otherParty.getByRole('button', { name: 'Redigera uppgifter', exact: true })).toBeVisible();
    await expect(otherParty.locator('[data-cy="delete-stakeholder-button"]')).toHaveCount(0);

    await brukare.locator('[data-cy="delete-stakeholder-button"]').click();
    await expect(page.locator(CONFIRM_DIALOG)).toHaveCSS('opacity', '1');
    await page.locator(CONFIRM_DIALOG).getByRole('button', { name: 'Ja', exact: true }).click();
    await expect(brukare).toHaveCount(0);
    // Once the brukare is gone, the search for one is back; the other party stays as it was, and is not made the
    // brukare in its place.
    await expect(basics.locator('[data-cy="search-person-form-PRIMARY"]')).toBeChecked();
    await expect(otherParty).toContainText('Olle Övrig');
    await expect(otherParty.locator('[data-cy="make-stakeholder-owner-button"]')).toHaveCount(0);
  });

  /**
   * The schema debug dump rides on NEXT_PUBLIC_ENVIRONMENT: the local .env sets TEST, so it is
   * on here, and a production deployment substitutes another value and never renders it. It shows
   * the document the page already holds - it makes no request of its own.
   */
  test('visar varje utrednings JSON-värde bara i test- och utvecklingsmiljö', async ({
    page,
    dismissCookieConsent,
  }) => {
    // All three schemas, not only the manager's: they render through the same document component,
    // so the gate has to hold for each of them.
    const documents = allExistingInvestigationDocuments();
    await installIafApiMock(page, { documents });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    for (const [key, tabName] of [
      [managerKey, 'Utredning enhetschef'],
      [solLssKey, 'Utredning Lex Sarah'],
      ['utredning-hsl', 'Händelseanalys HSL'],
    ] as const) {
      await page.getByRole('tab', { name: tabName, exact: true }).click();

      // Every document tab is mounted, so the assertions are scoped to the one on screen.
      const investigationDocument = page.locator(`[data-cy="investigation-document-${key}"]`);
      const debugPanel = investigationDocument.locator('[data-cy="investigation-schema-debug"]');
      // Whether the handler may edit the document is about the errand, and shows in every environment.
      await expect(investigationDocument.getByText(/^(Skrivskyddad|Redigerbar)$/u).first()).toBeVisible();

      if (!schemaDebugIsVisible) {
        // Production shows the errand, not the schema behind it.
        await expect(debugPanel).toHaveCount(0);
        await expect(investigationDocument).not.toContainText('Schema:');
        await expect(investigationDocument).not.toContainText('Ansvarig roll');
        continue;
      }

      await expect(debugPanel).toBeVisible();
      await expect(investigationDocument).toContainText(`Schema: ${documents[key].schemaId}`);
      await expect(investigationDocument).toContainText('Ansvarig roll');

      const disclosureButton = debugPanel.getByRole('button').first();
      await expect(disclosureButton).toHaveAttribute('aria-expanded', 'false');
      await disclosureButton.click();
      await expect(disclosureButton).toHaveAttribute('aria-expanded', 'true');
      // Asserted against this document's own data, since the three schemas share no field.
      const [firstField] = Object.keys(documents[key].value);
      await expect(debugPanel.locator('[data-cy="schema-form-data-preview"]')).toContainText(`"${firstField}"`);
    }
  });

  test('renderar exakt de dokument som den aktuella appens profil tillåter', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    const managerDocument = profile.documents.find(({ key }) => key === managerKey)!;
    const solLssDocument = profile.documents.find(({ key }) => key === solLssKey)!;
    profile.documents = [
      { ...solLssDocument, tabLabel: 'Först: SoL/LSS' },
      { ...managerDocument, tabLabel: 'Sedan: enhetschef' },
    ];
    const trace = await installIafApiMock(page, { investigationProfile: profile });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const investigation = page.locator('[data-cy="support-investigation-tab"]');
    await expect(investigation.getByRole('tab')).toHaveCount(2);
    await expect(investigation.getByRole('tab').nth(0)).toHaveText('Först: SoL/LSS');
    await expect(investigation.getByRole('tab').nth(1)).toHaveText('Sedan: enhetschef');
    await expect(investigation.getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toHaveCount(0);
    await expect.poll(() => [...new Set(trace.documentGets)].sort()).toEqual([managerKey, solLssKey].sort());
  });

  test('håller dokumentnyckeln skild från schemanamnet', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    profile.documents = [
      {
        key: 'manager-investigation',
        schemaName: 'utredning-enhetschef',
        tabLabel: 'Profilstyrd utredning',
        ownerLabel: 'Testroll',
      },
    ];
    const trace = await installIafApiMock(page, {
      documents: {},
      investigationProfile: profile,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const investigation = page.locator('[data-cy="support-investigation-tab"]');
    await expect(investigation.getByRole('tab')).toHaveCount(1);
    await expect(investigation.getByRole('tab', { name: 'Profilstyrd utredning', exact: true })).toBeVisible();
    await expect(page.locator('[data-cy="investigation-document-manager-investigation"]')).toBeVisible();
    await expect.poll(() => [...new Set(trace.documentGets)]).toEqual(['manager-investigation']);
    await expect.poll(() => [...new Set(trace.latestSchemaNames)]).toEqual(['utredning-enhetschef']);
  });

  test('filtrerar en profilkonfigurerad dokumentnyckel från Ärendeuppgifter', async ({
    page,
    dismissCookieConsent,
  }) => {
    const profile = defaultInvestigationProfile();
    profile.documents = [
      {
        key: 'manager-investigation',
        schemaName: 'utredning-enhetschef',
        tabLabel: 'Profilstyrd utredning',
        ownerLabel: 'Testroll',
      },
    ];
    const existing = existingManagerDocument();
    existing.key = 'manager-investigation';
    existing.value.investigationText = '<p>SKA ENDAST VISAS UNDER PROFILENS UTREDNING</p>';
    await installIafApiMock(page, {
      documents: { 'manager-investigation': existing },
      investigationProfile: profile,
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();

    const details = page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true }).locator('..');
    await expect(details.getByRole('textbox', { name: 'Händelse från Katla', exact: true })).toHaveValue(
      'Katla från web-app-katla-sm'
    );
    await expect(details).not.toContainText('SKA ENDAST VISAS UNDER PROFILENS UTREDNING');
  });

  /**
   * Grundinformation has no "Om ärendet" section for avvikelse, so the categorization control it
   * used to fall back into is gone with it. The errand must still be savable, and the save must
   * leave the classification alone rather than resending a value nobody could see.
   */
  test('skriver ingen klassificering från Grundinformation när IAF/VOF:s ägardokument saknas', async ({
    page,
    dismissCookieConsent,
  }) => {
    const profile = defaultInvestigationProfile();
    profile.documents = profile.documents.filter(({ schemaName }) => schemaName === 'utredning-enhetschef');
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      investigationProfile: profile,
      // Priority is a sidebar field, and the sidebar needs the errand to be the signed-in
      // handler's own. The mock signs in as iaf.test.
      assignedUserId: 'iaf.test',
    });

    await visitErrand(page, dismissCookieConsent);
    await expect(page.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="label-classification-type"]')).toHaveCount(0);

    await page.locator('[data-cy="priority-input"]').selectOption('HIGH');
    await page
      .locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')
      .filter({ hasText: 'Spara ärende' })
      .click();
    await expect.poll(() => trace.errandPatches.length).toBe(1);
    expect(trace.errandPatches[0]).toEqual(expect.objectContaining({ priority: 'HIGH' }));
    expect(trace.errandPatches[0]).not.toHaveProperty('classification');
    expect(trace.errandPatches[0]).not.toHaveProperty('labels');

    await openInvestigation(page);
    await expect(page.locator(classificationFieldSelector)).toHaveCount(0);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('faller säkert tillbaka när profilen inte går att läsa', async ({ page, dismissCookieConsent }) => {
    const existing = existingManagerDocument();
    existing.value.investigationText = '<p>BEFINTLIG UTREDNING SKA VARA SYNLIG</p>';
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      // A state the client does not know, so the profile is refused rather than guessed at.
      investigationProfileResponse: {
        state: 'paused',
        registration: { mode: 'enabled' },
        documents: [],
      },
    });

    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="investigation-profile-error"]')).toBeVisible();
    // The tab does not hang on the profile: it stays and explains itself, while the notice above the
    // tab strip is what warns from any other tab.
    await expect(page.getByRole('tab', { name: 'Utredning', exact: true })).toHaveCount(1);
    // No categorization control is left to fall back to: avvikelse renders no "Om ärendet" at all.
    await expect(page.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
    await expect(page.getByText('BEFINTLIG UTREDNING SKA VARA SYNLIG', { exact: false })).toBeVisible();
    expect(trace.profileGets).toBe(1);
  });

  test('låter orelaterade ärendefält sparas när klassificeringsägarskapet är otillgängligt', async ({
    page,
    dismissCookieConsent,
  }) => {
    const profile = defaultInvestigationProfile();
    profile.state = 'unavailable';
    // Priority is a sidebar field, and the sidebar needs the errand to be the signed-in handler's
    // own. The mock signs in as iaf.test.
    const trace = await installIafApiMock(page, { investigationProfile: profile, assignedUserId: 'iaf.test' });

    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="investigation-profile-unavailable"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Utredning', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);

    await page.locator('[data-cy="priority-input"]').selectOption('HIGH');
    await page
      .locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')
      .filter({ hasText: 'Spara ärende' })
      .click();

    await expect.poll(() => trace.errandPatches.length).toBe(1);
    expect(trace.errandPatches[0]).toEqual(expect.objectContaining({ priority: 'HIGH' }));
    expect(trace.errandPatches[0]).not.toHaveProperty('classification');
    expect(trace.errandPatches[0]).not.toHaveProperty('labels');

    // Asserted last on purpose: opening Utredning hides Grundinformation, and the steps
    // above operate on it.
    await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
    await expect(page.locator('[data-cy="investigation-tab-unavailable"]')).toBeVisible();
  });

  test('låter orelaterade ärendefält sparas när profilhämtningen misslyckas', async ({
    page,
    dismissCookieConsent,
  }) => {
    // Priority is a sidebar field, and the sidebar needs the errand to be the signed-in handler's
    // own. The mock signs in as iaf.test.
    const trace = await installIafApiMock(page, { investigationProfileStatus: 500, assignedUserId: 'iaf.test' });

    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="investigation-profile-error"]')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Utredning', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);

    await page.locator('[data-cy="priority-input"]').selectOption('HIGH');
    await page
      .locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')
      .filter({ hasText: 'Spara ärende' })
      .click();

    await expect.poll(() => trace.errandPatches.length).toBe(1);
    expect(trace.errandPatches[0]).toEqual(expect.objectContaining({ priority: 'HIGH' }));
    expect(trace.errandPatches[0]).not.toHaveProperty('classification');
    expect(trace.errandPatches[0]).not.toHaveProperty('labels');
  });

  test('behandlar en tom inaktiv profil som ett explicit legacyflöde', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    profile.state = 'inactive';
    profile.documents = [];
    await installIafApiMock(page, { investigationProfile: profile });

    await visitErrand(page, dismissCookieConsent);

    await expect(page.getByRole('tab', { name: 'Utredning', exact: true })).toHaveCount(1);
    await expect(page.locator('[data-cy="investigation-profile-error"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="investigation-profile-unavailable"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="avvikelse-label-categorization"]')).toHaveCount(0);

    await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
    await expect(page.locator('[data-cy="investigation-tab-not-configured"]')).toBeVisible();
  });

  for (const ownerCase of [
    { eventType: 'AVVIKELSE', ownerKey: 'manager-investigation' },
    { eventType: 'MISSFORHALLANDE', ownerKey: 'misconduct-investigation' },
  ] as const) {
    test(`löser IAF/VOF-regelns ägardokument via profilnycklar för ${ownerCase.eventType}`, async ({
      page,
      dismissCookieConsent,
    }) => {
      const profile = defaultInvestigationProfile();
      profile.documents = [
        {
          key: 'manager-investigation',
          schemaName: 'utredning-enhetschef',
          tabLabel: 'Chefens utredning',
          ownerLabel: 'Enhetschef',
        },
        {
          key: 'misconduct-investigation',
          schemaName: 'utredning-sol-lss',
          tabLabel: 'Missförhållandeutredning',
          ownerLabel: 'Lex Sarah',
        },
      ];
      const sourceDocuments = allExistingInvestigationDocuments();
      const trace = await installIafApiMock(page, {
        documents: {
          'manager-investigation': {
            ...sourceDocuments['utredning-enhetschef'],
            key: 'manager-investigation',
          },
          'misconduct-investigation': {
            ...sourceDocuments['utredning-sol-lss'],
            key: 'misconduct-investigation',
          },
        },
        eventType: ownerCase.eventType,
        investigationProfile: profile,
      });

      await visitErrand(page, dismissCookieConsent);
      await openInvestigation(page);

      for (const { key } of profile.documents) {
        await expect(
          page.locator(`[data-cy="investigation-document-${key}"]`).locator(classificationFieldSelector)
        ).toHaveCount(key === ownerCase.ownerKey ? 1 : 0);
      }

      if (ownerCase.eventType === 'MISSFORHALLANDE') {
        await page.getByRole('tab', { name: 'Missförhållandeutredning', exact: true }).click();
      }
      const ownerDocument = page.locator(`[data-cy="investigation-document-${ownerCase.ownerKey}"]`);
      const ownerClassification = ownerDocument.locator(classificationFieldSelector);
      if (ownerCase.eventType === 'MISSFORHALLANDE') {
        await ownerClassification
          .locator('[data-cy="label-classification-type"]')
          .selectOption(iafLabelFixture.classification.executionDeficiency.resourcePath);
        await ownerClassification
          .locator('[data-cy="label-classification-subtype"]')
          .selectOption(iafLabelFixture.classification.supportNotProvided.resourcePath);
      } else {
        await ownerClassification
          .locator(hslClassificationSelector)
          .locator('[data-cy="label-classification-type"]')
          .selectOption(iafLabelFixture.classification.medication.resourcePath);
        await ownerClassification
          .locator(hslClassificationSelector)
          .locator('[data-cy="label-classification-subtype"]')
          .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
      }
      await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

      await expect.poll(() => trace.classificationPatches.length).toBe(1);
      expect(trace.puts).toHaveLength(0);
      expect(trace.classificationPatches[0].body).toEqual(
        expect.objectContaining({
          documentKey: ownerCase.ownerKey,
          documentETag:
            ownerCase.eventType === 'MISSFORHALLANDE'
              ? sourceDocuments['utredning-sol-lss'].etag
              : sourceDocuments['utredning-enhetschef'].etag,
        })
      );
    });
  }

  test('visar tre dokumentflikar och låser ett befintligt dokument till dess exakta schemaversion', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existing } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const investigation = page.locator('[data-cy="support-investigation-tab"]');
    // VC kommentar HSL opens only once MAS/MAR has asked the head of operations for their comment.
    await expect(investigation.getByRole('tab')).toHaveText([
      'Utredning enhetschef',
      'Utredning Lex Sarah',
      'Händelseanalys HSL',
    ]);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    if (schemaDebugIsVisible) {
      await expect(managerDocument).toContainText(`Schema: ${existing.schemaId}`);
    } else {
      await expect(managerDocument).not.toContainText(`Schema: ${existing.schemaId}`);
    }
    const classificationField = managerDocument.locator(classificationFieldSelector);
    await expect(classificationField).toBeVisible();
    await expect(classificationField.getByRole('heading', { name: 'Ange avvikelsetyp', exact: true })).toBeVisible();
    const hslClassification = classificationField.locator(hslClassificationSelector);
    await expect(hslClassification.getByRole('combobox', { name: 'Avvikelsetyp (obligatoriskt)' })).toHaveValue(
      iafLabelFixture.classification.rehab.resourcePath
    );
    await expect(hslClassification.getByRole('combobox', { name: 'Underkategori (obligatorisk)' })).toHaveValue(
      iafLabelFixture.classification.missedAssessment.resourcePath
    );
    const socialClassification = classificationField.locator(socialClassificationSelector);
    await expect(socialClassification.getByRole('combobox', { name: 'Avvikelsetyp (obligatoriskt)' })).toHaveValue(
      iafLabelFixture.classification.legalCertainty.resourcePath
    );
    await expect(socialClassification.getByRole('combobox', { name: 'Underkategori (obligatorisk)' })).toHaveValue(
      iafLabelFixture.classification.deficientHandling.resourcePath
    );
    const schemaFieldOrder = await managerDocument
      .locator(`#${managerKey}_legalBases-group, ${classificationFieldSelector}`)
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-cy') ?? element.id));
    expect(schemaFieldOrder).toEqual([`${managerKey}_legalBases-group`, 'schema-external-field-errandClassification']);
    await expect(page.getByRole('textbox', { name: 'Utredningstext', exact: true })).toContainText(
      'Enhetschefens samlade utredning.'
    );

    await investigation.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();
    await expect(page.locator('[data-cy="investigation-document-utredning-sol-lss"]')).toBeVisible();
    await investigation.getByRole('tab', { name: 'Händelseanalys HSL', exact: true }).click();
    await expect(page.locator('[data-cy="investigation-document-utredning-hsl"]')).toBeVisible();

    // Without a phase model the Beslut tab is offered as well, and it reads the decision on this HSL deviation.
    await expect
      .poll(() => [...new Set(trace.documentGets)].sort())
      .toEqual([...investigationTabKeys, hslDecisionKey].sort());
    await expect
      .poll(() => [...new Set(trace.latestSchemaNames)].sort())
      .toEqual(['utredning-hsl', 'utredning-sol-lss', hslDecisionKey].sort());
    expect(trace.latestSchemaNames).not.toContain(managerKey);
    expect(trace.exactSchemaIds).toContain(existing.schemaId);
  });

  test('döljer de utredningsdelar användaren saknar behörighet till', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      investigationProfile: profile,
      documentAccess: { [managerKey]: 'edit' },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const investigation = page.locator('[data-cy="support-investigation-tab"]');
    await expect(investigation.getByRole('tab')).toHaveCount(1);
    await expect(investigation.getByRole('tab', { name: 'Utredning enhetschef', exact: true })).toBeVisible();
    await expect(investigation.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true })).toHaveCount(0);
    await expect(investigation.getByRole('tab', { name: 'Händelseanalys HSL', exact: true })).toHaveCount(0);
    await expect(page.locator('[data-cy="investigation-document-utredning-hsl"]')).toHaveCount(0);
  });

  test('visar en utredningsdel med enbart läsbehörighet skrivskyddad', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      investigationProfile: profile,
      documentAccess: Object.fromEntries(
        profile.documents.map(({ key }) => [key, key === managerKey ? 'read' : 'edit'])
      ),
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    // A read grant keeps the tab, unlike a hidden one, and only takes the writing away.
    const investigation = page.locator('[data-cy="support-investigation-tab"]');
    await expect(investigation.getByRole('tab')).toHaveCount(investigationTabKeys.length);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await expect(managerDocument).toContainText('Utredningen kan läsas men inte ändras');
    await expect(page.locator(managerProbabilityGroup).getByLabel(/^1 –/u)).toBeDisabled();

    await investigation.getByRole('tab', { name: 'Händelseanalys HSL', exact: true }).click();
    const hslDocument = page.locator('[data-cy="investigation-document-utredning-hsl"]');
    await expect(
      hslDocument.locator('#utredning-hsl_completed').getByRole('radio', { name: 'Ja', exact: true })
    ).toBeEnabled();
  });

  test('beslutsfliken säger att det inte finns något att besluta om för en vanlig avvikelse utan lagrum HSL', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'AVVIKELSE', ...solDeviationScenario() });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await expect(page.locator('[data-cy="support-investigation-tab"]').getByRole('tab')).toHaveCount(
      investigationTabKeys.length
    );

    // The tab is always there, and tells the handler that a SoL deviation calls for no decision.
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    const decisionTab = page.locator('[data-cy="support-decision-tab"]');
    await expect(decisionTab.locator('[data-cy="decision-tab-nothing-to-do"]')).toHaveText(
      'Det finns inget att besluta om. Gå vidare till uppföljning.'
    );
    await expect(decisionTab.getByRole('heading', { name: 'Beslut' })).toHaveCount(0);
    await expect(decisionTab.getByRole('tab')).toHaveCount(0);
    expect(trace.documentGets).not.toContain(hslDecisionKey);
    expect(trace.documentGets).not.toContain(misconductDecisionKey);
  });

  // Reports rarely name a legal base: the unit manager's investigation does, and the BFF marks the errand when it
  // assesses a high HSL risk. That mark is what brings MAS/MAR to the errand, so it offers them their decision too.
  test('MAS/MAR erbjuds Beslut HSL på en avvikelse med hög HSL-risk som inte rapporterats under något lagrum', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      roleKeys: ['mas-mar'],
      documents: {},
      eventType: 'AVVIKELSE',
      ...withHighHslRisk({ reportedUnderHsl: false }),
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    const decisionTab = page.locator('[data-cy="support-decision-tab"]');
    await expect(decisionTab.locator('[data-cy="decision-tab-nothing-to-do"]')).toHaveCount(0);
    await expect(decisionTab.getByRole('tab')).toHaveCount(1);
    const document = page.locator(`[data-cy="investigation-document-${hslDecisionKey}"]`);
    await expect(document).toBeVisible();
    await expect(document).toContainText('Ansvarig roll: MAS/MAR');
    await expect.poll(() => trace.latestSchemaNames).toContain(hslDecisionKey);
    expect(trace.documentGets).not.toContain(misconductDecisionKey);
  });

  test('chefen får veta att MAS/MAR fattar beslutet på en avvikelse med hög HSL-risk', async ({
    page,
    dismissCookieConsent,
  }) => {
    const profile = defaultInvestigationProfile();
    await installIafApiMock(page, {
      roleKeys: ['enhetschef'],
      documents: {},
      eventType: 'AVVIKELSE',
      investigationProfile: profile,
      documentAccess: Object.fromEntries(
        profile.documents.map(({ key }) => [key, key === hslDecisionKey ? 'hidden' : 'edit'])
      ),
      ...withHighHslRisk({ reportedUnderHsl: false }),
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    await expect(
      page.locator('[data-cy="support-decision-tab"]').locator('[data-cy="decision-tab-nothing-to-do"]')
    ).toHaveText('Beslutet fattas av MAS/MAR.');
  });

  test('utan rapporterat lagrum och utan hög HSL-risk finns inget att besluta om', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      roleKeys: ['mas-mar'],
      documents: {},
      eventType: 'AVVIKELSE',
      ...deviationWithoutReportedLegalBase(),
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    await expect(
      page.locator('[data-cy="support-decision-tab"]').locator('[data-cy="decision-tab-nothing-to-do"]')
    ).toHaveText('Det finns inget att besluta om. Gå vidare till uppföljning.');
    expect(trace.documentGets).not.toContain(hslDecisionKey);
  });

  test('sparar IVO-beslutet för en vanlig HSL-avvikelse och kräver Public 360 vid anmälan', async ({
    page,
    dismissCookieConsent,
  }) => {
    // The default deviation carries the HSL legal base.
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'AVVIKELSE' });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await expect(page.locator('[data-cy="support-investigation-tab"]').getByRole('tab')).toHaveCount(
      investigationTabKeys.length
    );

    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    const decisionTab = page.locator('[data-cy="support-decision-tab"]');
    await expect(decisionTab).toBeVisible();
    // Only the HSL decision applies; the lex Sarah decision is neither shown nor fetched.
    await expect(decisionTab.getByRole('tab')).toHaveCount(1);
    const document = page.locator(`[data-cy="investigation-document-${hslDecisionKey}"]`);
    await expect(document).toBeVisible();
    await expect(document).toContainText('Ansvarig roll: MAS/MAR');
    await expect.poll(() => trace.latestSchemaNames).toContain(hslDecisionKey);
    expect(trace.documentGets).not.toContain(misconductDecisionKey);
    await expect(page.locator('[data-cy="investigation-decision-proposal"]')).toHaveCount(0);

    // Both case numbers exist only once the errand is reported to IVO; Public 360 is then required.
    // The decision timestamps and revisions are the server's and are never asked for.
    const ivoNotification = document.locator(`#${hslDecisionKey}_ivoNotification`);
    const public360 = document.locator(`#${hslDecisionKey}_public360CaseNumber`);
    await expect(document.locator(`label[for="${hslDecisionKey}_ivoNotification"]`)).toContainText('(Obligatorisk)');
    await expect(public360).toHaveCount(0);
    await expect(document.locator(`#${hslDecisionKey}_ivoCaseNumber`)).toHaveCount(0);
    for (const serverField of ['decidedAt', 'updatedAt', 'revisions']) {
      await expect(document.locator(`#${hslDecisionKey}_${serverField}`)).toHaveCount(0);
    }
    await ivoNotification.getByRole('radio', { name: 'Nej', exact: true }).check();
    await expect(public360).toHaveCount(0);
    await ivoNotification.getByRole('radio', { name: 'Ja', exact: true }).check();
    await expect(public360).toBeVisible();
    await expect(document.locator(`label[for="${hslDecisionKey}_public360CaseNumber"]`)).toHaveText(
      'Public 360 ärendenummer (Obligatorisk)'
    );
    await expect(document.locator(`#${hslDecisionKey}_ivoCaseNumber`)).toHaveCount(1);

    // Reporting to IVO without a Public 360 number is refused before anything is written.
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
    await expect(document.locator('[data-cy="schema-form-error-summary"]')).toBeVisible();
    expect(trace.puts).toHaveLength(0);

    await document.locator(`#${hslDecisionKey}_public360CaseNumber`).fill('P360-2026-5678');
    await document.locator(`#${hslDecisionKey}_ivoCaseNumber`).fill('IVO-2026-1234');
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.puts[0].key).toBe(hslDecisionKey);
    expect(trace.puts[0].headers['if-none-match']).toBe('*');
    expect(trace.puts[0].body).toEqual({
      schemaId: `2281_${hslDecisionKey}_1.2`,
      value: {
        ivoNotification: 'yes',
        ivoCaseNumber: 'IVO-2026-1234',
        public360CaseNumber: 'P360-2026-5678',
      },
    });
    expect(trace.classificationPatches).toHaveLength(0);
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
  });

  test('sparar lex Sarah-beslutet om ett missförhållande med utredarens förslag intill', async ({
    page,
    dismissCookieConsent,
  }) => {
    const investigations = allExistingInvestigationDocuments();
    const trace = await installIafApiMock(page, {
      documents: { 'utredning-sol-lss': investigations['utredning-sol-lss'] },
      eventType: 'MISSFORHALLANDE',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    // A misconduct is never analysed under HSL, so Händelseanalys HSL is not among its tabs.
    await expect(page.locator('[data-cy="support-investigation-tab"]').getByRole('tab')).toHaveCount(
      investigationTabKeys.filter((key) => key !== 'utredning-hsl').length
    );
    await expect(
      page.locator('[data-cy="support-investigation-tab"]').getByRole('tab', { name: 'Beslut', exact: true })
    ).toHaveCount(0);

    // The decision closes the case, so its tab follows the measures.
    const errandTabNames = await page.getByRole('tablist').first().getByRole('tab').allInnerTexts();
    expect(errandTabNames.indexOf('Åtgärder')).toBeGreaterThan(-1);
    expect(errandTabNames.indexOf('Åtgärder')).toBeLessThan(errandTabNames.indexOf('Beslut'));

    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    const decisionTab = page.locator('[data-cy="support-decision-tab"]');
    await expect(decisionTab).toBeVisible();
    // Only the lex Sarah decision applies to a reported misconduct, whatever its legal bases.
    await expect(decisionTab.getByRole('tab')).toHaveCount(1);
    const document = page.locator(`[data-cy="investigation-document-${misconductDecisionKey}"]`);
    await expect(document).toBeVisible();
    await expect(document).toContainText('Ansvarig roll: LEX-ansvarig');
    await expect.poll(() => trace.latestSchemaNames).toContain(misconductDecisionKey);
    expect(trace.documentGets).not.toContain(hslDecisionKey);

    // Until the decision is saved, the one about to take it is shown as it will be recorded: by name, as LEX-ansvarig.
    const decisionMaker = document.locator('[data-cy="investigation-document-author"]');
    await expect(decisionMaker.getByRole('heading', { name: 'Beslutsfattare', exact: true })).toBeVisible();
    await expect(decisionMaker).toContainText('Iaf Testare');
    await expect(decisionMaker).toContainText('LEX-ansvarig');

    // The investigator's proposal from the SoL/LSS investigation is shown read-only, never copied.
    const proposal = document.locator('[data-cy="investigation-decision-proposal"]');
    await expect(proposal).toContainText('Förslag till beslut från utredning SoL/LSS');
    await expect(proposal.locator('[data-cy="investigation-decision-proposal-degree"]')).toHaveText('Missförhållande');
    await expect(proposal.locator('[data-cy="investigation-decision-proposal-motivation"]')).toContainText(
      'Utredarens samlade motivering.'
    );
    await expect(document.locator('[data-cy="investigation-document-prerequisite"]')).toHaveCount(0);

    // The case numbers only appear once the errand is reported to IVO.
    await expect(document.locator(`#${misconductDecisionKey}_ivoCaseNumber`)).toHaveCount(0);
    await expect(document.locator(`#${misconductDecisionKey}_public360CaseNumber`)).toHaveCount(0);
    // The classification spans the form: the UI schema's width wins over the widget's capped default.
    const classification = document.locator(`#${misconductDecisionKey}_decidedMisconductDegree`);
    await expect(classification).toHaveClass(/\bw-full\b/u);
    await expect(classification).not.toHaveClass(/max-w-\[48rem\]/u);
    await classification.selectOption('tangible_risk_of_serious_misconduct');
    // The provisions the decision is taken under: lex Sarah's own, one or both.
    const decisionLegalBases = document.locator(`#${misconductDecisionKey}_decisionLegalBases-group`);
    await expect(document.getByRole('group', { name: 'Ange lagrum', exact: true })).toBeVisible();
    await expect(decisionLegalBases.getByLabel('24 e § LSS', { exact: true })).not.toBeChecked();
    await decisionLegalBases.getByText('27 kap 5 § SoL', { exact: true }).click();
    await document.locator(`#${misconductDecisionKey}_decisionMotivation`).fill('Risken var påtaglig.');
    await document
      .locator(`#${misconductDecisionKey}_ivoNotification`)
      .getByRole('radio', { name: 'Ja', exact: true })
      .check();
    await expect(document.locator(`#${misconductDecisionKey}_ivoCaseNumber`)).toHaveCount(1);
    await document.locator(`#${misconductDecisionKey}_public360CaseNumber`).fill('P360-2026-8765');
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.puts[0].key).toBe(misconductDecisionKey);
    expect(trace.puts[0].headers['if-none-match']).toBe('*');
    // Who decided is not in what the browser sends: the BFF records it.
    expect(trace.puts[0].body).toEqual({
      schemaId: `2281_${misconductDecisionKey}_1.4`,
      value: {
        decidedMisconductDegree: 'tangible_risk_of_serious_misconduct',
        decisionLegalBases: ['sol_27_5'],
        decisionMotivation: '<p>Risken var påtaglig.</p>',
        ivoNotification: 'yes',
        public360CaseNumber: 'P360-2026-8765',
      },
    });
    expect(trace.classificationPatches).toHaveLength(0);
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
  });

  test('spärrar lex Sarah-beslutet tills utredningen SoL/LSS har sparats i ärendet', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'MISSFORHALLANDE' });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();

    const document = page.locator(`[data-cy="investigation-document-${misconductDecisionKey}"]`);
    await expect(document).toBeVisible();
    await expect(document.locator('[data-cy="investigation-document-prerequisite"]')).toContainText(
      'Beslutet kan fattas först när Utredning Lex Sarah har sparats i ärendet.'
    );
    await expect(document.locator('[data-cy="investigation-decision-proposal"]')).toHaveCount(0);
    await expect(document.locator(`#${misconductDecisionKey}_decisionMotivation`)).not.toBeEditable();
    expect(trace.puts).toHaveLength(0);
  });

  // B4. After LEX hands the errand back, the unit manager reads the decision but not the lex Sarah investigation
  // it answers, so the errand they are given carries the one and not the other.
  test('visar ingen förutsättningsvarning för ett fattat beslut när läsaren inte ser utredningen det besvarar', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: { [misconductDecisionKey]: allExistingInvestigationDocuments()[misconductDecisionKey] },
      eventType: 'MISSFORHALLANDE',
      documentAccess: { [managerKey]: 'edit', [misconductDecisionKey]: 'read' },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();

    const document = page.locator(`[data-cy="investigation-document-${misconductDecisionKey}"]`);
    await expect(document.locator(`#${misconductDecisionKey}_decisionMotivation`)).toBeVisible();
    await expect(document.locator('[data-cy="investigation-document-prerequisite"]')).toHaveCount(0);
    await expect(document).not.toContainText('kan fattas först när');
    // The decision is by whoever took it, as the document records - not by whoever reads it.
    const decisionMaker = document.locator('[data-cy="investigation-document-author"]');
    await expect(decisionMaker).toContainText('Lena Lexberg');
    await expect(decisionMaker).toContainText('LEX-ansvarig');
    await expect(decisionMaker).not.toContainText('Iaf Testare');
  });

  // Ä5. MAS/MAR may decide that the event is not to be analysed. The reason is all such an analysis needs to be
  // complete, and the reason belongs to that decision alone.
  test('MAS/MAR markerar händelseanalysen klar med beslutet att inte händelseanalysera', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'AVVIKELSE' });
    const reason = 'Händelsen har inte lett till någon vårdskada.';

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page
      .locator('[data-cy="support-investigation-tab"]')
      .getByRole('tab', { name: 'Händelseanalys HSL', exact: true })
      .click();
    const document = page.locator('[data-cy="investigation-document-utredning-hsl"]');
    const motivation = document.getByRole('textbox', {
      name: 'Motivera beslut om att inte händelseanalysera',
      exact: true,
    });
    await expect(motivation).toHaveCount(0);

    await document
      .locator('#utredning-hsl_analysisDecision')
      .getByRole('radio', { name: 'Inte ska händelseanalyseras', exact: true })
      .check();
    await motivation.fill(reason);
    await document.locator('#utredning-hsl_completed').getByRole('radio', { name: 'Ja', exact: true }).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.puts[0].body).toEqual({
      schemaId: latestSchemaIds['utredning-hsl'],
      value: expect.objectContaining({
        analysisDecision: 'not_analyze',
        notAnalyzedMotivation: reason,
        completed: 'yes',
      }),
    });
    await expect(document.locator('[data-cy="investigation-document-locked"]')).toBeVisible();
  });

  test('markerar HSL-utredningen klar, låser den, skapar numrerade rapporter och låser upp igen', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'AVVIKELSE' });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page
      .locator('[data-cy="support-investigation-tab"]')
      .getByRole('tab', { name: 'Händelseanalys HSL', exact: true })
      .click();
    const document = page.locator('[data-cy="investigation-document-utredning-hsl"]');
    await expect(document).toBeVisible();

    // Nothing to report until the document is saved as completed.
    const controls = document.locator('[data-cy="investigation-report-utredning-hsl"]');
    await expect(controls).toBeVisible();
    await expect(controls.locator('[data-cy="investigation-report-generate"]')).toBeDisabled();
    await expect(controls.locator('[data-cy="investigation-report-unlock"]')).toHaveCount(0);
    await expect(document.locator('[data-cy="investigation-document-locked"]')).toHaveCount(0);

    // Ä5. The analysis is complete once MAS/MAR has decided it is made, and made as the analysis asks.
    await document
      .locator('#utredning-hsl_analysisDecision')
      .getByRole('radio', { name: 'Ska händelseanalyseras', exact: true })
      .check();
    await document.locator('#utredning-hsl_completed').getByRole('radio', { name: 'Ja', exact: true }).check();
    // MAS/MAR's investigation is not handed on to LEX-ansvarig: finishing it is told to save, and nothing more.
    await expect(controls.locator('[data-cy="investigation-report-completed-notice"]')).toHaveText(
      'Din del av utredningen är klar. Tryck på Spara ärende. Ärendet behöver inte tilldelas någon.'
    );
    // Only the lex Sarah investigator proposes measures, so only their investigation reminds of them.
    await expect(controls.locator('[data-cy="investigation-measures-reminder"]')).toHaveCount(0);
    // Nor is a finished HSL investigation told that the errand has no measures: that is said to the unit manager.
    await expect(controls.locator('[data-cy="investigation-no-measures-notice"]')).toHaveCount(0);
    // One click saves the form as completed and creates the report.
    await expect(controls.locator('[data-cy="investigation-report-generate"]')).toBeEnabled();
    const writesBeforeReport = trace.writeRequestGroupIds.length;
    await controls.locator('[data-cy="investigation-report-generate"]').click();
    await expect.poll(() => trace.puts.length).toBe(1);
    // The form never sends the server-owned report log, whatever RJSF defaulted it to.
    expect(trace.puts[0].body).toEqual({
      schemaId: latestSchemaIds['utredning-hsl'],
      value: expect.objectContaining({ completed: 'yes' }),
    });
    expect(trace.puts[0].body).not.toHaveProperty(['value', 'reports']);

    // Saved as completed: locked, read-only, and the report followed the save.
    await expect(document.locator('[data-cy="investigation-document-locked"]')).toBeVisible();
    await expect(
      document.locator('#utredning-hsl_completed').getByRole('radio', { name: 'Ja', exact: true })
    ).toBeDisabled();
    await expect.poll(() => trace.reports.length).toBe(1);
    expect(trace.reports[0]).toEqual({ key: 'utredning-hsl', preview: false });
    await expect(toast(page, 'Rapporten Rapport_1.pdf har skapats')).toBeVisible();
    await expect(controls.locator('[data-cy="investigation-report-list"]')).toContainText('Rapport_1.pdf');
    // The save and the report are one action for Support Management: one notification, not one for each write.
    const reportGroupIds = trace.writeRequestGroupIds.slice(writesBeforeReport);
    expect(reportGroupIds).toHaveLength(2);
    expect(reportGroupIds[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(new Set(reportGroupIds).size).toBe(1);

    // A second report gets the next number; the document stays locked in between.
    await controls.locator('[data-cy="investigation-report-generate"]').click();
    await expect.poll(() => trace.reports.length).toBe(2);
    await expect(controls.locator('[data-cy="investigation-report-list"]')).toContainText('Rapport_2.pdf');
    expect(trace.puts).toHaveLength(1);

    // Unlocking is the one write a locked document accepts from the form.
    await controls.locator('[data-cy="investigation-report-unlock"]').click();
    await expect.poll(() => trace.puts.length).toBe(2);
    expect(trace.puts[1].body).toEqual(
      expect.objectContaining({ value: expect.objectContaining({ completed: 'no' }) })
    );
    await expect(toast(page, 'Utredningen är upplåst och kan ändras igen.')).toBeVisible();
    await expect(document.locator('[data-cy="investigation-document-locked"]')).toHaveCount(0);
    await expect(
      document.locator('#utredning-hsl_completed').getByRole('radio', { name: 'Ja', exact: true })
    ).toBeEnabled();
    // Unlocked and answered Nej again: the report has to wait for a new Ja.
    await expect(controls.locator('[data-cy="investigation-report-generate"]')).toBeDisabled();
  });

  test('beslutsfliken säger vem som fattar beslutet när det är en annan rolls', async ({
    page,
    dismissCookieConsent,
  }) => {
    const profile = defaultInvestigationProfile();
    await installIafApiMock(page, {
      documents: {},
      eventType: 'MISSFORHALLANDE',
      investigationProfile: profile,
      documentAccess: Object.fromEntries(
        profile.documents.map(({ key }) => [key, key === misconductDecisionKey ? 'hidden' : 'edit'])
      ),
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    // The decision is the LEX role's: this handler is told who takes it, and nothing else.
    await page.getByRole('tab', { name: 'Beslut', exact: true }).click();
    const decisionTab = page.locator('[data-cy="support-decision-tab"]');
    await expect(decisionTab.locator('[data-cy="decision-tab-nothing-to-do"]')).toHaveText(
      'Beslutet fattas av LEX-ansvarig.'
    );
    await expect(decisionTab).not.toContainText('behörighet');
  });

  test('förklarar sig när ingen del av utredningen tillhör användaren', async ({ page, dismissCookieConsent }) => {
    const profile = defaultInvestigationProfile();
    await installIafApiMock(page, {
      investigationProfile: profile,
      documentAccess: {},
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(page.locator('[data-cy="investigation-tab-no-access"]')).toBeVisible();
    await expect(page.locator('[data-cy="support-investigation-tab"]').getByRole('tab')).toHaveCount(0);
  });

  test('visar ett uttryckligt fel när ett utredningsschema inte kan laddas', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      schemaFailureFor: managerKey,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(page.locator('[data-cy="investigation-document-notice"]')).toContainText(
      'Utredningen kunde inte laddas'
    );
    await expect(page.locator(classificationFieldSelector)).toHaveCount(0);
    await expect(page.locator(`[data-cy="investigation-document-${managerKey}"]`)).toHaveCount(0);
  });

  test('behåller utredningen som ensam ägare när ett nytt schema saknar klassificeringsdeklarationen', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: allExistingInvestigationDocuments(),
      classificationDeclarationMissingFor: managerKey,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await expect(managerDocument.locator(classificationFieldSelector)).toBeVisible();
    await expect(managerDocument.locator('[data-cy="investigation-classification-schema-warning"]')).toContainText(
      'Draken använder den centrala utredningsplaceringen'
    );
    await expect(page.getByRole('heading', { name: 'Ange avvikelsetyp', exact: true })).toHaveCount(1);
  });

  test('normaliserar en felplacerad klassificeringsslot till den kanoniska sektionen', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: allExistingInvestigationDocuments(),
      classificationSlotMisplacedFor: managerKey,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const classificationField = managerDocument.locator(classificationFieldSelector);
    await expect(classificationField).toHaveCount(1);
    const schemaFieldOrder = await managerDocument
      .locator(`#${managerKey}_legalBases-group, ${classificationFieldSelector}`)
      .evaluateAll((elements) => elements.map((element) => element.getAttribute('data-cy') ?? element.id));
    expect(schemaFieldOrder).toEqual([`${managerKey}_legalBases-group`, 'schema-external-field-errandClassification']);
  });

  test('filtrerar schemafältets klassificering efter valda lagrum', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const legalBases = managerDocument.locator(`#${managerKey}_legalBases-group`);
    const hsl = legalBases.getByLabel(/^HSL –/u);
    const sol = legalBases.getByLabel(/^SoL –/u);
    const lss = legalBases.getByLabel(/^LSS –/u);
    const hslLabel = legalBases.getByText(/^HSL –/u);
    const solLabel = legalBases.getByText(/^SoL –/u);
    const lssLabel = legalBases.getByText(/^LSS –/u);
    const hslGroup = managerDocument.locator(hslClassificationSelector);
    const socialGroup = managerDocument.locator(socialClassificationSelector);
    const typeOption = (groupSelector: string, name: string) =>
      managerDocument
        .locator(`${groupSelector} [data-cy="label-classification-type"] option`)
        .filter({ hasText: name });
    const rehab = iafLabelFixture.classification.rehab.displayName;
    const legalCertainty = iafLabelFixture.classification.legalCertainty.displayName;

    // HSL and SoL are chosen: one selector per group, each offering only its own categories.
    await expect(hslGroup.locator('legend')).toHaveText('HSL');
    await expect(socialGroup.locator('legend')).toHaveText('SoL');
    await expect(typeOption(hslClassificationSelector, rehab)).toHaveCount(1);
    await expect(typeOption(hslClassificationSelector, legalCertainty)).toHaveCount(0);
    await expect(typeOption(socialClassificationSelector, legalCertainty)).toHaveCount(1);
    await expect(typeOption(socialClassificationSelector, rehab)).toHaveCount(0);

    // All three legal bases can be chosen. SoL and LSS share their selector, which then names both.
    await lssLabel.click();
    await expect(lss).toBeChecked();
    await expect(socialGroup.locator('legend')).toHaveText('SoL/LSS');
    await expect(hslGroup).toHaveCount(1);

    await solLabel.click();
    await expect(sol).not.toBeChecked();
    await expect(socialGroup.locator('legend')).toHaveText('LSS');

    await lssLabel.click();
    await expect(lss).not.toBeChecked();
    await expect(socialGroup).toHaveCount(0);
    await expect(typeOption(hslClassificationSelector, rehab)).toHaveCount(1);

    await solLabel.click();
    await expect(sol).toBeChecked();
    await hslLabel.click();
    await expect(hsl).not.toBeChecked();
    await expect(hslGroup).toHaveCount(0);
    await expect(typeOption(socialClassificationSelector, legalCertainty)).toHaveCount(1);
  });

  // From utredning-enhetschef 1.10 the legal bases choose the template: SOL/LSS/HSL wherever HSL is one of them,
  // SOL/LSS otherwise. Text that is still a template's is replaced at once; written text only after asking.
  test('fyller utredningstexten från mallen som lagrummen väljer och frågar innan egen text skrivs över', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: {},
      investigationTextTemplates: {
        'avvikelse.investigation.sol-lss': '<h2>Mall SOL/LSS</h2><p>[Vägledning SOL/LSS]</p>',
        'avvikelse.investigation.sol-lss-hsl': '<h2>Mall SOL/LSS/HSL</h2><p>[Vägledning SOL/LSS/HSL]</p>',
      },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const legalBases = managerDocument.locator(`#${managerKey}_legalBases-group`);
    const hsl = legalBases.getByLabel(/^HSL –/u);
    const lss = legalBases.getByLabel(/^LSS –/u);
    const text = managerDocument.getByRole('textbox', { name: 'Utredningstext', exact: true });
    const overwriteDialog = page.locator('[data-cy="investigation-template-overwrite"]');
    const answer = (name: string) => overwriteDialog.getByRole('button', { name, exact: true }).click();

    // There is no template to choose; the legal bases choose it.
    await expect(managerDocument.locator(`#${managerKey}_investigationTemplate`)).toHaveCount(0);

    // SoL alone calls for SOL/LSS, which fills the empty text.
    await legalBases.getByText(/^SoL –/u).click();
    await expect(text).toContainText('Mall SOL/LSS');
    await expect(text).toContainText('[Vägledning SOL/LSS]');

    // HSL calls for SOL/LSS/HSL. The text is still the template's own, so it is replaced without asking.
    await legalBases.getByText(/^HSL –/u).click();
    await expect(text).toContainText('Mall SOL/LSS/HSL');
    await expect(overwriteDialog).toHaveCount(0);

    // Once the investigator has written in it, a change that keeps the template leaves the text alone.
    await text.click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' Egen text');
    await legalBases.getByText(/^LSS –/u).click();
    await expect(lss).toBeChecked();
    await expect(overwriteDialog).toHaveCount(0);
    await expect(text).toContainText('Egen text');

    const hslType = managerDocument.locator(hslClassificationSelector).locator('[data-cy="label-classification-type"]');
    await hslType.selectOption(iafLabelFixture.classification.medication.resourcePath);

    // A change that calls for another template asks first. Avbryt undoes it: the legal bases are as they were, and
    // so are the text and the HSL categorization that unticking HSL cleared.
    await legalBases.getByText(/^HSL –/u).click();
    await expect(overwriteDialog).toContainText('Du har uppdaterat lagrummet och mallen kommer att skrivas över.');
    await answer('Avbryt');
    await expect(overwriteDialog).toHaveCount(0);
    await expect(hsl).toBeChecked();
    await expect(lss).toBeChecked();
    await expect(hslType).toHaveValue(iafLabelFixture.classification.medication.resourcePath);
    await expect(text).toContainText('Egen text');

    // Nej keeps the text and the new legal bases.
    await legalBases.getByText(/^HSL –/u).click();
    await expect(overwriteDialog).toBeVisible();
    await answer('Nej');
    await expect(overwriteDialog).toHaveCount(0);
    await expect(hsl).not.toBeChecked();
    await expect(managerDocument.locator(hslClassificationSelector)).toHaveCount(0);
    await expect(text).toContainText('Egen text');
    await expect(text).toContainText('Mall SOL/LSS/HSL');

    // Ja overwrites the text with the template the new legal bases call for.
    await legalBases.getByText(/^HSL –/u).click();
    await answer('Ja, skriv över mallen');
    await expect(hsl).toBeChecked();
    await expect(text).not.toContainText('Egen text');
    await expect(text).toContainText('Mall SOL/LSS/HSL');
  });

  // The investigator's measure proposals are registered in the Åtgärder tab, away from the investigation, and are
  // easily forgotten. Finishing the investigation reminds of them and leads there.
  test('påminner utredaren om åtgärdsförslagen när Utredning Lex Sarah markeras som klar', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: {},
      eventType: 'MISSFORHALLANDE',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page
      .locator('[data-cy="support-investigation-tab"]')
      .getByRole('tab', { name: 'Utredning Lex Sarah', exact: true })
      .click();
    const document = page.locator('[data-cy="investigation-document-utredning-sol-lss"]');
    const reminder = document.locator('[data-cy="investigation-measures-reminder"]');
    const measuresLink = document.locator('[data-cy="investigation-measures-link"]');
    const completedNotice = document.locator('[data-cy="investigation-report-completed-notice"]');
    await expect(document).toBeVisible();
    await expect(reminder).toHaveCount(0);
    await expect(completedNotice).toHaveCount(0);
    // Ä9. Where measures are registered is said from the start, with the way there.
    await expect(measuresLink).toContainText('Åtgärder registreras under fliken Åtgärder.');

    await document.locator('#utredning-sol-lss_completed').getByRole('radio', { name: 'Ja', exact: true }).check();
    // Answering Ja explains the next step at once, before the save that enables the report.
    await expect(completedNotice).toContainText('skapa en rapport och tilldela ärendet till LEX-ansvarig');
    await expect(reminder).toContainText('Registrera dem i fliken Åtgärder');
    await measuresLink.getByRole('button', { name: 'Gå till Åtgärder', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Åtgärder', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  // The unit manager answers the police report question where HSL applies: after the HSL risk assessment, Ja or Ej
  // aktuellt, and gone with HSL.
  test('frågar enhetschefen om polisanmälan när HSL gäller', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: {} });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const legalBases = managerDocument.locator(`#${managerKey}_legalBases-group`);
    const policeReport = managerDocument.locator(`#${managerKey}_requiresPoliceReport`);
    await legalBases.getByText(/^SoL –/u).click();
    await expect(policeReport).toHaveCount(0);

    await legalBases.getByText(/^HSL –/u).click();
    await expect(policeReport.getByRole('radio')).toHaveCount(2);
    await expect(policeReport.getByRole('radio', { name: 'Ja', exact: true })).toBeVisible();
    await expect(policeReport.getByRole('radio', { name: 'Ej aktuellt', exact: true })).toBeVisible();
    await policeReport.getByRole('radio', { name: 'Ja', exact: true }).check();

    await legalBases.getByText(/^HSL –/u).click();
    await expect(policeReport).toHaveCount(0);
  });

  // Only a suspected misconduct goes on to LEX-ansvarig; an ordinary deviation stays with the unit manager.
  test('ber enhetschefen tilldela LEX-ansvarig bara när utredningen bedömer ett misstänkt missförhållande', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const document = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const notice = document.locator('[data-cy="investigation-report-completed-notice"]');
    const suspectedMisconduct = document.locator(`#${managerKey}_suspectedMisconduct`);

    await document.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await expect(suspectedMisconduct.getByRole('radio', { name: 'Nej', exact: true })).toBeChecked();
    await expect(notice).toHaveText('När du är klar med din utredning, ska du skapa en rapport.');

    await suspectedMisconduct.getByRole('radio', { name: 'Ja', exact: true }).check();
    await expect(notice).toHaveText(
      'När du är klar med din utredning, ska du skapa en rapport och tilldela ärendet till LEX-ansvarig.'
    );
  });

  // Ä7 and Ä9. The unit's measures are registered in Åtgärder: every investigation leads there, and the unit
  // manager who finishes theirs with none is told so - as information, not as something that stops them.
  test('leder till Åtgärder från utredningen och säger när enhetschefen markerar klart utan åtgärder', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const document = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const notice = document.locator('[data-cy="investigation-no-measures-notice"]');
    const measuresLink = document.locator('[data-cy="investigation-measures-link"]');
    await expect(measuresLink).toContainText('Åtgärder registreras under fliken Åtgärder.');
    await expect(notice).toHaveCount(0);

    await document.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await expect(notice).toContainText('Det finns inga åtgärder i ärendet. Lägg till åtgärder under fliken Åtgärder.');
    // Information, not a refusal: the investigation is saved as completed all the same.
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.puts[0].body).toMatchObject({ value: { completed: 'yes' } });

    const goToMeasures = measuresLink.getByRole('button', { name: 'Gå till Åtgärder', exact: true });
    await goToMeasures.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('tab', { name: 'Åtgärder', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  // The classification is demanded when the investigation is marked finished; the warning says so while it is
  // still being written, instead of only when that save is refused.
  test('varnar så länge kategoriseringen saknas för de valda lagrummen', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: {}, classification: { category: 'NONE', type: 'NONE' }, labels: [] });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const classification = managerDocument.locator(classificationFieldSelector);
    const warning = managerDocument.locator('[data-cy="avvikelse-classification-missing"]');
    // Without a lagrum there is nothing to categorize yet, and so nothing missing.
    await expect(classification).toBeVisible();
    await expect(warning).toHaveCount(0);

    await managerDocument
      .locator(`#${managerKey}_legalBases-group`)
      .getByText(/^SoL –/u)
      .click();
    await expect(warning).toContainText('Kategoriseringen är inte ifylld');

    await classification
      .locator(socialClassificationSelector)
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.legalCertainty.resourcePath);
    await classification
      .locator(socialClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.deficientHandling.resourcePath);
    await expect(warning).toHaveCount(0);
  });

  // A misconduct's lagrum is SoL and LSS from the start, so they call for the SOL/LSS template before the
  // investigator does anything that would fill the text.
  test('ger ett nytt missförhållande SOL/LSS-mallens text från början, utan att dokumentet räknas som ändrat', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: {},
      eventType: 'MISSFORHALLANDE',
      investigationTextTemplates: {
        'avvikelse.investigation.sol-lss': '<h2>Mall SOL/LSS</h2><p>[Vägledning SOL/LSS]</p>',
      },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const text = managerDocument.getByRole('textbox', { name: 'Utredningstext', exact: true });
    await expect(text).toContainText('Mall SOL/LSS');
    await expect(text).toContainText('[Vägledning SOL/LSS]');
    // The template's text is where the document starts, not an edit to save.
    await expect(
      page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').filter({ hasText: 'Spara ärende' })
    ).toBeDisabled();
  });

  test('samlar alla valideringsfel och navigerar till fält i hopfällda avsnitt', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const document = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const assessedWith = document.locator(`#${managerKey}_riskAssessmentHsl_assessedWith`);
    const typeSelect = document.locator(hslClassificationSelector).locator('[data-cy="label-classification-type"]');
    const subtypeSelect = document
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]');
    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    const summary = document.locator('[data-cy="schema-form-error-summary"]');
    // A collapsed section keeps its fields in the DOM at zero height, so whether it is open is read from its content.
    const assessedWithSectionContent = document
      .locator('.schema-boundary-disclosure')
      .filter({ has: page.locator(`#${managerKey}_riskAssessmentHsl_assessedWith`) })
      .locator(':scope > .sk-disclosure-body');
    // What the investigation must contain is asserted when it is marked finished; an unfinished
    // draft may have empty fields. The scenario therefore finishes it, then empties a field in it.
    await document.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await assessedWith.fill('');
    await typeSelect.selectOption('');

    const openSections = document.locator('.sk-disclosure-header-button[aria-expanded="true"]');
    for (let remaining = await openSections.count(); remaining > 0; remaining--) {
      await openSections.first().click();
    }
    await expect(assessedWithSectionContent).toHaveAttribute('aria-hidden', 'true');
    await saveButton.click();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveCount(2);
    await expect(summary).toContainText('Legitimerad personal som medverkat i bedömningen');
    await expect(summary).toContainText('Kategorisering');
    expect(trace.puts).toHaveLength(0);
    expect(trace.classificationPatches).toHaveLength(0);

    const fieldLink = summary.getByRole('link', { name: /Legitimerad personal/u });
    await fieldLink.click();
    await expect(assessedWithSectionContent).toHaveAttribute('aria-hidden', 'false');
    await expect(assessedWith).toBeFocused();
    await document
      .locator('.schema-boundary-disclosure')
      .filter({ has: page.locator(`#${managerKey}_riskAssessmentHsl_assessedWith`) })
      .locator('.sk-disclosure-header-button')
      .first()
      .click();
    await expect(assessedWithSectionContent).toHaveAttribute('aria-hidden', 'true');
    await fieldLink.click();
    await expect(assessedWithSectionContent).toHaveAttribute('aria-hidden', 'false');
    await expect(assessedWith).toBeFocused();
    await assessedWith.fill('Anna Andersson');
    await saveButton.click();
    await expect(summary).toBeFocused();
    await expect(summary.getByRole('link')).toHaveCount(1);
    await expect(summary).not.toContainText('Legitimerad personal');

    await summary.getByRole('link', { name: /^Kategorisering/u }).focus();
    await page.keyboard.press('Enter');
    await expect(typeSelect).toBeVisible();
    await expect(typeSelect).toBeFocused();
    await typeSelect.selectOption(iafLabelFixture.classification.medication.resourcePath);
    await subtypeSelect.selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    await saveButton.click();
    await expect(summary).toHaveCount(0);
    await expect.poll(() => trace.puts.length).toBe(1);
    await expect.poll(() => trace.classificationPatches.length).toBe(1);
  });

  test('sparas med Spara ärende, som visar utredningen när den inte kunde sparas', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const document = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    // The investigation has no save button of its own.
    await expect(document.getByRole('button', { name: /^Spara/u })).toHaveCount(0);
    await expect(saveButton).toBeDisabled();

    // Finished, with a required field emptied, so the investigation refuses the save.
    await document.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await document.locator(`#${managerKey}_riskAssessmentHsl_assessedWith`).fill('');
    await expect(saveButton).toBeEnabled();

    // Saved from another tab: the handler is taken back to the investigation, and to why.
    await page.getByRole('tab', { name: 'Grundinformation', exact: true }).click();
    await expect(document).toBeHidden();
    await saveButton.click();
    await expect(page.getByText('Utredning enhetschef kunde inte sparas. Orsaken visas där.')).toBeVisible();
    await expect(document).toBeVisible();
    await expect(document.locator('[data-cy="schema-form-error-summary"]')).toBeFocused();
    expect(trace.puts).toHaveLength(0);
  });

  test('sparar endast aktiv dokumentnyckel med schemaId och If-Match', async ({ page, dismissCookieConsent }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existing } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const probabilityOne = page.locator(managerProbabilityGroup).getByLabel(/^1 –/u);
    await probabilityOne.check();
    await expect(probabilityOne).toBeChecked();

    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    // The toast is the confirmation: no alert is put at the top of the form to jump to.
    await expect(page.locator('[data-cy="investigation-document-notice"]')).toHaveCount(0);

    await expect.poll(() => trace.puts.length).toBe(1);
    const put = trace.puts[0];
    expect(put.key).toBe(managerKey);
    expect(put.headers['if-match']).toBe(existing.etag);
    expect(put.body).toEqual({
      schemaId: existing.schemaId,
      value: expect.objectContaining({
        riskAssessmentHsl: expect.objectContaining({ probability: 1, calculatedRiskValue: 3 }),
      }),
    });
    expect(Object.keys(put.body as Record<string, unknown>).sort()).toEqual(['schemaId', 'value']);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('sparar en utredningsändring utan att skriva om en äldre okänd klassificering', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const legacyCategoryPath = 'CATEGORY/HSL/RETIRED_CATEGORY';
    const legacyTypePath = `${legacyCategoryPath}/RETIRED_TYPE`;
    const legacyLabels: MockLabel[] = [
      {
        id: 'legacy-category-id',
        classification: 'CATEGORY',
        displayName: 'Äldre avvikelsetyp',
        resourceName: 'RETIRED_CATEGORY',
        resourcePath: legacyCategoryPath,
      },
      {
        id: 'legacy-type-id',
        classification: 'TYPE',
        displayName: 'Äldre underkategori',
        resourceName: 'RETIRED_TYPE',
        resourcePath: legacyTypePath,
      },
    ];
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      classification: {
        category: iafLabelFixture.classification.hslOwner.resourcePath,
        type: legacyCategoryPath,
      },
      labels: [...legacyLabels, ...socialClassificationLabels],
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('sparar en utredningsändring utan att skriva om en pensionerad underkategori', async ({
    page,
    dismissCookieConsent,
  }) => {
    const retiredTypePath = `${iafLabelFixture.classification.rehab.resourcePath}/RETIRED_TYPE`;
    const labelsWithRetiredType: MockLabel[] = [
      {
        id: iafLabelFixture.provision.hsl.id,
        classification: 'PROVISION',
        displayName: 'HSL',
        resourceName: 'HSL',
        resourcePath: iafLabelFixture.provision.hsl.resourcePath,
      },
      {
        id: iafLabelFixture.reportType.deviation.id,
        classification: 'REPORT_TYPE',
        displayName: 'Avvikelse',
        resourceName: 'DEVIATION',
        resourcePath: iafLabelFixture.reportType.deviation.resourcePath,
      },
      {
        id: iafLabelFixture.classification.hslOwner.id,
        classification: 'PROVISION_CATEGORY',
        displayName: 'HSL',
        resourceName: 'HSL',
        resourcePath: iafLabelFixture.classification.hslOwner.resourcePath,
      },
      {
        id: iafLabelFixture.classification.rehab.id,
        classification: 'CATEGORY',
        displayName: iafLabelFixture.classification.rehab.displayName,
        resourceName: 'REHAB',
        resourcePath: iafLabelFixture.classification.rehab.resourcePath,
      },
      {
        id: 'retired-type-id',
        classification: 'TYPE',
        displayName: 'Äldre underkategori',
        resourceName: 'RETIRED_TYPE',
        resourcePath: retiredTypePath,
      },
    ];
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      labels: [...labelsWithRetiredType, ...socialClassificationLabels],
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('kräver kategorisering innan ett helt oklassificerat ärendes utredning kan markeras klar', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      classification: { category: '', type: '' },
      labels: [],
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    // Kategoriseringen krävs när utredningen markeras klar, inte vid varje sparning däremellan.
    await page.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(page.locator('[data-cy="schema-form-error-summary"]')).toContainText(
      'Välj typ och underkategori för varje valt lagrum innan utredningen sparas.'
    );
    expect(trace.puts).toHaveLength(0);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  // The reason the gate exists: a unit manager who has written half the investigation must be able
  // to put it down, on an errand nobody has classified yet.
  test('sparar ett påbörjat utkast på ett helt oklassificerat ärende', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      classification: { category: '', type: '' },
      labels: [],
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect(page.locator('[data-cy="schema-form-error-summary"]')).toHaveCount(0);
    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('blockerar klarmarkering när den befintliga klassificeringen inte hör till valt lagrum', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    existing.value.legalBases = ['SOL'];
    delete existing.value.riskAssessmentHsl;
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existing } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(`#${managerKey}_riskAssessmentSolLss_probability`).getByLabel(/^1 –/u).check();
    // Kategoriseringen krävs när utredningen markeras klar, inte vid varje sparning däremellan.
    await page.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(page.locator('[data-cy="schema-form-error-summary"]')).toContainText(
      'Den befintliga kategoriseringen stämmer inte med valda lagrum. Välj en giltig typ och underkategori för varje valt lagrum.'
    );
    expect(trace.puts).toHaveLength(0);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  test('blockerar klarmarkering när en känd kategori saknar obligatorisk underkategori', async ({
    page,
    dismissCookieConsent,
  }) => {
    const labelsWithoutSubtype: MockLabel[] = [
      {
        id: iafLabelFixture.provision.hsl.id,
        classification: 'PROVISION',
        displayName: 'HSL',
        resourceName: 'HSL',
        resourcePath: iafLabelFixture.provision.hsl.resourcePath,
      },
      {
        id: iafLabelFixture.reportType.deviation.id,
        classification: 'REPORT_TYPE',
        displayName: 'Avvikelse',
        resourceName: 'DEVIATION',
        resourcePath: iafLabelFixture.reportType.deviation.resourcePath,
      },
      {
        id: iafLabelFixture.classification.hslOwner.id,
        classification: 'PROVISION_CATEGORY',
        displayName: 'HSL',
        resourceName: 'HSL',
        resourcePath: iafLabelFixture.classification.hslOwner.resourcePath,
      },
      {
        id: iafLabelFixture.classification.rehab.id,
        classification: 'CATEGORY',
        displayName: iafLabelFixture.classification.rehab.displayName,
        resourceName: 'REHAB',
        resourcePath: iafLabelFixture.classification.rehab.resourcePath,
      },
    ];
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      labels: labelsWithoutSubtype,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    // Kategoriseringen krävs när utredningen markeras klar, inte vid varje sparning däremellan.
    await page.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(page.locator('[data-cy="schema-form-error-summary"]')).toContainText(
      'Välj underkategori för varje valt lagrum innan utredningen sparas.'
    );
    expect(trace.puts).toHaveLength(0);
    expect(trace.classificationPatches).toHaveLength(0);
  });

  /**
   * Taking up an assigned errand moves its version without resetting the errand form. The investigation saved
   * after it moves the version once more, and the classification that follows must be sent on that version - not
   * refused as somebody else's change, which is what a handler taking up a LEX investigation used to be told.
   */
  test('sparar klassificeringen efter att ett tilldelat ärende återupptagits utan att kalla det någon annans ändring', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      errandStatus: 'ASSIGNED',
    });

    await visitErrand(page, dismissCookieConsent);
    await page.locator('[data-cy="resume-button"]').click();
    // Answered once the dialog has finished opening: closing it mid-transition leaves its overlay over the page.
    await expect(page.locator(CONFIRM_DIALOG)).toHaveCSS('opacity', '1');
    await page.locator(CONFIRM_DIALOG).getByRole('button', { name: 'Ja', exact: true }).click();
    await expect(page.locator('[data-cy="resume-button"]')).toHaveCount(0);
    await expect(page.locator(CONFIRM_DIALOG)).toHaveCount(0);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.medication.resourcePath);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page
      .locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')
      .filter({ hasText: 'Spara ärende' })
      .click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    // Version 7 as loaded, 8 once taken up, 9 once the investigation was saved.
    expect(trace.classificationPatches).toHaveLength(1);
    expect(trace.classificationPatches[0].body).toMatchObject({ expectedVersion: 9 });
  });

  /**
   * An investigation can be long, and the handler saves from wherever they are in it. The save's own writes move
   * the errand's version and the document access is checked again, but the form stays where it is: no alert is put
   * at its top and the documents are not emptied out while the check runs, so the page does not jump to the top.
   */
  test('stannar där handläggaren är i utredningen när den sparas', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });
    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const probability = page.locator(managerProbabilityGroup);
    await probability.getByLabel(/^1 –/u).check();
    const before = await probability.boundingBox();
    // Whether the documents were ever hidden during the save: that is what drops the page to its top.
    await page.evaluate(() => {
      const record = window as unknown as { documentsEmptied: boolean };
      record.documentsEmptied = false;
      new MutationObserver(() => {
        const documents = document.querySelector<HTMLElement>('[data-cy="support-investigation-tab"] .sk-tabs');
        if (!documents || documents.hidden) record.documentsEmptied = true;
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    // Dispatched rather than clicked, so Playwright does not scroll the page to reach the button first.
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').dispatchEvent('click');

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect(page.locator('[data-cy="investigation-document-notice"]')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { documentsEmptied: boolean }).documentsEmptied)).toBe(
      false
    );
    const after = await probability.boundingBox();
    expect(before).not.toBeNull();
    expect(Math.abs((after?.y ?? 0) - (before?.y ?? 0))).toBeLessThanOrEqual(2);
  });

  test('sparar dokumentdata och labelägd klassificering genom separata smala kontrakt', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, { documents: { [managerKey]: existing } });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const sidebarSaveButton = page
      .locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')
      .filter({ hasText: 'Spara ärende' });
    const typeSelect = managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]');
    const subtypeSelect = managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]');
    await expect(sidebarSaveButton).toBeDisabled();
    await typeSelect.selectOption(iafLabelFixture.classification.medication.resourcePath);
    await subtypeSelect.selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    // The classification is a draft of the investigation, saved with Spara ärende through the
    // investigation's own narrow contracts - nothing is written until it is clicked.
    await expect(sidebarSaveButton).toBeEnabled();
    expect(trace.classificationPatches).toHaveLength(0);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();

    await sidebarSaveButton.click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();

    await expect.poll(() => trace.puts.length).toBe(1);
    await expect.poll(() => trace.classificationPatches.length).toBe(1);
    expect(trace.writes).toEqual(['document', 'classification']);

    const putBody = trace.puts[0].body as { schemaId: string; value: Record<string, unknown> };
    expect(putBody.schemaId).toBe(existing.schemaId);
    expect(putBody.value.riskAssessmentHsl).toEqual(
      expect.objectContaining({ probability: 1, calculatedRiskValue: 3 })
    );
    for (const labelOwnedField of [
      'classification',
      'labels',
      'category',
      'type',
      'subType',
      'deviationType',
      'deviationSubtype',
      'errandClassification',
    ]) {
      expect(putBody.value).not.toHaveProperty(labelOwnedField);
    }

    expect(trace.classificationPatches[0].body).toEqual({
      expectedVersion: 8,
      classifications: [
        {
          classification: {
            category: iafLabelFixture.classification.hslOwner.resourcePath,
            type: iafLabelFixture.classification.medication.resourcePath,
          },
          categoryLabels: [
            { id: iafLabelFixture.classification.hslOwner.id },
            { id: iafLabelFixture.classification.medication.id },
            { id: iafLabelFixture.classification.incorrectAdministration.id },
          ],
        },
        socialClassificationPatch,
      ],
      documentKey: managerKey,
      documentETag: '"8"',
    });
    expect(Object.keys(trace.classificationPatches[0].body as Record<string, unknown>).sort()).toEqual([
      'classifications',
      'documentETag',
      'documentKey',
      'expectedVersion',
    ]);
    await expect(typeSelect).toHaveValue(iafLabelFixture.classification.medication.resourcePath);
    await expect(subtypeSelect).toHaveValue(iafLabelFixture.classification.incorrectAdministration.resourcePath);

    await typeSelect.selectOption(iafLabelFixture.classification.rehab.resourcePath);
    await subtypeSelect.selectOption(iafLabelFixture.classification.missedAssessment.resourcePath);
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect.poll(() => trace.classificationPatches.length).toBe(2);
    expect(trace.puts).toHaveLength(1);
    expect(trace.classificationPatches[1].body).toEqual(
      expect.objectContaining({
        expectedVersion: 9,
        classifications: [
          expect.objectContaining({
            classification: {
              category: iafLabelFixture.classification.hslOwner.resourcePath,
              type: iafLabelFixture.classification.rehab.resourcePath,
            },
          }),
          socialClassificationPatch,
        ],
      })
    );
  });

  test('sparar klassificering från metadata som endast har resourceName', async ({ page, dismissCookieConsent }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      omitLabelResourcePaths: true,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    const typeSelect = managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]');
    const subtypeSelect = managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]');
    await typeSelect.selectOption(iafLabelFixture.classification.medication.id);
    await subtypeSelect.selectOption(iafLabelFixture.classification.incorrectAdministration.id);
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    expect(trace.classificationPatches).toHaveLength(1);
    expect(trace.classificationPatches[0].body).toEqual({
      expectedVersion: 7,
      classifications: [
        {
          classification: { category: 'HSL', type: 'MEDICATION' },
          categoryLabels: [
            { id: iafLabelFixture.classification.hslOwner.id },
            { id: iafLabelFixture.classification.medication.id },
            { id: iafLabelFixture.classification.incorrectAdministration.id },
          ],
        },
        {
          classification: { category: 'SOL_LSS', type: 'LEGAL_CERTAINTY' },
          categoryLabels: socialClassificationPatch.categoryLabels,
        },
      ],
      documentKey: managerKey,
      documentETag: existing.etag,
    });
  });

  test('återförsöker endast klassificeringen efter en delvis genomförd sparning', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      classificationPatchResult: 'server-error-once',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.medication.resourcePath);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();

    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    await saveButton.click();
    await expect(page.locator('[data-cy="investigation-document-notice"]')).toContainText(
      'Utredningen har sparats, men ärendets klassificering kunde inte synkroniseras'
    );
    expect(trace.puts).toHaveLength(1);
    expect(trace.classificationPatches).toHaveLength(1);

    await saveButton.click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    expect(trace.puts).toHaveLength(1);
    expect(trace.classificationPatches).toHaveLength(2);
    expect(trace.writes).toEqual(['document', 'classification', 'classification']);
  });

  // Completing the investigation locks it as soon as it is saved. A classification that did not follow is still the
  // investigator's to retry, and the retry writes the classification alone: no unlock, no second document write.
  test('återförsöker klassificeringen även när utredningen sparades som klar', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      classificationPatchResult: 'server-error-once',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.medication.resourcePath);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await managerDocument.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();

    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    await saveButton.click();
    await expect(page.locator('[data-cy="investigation-document-notice"]')).toContainText(
      'Utredningen har sparats, men ärendets klassificering kunde inte synkroniseras'
    );
    expect(trace.puts).toHaveLength(1);
    expect(trace.puts[0].body).toMatchObject({ value: { completed: 'yes' } });
    expect(trace.classificationPatches).toHaveLength(1);

    await expect(saveButton).toBeEnabled();
    await saveButton.click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    expect(trace.puts).toHaveLength(1);
    expect(trace.classificationPatches).toHaveLength(2);
    expect(trace.writes).toEqual(['document', 'classification', 'classification']);
  });

  test('stoppar en klassificeringsuppdatering som bygger på en äldre ärendeversion', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      classificationPatchResult: 'conflict',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.medication.resourcePath);
    await managerDocument
      .locator(hslClassificationSelector)
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.incorrectAdministration.resourcePath);
    await page.locator(managerProbabilityGroup).getByLabel(/^1 –/u).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(page.locator('[data-cy="investigation-document-notice"]')).toContainText(
      'klassificering har ändrats av någon annan'
    );
    expect(trace.puts).toHaveLength(1);
    expect(trace.classificationPatches).toHaveLength(1);
    expect(trace.classificationPatches[0].body).toEqual(expect.objectContaining({ expectedVersion: 8 }));
  });

  test('behåller lokala ändringar när Support Management svarar med versionskonflikt', async ({
    page,
    dismissCookieConsent,
  }) => {
    const existing = existingManagerDocument();
    const trace = await installIafApiMock(page, {
      documents: { [managerKey]: existing },
      putResult: 'conflict',
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const probabilityFour = page.locator(managerProbabilityGroup).getByLabel(/^4 –/u);
    await probabilityFour.check();
    const saveButton = page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]');
    await saveButton.click();

    await expect(page.locator('[data-cy="investigation-document-notice"]')).toContainText(
      'Utredningen har ändrats av någon annan'
    );
    await expect(probabilityFour).toBeChecked();
    await expect(page.locator(`#${managerKey}_riskAssessmentHsl_calculatedRiskValue`)).toHaveValue('12');
    await expect(saveButton).toBeEnabled();
    expect(trace.puts).toHaveLength(1);
  });

  test('låser SOL/LSS för missförhållande och placerar klassificeringen i SOL/LSS-utredningen', async ({
    page,
    dismissCookieConsent,
  }) => {
    const documents = allExistingInvestigationDocuments();
    const trace = await installIafApiMock(page, {
      eventType: 'MISSFORHALLANDE',
      documents,
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    // The legal bases of a misconduct are LEX's to state: the unit manager does not see them. The SoL/LSS risk
    // assessment is here because it is already made - it is kept, and shown to whoever reads the investigation.
    await expect(managerDocument.locator(`#${managerKey}_legalBases-group`)).toHaveCount(0);
    await expect(managerDocument.getByText(/^HSL –/u)).toHaveCount(0);
    await expect(page.locator(`#${managerKey}_riskAssessmentSolLss_probability`)).toBeVisible();
    await expect(managerDocument.locator(classificationFieldSelector)).toHaveCount(0);
    // The investigation speaks of what happened, not of a deviation.
    await expect(managerDocument.getByText(/Händelsens allvarlighetsgrad/u).first()).toBeVisible();
    await expect(managerDocument.getByText(/Orsak till det inträffade/u).first()).toBeVisible();
    await expect(managerDocument.getByText(/Avvikelsens allvarlighetsgrad|Orsak till avvikelse/u)).toHaveCount(0);

    await page.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();
    const solLssDocument = page.locator(`[data-cy="investigation-document-${solLssKey}"]`);
    const classificationField = solLssDocument.locator(classificationFieldSelector);
    await expect(classificationField).toBeVisible();

    const typeSelect = classificationField.locator('[data-cy="label-classification-type"]');
    const subtypeSelect = classificationField.locator('[data-cy="label-classification-subtype"]');
    await expect(
      typeSelect.locator('option').filter({ hasText: iafLabelFixture.classification.legalCertainty.displayName })
    ).toHaveCount(1);
    await expect(
      typeSelect.locator('option').filter({ hasText: iafLabelFixture.classification.rehab.displayName })
    ).toHaveCount(0);

    await typeSelect.selectOption(iafLabelFixture.classification.executionDeficiency.resourcePath);
    await subtypeSelect.selectOption(iafLabelFixture.classification.supportNotProvided.resourcePath);
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();

    await expect.poll(() => trace.classificationPatches.length).toBe(1);
    expect(trace.classificationPatches[0].body).toEqual({
      expectedVersion: 7,
      classifications: [
        {
          classification: {
            category: iafLabelFixture.classification.solLssOwner.resourcePath,
            type: iafLabelFixture.classification.executionDeficiency.resourcePath,
          },
          categoryLabels: [
            { id: iafLabelFixture.classification.solLssOwner.id },
            { id: iafLabelFixture.classification.executionDeficiency.id },
            { id: iafLabelFixture.classification.supportNotProvided.id },
          ],
        },
      ],
      documentKey: solLssKey,
      documentETag: documents[solLssKey].etag,
    });
  });

  test('enhetschefen riskbedömer inte ett missförhållande och kan ändå markera utredningen klar', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, { documents: {}, eventType: 'MISSFORHALLANDE' });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
    await expect(managerDocument.locator(`#${managerKey}_completed`)).toBeVisible();
    // The unit manager passes a misconduct on: the matrix that assesses a deviation is not part of it.
    await expect(managerDocument.locator(`[id^="${managerKey}_riskAssessmentSolLss"]`)).toHaveCount(0);
    await expect(managerDocument.getByText(/Riskbedömning SOL\/LSS/u)).toHaveCount(0);
    await expect(managerDocument.locator(`[id^="${managerKey}_reportedMisconduct"]`)).toHaveCount(0);

    await managerDocument.locator(`#${managerKey}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(page.locator('[data-cy="schema-form-error-summary"]')).toHaveCount(0);
    await expect.poll(() => trace.puts.length).toBe(1);
    expect(trace.puts[0].key).toBe(managerKey);
    expect(trace.puts[0].body).toMatchObject({
      value: { legalBases: ['SOL', 'LSS'], completed: 'yes', reportedMisconduct: true },
    });
    expect(trace.puts[0].body).not.toHaveProperty(['value', 'riskAssessmentSolLss']);
  });

  test('skapar SOL/LSS-dokumentet före klassificeringen när missförhållandet saknar ett dokument', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      eventType: 'MISSFORHALLANDE',
      documents: {},
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);
    await page.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();

    const solLssDocument = page.locator(`[data-cy="investigation-document-${solLssKey}"]`);
    const feedbackGiven = solLssDocument
      .locator(`#${solLssKey}_feedbackGiven`)
      .getByRole('radio', { name: 'Ja', exact: true });
    await feedbackGiven.check();
    await expect(feedbackGiven).toBeChecked();
    // LEX states the legal bases of the misconduct; nothing is chosen for them, and HSL is not on offer.
    const legalBases = solLssDocument.locator(`#${solLssKey}_legalBases-group`);
    await expect(legalBases.locator('input:checked')).toHaveCount(0);
    await expect(legalBases.getByText(/^HSL –/u)).toHaveCount(0);
    await legalBases.getByText(/^LSS –/u).click();
    // A reported misconduct is not called a deviation.
    await expect(
      solLssDocument.getByRole('combobox', { name: 'Typ av missförhållande (obligatoriskt)', exact: true })
    ).toBeVisible();
    await solLssDocument
      .locator('[data-cy="label-classification-type"]')
      .selectOption(iafLabelFixture.classification.executionDeficiency.resourcePath);
    await solLssDocument
      .locator('[data-cy="label-classification-subtype"]')
      .selectOption(iafLabelFixture.classification.supportNotProvided.resourcePath);
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();

    await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();
    await expect.poll(() => trace.classificationPatches.length).toBe(1);
    expect(trace.writes).toEqual(['document', 'classification']);
    expect(trace.puts).toHaveLength(1);
    expect(trace.puts[0].key).toBe(solLssKey);
    expect(trace.puts[0].headers['if-match']).toBeUndefined();
    expect(trace.puts[0].body).toEqual({
      schemaId: latestSchemaIds[solLssKey],
      value: expect.objectContaining({
        legalBases: ['LSS'],
        feedbackGiven: 'yes',
      }),
    });
  });

  for (const readonlyCase of [
    { title: 'låst ärende', scenario: { errandStatus: 'SOLVED', canEdit: true } },
    {
      title: 'saknad skrivbehörighet',
      scenario: {
        errandStatus: 'ONGOING',
        documentAccess: Object.fromEntries(investigationKeys.map((key) => [key, 'read' as const])),
      },
    },
  ] as const) {
    test(`visar utredningen skrivskyddad vid ${readonlyCase.title}`, async ({ page, dismissCookieConsent }) => {
      await installIafApiMock(page, {
        ...readonlyCase.scenario,
        documents: { [managerKey]: existingManagerDocument() },
      });

      await visitErrand(page, dismissCookieConsent);
      await openInvestigation(page);

      const managerDocument = page.locator(`[data-cy="investigation-document-${managerKey}"]`);
      await expect(managerDocument).toContainText('Utredningen kan läsas men inte ändras');
      await expect(page.locator(managerProbabilityGroup).getByLabel(/^1 –/u)).toBeDisabled();
    });
  }

  test('visar Support Managements åtkomstbeslut när AccessMapper nekar dokumentet', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documentReadAccessDeniedFor: managerKey,
      documents: { [managerKey]: existingManagerDocument() },
    });

    await visitErrand(page, dismissCookieConsent);
    await openInvestigation(page);

    await expect(page.locator('[data-cy="investigation-document-notice"]:visible')).toContainText(
      'Support Management nekade åtkomst till det här utredningsdokumentet.'
    );
    await expect(page.locator('[data-cy="support-investigation-tab"] form:visible')).toHaveCount(0);
  });

  test('behåller Katlas JSON under Ärendeuppgifter men visar inte utredningsdokumenten där', async ({
    page,
    dismissCookieConsent,
  }) => {
    const documents = allExistingInvestigationDocuments();
    documents['utredning-enhetschef'].value.investigationText = '<p>SKA BARA VISAS UNDER UTREDNING ENHETSCHEF</p>';
    documents['utredning-sol-lss'].value.reportedMisconduct = '<p>SKA BARA VISAS UNDER UTREDNING SOL LSS</p>';
    documents['utredning-hsl'].value.assignment = '<p>SKA BARA VISAS UNDER UTREDNING HSL</p>';
    const trace = await installIafApiMock(page, { documents });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();

    const details = page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true }).locator('..');
    await expect(details.getByRole('textbox', { name: 'Händelse från Katla', exact: true })).toHaveValue(
      'Katla från web-app-katla-sm'
    );
    await expect(details).not.toContainText('SKA BARA VISAS UNDER UTREDNING ENHETSCHEF');
    await expect(details).not.toContainText('SKA BARA VISAS UNDER UTREDNING SOL LSS');
    await expect(details).not.toContainText('SKA BARA VISAS UNDER UTREDNING HSL');
    expect(trace.exactSchemaIds).toContain(katlaSchemaId);
  });
  /**
   * The errand arrives from Katla unclassified, and its classification is written by the
   * investigation document rather than in Grundinformation. Reading that as "not registered yet"
   * left the whole errand page disabled: "Ta ärende", the tabs and every sidebar action. While the
   * capability is unavailable the control is on screen but read-only, so it cannot take a
   * classification either - the same errand must stay handleable there too.
   */
  /**
   * Assigning oneself is two writes and only the first one landed. The errand is the handler's now
   * but still lies in Ny, where the message tab keeps "Nytt meddelande" shut - so the message has
   * to say which half is missing. Nobody takes an avvikelse errand: the handler is chosen in Ansvarig.
   */
  test('behåller tilldelningen och säger vad som fattas när statusbytet faller', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      errandStatus: 'NEW',
      assignedUserId: null,
      administrators: [{ name: 'iaf.test', displayName: 'Testare Iaf', guid: 'admin-guid', roleKeys: ['enhetschef'] }],
      statusTransitionResult: 'bad-request',
    });

    await visitErrand(page, dismissCookieConsent);
    await page.locator('[data-cy="admin-input"]').selectOption('Testare Iaf');
    await errandSaveButton(page).click();

    await expect(page.getByText('Handläggaren tilldelades, men ärendet kunde inte sättas till Pågående')).toBeVisible();
    await expect(page.locator('[data-cy="admin-input"]')).toHaveValue('Testare Iaf');
  });

  /**
   * The errand arrives from Katla as Ny and stays there until someone moves it. That is not a
   * reason to keep its handler from answering it - being the assigned handler is the whole
   * permission - and blocking on the status left the tab's only action dead.
   */
  test('låter handläggaren skriva meddelanden på ett ärende som ligger i Ny', async ({
    page,
    dismissCookieConsent,
  }) => {
    // The mock signs in as iaf.test, and writing requires being the errand's own
    // handler - so the errand has to be assigned to that account.
    await installIafApiMock(page, {
      errandStatus: 'NEW',
      assignedUserId: 'iaf.test',
      administrators: [{ name: 'iaf.test', displayName: 'Testare Iaf', guid: 'admin-guid', roleKeys: ['enhetschef'] }],
    });

    await visitErrand(page, dismissCookieConsent);
    await page.getByRole('tab', { name: /Meddelanden/ }).click();

    await expect(page.locator('[data-cy="new-message-button"]')).toBeEnabled();
    // Avvikelse says what the messages are for: asking the errand's parties for what is missing.
    await expect(page.locator('[data-cy="messages-introduction"]')).toHaveText(
      'Använd denna meddelandefunktion för att inhämta kompletterande uppgifter om ärendet med berörda parter'
    );
  });

  /**
   * A workflow answers its errands once they have been taken on: while the errand is still in the phase
   * it was registered in, sending waits and the tab says what for. From the next phase on it is open.
   */
  for (const [activePhaseName, waits] of [
    ['ACTUALIZATION', true],
    ['REVIEW', false],
  ] as const) {
    test(`${waits ? 'väntar med' : 'tillåter'} meddelanden när ärendet ligger i ${activePhaseName}`, async ({
      page,
      dismissCookieConsent,
    }) => {
      await installIafApiMock(page, {
        activePhaseName,
      });

      await visitErrand(page, dismissCookieConsent);
      await page.getByRole('tab', { name: /Meddelanden/ }).click();

      if (waits) {
        await expect(page.locator('[data-cy="new-message-button"]')).toBeDisabled();
        await expect(page.locator('[data-cy="messages-phase-notice"]')).toHaveText(
          'Meddelanden kan skickas när ärendet har lämnat fasen Registrerat.'
        );
      } else {
        await expect(page.locator('[data-cy="new-message-button"]')).toBeEnabled();
        await expect(page.locator('[data-cy="messages-phase-notice"]')).toHaveCount(0);
      }
    });
  }

  // B2. Tilldela LEX-ansvarig (assign-lex) leaves the errand a misconduct under the LEX access label, assigned and
  // not categorized yet - the lex Sarah investigation does that. Opened straight from a link, the errand can arrive
  // before the investigation profile does, and the directory can write the account in another case than the
  // session: the errand is still its handler's to resume.
  test('LEX-ansvarig som fått ärendet via Tilldela LEX-ansvarig kan återuppta det', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      eventType: 'MISSFORHALLANDE',
      classification: { category: 'NONE', type: 'NONE' },
      labels: [
        {
          id: iafLabelFixture.reportType.misconduct.id,
          classification: 'REPORT_TYPE',
          displayName: 'Missförhållande',
          resourceName: 'ABUSE',
          resourcePath: iafLabelFixture.reportType.misconduct.resourcePath,
        },
        {
          id: iafPlaceFixture.accessLex.id,
          classification: 'ACCESS',
          displayName: 'LEX',
          resourceName: 'LEX',
          resourcePath: iafPlaceFixture.accessLex.resourcePath,
        },
      ],
      errandStatus: 'ASSIGNED',
      roleKeys: ['lex-ansvarig'],
      administrators: [
        { name: 'IAF.TEST', displayName: 'Testare Iaf', guid: 'admin-guid', roleKeys: ['lex-ansvarig'] },
      ],
    });
    // Registered after the mock, so it runs first: the profile is held back until the errand has been drawn.
    await page.route('**/supportmanagement/investigation-profile', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fallback();
    });

    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="resume-button"]')).toBeEnabled();
    await page.locator('[data-cy="resume-button"]').click();
    await expect(page.locator(CONFIRM_DIALOG)).toHaveCSS('opacity', '1');
    await page.locator(CONFIRM_DIALOG).getByRole('button', { name: 'Ja', exact: true }).click();
    await expect(toast(page, 'Ärende återupptogs')).toBeVisible();
    await expect(page.locator('[data-cy="resume-button"]')).toHaveCount(0);
  });

  // Ä14. The organisation does not park errands. One that is parked all the same is still its handler's to resume.
  test('erbjuder inte Parkera ärende i handläggningen', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: { [managerKey]: existingManagerDocument() } });
    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]')).toBeVisible();
    await expect(page.locator('[data-cy="suspend-button"]')).toHaveCount(0);
    await expect(page.locator('[data-cy="manage-sidebar"]')).not.toContainText('Parkera ärende');
  });

  test('låter ett redan parkerat ärende återupptas', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      documents: { [managerKey]: existingManagerDocument() },
      errandStatus: 'SUSPENDED',
    });
    await visitErrand(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="resume-button"]')).toBeEnabled();
    await expect(page.locator('[data-cy="suspend-button"]')).toHaveCount(0);
  });

  // Until the investigation has classified it, an errand has no type; its heading names what was reported instead.
  for (const [eventType, reportType, resourceName, heading] of [
    ['AVVIKELSE', 'deviation', 'DEVIATION', 'Avvikelse'],
    ['MISSFORHALLANDE', 'misconduct', 'ABUSE', 'Missförhållande'],
  ] as const) {
    test(`rubricerar ett oklassificerat ärende med rapporttypen ${heading}`, async ({ page, dismissCookieConsent }) => {
      const reported = iafLabelFixture.reportType[reportType];
      await installIafApiMock(page, {
        eventType,
        classification: { category: 'NONE', type: 'NONE' },
        labels: [
          {
            id: reported.id,
            classification: 'REPORT_TYPE',
            displayName: heading,
            resourceName,
            resourcePath: reported.resourcePath,
          },
        ],
      });

      await visitErrand(page, dismissCookieConsent);

      await expect(page.getByRole('heading', { level: 1, name: heading, exact: true })).toBeVisible();
      await expect(page.getByText('(Ärendetyp saknas)')).toHaveCount(0);
    });
  }

  for (const state of ['active', 'unavailable'] as const) {
    test(`låter ett oklassificerat ärende tilldelas och hanteras när utredningen är ${state}`, async ({
      page,
      dismissCookieConsent,
    }) => {
      const profile = defaultInvestigationProfile();
      profile.state = state;
      // The mock signs in as iaf.test; assigning oneself needs that account to be an
      // administrator and the errand to be unassigned.
      await installIafApiMock(page, {
        investigationProfile: profile,
        classification: { category: 'NONE', type: 'NONE' },
        labels: [],
        assignedUserId: null,
        administrators: [
          { name: 'iaf.test', displayName: 'Testare Iaf', guid: 'admin-guid', roleKeys: ['enhetschef'] },
        ],
      });

      await visitErrand(page, dismissCookieConsent);

      await expect(page.locator('[data-cy="admin-input"]')).toBeEnabled();
      await expect(page.getByRole('heading', { name: 'Registrera nytt ärende' })).toHaveCount(0);
      // An errand the investigation will classify has no type yet, and says nothing about one missing.
      await expect(page.getByText('(Ärendetyp saknas)')).toHaveCount(0);
      await expect(page.getByRole('tab', { name: 'Utredning', exact: true })).toBeEnabled();

      // Editing anything else must be savable: the errand PATCH leaves classification alone in
      // both states, so the form must not hold the button shut over a classification the user is
      // not the one to give it. Avvikelse renders no "Om ärendet", so the field edited here is a
      // sidebar one - which needs the errand assigned first.
      const saveButton = errandSaveButton(page);
      await expect(saveButton).toBeDisabled();

      await page.locator('[data-cy="admin-input"]').selectOption('Testare Iaf');
      await saveButton.click();
      await expect(toast(page, 'Ärendet uppdaterades')).toBeVisible();

      const priority = page.locator('[data-cy="priority-input"]');
      await expect(priority).toBeEnabled();
      await priority.selectOption('HIGH');
      await expect(saveButton).toBeEnabled();
    });
  }
});
