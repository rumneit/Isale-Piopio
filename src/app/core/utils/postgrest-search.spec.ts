import { describe, expect, it } from 'vitest';
import { safeIlikeTerm } from './postgrest-search';

describe('safeIlikeTerm', () => {
  it('preserves Vietnamese text and removes PostgREST filter grammar', () => {
    expect(safeIlikeTerm('  Bánh mì%),status.eq.cancelled  ')).toBe('Bánh mì status.eq.cancelled');
  });

  it('limits abusive search length', () => {
    expect(safeIlikeTerm('a'.repeat(500))).toHaveLength(200);
  });
});

