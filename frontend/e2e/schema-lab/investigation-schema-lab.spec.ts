import { expect, Page, test } from '@playwright/test';

import hslDecisionSchemaRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/beslut-hsl.schema-request.json';
import solLssDecisionSchemaRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/beslut-sol-lss.schema-request.json';
import managerSchemaRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-enhetschef.schema-request.json';
import hslSchemaRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-hsl.schema-request.json';
import solLssSchemaRequest from '../../src/supportmanagement/investigation/avvikelse/schemas/utredning-sol-lss.schema-request.json';

const backendOrigin = 'http://localhost:3001';
const managerIdPrefix = 'utredning-enhetschef';
const solLssIdPrefix = 'utredning-sol-lss';
const hslIdPrefix = 'utredning-hsl';
const hslDecisionIdPrefix = 'beslut-hsl';
const investigationTabNames = ['Utredning enhetschef', 'Utredning Lex Sarah', 'Händelseanalys HSL'] as const;
const backendRequestsByPage = new WeakMap<Page, string[]>();
// The lab refuses a local draft saved against another schema version, so seeded drafts follow the
// artifacts rather than a version written out by hand here.
const schemaVersions: Record<string, string> = {
  'utredning-enhetschef': managerSchemaRequest.version,
  'utredning-sol-lss': solLssSchemaRequest.version,
  'utredning-hsl': hslSchemaRequest.version,
  'beslut-hsl': hslDecisionSchemaRequest.version,
  'beslut-sol-lss': solLssDecisionSchemaRequest.version,
};

async function openAllDisclosures(page: Page) {
  const activePanel = page.locator('[role="tabpanel"]:visible');
  const closedDisclosureButtons = activePanel.locator('.sk-disclosure-header-button[aria-expanded="false"]');

  for (let attempts = 0; attempts < 10 && (await closedDisclosureButtons.count()) > 0; attempts += 1) {
    await closedDisclosureButtons.first().click();
  }

  await expect(closedDisclosureButtons).toHaveCount(0);
}

async function expectActivePanelToStayWithinBoundaries(page: Page) {
  const documentWidths = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  }));
  expect(documentWidths.scrollWidth).toBeLessThanOrEqual(documentWidths.clientWidth + 1);

  const overflowedBoundaries = await page
    .locator('[role="tabpanel"]:visible')
    .locator(
      'form, fieldset, [data-cy="schema-field-row"], [data-cy="schema-object-fieldset"], .sk-disclosure-body, .schema-text-editor, .ql-toolbar'
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const htmlElement = element as HTMLElement;
        if (htmlElement.getClientRects().length === 0 || htmlElement.clientWidth === 0) return [];
        const boundary = htmlElement.getBoundingClientRect();
        return htmlElement.scrollWidth > htmlElement.clientWidth + 1
          ? [
              {
                element: htmlElement.id || htmlElement.className || htmlElement.tagName,
                clientWidth: htmlElement.clientWidth,
                scrollWidth: htmlElement.scrollWidth,
                leakingDescendants: [...htmlElement.querySelectorAll<HTMLElement>('*')].flatMap((descendant) => {
                  if (descendant.getClientRects().length === 0) return [];
                  const rect = descendant.getBoundingClientRect();
                  return rect.left < boundary.left - 1 ||
                    rect.right > boundary.right + 1 ||
                    descendant.scrollWidth > descendant.clientWidth + 1
                    ? [
                        {
                          element: descendant.id || descendant.className || descendant.tagName,
                          clientWidth: descendant.clientWidth,
                          left: Math.round(rect.left),
                          right: Math.round(rect.right),
                          scrollWidth: descendant.scrollWidth,
                        },
                      ]
                    : [];
                }),
              },
            ]
          : [];
      })
    );

  expect(overflowedBoundaries).toEqual([]);
}

async function expectVisibleTextEditorsToFillTheirFrames(page: Page) {
  const editors = page.locator('[role="tabpanel"]:visible .schema-text-editor:visible');
  await expect(editors.first()).toBeVisible();

  const metrics = await editors.evaluateAll((hosts) =>
    hosts.map((host) => {
      const container = host.querySelector<HTMLElement>('.ql-container');
      const editor = host.querySelector<HTMLElement>('.ql-editor');
      const hostRect = host.getBoundingClientRect();
      const containerRect = container?.getBoundingClientRect();
      const editorRect = editor?.getBoundingClientRect();

      return {
        id: editor?.id,
        hostHeight: hostRect.height,
        containerHeight: containerRect?.height ?? 0,
        containerBottomGap: containerRect ? Math.abs(hostRect.bottom - containerRect.bottom) : Number.POSITIVE_INFINITY,
        editorBottomGap:
          containerRect && editorRect ? Math.abs(containerRect.bottom - editorRect.bottom) : Number.POSITIVE_INFINITY,
      };
    })
  );

  for (const metric of metrics) {
    expect(metric.hostHeight, `${metric.id} saknar konfigurerad höjd`).toBeGreaterThan(0);
    expect(metric.containerHeight, `${metric.id} saknar synlig editorram`).toBeGreaterThan(0);
    expect(metric.containerBottomGap, `${metric.id} lämnar tomrum under editorramen`).toBeLessThanOrEqual(1);
    expect(metric.editorBottomGap, `${metric.id} lämnar en oklickbar yta i editorramen`).toBeLessThanOrEqual(1);
  }
}

test.beforeEach(async ({ page }) => {
  const backendRequests: string[] = [];
  backendRequestsByPage.set(page, backendRequests);
  await page.route(`${backendOrigin}/**`, async (route) => {
    backendRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });

  await page.goto('schema-lab/utredning');
  await expect(page.getByRole('heading', { name: 'Lokal schema-labb · Utredning' })).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(backendRequestsByPage.get(page)).toEqual([]);
});

test('opens all investigation sections without turning an unanswered draft into radio answers', async ({ page }) => {
  await page.evaluate((versions) => {
    for (const [key, formData] of [
      ['utredning-enhetschef', { legalBases: ['HSL', 'SOL'] }],
      ['utredning-sol-lss', {}],
      ['utredning-hsl', {}],
      ['beslut-hsl', {}],
      ['beslut-sol-lss', {}],
    ] as [string, Record<string, unknown>][]) {
      localStorage.setItem(
        `draken:investigation-schema-lab:${key}`,
        JSON.stringify({
          schemaKey: key,
          schemaVersion: versions[key],
          savedAt: new Date().toISOString(),
          formData,
        })
      );
    }
  }, schemaVersions);
  await page.reload();

  for (const tabName of investigationTabNames) {
    await page.getByRole('tab', { name: tabName }).click();
    const panel = page.locator('[role="tabpanel"]:visible');
    await expect(panel.getByRole('radio').first()).toBeVisible();
    await expect(panel.locator('input[type="radio"]:checked')).toHaveCount(0);
    // Scoped to the form: the local JSON preview below it is a closed disclosure of its own.
    await expect(
      panel.locator('form .schema-boundary-disclosure .sk-disclosure-header-button[aria-expanded="false"]')
    ).toHaveCount(0);
  }
});

test('is reachable with the standard IAF profile and renders the investigation and decision schemas', async ({
  page,
}) => {
  await expect(page.getByRole('heading', { name: 'Lokal schema-labb · Utredning' })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(5);
  await expect(page.getByRole('tab', { name: 'Utredning enhetschef' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Utredning Lex Sarah' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Händelseanalys HSL' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Beslut HSL', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Beslut SoL/LSS', exact: true })).toBeVisible();

  await expect(page.locator(`#${managerIdPrefix}_legalBases-group input:checked`)).toHaveCount(2);
  await expect(page.locator('[id$="_deviationType"]')).toHaveCount(0);
  await expect(page.locator('[id$="_deviationSubtype"]')).toHaveCount(0);
  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentHsl_calculatedRiskValue`)).toHaveValue('6');
  await expect(page.locator('[data-cy="hsl-risk-threshold-alert"]')).toContainText('HSL-riskvärde 6');
  await expect(page.getByText('Enhetschefens samlade utredning.', { exact: true })).toBeVisible();

  const duplicateIds = await page.locator('[id]').evaluateAll((elements) => {
    const counts = new Map<string, number>();
    for (const element of elements) counts.set(element.id, (counts.get(element.id) ?? 0) + 1);
    return [...counts.entries()].filter(([, count]) => count > 1);
  });
  expect(duplicateIds).toEqual([]);
});

test('updates risks and label choices when the manager changes legal bases', async ({ page }) => {
  const activePanel = page.locator('[role="tabpanel"]:visible');
  const legalBases = page.locator(`#${managerIdPrefix}_legalBases-group`);
  const hsl = legalBases.getByLabel(/^HSL –/u);
  const lss = legalBases.getByLabel(/^LSS –/u);
  const sol = legalBases.getByLabel(/^SoL –/u);
  const hslLabel = legalBases.getByText(/^HSL –/u);
  const lssLabel = legalBases.getByText(/^LSS –/u);
  const solLabel = legalBases.getByText(/^SoL –/u);
  // One categorization selector per legal base group, as in the errand: HSL, and SoL and LSS together.
  const categorizationGroups = activePanel.locator('[data-cy^="avvikelse-label-categorization-"]');
  const hslGroup = activePanel.locator('[data-cy="avvikelse-label-categorization-HSL"]');
  const socialGroup = activePanel.locator('[data-cy="avvikelse-label-categorization-SOL_LSS"]');
  const socialTypeSelect = socialGroup.locator('[data-cy="label-classification-type"]');

  // From schema 1.3 all three legal bases can apply at once, so the third stays selectable.
  await expect(lss).toBeEnabled();
  await expect(hslGroup.locator('legend')).toHaveText('HSL');
  await expect(hslGroup.locator('[data-cy="label-classification-type"]')).toHaveValue('hsl_fall');
  await expect(socialGroup.locator('legend')).toHaveText('SoL');
  await expect(socialTypeSelect).toHaveValue('sol_lss_brister_arbetssatt_metoder_rutiner');
  await hslLabel.click();
  await expect(hsl).not.toBeChecked();

  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentHsl_probability`)).toHaveCount(0);
  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentSolLss_probability`)).toBeVisible();
  await expect(page.locator(`#${managerIdPrefix}_suspectedMisconduct`)).toBeVisible();
  // The HSL selector leaves with its classification; the SoL/LSS selector keeps its own.
  await expect(hslGroup).toHaveCount(0);
  await expect(socialTypeSelect.locator('option[value="hsl_fall"]')).toHaveCount(0);
  await expect(socialTypeSelect).toHaveValue('sol_lss_brister_arbetssatt_metoder_rutiner');
  await expect(activePanel.locator('[data-cy="label-classification-notice"]')).toContainText(
    'ärendeklassificering passade inte längre valda lagrum'
  );

  // SoL and LSS share their selector, which is headed by whichever of them are chosen.
  await lssLabel.click();
  await expect(lss).toBeChecked();
  await expect(socialGroup.locator('legend')).toHaveText('SoL/LSS');
  await lssLabel.click();
  await expect(lss).not.toBeChecked();
  await expect(socialGroup.locator('legend')).toHaveText('SoL');

  await solLabel.click();
  await expect(sol).not.toBeChecked();
  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentSolLss_probability`)).toHaveCount(0);
  await expect(page.locator(`#${managerIdPrefix}_suspectedMisconduct`)).toHaveCount(0);
  await expect(categorizationGroups).toHaveCount(0);
  await expect(activePanel.getByText('Välj lagrum för att kunna kategorisera ärendet.')).toBeVisible();

  await activePanel.getByText('Visa lokalt JSON-värde', { exact: true }).click();
  const preview = page.locator('[data-cy="schema-form-data-preview"]:visible');
  await expect(preview).not.toContainText('riskAssessmentHsl');
  await expect(preview).not.toContainText('riskAssessmentSolLss');
  await expect(preview).not.toContainText('suspectedMisconduct');
});

test('mock roles make only the owned investigation editable', async ({ page }) => {
  await page.locator('[data-cy="utredning-sol-lss-tab"]').click();
  const activePanel = page.locator('[role="tabpanel"]:visible');
  const individualNotified = page
    .locator(`#${solLssIdPrefix}_individualNotified`)
    .getByRole('radio', { name: 'Ja', exact: true });
  await expect(individualNotified).toBeDisabled();
  // LEX chooses the legal bases of a misconduct, SoL or LSS, and only LEX may choose. The lab starts from the
  // schema's valid example, which names both; that nothing is chosen for LEX on an errand is the errand suite's.
  const lexLegalBases = page.locator(`#${solLssIdPrefix}_legalBases-group`);
  await expect(lexLegalBases.locator('input')).toHaveCount(2);
  await expect(lexLegalBases.locator('input:checked')).toHaveCount(2);
  await expect(lexLegalBases.getByLabel(/^SoL –/u)).toBeDisabled();
  await expect(activePanel.locator('[data-cy="schema-submit-button"]')).toHaveCount(0);

  await page.locator('[data-cy="investigation-lab-role"]').selectOption('lexInvestigator');
  await expect(individualNotified).toBeEnabled();
  await expect(lexLegalBases.getByLabel(/^SoL –/u)).toBeEnabled();
  await expect(activePanel.locator('[data-cy="schema-submit-button"]')).toBeVisible();
});

test('keeps the schema lab inside inner and outer design boundaries', async ({ page }) => {
  for (const width of [320, 375, 767, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    for (const tabName of investigationTabNames) {
      await page.getByRole('tab', { name: tabName }).click();
      await openAllDisclosures(page);
      await expectActivePanelToStayWithinBoundaries(page);
    }
  }

  await page.setViewportSize({ width: 1920, height: 1000 });
  const outerWidth = await page
    .locator('[data-cy="investigation-schema-lab-content"]')
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(outerWidth).toBeLessThanOrEqual(1440);
});

test('makes each text editor frame and writing area fill its configured height', async ({ page }) => {
  for (const width of [320, 1440]) {
    await page.setViewportSize({ width, height: 900 });

    for (const tabName of investigationTabNames) {
      await page.getByRole('tab', { name: tabName }).click();
      await openAllDisclosures(page);
      await expectVisibleTextEditorsToFillTheirFrames(page);
    }
  }
});

test('preserves WCAG reflow when text spacing is increased', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.addStyleTag({
    content: `
      main, main * {
        line-height: 1.5 !important;
        letter-spacing: 0.12em !important;
        word-spacing: 0.16em !important;
      }
      main p {
        margin-bottom: 2em !important;
      }
    `,
  });

  for (const tabName of investigationTabNames) {
    await page.getByRole('tab', { name: tabName }).click();
    await openAllDisclosures(page);
    await expectActivePanelToStayWithinBoundaries(page);
  }
});

test('exposes labels, descriptions, state and disclosure controls accessibly', async ({ page }) => {
  const editor = page.getByRole('textbox', { name: 'Utredningstext', exact: true });
  await expect(editor).toBeVisible();
  await expect(editor).toHaveAttribute('aria-multiline', 'true');
  await expect(editor).toHaveAttribute(
    'aria-describedby',
    new RegExp(`${managerIdPrefix}_investigationText__description`)
  );
  await expect(page.locator(`#${managerIdPrefix}_investigationText__description`)).toBeVisible();

  await expect(
    page.getByRole('radiogroup', { name: 'Sannolikhet för inträffande (Obligatorisk)' }).first()
  ).toBeVisible();
  await expect(page.getByRole('group', { name: /Vilket eller vilka lagrum gäller/u })).toBeVisible();

  const sectionButton = page.getByRole('button', { name: 'Kategorisering och dokumentation' });
  await expect(sectionButton).toHaveAttribute('aria-expanded', 'true');
  await sectionButton.focus();
  await page.keyboard.press('Enter');
  await expect(sectionButton).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Space');
  await expect(sectionButton).toHaveAttribute('aria-expanded', 'true');

  const visibleHeadingLevels = await page
    .locator('main h1:visible, main h2:visible, main h3:visible, main h4:visible')
    .evaluateAll((headings) => headings.map((heading) => Number(heading.tagName.slice(1))));
  expect(
    visibleHeadingLevels.every((level, index) => index === 0 || level - visibleHeadingLevels[index - 1] <= 1)
  ).toBe(true);

  await page.getByRole('button', { name: 'Spara utkast lokalt' }).click();
  await expect(page.getByRole('status')).toContainText('Utkastet är sparat');
});

test('marks an empty required field as an error only after a save attempt', async ({ page }) => {
  const assessedWith = page.locator(`#${managerIdPrefix}_riskAssessmentHsl_assessedWith`);
  const assessedWithError = page.locator(`#${managerIdPrefix}_riskAssessmentHsl_assessedWith__error`);
  // An unfinished draft may have empty fields. Marking the investigation finished is what makes
  // the schema require them. The requirement is conditional, so the form does not mark the field
  // required itself; the UI schema's indicator says so from the start.
  await expect(page.locator(`label[for="${managerIdPrefix}_riskAssessmentHsl_assessedWith"]`)).toContainText(
    '(Obligatorisk)'
  );
  await page.locator(`#${managerIdPrefix}_completed`).getByRole('radio', { name: 'Ja', exact: true }).check();
  await assessedWith.fill('');

  // The theme styles :invalid as an error, so an untouched empty field must not match it before saving.
  await expect(assessedWith).toHaveAttribute('aria-invalid', 'false');
  expect(await assessedWith.evaluate((input) => input.matches(':invalid'))).toBe(false);
  await expect(assessedWithError).toHaveCount(0);

  await page.getByRole('button', { name: 'Validera och spara lokalt' }).click();
  await expect(assessedWith).toHaveAttribute('aria-invalid', 'true');
  await expect(assessedWithError).toBeVisible();
});

test('calculates risk values and restores a locally saved draft after reload', async ({ page }) => {
  await page.locator(`#${managerIdPrefix}_riskAssessmentHsl_probability`).getByLabel(/^1 –/u).check();
  await page.locator(`#${managerIdPrefix}_riskAssessmentHsl_severity`).getByLabel(/^1 –/u).check();

  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentHsl_calculatedRiskValue`)).toHaveValue('1');
  await expect(page.locator('[data-cy="hsl-risk-threshold-alert"]')).toHaveCount(0);

  await page.getByRole('button', { name: 'Spara utkast lokalt' }).click();
  await expect(page.locator('[data-cy="investigation-lab-notice"]')).toContainText('Utkastet är sparat');

  await page.reload();
  await expect(page.locator(`#${managerIdPrefix}_riskAssessmentHsl_calculatedRiskValue`)).toHaveValue('1');
});

test('keeps SupportManagement labels separate from investigation JSON', async ({ page }) => {
  const activePanel = page.locator('[role="tabpanel"]:visible');
  const hslGroup = activePanel.locator('[data-cy="avvikelse-label-categorization-HSL"]');
  const typeSelect = hslGroup.locator('[data-cy="label-classification-type"]');
  const subtypeSelect = hslGroup.locator('[data-cy="label-classification-subtype"]');
  const socialClassification = {
    typeCode: 'sol_lss_brister_arbetssatt_metoder_rutiner',
    subtypeCode: 'sol_lss_brister_arbetssatt_brister_i_rutin',
  };

  await expect(hslGroup.getByLabel('Avvikelsetyp (obligatoriskt)')).toBeVisible();
  await expect(hslGroup.getByLabel('Underkategori (obligatorisk)')).toBeVisible();
  await expect(typeSelect.locator('option').first()).toHaveText('Välj avvikelsetyp');
  await expect(typeSelect).toHaveValue('hsl_fall');
  await typeSelect.selectOption('hsl_lakemedel');
  await expect(subtypeSelect).toHaveValue('');
  await subtypeSelect.selectOption('hsl_lakemedel_fel_dos');
  await page.getByRole('button', { name: 'Spara utkast lokalt' }).click();

  const storedValues = await page.evaluate(() => ({
    labels: window.localStorage.getItem('draken:investigation-schema-lab:supportmanagement-labels'),
    investigation: window.localStorage.getItem('draken:investigation-schema-lab:utredning-enhetschef'),
  }));

  // One selection per legal base group, the way the errand keeps one label path per group.
  expect(JSON.parse(storedValues.labels ?? '{}').value).toEqual({
    HSL: { typeCode: 'hsl_lakemedel', subtypeCode: 'hsl_lakemedel_fel_dos' },
    SOL_LSS: socialClassification,
  });
  expect(storedValues.investigation).not.toContain('deviationType');
  expect(storedValues.investigation).not.toContain('deviationSubtype');

  await page.reload();
  await expect(typeSelect).toHaveValue('hsl_lakemedel');
  await expect(subtypeSelect).toHaveValue('hsl_lakemedel_fel_dos');

  // Reported misconduct always has SoL and LSS, so the SoL/LSS investigation categorizes in that group only.
  await page.locator('[data-cy="utredning-sol-lss-tab"]').click();
  const socialPanelGroups = page.locator('[role="tabpanel"]:visible [data-cy^="avvikelse-label-categorization-"]');
  await expect(socialPanelGroups).toHaveCount(1);
  await expect(socialPanelGroups.locator('legend')).toHaveText('SoL/LSS');
  await expect(socialPanelGroups.locator('[data-cy="label-classification-type"]')).toHaveValue(
    socialClassification.typeCode
  );
});

test('sanitizes legacy label fields and ignores malformed local timestamps', async ({ page }) => {
  const activePanel = page.locator('[role="tabpanel"]:visible');
  await page.evaluate((schemaVersion) => {
    window.localStorage.setItem(
      'draken:investigation-schema-lab:utredning-enhetschef',
      JSON.stringify({
        schemaKey: 'utredning-enhetschef',
        schemaVersion,
        savedAt: '2026-08-11T10:00:00.000Z',
        formData: {
          legalBases: ['HSL'],
          deviationType: 'hsl_fall',
          deviationSubtype: 'hsl_fall_vid_forflyttning_med_personal',
        },
      })
    );
  }, schemaVersions['utredning-enhetschef']);
  await page.reload();

  await expect(page.locator('[data-cy="investigation-lab-notice"]')).toContainText(
    'Labelägda fält hittades i det lokala utkastet'
  );
  await activePanel.getByText('Visa lokalt JSON-värde', { exact: true }).click();
  const managerPreview = page.locator('[data-cy="schema-form-data-preview"]:visible');
  await expect(managerPreview).not.toContainText('deviationType');
  await expect(managerPreview).not.toContainText('deviationSubtype');

  await page.getByRole('button', { name: 'Spara utkast lokalt' }).click();
  const sanitizedDraft = await page.evaluate(() =>
    window.localStorage.getItem('draken:investigation-schema-lab:utredning-enhetschef')
  );
  expect(sanitizedDraft).not.toContain('deviationType');
  expect(sanitizedDraft).not.toContain('deviationSubtype');

  await page.evaluate(() => {
    window.localStorage.setItem(
      'draken:investigation-schema-lab:utredning-hsl',
      JSON.stringify({
        schemaKey: 'utredning-hsl',
        schemaVersion: '1.0',
        savedAt: 'not-a-date',
        formData: { methodology: '<p>Legacy</p>' },
      })
    );
  });
  await page.reload();
  await page.locator('[data-cy="utredning-hsl-tab"]').click();
  await expect(page.locator('[data-cy="investigation-lab-notice"]')).toContainText(
    'annan schemaversion eller är ogiltigt'
  );
  await expect(page.locator(`#${hslIdPrefix}_analysisTeamParticipants_0_name`)).toHaveValue('Anna Andersson');
});

test('the HSL investigation no longer asks about IVO; the HSL decision does', async ({ page }) => {
  await page.locator('[data-cy="investigation-lab-role"]').selectOption('masMar');
  await page.locator('[data-cy="utredning-hsl-tab"]').click();
  await openAllDisclosures(page);
  await expect(page.locator(`#${hslIdPrefix}_ivoNotification`)).toHaveCount(0);
  await expect(page.locator(`#${hslIdPrefix}_public360CaseNumber`)).toHaveCount(0);

  await page.locator('[data-cy="beslut-hsl-tab"]').click();
  const activePanel = page.locator('[role="tabpanel"]:visible');
  await openAllDisclosures(page);

  // The example is reported to IVO, so both case numbers are offered and Public 360 is required.
  const public360 = page.locator(`#${hslDecisionIdPrefix}_public360CaseNumber`);
  await expect(public360).toBeVisible();
  await expect(page.locator(`label[for="${hslDecisionIdPrefix}_public360CaseNumber"]`)).toHaveText(
    'Public 360 ärendenummer (Obligatorisk)'
  );
  await expect(page.locator(`#${hslDecisionIdPrefix}_ivoCaseNumber`)).toBeVisible();
  // The decision timestamps and revisions are the server's; the form never asks for them.
  for (const serverField of ['decidedAt', 'updatedAt', 'revisions']) {
    await expect(page.locator(`#${hslDecisionIdPrefix}_${serverField}`)).toHaveCount(0);
  }

  // A Nej removes both case numbers.
  await page.locator(`#${hslDecisionIdPrefix}_ivoNotification`).getByLabel('Nej').check();
  await expect(public360).toHaveCount(0);
  await expect(page.locator(`#${hslDecisionIdPrefix}_ivoCaseNumber`)).toHaveCount(0);

  await activePanel.getByText('Visa lokalt JSON-värde', { exact: true }).click();
  await expect(page.locator('[data-cy="schema-form-data-preview"]:visible')).not.toContainText('ivoCaseNumber');
  await page.getByRole('button', { name: 'Spara utkast lokalt' }).click();
  const storedHslDraft = await page.evaluate(() =>
    window.localStorage.getItem('draken:investigation-schema-lab:beslut-hsl')
  );
  expect(storedHslDraft).not.toContain('ivoCaseNumber');
  expect(storedHslDraft).not.toContain('public360CaseNumber');
});
