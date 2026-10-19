import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  allExistingInvestigationDocuments,
  defaultInvestigationProfile,
  errandNumber,
  hslDecisionKey,
  installIafApiMock,
  investigationPhases,
} from './fixtures/investigation-flow.mock';

const investigationTab = (page: Page) => page.getByRole('tab', { name: 'Utredning', exact: true });
const decisionTab = (page: Page) => page.getByRole('tab', { name: 'Beslut', exact: true });
const measuresTab = (page: Page) => page.getByRole('tab', { name: 'Åtgärder', exact: true });
const followUpTab = (page: Page) => page.getByRole('tab', { name: 'Uppföljning', exact: true });

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await expect(page.getByRole('tab', { name: 'Grundinformation', exact: true })).toBeVisible();
}

/**
 * The tabs follow the workflow: the investigations are written while the errand is being
 * investigated, the decision once it has moved on to being decided and the follow-up once it is being
 * followed up, so no tab is reachable before the errand is there. The default deviation is under HSL,
 * so the IVO decision is the one that applies to it.
 */
test.describe('Utrednings- och beslutsflikarna följer ärendets fas', () => {
  test('varken utredning eller beslut visas innan ärendet är i utredningsfasen', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: {},
      metadataPhases: investigationPhases,
      activePhaseId: 'phase-received',
    });

    await visitErrand(page, dismissCookieConsent);

    await expect(investigationTab(page)).toHaveCount(0);
    await expect(decisionTab(page)).toHaveCount(0);
    // The measures follow the same rule: decided under Utredning, followed up under Uppföljning.
    await expect(measuresTab(page)).toHaveCount(0);
    await expect(followUpTab(page)).toHaveCount(0);
  });

  test('utredningen visas i utredningsfasen, beslutet först i beslutsfasen', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      documents: {},
      metadataPhases: investigationPhases,
      activePhaseId: 'phase-investigation',
    });

    await visitErrand(page, dismissCookieConsent);

    await investigationTab(page).click();
    await expect(page.locator('[data-cy="support-investigation-tab"]')).toBeVisible();
    await expect(decisionTab(page)).toHaveCount(0);
    await expect(measuresTab(page)).toHaveCount(1);
    await expect(followUpTab(page)).toHaveCount(0);
  });

  test('beslutsfliken visas när ärendet nått beslutsfasen, och utredningen finns kvar', async ({
    page,
    dismissCookieConsent,
  }) => {
    await installIafApiMock(page, {
      documents: {},
      metadataPhases: investigationPhases,
      activePhaseId: 'phase-decision',
    });

    await visitErrand(page, dismissCookieConsent);

    await expect(investigationTab(page)).toHaveCount(1);
    await expect(measuresTab(page)).toHaveCount(1);
    // Being decided is not yet being followed up.
    await expect(followUpTab(page)).toHaveCount(0);
    await decisionTab(page).click();
    await expect(page.locator('[data-cy="support-decision-tab"]')).toBeVisible();
  });

  test('uppföljningen visas först när ärendet nått uppföljningsfasen', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, {
      documents: {},
      metadataPhases: investigationPhases,
      activePhaseId: 'phase-follow-up',
    });

    await visitErrand(page, dismissCookieConsent);

    await expect(followUpTab(page)).toHaveCount(1);
    await expect(measuresTab(page)).toHaveCount(1);
    await expect(decisionTab(page)).toHaveCount(1);
  });

  // A namespace that runs no workflow has no phase to wait for, and keeps the tabs it always had.
  // Ä6. MAS/MAR decides on reporting an HSL deviation to IVO under the delegation, and does not hold the errand: they
  // are offered Beslut HSL while the errand is still being investigated. Everybody else waits for the decision phase.
  test('MAS/MAR fattar Beslut HSL redan i utredningsfasen', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      roleKeys: ['mas-mar'],
      documents: {},
      metadataPhases: investigationPhases,
      activePhaseId: 'phase-investigation',
    });

    await visitErrand(page, dismissCookieConsent);

    await decisionTab(page).click();
    const decision = page.locator(`[data-cy="investigation-document-${hslDecisionKey}"]`);
    await expect(decision).toBeVisible();
    await decision
      .locator(`#${hslDecisionKey}_ivoNotification`)
      .getByRole('radio', { name: 'Nej', exact: true })
      .check();
    await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
    await expect.poll(() => trace.puts.map(({ key }) => key)).toEqual([hslDecisionKey]);
  });

  for (const roleKey of ['enhetschef', 'verksamhetschef']) {
    // The managers read the HSL decision, as Support Management's namespace configuration grants them, and never write it.
    const installManagerErrand = (page: Page, activePhaseId: string) => {
      const profile = defaultInvestigationProfile();
      return installIafApiMock(page, {
        roleKeys: [roleKey],
        documents: allExistingInvestigationDocuments(),
        investigationProfile: profile,
        documentAccess: Object.fromEntries(
          profile.documents.map(({ key }) => [key, key === hslDecisionKey ? 'read' : 'edit'] as const)
        ),
        metadataPhases: investigationPhases,
        activePhaseId,
      });
    };

    test(`${roleKey} får inte Beslut HSL i utredningsfasen`, async ({ page, dismissCookieConsent }) => {
      await installManagerErrand(page, 'phase-investigation');
      await visitErrand(page, dismissCookieConsent);

      await expect(investigationTab(page)).toHaveCount(1);
      await expect(decisionTab(page)).toHaveCount(0);
    });

    test(`${roleKey} läser Beslut HSL i beslutsfasen men kan inte ändra det`, async ({
      page,
      dismissCookieConsent,
    }) => {
      await installManagerErrand(page, 'phase-decision');
      await visitErrand(page, dismissCookieConsent);

      await decisionTab(page).click();
      const decision = page.locator(`[data-cy="investigation-document-${hslDecisionKey}"]`);
      await expect(decision).toBeVisible();
      await expect(
        decision.locator(`#${hslDecisionKey}_ivoNotification`).getByRole('radio', { name: 'Ja', exact: true })
      ).toBeDisabled();
    });
  }

  test('utan fasmodell är flikarna kvar som förut', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, { documents: {} });

    await visitErrand(page, dismissCookieConsent);

    await expect(investigationTab(page)).toHaveCount(1);
    await expect(decisionTab(page)).toHaveCount(1);
    await expect(measuresTab(page)).toHaveCount(1);
    await expect(followUpTab(page)).toHaveCount(1);
  });
});
