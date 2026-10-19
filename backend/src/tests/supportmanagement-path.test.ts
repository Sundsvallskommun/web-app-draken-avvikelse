import { describe, expect, it } from 'vitest';

import { normalizeSupportManagementResourcePath, trimSupportManagementPath } from '@/config/supportmanagement-path';

describe('Support Management path normalization', () => {
  it('removes only boundary whitespace and slashes', () => {
    expect(trimSupportManagementPath('  ///Category/HSL///  ')).toBe('Category/HSL');
    expect(trimSupportManagementPath('CATEGORY//HSL')).toBe('CATEGORY//HSL');
  });

  it('normalizes label resources case-insensitively', () => {
    expect(normalizeSupportManagementResourcePath(' /Category/Hsl/ ')).toBe('CATEGORY/HSL');
    expect(normalizeSupportManagementResourcePath(undefined)).toBe('');
  });
});
