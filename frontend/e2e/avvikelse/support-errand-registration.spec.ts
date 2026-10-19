import { expect, test } from '../fixtures/base.fixture';
import { defaultInvestigationProfile, errandNumber, installIafApiMock } from './fixtures/investigation-flow.mock';

/** The profile as a drake that asks before the errand exists reports it. */
const registrationProfile = () => ({
  ...defaultInvestigationProfile(),
  registration: { mode: 'enabled' as const, form: true },
});

const registrationOptions = {
  reportTypes: [
    { labelId: 'deviation', displayName: 'Avvikelse', resourcePath: 'REPORT_TYPE/DEVIATION' },
    { labelId: 'abuse', displayName: 'Missförhållande', resourcePath: 'REPORT_TYPE/ABUSE' },
  ],
  locations: [{ labelId: 'unit', displayName: 'Hemtjänst Norr', resourcePath: 'LOCATION/VOF/HEMTJANST_NORR' }],
  // The handler is not asked for a priority; the BFF starts every errand at Medel.
  priorities: [],
};

const visitRegistration = async (
  page: Parameters<typeof installIafApiMock>[0],
  dismissCookieConsent: () => Promise<void>
) => {
  await page.goto('registrera');
  await dismissCookieConsent();
};

test.describe('Registrering i IAF/VOF', () => {
  test('frågar vad som hänt och var innan ärendet skapas', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      investigationProfileResponse: registrationProfile(),
      registrationOptions,
    });

    await visitRegistration(page, dismissCookieConsent);

    const form = page.locator('[data-cy="support-registration-form"]');
    await expect(form).toBeVisible();
    // Nothing is created by opening the page; every other support drake would have done exactly that.
    expect(trace.registrations).toHaveLength(0);

    // Both report types are offered, and only the handler's own place.
    await expect(form.locator('[data-cy="registration-report-type"] option')).toHaveText([
      'Välj',
      'Avvikelse',
      'Missförhållande',
    ]);
    // The only place on the account is chosen already.
    await expect(form.locator('[data-cy="registration-location-input"]')).toHaveValue('Hemtjänst Norr');

    const submit = form.locator('[data-cy="registration-submit"]');
    await expect(submit).toBeDisabled();

    await form.locator('[data-cy="registration-report-type"]').selectOption('abuse');
    await expect(form.locator('[data-cy="registration-priority"]')).toHaveCount(0);
    await expect(submit).toBeEnabled();

    await submit.click();

    await expect.poll(() => trace.registrations).toEqual([{ reportTypeLabelId: 'abuse', locationLabelId: 'unit' }]);
    await expect(page).toHaveURL(new RegExp(`/arende/${errandNumber}$`, 'u'));
  });

  // An account can reach many places, so they are searched for rather than scrolled through.
  test('låter handläggaren söka fram platsen bland flera', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      investigationProfileResponse: registrationProfile(),
      registrationOptions: {
        ...registrationOptions,
        locations: [
          { labelId: 'unit', displayName: 'Hemtjänst Norr', resourcePath: 'LOCATION/VOF/HEMTJANST_NORR' },
          { labelId: 'south', displayName: 'Hemtjänst Syd', resourcePath: 'LOCATION/VOF/HEMTJANST_SYD' },
          { labelId: 'granlunda', displayName: 'Granlunda', resourcePath: 'LOCATION/VOF/GRANLUNDA' },
        ],
      },
    });

    await visitRegistration(page, dismissCookieConsent);

    const form = page.locator('[data-cy="support-registration-form"]');
    const location = form.locator('[data-cy="registration-location-input"]');
    // Several places leave the choice to the handler.
    await expect(location).toHaveValue('');
    await location.click();
    await location.pressSequentially('Syd');
    await expect(page.getByRole('option', { name: 'Hemtjänst Norr' })).toHaveCount(0);
    await page.getByRole('option', { name: 'Hemtjänst Syd' }).click();
    await expect(location).toHaveValue('Hemtjänst Syd');

    await form.locator('[data-cy="registration-report-type"]').selectOption('deviation');
    await form.locator('[data-cy="registration-submit"]').click();

    await expect
      .poll(() => trace.registrations)
      .toEqual([{ reportTypeLabelId: 'deviation', locationLabelId: 'south' }]);
  });

  // An errand has to belong to a place, so a handler configured for none is told why rather than
  // shown a form whose mandatory choice is empty.
  test('säger ifrån när kontot saknar plats', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      investigationProfileResponse: registrationProfile(),
      registrationOptions: { ...registrationOptions, locations: [] },
    });

    await visitRegistration(page, dismissCookieConsent);

    await expect(page.locator('[data-cy="registration-without-location"]')).toContainText('ingen plats kopplad');
    await expect(page.locator('[data-cy="support-registration-form"]')).toHaveCount(0);
    expect(trace.registrations).toHaveLength(0);
  });

  // The unit the handler is employed at is the place: shown, not asked for, when it is the only one.
  test('hämtar platsen från enhetschefens anställning', async ({ page, dismissCookieConsent }) => {
    const trace = await installIafApiMock(page, {
      investigationProfileResponse: registrationProfile(),
      registrationOptions: {
        ...registrationOptions,
        locations: [{ labelId: 'employment-unit', displayName: 'Hemtjänst Syd', resourcePath: 'LOCATION/VOF/900001' }],
        locationSource: 'employment',
      },
    });

    await visitRegistration(page, dismissCookieConsent);

    const form = page.locator('[data-cy="support-registration-form"]');
    await expect(form.locator('[data-cy="registration-location-fixed"]')).toHaveValue('Hemtjänst Syd');
    await expect(form.locator('[data-cy="registration-location"]')).toHaveCount(0);

    await form.locator('[data-cy="registration-report-type"]').selectOption('deviation');
    await form.locator('[data-cy="registration-submit"]').click();

    await expect
      .poll(() => trace.registrations)
      .toEqual([{ reportTypeLabelId: 'deviation', locationLabelId: 'employment-unit' }]);
  });
});
