import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  defaultInvestigationProfile,
  errandNumber,
  iafPlaceFixture,
  installIafApiMock,
  latestSchemaIds,
  lexAssessmentKey,
  withPlaceStructure,
} from './fixtures/investigation-flow.mock';

/**
 * LEX-ansvarig's initial assessment sits in Ärendeuppgifter while the errand is with LEX. When it declines to
 * lex-investigate, the errand goes back to a manager of its place - the BFF writes the motivation as a service
 * note and hands it back as a deviation; here only the step the client names is checked.
 */
const motivation = 'Händelsen gäller inte omsorgen om den enskilde.';

/** A saved assessment as the BFF leaves it: the server stamps its times and records the save. */
const assessment = (value: Record<string, unknown>) => ({
  key: lexAssessmentKey,
  schemaId: latestSchemaIds[lexAssessmentKey],
  value: {
    assessedAt: '2026-10-06T09:00:00.000Z',
    updatedAt: '2026-10-06T09:00:00.000Z',
    revisions: [{ savedAt: '2026-10-06T09:00:00.000Z', savedBy: 'iaf.test' }],
    ...value,
  },
  version: 1,
  etag: '"1"',
});

async function installAssessedErrand(
  page: Page,
  {
    withLex = true,
    saved,
    errandStatus,
  }: { withLex?: boolean; saved?: Record<string, unknown>; errandStatus?: string } = {}
) {
  const profile = defaultInvestigationProfile();
  profile.documents = [
    ...profile.documents,
    {
      key: lexAssessmentKey,
      schemaName: lexAssessmentKey,
      tabLabel: 'Lex Sarah-ansvarigs initiala bedömning',
      ownerLabel: 'LEX-ansvarig',
      placement: 'details',
    },
  ];
  return installIafApiMock(page, {
    ...withPlaceStructure({ withLex }),
    assignedUserId: 'iaf.test',
    ...(errandStatus ? { errandStatus } : {}),
    investigationProfile: profile,
    roleKeys: ['lex-ansvarig'],
    documents: saved ? { [lexAssessmentKey]: assessment(saved) } : {},
    locationManagers: {
      [iafPlaceFixture.northBlue.id]: [{ adAccount: 'nora.chef', displayName: 'Nora Chef', roleKey: 'UNIT_MANAGER' }],
    },
  });
}

const assessmentSection = (page: Page) => page.locator(`[data-cy="details-document-${lexAssessmentKey}"]`);

async function openDetails(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
}

test('visar den initiala bedömningen i Ärendeuppgifter medan ärendet är hos LEX', async ({
  page,
  dismissCookieConsent,
}) => {
  await installAssessedErrand(page);
  await openDetails(page, dismissCookieConsent);

  await expect(assessmentSection(page)).toContainText('Lex Sarah-ansvarigs initiala bedömning');
  await expect(assessmentSection(page)).toContainText('Ska ärendet anmälas till IVO?');
  await expect(assessmentSection(page)).toContainText('Jag beslutar att ärendet');
  // Nothing is declined yet, so there is nothing to hand back.
  await expect(page.locator('[data-cy="decline-lex-button"]')).toHaveCount(0);
});

test('visar ingen bedömning på ett ärende som aldrig varit hos LEX', async ({ page, dismissCookieConsent }) => {
  await installAssessedErrand(page, { withLex: false });
  await openDetails(page, dismissCookieConsent);

  await expect(page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true })).toHaveAttribute(
    'aria-selected',
    'true'
  );
  await expect(assessmentSection(page)).toHaveCount(0);
});

test('lämnar tillbaka ärendet till en chef för platsen när bedömningen avböjer lex-utredning', async ({
  page,
  dismissCookieConsent,
}) => {
  const trace = await installAssessedErrand(page, {
    saved: {
      ivoNotification: 'no',
      lexInvestigationDecision: 'not_investigate',
      notInvestigatedMotivation: motivation,
    },
  });
  await openDetails(page, dismissCookieConsent);

  await page.locator('[data-cy="decline-lex-button"]').click();
  const dialog = page.locator('[data-cy="handler-assignment-modal"]');
  await expect(dialog).toContainText('Motiveringen sparas som en tjänsteanteckning på ärendet.');
  await dialog.getByRole('button', { name: 'Lämna tillbaka ärendet', exact: true }).click();

  await expect
    .poll(() => trace.handovers)
    .toEqual([expect.objectContaining({ step: 'decline-lex', assignedUserId: 'nora.chef' })]);
});

// A handover leaves the errand ASSIGNED with LEX. Handing it straight back needs no resume first.
test('lämnar tillbaka ett tilldelat ärende utan att det först återupptas', async ({ page, dismissCookieConsent }) => {
  const trace = await installAssessedErrand(page, {
    errandStatus: 'ASSIGNED',
    saved: {
      ivoNotification: 'no',
      lexInvestigationDecision: 'not_investigate',
      notInvestigatedMotivation: motivation,
    },
  });
  await openDetails(page, dismissCookieConsent);

  await page.locator('[data-cy="decline-lex-button"]').click();
  const dialog = page.locator('[data-cy="handler-assignment-modal"]');
  await dialog.getByRole('button', { name: 'Lämna tillbaka ärendet', exact: true }).click();

  await expect
    .poll(() => trace.handovers)
    .toEqual([expect.objectContaining({ step: 'decline-lex', assignedUserId: 'nora.chef' })]);
});
