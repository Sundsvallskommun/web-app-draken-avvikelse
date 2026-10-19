import type { Measure } from '../../src/common/data-contracts/supportmanagement/data-contracts';
import type { MeasureDecisionInput } from '../../src/supportmanagement/measures/measure-decision';
import type {
  MeasureChanges,
  MeasuresSnapshot,
  NewMeasure,
} from '../../src/supportmanagement/measures/support-measure-service';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/base.fixture';
import { errandNumber, installIafApiMock, type WorkflowPhaseName } from './fixtures/investigation-flow.mock';

// Support Management keys a measure's type by the metadata name.
const firstType = 'FIRST';
const secondType = 'SECOND';
const oldType = 'OLD';

async function installMeasures(
  page: Page,
  {
    canEdit = true,
    failWrite = false,
    conflictOnce = false,
    conflictDecidedBy,
    denyRead = false,
    noCreationRoles = false,
    singleCreationRole = false,
    registrationStatus = 'ready',
    reloadDelayMs = 0,
    foreignMeasure = false,
    undatedProposal = false,
    existingDecision,
    activePhaseName,
  }: {
    canEdit?: boolean;
    failWrite?: boolean;
    /** Someone else writes first: the next write is rejected once and the stored measure moves on. */
    conflictOnce?: boolean;
    /** The competing write is a decision, so the measure comes back settled and its content locked. */
    conflictDecidedBy?: Measure['accept'];
    denyRead?: boolean;
    noCreationRoles?: boolean;
    singleCreationRole?: boolean;
    registrationStatus?: MeasuresSnapshot['registration']['status'];
    /** Delays every read after the first, to observe what the tab shows while it reloads. */
    reloadDelayMs?: number;
    /** The existing measure was registered by another user. */
    foreignMeasure?: boolean;
    /** The existing measure is a proposal without dates, which is how a proposing role registers one. */
    undatedProposal?: boolean;
    existingDecision?: Measure['accept'];
    /** The workflow phase the errand is in; left out, the errand runs no workflow. */
    activePhaseName?: WorkflowPhaseName;
  } = {}
) {
  const trace = await installIafApiMock(page, {
    canEdit,
    activePhaseName,
  });
  const writes: Array<{ method: string; data: unknown; version?: string }> = [];
  let reads = 0;
  let conflicted = false;
  let errandVersion = 7;
  const measures: Measure[] = [
    {
      id: 'existing',
      type: oldType,
      version: 3,
      goal: 'Befintligt mål',
      description: 'Befintlig beskrivning',
      ...(undatedProposal ? {} : { plannedStart: '2026-09-08T00:00:00Z', plannedComplete: '2026-09-10T00:00:00Z' }),
      addedByRole: undatedProposal ? 'NURSE' : 'MANAGER',
      addedByUser: foreignMeasure ? 'someone.else' : 'iaf.test',
      accept: existingDecision,
      acceptMotivation:
        existingDecision === 'REWORK'
          ? 'Genomför endast dokumentationsdelen, övrigt ingår i ordinarie arbete.'
          : undefined,
      created: '2026-09-09T13:39:54+02:00',
    },
  ];
  const metadata: MeasuresSnapshot['metadata'] = {
    roles: [
      { id: 'role-manager', name: 'MANAGER', displayName: 'Enhetschef' },
      { id: 'role-nurse', name: 'NURSE', displayName: 'HSL' },
    ],
    measureTypes: [
      {
        id: 'dd000000-0000-4000-8000-000000000101',
        name: secondType,
        displayName: 'Handledning',
        measureGroups: ['Förebyggande', 'SHARED'],
        sortOrder: 2,
      },
      {
        id: 'dd000000-0000-4000-8000-000000000100',
        name: firstType,
        displayName: 'Utbildning',
        measureGroups: ['Förebyggande', 'SHARED'],
        sortOrder: 1,
      },
      {
        id: 'dd000000-0000-4000-8000-000000000102',
        name: oldType,
        displayName: 'Tidigare åtgärdstyp',
        measureGroups: ['Förebyggande', 'SHARED'],
        deprecated: true,
      },
    ],
  };
  const creationRoles =
    noCreationRoles || registrationStatus !== 'ready'
      ? []
      : singleCreationRole
      ? metadata.roles.slice(0, 1)
      : metadata.roles;
  const registration: MeasuresSnapshot['registration'] = {
    status: registrationStatus,
    roleTypes:
      registrationStatus === 'ready'
        ? [
            { roleName: 'MANAGER', measureTypes: [firstType, secondType], decides: true },
            { roleName: 'NURSE', measureTypes: [firstType], decides: false },
          ]
        : [],
  };
  await page.route(/\/supporterrands\/[^/]+\/measures(?:\/[^/]+(?:\/decision)?)?$/, async (route) => {
    const request = route.request();
    if (request.method() === 'GET') {
      reads++;
      if (reads > 1 && reloadDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, reloadDelayMs));
      await route.fulfill(
        denyRead
          ? { status: 403, json: { message: 'Denied' } }
          : {
              json: {
                measures,
                errandVersion,
                metadata,
                creationRoles,
                registration,
                canWrite: true,
                mayFollowUp: true,
              },
            }
      );
      return;
    }
    writes.push({ method: request.method(), data: request.postDataJSON(), version: request.headers()['if-match'] });
    if (failWrite) {
      await route.fulfill({ status: 412, json: { message: 'Stale version' } });
      return;
    }
    if ((conflictOnce || conflictDecidedBy) && !conflicted) {
      conflicted = true;
      // Apply the competing write before rejecting, so the reload the client performs sees what really changed.
      measures[0] = conflictDecidedBy
        ? {
            ...measures[0],
            accept: conflictDecidedBy,
            acceptMotivation: 'Avgjort av någon annan.',
            version: (measures[0].version ?? 0) + 1,
          }
        : { ...measures[0], goal: 'Mål satt av någon annan', version: (measures[0].version ?? 0) + 1 };
      errandVersion++;
      await route.fulfill({ status: 412, json: { message: 'Stale version' } });
      return;
    }
    if (request.method() === 'DELETE') {
      const removedId = new URL(request.url()).pathname.split('/').pop();
      measures.splice(
        measures.findIndex((measure) => measure.id === removedId),
        1
      );
      errandVersion++;
      await route.fulfill({ status: 204 });
      return;
    }
    if (new URL(request.url()).pathname.endsWith('/decision')) {
      const decision: MeasureDecisionInput = request.postDataJSON();
      measures[0] = { ...measures[0], ...decision, version: (measures[0].version ?? 0) + 1 };
      errandVersion++;
      await route.fulfill({ status: 204 });
      return;
    }
    if (request.method() === 'POST') {
      const body: NewMeasure = request.postDataJSON();
      measures.push({
        ...body,
        id: 'new-measure',
        addedByUser: 'authenticated-user',
        accept: body.addedByRole === 'MANAGER' ? 'TRUE' : undefined,
        version: 0,
      });
      errandVersion++;
      await route.fulfill({ status: 204 });
      return;
    }
    const body: MeasureChanges = request.postDataJSON();
    measures[0] = {
      ...measures[0],
      ...body,
      version: (measures[0].version ?? 0) + 1,
    };
    errandVersion++;
    await route.fulfill({ status: 204 });
  });
  return { writes, trace, reads: () => reads };
}

/** Next.js' route announcer is also role="alert", so alerts are read inside the tab panel only. */
const measuresAlert = (page: Page) => page.getByRole('tabpanel', { name: 'Åtgärder' }).getByRole('alert');
/** Editing happens in a modal; the page form is reserved for new measures. */
const editDialog = (page: Page) => page.getByRole('dialog', { name: 'Redigera åtgärd' });

async function openMeasures(page: Page, dismissCookieConsent: () => Promise<void>) {
  await page.goto('arende/' + errandNumber);
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Åtgärder', exact: true }).click();
  await expect(page.getByText('Befintligt mål', { exact: true })).toBeVisible();
}

test('creates a measure for an explicitly selected granted role', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page);
  await openMeasures(page, dismissCookieConsent);
  const roles = page.getByLabel('Registrera åtgärden för rollen (Obligatoriskt)', { exact: true });
  await expect(roles).toHaveValue('');
  await expect(roles.locator('option')).toHaveText(['Välj registreringsroll', 'Enhetschef', 'HSL']);
  const types = page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true });
  await expect(types).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Lägg till åtgärd', exact: true })).toBeDisabled();
  await roles.selectOption('NURSE');
  await expect(page.getByRole('button', { name: 'Lägg till förslag till åtgärd', exact: true })).toBeVisible();
  await expect(page.locator('[data-cy="measure-proposal-notice"]')).toBeVisible();
  await expect(types).toBeEnabled();
  await expect(types.locator('option')).toHaveText(['Välj typ av åtgärd', 'Utbildning']);
  await types.selectOption(firstType);
  // A proposal has no timing and no dates: the one who approves it says when it runs.
  await expect(page.getByLabel('Genomförda åtgärder', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Planerade åtgärder', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('När ska åtgärden påbörjas? (Obligatoriskt)', { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-cy="measure-undated-proposal"]')).toContainText(
    'Start- och slutdatum anges av den som godkänner förslaget'
  );
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Gemensam utbildning');
  await page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Säkrare arbetssätt');
  await page.getByRole('button', { name: 'Lägg till förslag till åtgärd', exact: true }).click();
  await expect(page.getByText('Säkrare arbetssätt', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([
    {
      method: 'POST',
      version: undefined,
      data: {
        type: firstType,
        addedByRole: 'NURSE',
        description: 'Gemensam utbildning',
        goal: 'Säkrare arbetssätt',
      },
    },
  ]);
  const created = page
    .getByRole('list', { name: 'Registrerade åtgärder' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { name: 'Utbildning', exact: true }) });
  await expect(created).toContainText('Skapad av authenticated-user (HSL)');
  await expect(created.getByText('Ej bedömd', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true })).toHaveValue('');
  expect(state.trace.puts).toEqual([]);
  expect(state.trace.errandPatches).toEqual([]);
});

test('keeps existing measures editable when creation roles are unavailable', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { noCreationRoles: true });
  await openMeasures(page, dismissCookieConsent);
  await expect(
    page.getByText(
      'Du har ingen registreringsroll för åtgärder i den här verksamheten. Kontakta administratören om du behöver kunna lägga till åtgärder.'
    )
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Lägg till åtgärd', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Registrerade åtgärder' })).toContainText('(Enhetschef)');
  await expect(page.getByRole('button', { name: /^Redigera åtgärd/ })).toBeVisible();
  expect(state.writes).toEqual([]);
});

test('changes type using sorted metadata UUIDs and the measure ETag', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page);
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Redigera åtgärd', exact: true })).toBeVisible();
  await expect(dialog).toContainText('Åtgärden är registrerad för rollen Enhetschef');
  const types = dialog.getByLabel('Åtgärd (Obligatoriskt)', { exact: true });
  await expect(types.locator('option')).toHaveText([
    'Välj typ av åtgärd',
    'Utbildning',
    'Handledning',
    'Tidigare åtgärdstyp (utgången)',
  ]);
  await types.selectOption(firstType);
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Utbildning', exact: true })).toBeVisible();
  expect(state.writes).toEqual([{ method: 'PATCH', version: '"3"', data: { type: firstType } }]);
  expect(state.trace.puts).toEqual([]);
  expect(state.trace.errandPatches).toEqual([]);
});

test('edits historic measures narrowly and uses the refreshed measure version for a second edit', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installMeasures(page);
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  await expect(editDialog(page).getByLabel('Åtgärd (Obligatoriskt)', { exact: true })).toHaveValue(oldType);
  await editDialog(page).getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Ändrat mål');
  await editDialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  await expect(page.getByText('Ändrat mål', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  await editDialog(page).getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Nästa mål');
  await editDialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  await expect(page.getByText('Nästa mål', { exact: true })).toBeVisible();
  expect(state.writes).toEqual([
    { method: 'PATCH', version: '"3"', data: { goal: 'Ändrat mål' } },
    { method: 'PATCH', version: '"4"', data: { goal: 'Nästa mål' } },
  ]);
});

test('keeps the draft and reports a version conflict', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { failWrite: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Mitt osparade mål');
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  const alert = dialog.getByRole('alert');
  // A rejected edit is rebased on the measure as it now stands, so it is reported as the other writer's change.
  await expect(alert).toContainText('Åtgärden har ändrats av någon annan');
  await expect(alert).toBeFocused();
  await expect(dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true })).toHaveValue(
    'Mitt osparade mål'
  );
});

test('does not claim a rebase when a new measure conflicts with a moved errand', async ({
  page,
  dismissCookieConsent,
}) => {
  // A create has nothing to rebase onto: a conflict there means the errand itself moved on, so the merge
  // wording would be false on every count and no retry can succeed.
  await installMeasures(page, { singleCreationRole: true, failWrite: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true }).selectOption(firstType);
  await page.getByLabel('Planerade åtgärder', { exact: true }).check();
  await page.getByLabel('När ska åtgärden påbörjas? (Obligatoriskt)', { exact: true }).fill('2026-09-08');
  await page.getByLabel('När ska åtgärden vara klar? (Obligatoriskt)', { exact: true }).fill('2026-09-10');
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Ny åtgärd');
  await page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Nytt mål');
  await page.getByRole('button', { name: /^Lägg till/ }).click();

  const alert = measuresAlert(page).filter({ hasText: 'Åtgärden kunde inte sparas' });
  await expect(alert).toContainText('uppdaterats av någon annan');
  await expect(alert).not.toContainText('Fälten är uppdaterade');
});

test('rebases the open edit on the current measure so a retry succeeds', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { conflictOnce: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await dialog.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Min ändrade beskrivning');
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Åtgärden har ändrats av någon annan');
  await expect(alert).toContainText('Fälten är uppdaterade med den andra ändringen');
  await expect(alert).toBeFocused();
  // The typed field is kept, and the goal nobody here touched follows the competing writer instead of being
  // silently restored to this user's stale copy on the retry.
  await expect(dialog.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true })).toHaveValue(
    'Min ändrade beskrivning'
  );
  await expect(dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true })).toHaveValue(
    'Mål satt av någon annan'
  );

  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  await expect(editDialog(page)).toBeHidden();
  // The second patch carries the draft only: goal is absent because it now matches the rebased measure.
  expect(state.writes).toEqual([
    { method: 'PATCH', version: '"3"', data: { description: 'Min ändrade beskrivning' } },
    { method: 'PATCH', version: '"4"', data: { description: 'Min ändrade beskrivning' } },
  ]);
});

test('warns which field it will overwrite when both writers edited the same one', async ({
  page,
  dismissCookieConsent,
}) => {
  await installMeasures(page, { conflictOnce: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  const goal = dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true });
  await goal.fill('Mitt mål');
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();

  await expect(dialog.getByRole('alert')).toContainText('utom där ni båda skrivit: Mål');
  await expect(goal).toHaveValue('Mitt mål');
});

test('explains that a decision locked the content instead of inviting a retry', async ({
  page,
  dismissCookieConsent,
}) => {
  await installMeasures(page, { conflictDecidedBy: 'FALSE' });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await dialog.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Min ändrade beskrivning');
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();

  const alert = dialog.getByRole('alert');
  await expect(alert).toContainText('Åtgärden har ändrats av någon annan');
  await expect(alert).toContainText('typ, beskrivning och mål är nu låsta');
  await expect(dialog.getByText('Motivering till avslag', { exact: true })).toBeVisible();
  // Locked content stays readable: read-only, not disabled.
  await expect(dialog.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true })).not.toBeEditable();
});

test('stops offering a decision that someone else already made', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { conflictDecidedBy: 'TRUE' });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Bedöm förslag/ }).click();
  const dialog = decisionDialog(page);
  await dialog.getByRole('radio', { name: 'Avslå', exact: true }).check();
  await dialog.getByLabel('Beslutskommentar (Obligatoriskt)', { exact: true }).fill('Min motivering');
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();

  await expect(dialog.getByText('Förslaget är redan avgjort')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Spara beslut', exact: true })).toBeHidden();
  await expect(dialog.getByLabel('Beslutskommentar (Obligatoriskt)', { exact: true })).toHaveValue('Min motivering');
  // The settled dialog's own button, not the modal's close icon that shares its name.
  await dialog.getByRole('button', { name: 'Stäng', exact: true }).filter({ hasText: 'Stäng' }).click();
  await expect(decisionDialog(page)).toBeHidden();
});

test('offers editing only for measures the current user registered', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { foreignMeasure: true });
  await openMeasures(page, dismissCookieConsent);
  const cards = page.getByRole('list', { name: 'Registrerade åtgärder' }).getByRole('listitem');
  await expect(cards.first()).toContainText('Skapad av someone.else');
  await expect(page.getByRole('button', { name: /^Redigera åtgärd/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Ta bort/ })).toHaveCount(0);
});

test('shows a read view without edit permission', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { canEdit: false });
  await openMeasures(page, dismissCookieConsent);
  await expect(page.getByRole('button', { name: 'Lägg till åtgärd' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Redigera åtgärd/ })).toHaveCount(0);
});

test('reports denied access instead of a falsely empty list', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { denyRead: true });
  await page.goto('arende/' + errandNumber);
  await dismissCookieConsent();
  await page.getByRole('tab', { name: 'Åtgärder', exact: true }).click();
  await expect(measuresAlert(page)).toContainText('saknar behörighet att läsa åtgärder');
  await expect(page.getByText('Det finns inga åtgärder registrerade.')).toHaveCount(0);
});

test('changing registration role resets the type while preserving the draft text', async ({
  page,
  dismissCookieConsent,
}) => {
  await installMeasures(page);
  await openMeasures(page, dismissCookieConsent);
  const role = page.getByLabel('Registrera åtgärden för rollen (Obligatoriskt)', { exact: true });
  const type = page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true });
  await role.selectOption('MANAGER');
  await type.selectOption(secondType);
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Mitt utkast');
  await role.selectOption('NURSE');
  await expect(type).toHaveValue('');
  await expect(type.locator('option')).toHaveText(['Välj typ av åtgärd', 'Utbildning']);
  await expect(page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true })).toHaveValue('Mitt utkast');
});

test('skips the role step and registers for the only granted role', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { singleCreationRole: true, reloadDelayMs: 800 });
  await openMeasures(page, dismissCookieConsent);
  await expect(page.getByLabel('Registrera åtgärden för rollen (Obligatoriskt)', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '1. Välj registreringsroll' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /Beskriv åtgärden/ })).toHaveCount(0);
  await expect(page.locator('[data-cy="measure-registration-role"]')).toHaveCount(0);
  await expect(page.locator('[data-cy="measure-proposal-notice"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Lägg till åtgärd', exact: true })).toBeVisible();
  const types = page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true });
  await expect(types).toBeEnabled();
  await expect(types.locator('option')).toHaveText(['Välj typ av åtgärd', 'Utbildning', 'Handledning']);
  await types.selectOption(secondType);
  await page.getByLabel('Genomförda åtgärder', { exact: true }).check();
  await page.getByLabel('När genomfördes åtgärden? (Obligatoriskt)', { exact: true }).fill('2026-09-08');
  await page.getByLabel('Ansvarig för åtgärden', { exact: true }).fill(' Anna Andersson ');
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Handledning i teamet');
  await page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Tydligare rutiner');
  await page.getByRole('button', { name: 'Lägg till åtgärd', exact: true }).click();
  // The reload is still pending here (delayed read): the tab marks itself busy but keeps its content on screen.
  const busy = page.locator('[data-cy="support-measures-tab"] [aria-busy="true"]');
  await expect(busy).toBeVisible();
  // Uppföljning is a measures tab too; its hidden panel keeps a spinner of its own until it is opened.
  expect(await page.locator('[data-cy="support-measures-tab"]').getByLabel('Åtgärder laddas').count()).toBe(0);
  await expect(busy.getByRole('form', { name: 'Lägg till åtgärder' })).toBeVisible();
  await expect(busy).toHaveCount(0);
  await expect(page.getByText('Tydligare rutiner', { exact: true })).toBeVisible();
  await expect(page.getByText('Anna Andersson', { exact: true })).toBeVisible();
  expect(state.writes).toHaveLength(1);
  expect(state.writes[0].data).toMatchObject({
    type: secondType,
    addedByRole: 'MANAGER',
    responsibleUser: 'Anna Andersson',
  });
});

test('lists validation errors in an alert that links to the fields', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { singleCreationRole: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Bara en beskrivning');
  await page.getByRole('button', { name: 'Lägg till åtgärd', exact: true }).click();
  const alert = measuresAlert(page);
  await expect(alert).toContainText('Kontrollera uppgifterna innan du sparar');
  await expect(alert).toBeFocused();
  await alert.getByRole('link', { name: 'Välj typ av åtgärd.' }).click();
  await expect(page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true })).toBeFocused();
});

test('rejects an executed date in the future before saving', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { singleCreationRole: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true }).selectOption(firstType);
  await page.getByLabel('Genomförda åtgärder', { exact: true }).check();
  const executed = page.getByLabel('När genomfördes åtgärden? (Obligatoriskt)', { exact: true });
  await expect(executed).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/);
  await executed.fill('2099-01-01');
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('x');
  await page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('y');
  await page.getByRole('button', { name: 'Lägg till åtgärd', exact: true }).click();
  await expect(measuresAlert(page)).toContainText('Genomfört datum kan inte ligga i framtiden.');
  expect(state.writes).toEqual([]);
});

test('filters the list by status, decision, role, type and text', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { singleCreationRole: true, existingDecision: 'REWORK' });
  await openMeasures(page, dismissCookieConsent);
  // Add a second, executed measure so the filters have something to separate.
  await page.getByLabel('Åtgärd (Obligatoriskt)', { exact: true }).selectOption(firstType);
  await page.getByLabel('Genomförda åtgärder', { exact: true }).check();
  await page.getByLabel('När genomfördes åtgärden? (Obligatoriskt)', { exact: true }).fill('2026-09-08');
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Genomgång av rutin');
  await page.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Alla känner rutinen');
  await page.getByRole('button', { name: 'Lägg till åtgärd', exact: true }).click();
  const cards = page.getByRole('list', { name: 'Registrerade åtgärder' }).getByRole('listitem');
  await expect(cards).toHaveCount(2);
  const filters = page.getByRole('group', { name: 'Filtrera och sortera åtgärder' });
  const summary = page.locator('[data-cy="measure-filter-summary"]');
  await expect(summary).toHaveText('2 åtgärder.');

  await filters.getByLabel('Genomförande', { exact: true }).selectOption('executed');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByRole('heading', { name: 'Utbildning', exact: true })).toBeVisible();
  await expect(summary).toHaveText('Visar 1 av 2 åtgärder.');

  await filters.getByRole('button', { name: 'Rensa filter', exact: true }).click();
  await expect(cards).toHaveCount(2);
  await filters.getByLabel('Godkännande', { exact: true }).selectOption('rework');
  await expect(cards.first().getByRole('heading', { name: 'Tidigare åtgärdstyp', exact: true })).toBeVisible();
  await expect(cards).toHaveCount(1);

  await filters.getByLabel('Sök', { exact: true }).fill('rutin');
  await expect(page.getByText('Inga åtgärder matchar filtret.')).toBeVisible();
  await filters.getByLabel('Godkännande', { exact: true }).selectOption('');
  await expect(cards).toHaveCount(1);
  await expect(filters.getByLabel('Registrerad av', { exact: true }).locator('option')).toHaveText([
    'Alla',
    'Enhetschef',
  ]);
});

// A new measure is added or left as it is: its form offers nothing that clears it.
test('offers no clearing of a new measure', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { singleCreationRole: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true }).fill('Mitt utkast');

  await expect(page.getByRole('button', { name: 'Lägg till åtgärd', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rensa formuläret', exact: true })).toHaveCount(0);
});

test('shows each measure as a card with status, goal, date and creator with role', async ({
  page,
  dismissCookieConsent,
}) => {
  await installMeasures(page, { existingDecision: 'REWORK' });
  await openMeasures(page, dismissCookieConsent);
  const card = page.getByRole('list', { name: 'Registrerade åtgärder' }).getByRole('listitem');
  await expect(card).toHaveCount(1);
  await expect(card.getByRole('heading', { name: 'Tidigare åtgärdstyp', exact: true })).toBeVisible();
  await expect(card.getByText('Planerad', { exact: true })).toBeVisible();
  await expect(card.getByText('Delvis godkänd', { exact: true })).toBeVisible();
  await expect(card).toContainText('Befintlig beskrivning');
  await expect(card).toContainText('Mål: Befintligt mål');
  await expect(card).toContainText('Planerat datum: 2026-09-08 – 2026-09-10');
  await expect(card).toContainText('Skapad av iaf.test (Enhetschef) • 2026-09-09 13:39:54');
  await expect(card.getByRole('heading', { name: 'Detta ska justeras', exact: true })).toBeVisible();
  await expect(card).toContainText('Genomför endast dokumentationsdelen, övrigt ingår i ordinarie arbete.');
  await expect(card.getByRole('button', { name: /^Redigera åtgärd/ })).toBeVisible();
});

test('edits in a modal while the page form stays reserved for new measures', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page);
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Redigera åtgärd', exact: true })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Lägg till åtgärder' })).toHaveCount(1);
  await dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true }).fill('Påbörjad ändring');
  await dialog.getByRole('button', { name: 'Stäng', exact: true }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Avbryt redigering?' })
    .getByRole('button', { name: 'Nej, behåll', exact: true })
    .click();
  await expect(dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true })).toHaveValue(
    'Påbörjad ändring'
  );
  await dialog.getByRole('button', { name: 'Avbryt redigering', exact: true }).click();
  await page
    .getByRole('dialog')
    .filter({ hasText: 'Avbryt redigering?' })
    .getByRole('button', { name: 'Ja, avbryt', exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText('Befintligt mål', { exact: true })).toBeVisible();
});

for (const registrationStatus of ['unconfigured', 'invalid'] as const) {
  test(`keeps history available and explains ${registrationStatus} registration`, async ({
    page,
    dismissCookieConsent,
  }) => {
    const state = await installMeasures(page, { registrationStatus });
    await openMeasures(page, dismissCookieConsent);
    await expect(
      page.getByText(
        registrationStatus === 'unconfigured'
          ? 'Registrering av åtgärder är inte konfigurerad för den här verksamheten. Kontakta administratören. Du kan fortfarande läsa befintliga åtgärder.'
          : 'Inställningarna för åtgärdernas roller och typer behöver ses över. Kontakta administratören. Du kan fortfarande läsa befintliga åtgärder.'
      )
    ).toBeVisible();
    await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
    await editDialog(page).getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)').fill('Uppdaterat historiskt mål');
    await editDialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();
    expect(state.writes).toHaveLength(1);
    expect(state.writes[0].data).toEqual({ goal: 'Uppdaterat historiskt mål' });
  });
}

const decisionDialog = (page: Page) => page.getByRole('dialog', { name: 'Bedöm åtgärdsförslag' });

test('a manager can partially approve another author’s proposal without editing the original', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installMeasures(page, { foreignMeasure: true });
  await openMeasures(page, dismissCookieConsent);
  await expect(page.getByRole('button', { name: /^Redigera åtgärd/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Bedöm förslag/ }).click();
  const dialog = decisionDialog(page);
  await expect(dialog).toContainText('Befintlig beskrivning');
  await expect(dialog).toContainText('Befintligt mål');
  await dialog.getByRole('radio', { name: 'Godkänn delvis', exact: true }).check();
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Skriv en kommentar till beslutet.');
  await expect(dialog.getByRole('alert')).toBeFocused();
  expect(state.writes).toEqual([]);
  const comment = 'Genomför endast dokumentationsdelen. Övriga delar finns redan i ordinarie arbete.';
  await dialog.getByLabel('Beslutskommentar (Obligatoriskt)', { exact: true }).fill(comment);
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const card = page.getByRole('list', { name: 'Registrerade åtgärder' }).getByRole('listitem');
  await expect(card.getByText('Delvis godkänd', { exact: true })).toBeVisible();
  await expect(card).toContainText(comment);
  await expect(card).toContainText('Befintlig beskrivning');
  await expect(card).toContainText('Befintligt mål');
  await expect(card).toContainText('Skapad av someone.else (Enhetschef)');
  await expect(card.getByRole('button', { name: /^Bedöm förslag/ })).toHaveCount(0);
  expect(state.writes).toEqual([
    {
      method: 'PATCH',
      version: '"3"',
      data: {
        accept: 'REWORK',
        acceptMotivation: comment,
        // The proposal's own dates were the starting point, and the approval settles them.
        plannedStart: expect.stringMatching(/^2026-09-08T00:00:00[+-]\d{2}:\d{2}$/),
        plannedComplete: expect.stringMatching(/^2026-09-10T00:00:00[+-]\d{2}:\d{2}$/),
      },
    },
  ]);
  expect(state.trace.errandPatches).toEqual([]);
});

// A proposal leaves its dates open, so approving it - whole or in part - is where they are set.
test('approving a proposal without dates asks when it starts and ends', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { foreignMeasure: true, undatedProposal: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Bedöm förslag/ }).click();
  const dialog = decisionDialog(page);
  const start = dialog.getByLabel('När ska åtgärden påbörjas? (Obligatoriskt)', { exact: true });
  const complete = dialog.getByLabel('När ska åtgärden vara klar? (Obligatoriskt)', { exact: true });

  // A rejection plans nothing, so it asks for no dates.
  await dialog.getByRole('radio', { name: 'Avslå', exact: true }).check();
  await expect(start).toHaveCount(0);

  await dialog.getByRole('radio', { name: 'Godkänn', exact: true }).check();
  await expect(start).toHaveValue('');
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Ange när åtgärden ska påbörjas.');
  await expect(dialog.getByRole('alert')).toContainText('Ange när åtgärden ska vara klar.');
  expect(state.writes).toEqual([]);

  await start.fill('2026-10-12');
  await complete.fill('2026-11-30');
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.writes).toEqual([
    {
      method: 'PATCH',
      version: '"3"',
      data: {
        accept: 'TRUE',
        plannedStart: expect.stringMatching(/^2026-10-12T00:00:00[+-]\d{2}:\d{2}$/),
        plannedComplete: expect.stringMatching(/^2026-11-30T00:00:00[+-]\d{2}:\d{2}$/),
      },
    },
  ]);
});

test('a decision conflict preserves the comment and does not retry', async ({ page, dismissCookieConsent }) => {
  const state = await installMeasures(page, { foreignMeasure: true, failWrite: true });
  await openMeasures(page, dismissCookieConsent);
  await page.getByRole('button', { name: /^Bedöm förslag/ }).click();
  const dialog = decisionDialog(page);
  await dialog.getByRole('radio', { name: 'Avslå', exact: true }).check();
  const comment = dialog.getByLabel('Beslutskommentar (Obligatoriskt)', { exact: true });
  await comment.fill('Förslaget ersätts av en redan beslutad åtgärd.');
  await dialog.getByRole('button', { name: 'Spara beslut', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('ladda om åtgärderna');
  await expect(comment).toHaveValue('Förslaget ersätts av en redan beslutad åtgärd.');
  expect(state.writes).toHaveLength(1);
});

test('does not offer decisions without a granted deciding role', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { noCreationRoles: true });
  await openMeasures(page, dismissCookieConsent);
  await expect(page.getByRole('button', { name: /^Bedöm förslag/ })).toHaveCount(0);
});

test('partial approval locks the original content but lets its author report execution', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installMeasures(page, { existingDecision: 'REWORK' });
  await openMeasures(page, dismissCookieConsent);
  await expect(page.getByRole('button', { name: /^Bedöm förslag/ })).toHaveCount(0);
  await page.getByRole('button', { name: /^Redigera åtgärd/ }).click();
  const dialog = editDialog(page);
  await expect(dialog.getByLabel('Åtgärd (Obligatoriskt)', { exact: true })).toBeDisabled();
  await expect(dialog.getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true })).toHaveAttribute(
    'readonly',
    ''
  );
  await expect(dialog.getByLabel('Beskriv syftet med åtgärden (Obligatoriskt)', { exact: true })).toHaveAttribute(
    'readonly',
    ''
  );
  await expect(dialog).toContainText('Genomför endast dokumentationsdelen');
  await dialog.getByLabel('Genomförda åtgärder', { exact: true }).check();
  await dialog.getByLabel('När genomfördes åtgärden? (Obligatoriskt)', { exact: true }).fill('2026-09-09');
  await dialog.getByRole('button', { name: 'Spara ändringar', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('list', { name: 'Registrerade åtgärder' }).getByText('Genomförd', { exact: true })
  ).toBeVisible();
  expect(state.writes).toEqual([
    { method: 'PATCH', version: '"3"', data: { executed: expect.stringMatching(/^2026-09-09T00:00:00/) } },
  ]);
});

/** The BFF builds the plan from the stored measures; the browser only asks for it and reports the answer. */
async function installActionPlan(page: Page, { status = 201 }: { status?: number } = {}) {
  const requests: string[] = [];
  await page.route(/\/supporterrands\/[^/]+\/measures\/action-plan$/, async (route) => {
    requests.push(route.request().method());
    await route.fulfill(
      status === 201
        ? {
            status,
            json: {
              data: { fileName: `Handlingsplan_${errandNumber}_1.pdf`, attachmentId: 'plan-1' },
              message: 'Action plan attached',
            },
          }
        : { status, json: { message: 'Det finns inga åtgärder att ta med i handlingsplanen.' } }
    );
  });
  return { requests };
}

const actionPlanButton = (page: Page) => page.getByRole('button', { name: 'Skapa handlingsplan', exact: true });

test('creates an action plan from the stored measures and attaches it as a PDF', async ({
  page,
  dismissCookieConsent,
}) => {
  const state = await installMeasures(page);
  const plan = await installActionPlan(page);
  await openMeasures(page, dismissCookieConsent);
  await expect(actionPlanButton(page)).toBeEnabled();
  await actionPlanButton(page).click();
  await expect(
    page.getByText(
      `Handlingsplanen Handlingsplan_${errandNumber}_1.pdf har skapats och lagts som en bilaga på ärendet.`
    )
  ).toBeVisible();
  expect(plan.requests).toEqual(['POST']);
  // The plan is an attachment made by the BFF, never a measure write from the browser.
  expect(state.writes).toEqual([]);
  await expect(actionPlanButton(page)).toBeEnabled();
});

test('explains why an action plan could not be created and keeps the tab usable', async ({
  page,
  dismissCookieConsent,
}) => {
  await installMeasures(page);
  const plan = await installActionPlan(page, { status: 409 });
  await openMeasures(page, dismissCookieConsent);
  await actionPlanButton(page).click();
  await expect(page.getByText('Det finns inga åtgärder att ta med i handlingsplanen.')).toBeVisible();
  expect(plan.requests).toEqual(['POST']);
  await expect(actionPlanButton(page)).toBeEnabled();
  await expect(page.getByRole('button', { name: /^Redigera åtgärd/ })).toBeVisible();
});

test('does not offer an action plan without write access', async ({ page, dismissCookieConsent }) => {
  await installMeasures(page, { canEdit: false });
  await openMeasures(page, dismissCookieConsent);
  await expect(actionPlanButton(page)).toHaveCount(0);
});

// While the errand is investigated a decided measure may still be put right; once it has left Utredning it may not.
test('lets a decided measure be put right while the errand is investigated', async ({ page, dismissCookieConsent }) => {
  const { writes } = await installMeasures(page, { existingDecision: 'TRUE', activePhaseName: 'INVESTIGATION' });
  await openMeasures(page, dismissCookieConsent);

  await page.getByRole('button', { name: 'Redigera åtgärd Tidigare åtgärdstyp', exact: true }).click();
  const description = editDialog(page).getByLabel('Beskrivning av åtgärd (Obligatoriskt)', { exact: true });
  await expect(description).toBeEditable();
  await description.fill('Rättad beskrivning');
  await editDialog(page).getByRole('button', { name: 'Spara ändringar', exact: true }).click();

  await expect
    .poll(() => writes)
    .toEqual([{ method: 'PATCH', data: { description: 'Rättad beskrivning' }, version: '"3"' }]);
});

test('removes an own measure that is not carried out while the errand is investigated, once confirmed', async ({
  page,
  dismissCookieConsent,
}) => {
  const { writes } = await installMeasures(page, { activePhaseName: 'INVESTIGATION' });
  await openMeasures(page, dismissCookieConsent);

  await page.getByRole('button', { name: 'Ta bort åtgärd Tidigare åtgärdstyp', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Ta bort åtgärden?');
  await dialog.getByRole('button', { name: 'Ja, ta bort', exact: true }).click();

  await expect.poll(() => writes).toEqual([{ method: 'DELETE', data: null, version: '"3"' }]);
  await expect(page.getByText('Det finns inga åtgärder registrerade.', { exact: true })).toBeVisible();
});

for (const [situation, options] of [
  ['somebody else registered it', { foreignMeasure: true, activePhaseName: 'INVESTIGATION' }],
  ['the errand has left Utredning', { activePhaseName: 'DECISION' }],
] as const) {
  test(`offers no removal of a measure when ${situation}`, async ({ page, dismissCookieConsent }) => {
    await installMeasures(page, options);
    await openMeasures(page, dismissCookieConsent);

    await expect(page.getByRole('button', { name: 'Ta bort åtgärd Tidigare åtgärdstyp', exact: true })).toHaveCount(0);
  });
}
