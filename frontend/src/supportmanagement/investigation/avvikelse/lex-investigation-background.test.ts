import assert from 'node:assert/strict';

import type { SupportErrand } from '@supportmanagement/services/support-errand-service';
import { test } from 'vitest';

import type { InvestigationProfile } from '../investigation-profile';
import { lexInvestigationBackground } from './lex-investigation-background';

const profile = { documents: [], reportDocument: { key: 'report' } } as unknown as InvestigationProfile;
const administrators = [{ adAccount: 'lisa.utredare', displayName: 'Lisa Utredare' }];
const errand = (overrides: Record<string, unknown> = {}) =>
  ({
    assignedUserId: 'Lisa.Utredare',
    jsonParameters: [{ key: 'report', value: { eventDescription: 'Kvällsbesöket uteblev.' } }],
    ...overrides,
  } as unknown as SupportErrand);

test('fills in the investigator, what was reported, a summary to rewrite and the day the investigator took it up', () => {
  assert.deepEqual(
    lexInvestigationBackground({ errand: errand(), profile, administrators, resumedAt: '2026-10-08T09:00:00+02:00' }),
    {
      investigator: 'Lisa Utredare',
      reportedEventDescription: '<p>Kvällsbesöket uteblev.</p>',
      reportSummary: '<p>Kvällsbesöket uteblev.</p>',
      reportReceivedDate: '2026-10-08',
    }
  );
});

test('names an investigator the directory does not know by account, and leaves out what the errand does not tell', () => {
  assert.deepEqual(
    lexInvestigationBackground({
      errand: errand({ assignedUserId: 'okand.person', jsonParameters: [] }),
      profile,
      administrators,
      resumedAt: undefined,
    }),
    { investigator: 'okand.person' }
  );
  assert.deepEqual(
    lexInvestigationBackground({
      errand: errand({ assignedUserId: undefined }),
      profile: null,
      administrators,
      resumedAt: 'not a date',
    }),
    {}
  );
});
