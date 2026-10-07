import { describe, expect, it } from 'vitest';
import { parseBooleanSetting } from './settings.service';

describe('parseBooleanSetting', () => {
  it('fail-closed when a setting is absent', () => {
    expect(parseBooleanSetting(null)).toBe(false);
    expect(parseBooleanSetting(undefined)).toBe(false);
    expect(parseBooleanSetting(null, true)).toBe(true);
  });

  it('accepts only explicit truthy setting values', () => {
    for (const value of ['true', ' TRUE ', '1', 'yes', 'on']) {
      expect(parseBooleanSetting(value)).toBe(true);
    }
    for (const value of ['false', '0', 'off', '', 'random']) {
      expect(parseBooleanSetting(value)).toBe(false);
    }
  });
});
