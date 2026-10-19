import type { Locator, Page } from '@playwright/test';
import type { RJSFSchema } from '@rjsf/utils';

import { expect, test } from '../fixtures/base.fixture';
import {
  errandNumber,
  installIafApiMock,
  katlaParameterKey,
  katlaSchemaId,
  latestSchemaIds,
} from './fixtures/investigation-flow.mock';

// The date/time pair from Ärendeuppgifter, plus a row exercising wrapped labels
// and help below the input. All use the shared schema renderer.
const schema: RJSFSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  required: ['eventDate'],
  properties: {
    eventDate: { type: 'string', format: 'date', title: 'När upptäcktes händelsen?' },
    eventTime: { type: 'string', format: 'time', title: 'Vilken tid upptäcktes händelsen?' },
    reference: { type: 'string', title: 'Referens' },
    explanation: {
      type: 'string',
      title: 'En längre rubrik som behöver flera rader när formuläret visas i sin vanliga kolumnbredd',
    },
  },
};

// Not typed as rjsf's UiSchema: Draken's `ui:rows` is a row layout, where rjsf knows it only as a textarea's height.
const uiSchema = {
  eventDate: { 'ui:widget': 'date' },
  eventTime: {
    'ui:widget': 'time',
    'ui:description': 'Ange ungefärlig tid då händelsen upptäcktes.',
  },
  explanation: {
    'ui:description': 'Den här hjälptexten ska visas under inmatningsfältet och få radbrytas vid behov.',
    'ui:options': { descriptionBelow: true },
  },
  'ui:rows': [{ fields: ['eventDate', 'eventTime'] }, { fields: ['reference', 'explanation'] }],
};

async function mockLayoutSchema(page: Page, schemaId: string, name: string, latest = false) {
  await page.route(`**/schemas/${latest ? `${name}/latest` : schemaId}`, (route) =>
    route.fulfill({ json: { data: { id: schemaId, name, version: '1.1', value: schema }, message: 'success' } })
  );
  await page.route(`**/schemas/${schemaId}/ui-schema`, (route) =>
    route.fulfill({ json: { data: { id: schemaId, value: uiSchema }, message: 'success' } })
  );
}

async function expectAligned(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  expect(firstBox).not.toBeNull();
  expect(secondBox).not.toBeNull();
  expect(Math.abs(firstBox!.y - secondBox!.y)).toBeLessThanOrEqual(1);
  expect(secondBox!.x).toBeGreaterThanOrEqual(firstBox!.x + firstBox!.width);
}

test('schemafält linjerar med radbrutna rubriker och staplas på mobil, utan hjälptexter i den skrivskyddade visningen', async ({
  page,
  dismissCookieConsent,
  waitForFonts,
}, testInfo) => {
  await installIafApiMock(page);
  await mockLayoutSchema(page, katlaSchemaId, 'katla-report');
  await page.goto(`arende/${errandNumber}`);
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Ärendeuppgifter', exact: true }).click();
  await waitForFonts();

  const date = page.locator(`#${katlaParameterKey}_eventDate`);
  const time = page.locator(`#${katlaParameterKey}_eventTime`);
  const reference = page.locator(`#${katlaParameterKey}_reference`);
  const explanation = page.locator(`#${katlaParameterKey}_explanation`);
  const form = page.locator('.rjsf').filter({ has: date });
  await expect(date).toBeDisabled();
  await expectAligned(date, time);
  await expectAligned(reference, explanation);
  // Ä4. Ärendeuppgifter shows what was answered. How to answer was said to the one who filled the form in, so the
  // schema's descriptions and help texts are left out here.
  await expect(form).not.toContainText('Ange ungefärlig tid då händelsen upptäcktes.');
  await expect(form).not.toContainText('Den här hjälptexten ska visas under inmatningsfältet');
  await form.screenshot({ path: testInfo.outputPath('schema-fields-desktop.png') });

  await page.setViewportSize({ width: 390, height: 1000 });
  const dateBox = await date.boundingBox();
  const timeLabelBox = await page.locator(`label[for="${katlaParameterKey}_eventTime"]`).boundingBox();
  expect(timeLabelBox!.y).toBeGreaterThan(dateBox!.y + dateBox!.height);
  await expect
    .poll(() =>
      form
        .locator('[data-cy="schema-field-row"]')
        .evaluateAll((rows) => rows.every((row) => row.scrollWidth <= row.clientWidth))
    )
    .toBe(true);
});

test('schemafält behåller linjeringen när endast ena fältet har ett valideringsfel', async ({
  page,
  dismissCookieConsent,
  waitForFonts,
}) => {
  const key = 'utredning-sol-lss';
  const trace = await installIafApiMock(page, { documents: {} });
  await mockLayoutSchema(page, latestSchemaIds[key], key, true);
  await page.goto(`arende/${errandNumber}`);
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Utredning', exact: true }).click();
  await page.getByRole('tab', { name: 'Utredning Lex Sarah', exact: true }).click();
  await waitForFonts();

  const document = page.locator(`[data-cy="investigation-document-${key}"]`);
  const date = document.locator(`#${key}_eventDate`);
  const time = document.locator(`#${key}_eventTime`);
  // A form that is filled in carries the help texts, and its fields line up whatever help each of them has.
  await expectAligned(date, time);
  await expectAligned(document.locator(`#${key}_reference`), document.locator(`#${key}_explanation`));
  await expect(time).toHaveAccessibleDescription('Ange ungefärlig tid då händelsen upptäcktes.');
  await expect(document.locator(`#${key}_explanation`)).toHaveAccessibleDescription(
    'Den här hjälptexten ska visas under inmatningsfältet och få radbrytas vid behov.'
  );
  await time.fill('12:30');
  await page.locator('[data-cy="manage-sidebar"] [data-cy="save-button"]').click();
  await expect(date).toHaveAttribute('aria-invalid', 'true');
  await expect(time).toHaveAttribute('aria-invalid', 'false');
  await expect(document.locator(`#${key}_eventDate__error`)).toBeVisible();
  await expectAligned(date, time);
  expect(trace.puts).toHaveLength(0);
});
