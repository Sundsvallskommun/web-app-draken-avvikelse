import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import {
  errandNumber,
  iafPlaceFixture,
  installIafApiMock,
  withPlaceStructure,
} from './fixtures/investigation-flow.mock';

/**
 * An errand Katla routed to the wrong unit is moved by rewriting its location labels, and nothing
 * else: the incoming JSON parameter stays the record of what was reported. These specs prove the
 * move goes through the named handover step with the place and a manager of that place, that no
 * document or errand PATCH is written alongside it, and that the card is not offered while the
 * errand is with LEX.
 */
const southManagers = [
  { adAccount: 'south.manager', displayName: 'Sonja Söder', roleKey: 'UNIT_MANAGER' },
  { adAccount: 'south.head', displayName: 'Hans Huvud', roleKey: 'HEAD_OF_OPERATIONS' },
];

async function visitErrand(page: Page, dismissCookieConsent: () => Promise<void>) {
  const errandResponse = page.waitForResponse(
    (response) => response.url().includes(`/supporterrands/errandnumber/${errandNumber}`) && response.status() === 200
  );
  await page.goto(`arende/${errandNumber}`);
  await errandResponse;
  await dismissCookieConsent();
}

/** The card sits at the top of Ärendeuppgifter, not inside an investigation document. */
async function openErrandDetails(page: Page) {
  await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ärendeuppgifter', exact: true })).toBeVisible();
}

/**
 * Searches the places the way a handler does. The combobox renders its options as inputs too, so its own is
 * found by its label; it opens the list on focus, and filters on keystrokes, which a fill does not send.
 */
async function searchPlace(modal: Locator, text: string) {
  const search = modal.getByRole('textbox', { name: 'Ny plats', exact: true });
  await search.click();
  await search.pressSequentially(text);
}

test.describe('Fel plats: flytta ärendet utan att ändra det inrapporterade', () => {
  test('visar platsen enligt labels och flyttar ärendet med plats och chef i ett handover-steg', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      ...withPlaceStructure(),
      locationManagers: { [iafPlaceFixture.southBlue.id]: southManagers },
    });
    await visitErrand(page, dismissCookieConsent);
    await openErrandDetails(page);

    // The card reads the place from the labels, presented the way Katla presents it: the unit at
    // level 6 and the department beneath it.
    const card = page.locator('[data-cy="errand-location"]');
    await expect(card).toBeVisible();
    await expect(card.locator('[data-cy="errand-location-name"]')).toHaveText('Norra hemmet — Avdelning: Blå');

    await card.locator('[data-cy="move-location-button"]').click();
    const modal = page.locator('[data-cy="move-location-modal"]');
    await expect(modal).toBeVisible();
    await expect(modal.locator('[data-cy="move-location-current"]')).toHaveText('Norra hemmet — Avdelning: Blå');
    await expect(modal.locator('[data-cy="move-location-confirm"]')).toBeDisabled();

    // Only the units at the bottom are on offer, searched across every level like Katla's picker.
    await searchPlace(modal, 'södra');
    const option = modal.getByRole('option', { name: 'Södra hemmet — Avdelning: Blå' });
    await expect(option).toBeVisible();
    await expect(modal.getByRole('option', { name: 'Norra hemmet — Avdelning: Blå' })).toHaveCount(0);
    await option.click();

    await expect(modal.locator('[data-cy="move-location-selected-name"]')).toHaveText('Södra hemmet — Avdelning: Blå');
    await expect.poll(() => trace.locationManagerGets).toEqual([iafPlaceFixture.southBlue.id]);

    // The managers of the *new* place, grouped by role, with the first preselected.
    const managerSelect = modal.locator('[data-cy="move-location-manager"]');
    await expect(managerSelect).toBeVisible();
    await expect(managerSelect.locator('optgroup[label="Enhetschef"] option')).toHaveText(['Sonja Söder']);
    await expect(managerSelect.locator('optgroup[label="Verksamhetschef"] option')).toHaveText(['Hans Huvud']);
    await managerSelect.selectOption('south.head');

    await modal.locator('[data-cy="move-location-confirm"]').click();

    // One named step carrying the place and the manager; the mover has written themselves out of
    // the errand, so the page goes to the overview instead of re-reading it.
    await expect(page).toHaveURL(/\/oversikt/u);
    expect(trace.handovers).toEqual([
      {
        step: 'move-location',
        seenFacts: expect.objectContaining({ routingLabels: expect.any(String) }),
        assignedUserId: 'south.head',
        locationLabelId: iafPlaceFixture.southBlue.id,
      },
    ]);
    // Nothing else was written: no investigation document, no errand PATCH, no classification.
    expect(trace.puts).toEqual([]);
    expect(trace.errandPatches).toEqual([]);
    expect(trace.classificationPatches).toEqual([]);
  });

  test('en ändring som någon annan hann göra stoppar flytten och behåller ärendet på sidan', async ({
    page,
    dismissCookieConsent,
  }) => {
    const trace = await installIafApiMock(page, {
      ...withPlaceStructure(),
      locationManagers: { [iafPlaceFixture.southHome.id]: [], [iafPlaceFixture.southBlue.id]: southManagers },
      handoverResult: 'conflict',
    });
    await visitErrand(page, dismissCookieConsent);
    await openErrandDetails(page);

    await page.locator('[data-cy="move-location-button"]').click();
    const modal = page.locator('[data-cy="move-location-modal"]');
    await searchPlace(modal, 'blå');
    await modal.getByRole('option', { name: 'Södra hemmet — Avdelning: Blå' }).click();
    await expect(modal.locator('[data-cy="move-location-manager"]')).toBeVisible();
    await modal.locator('[data-cy="move-location-confirm"]').click();

    await expect(modal.locator('[data-cy="move-location-error"]')).toContainText('ändrats av någon annan');
    await expect(page).toHaveURL(new RegExp(`arende/${errandNumber}`, 'u'));
    expect(trace.handovers).toHaveLength(1);
  });

  test('en plats utan konfigurerad chef kan inte ta emot ärendet', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, { ...withPlaceStructure(), locationManagers: {} });
    await visitErrand(page, dismissCookieConsent);
    await openErrandDetails(page);

    await page.locator('[data-cy="move-location-button"]').click();
    const modal = page.locator('[data-cy="move-location-modal"]');
    await searchPlace(modal, 'södra');
    await modal.getByRole('option', { name: 'Södra hemmet — Avdelning: Blå' }).click();

    await expect(modal.locator('[data-cy="move-location-no-managers"]')).toContainText(
      'Ingen chef är konfigurerad för Blå'
    );
    await expect(modal.locator('[data-cy="move-location-confirm"]')).toBeDisabled();
    expect(trace.handovers).toEqual([]);
  });

  test('erbjuds inte medan ärendet är hos LEX', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page, withPlaceStructure({ withLex: true }));
    await visitErrand(page, dismissCookieConsent);
    await openErrandDetails(page);

    await expect(page.locator('[data-cy="errand-location"]')).toHaveCount(0);
  });

  test('visas inte alls när metadata saknar platsstruktur', async ({ page, dismissCookieConsent }) => {
    await installIafApiMock(page);
    await visitErrand(page, dismissCookieConsent);
    await openErrandDetails(page);

    await expect(page.locator('[data-cy="errand-location"]')).toHaveCount(0);
  });
});
