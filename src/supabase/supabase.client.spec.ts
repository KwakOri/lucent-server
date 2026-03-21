import { normalizeEnvValue, normalizeSupabaseUrl } from './supabase.client';

describe('Supabase env normalization', () => {
  describe('normalizeEnvValue', () => {
    it('trims leading and trailing spaces', () => {
      expect(normalizeEnvValue('  value  ')).toBe('value');
    });

    it('strips matching wrapping single quotes', () => {
      expect(normalizeEnvValue("'value'")).toBe('value');
    });

    it('strips matching wrapping double quotes', () => {
      expect(normalizeEnvValue('"value"')).toBe('value');
    });

    it('keeps unmatched quotes as-is', () => {
      expect(normalizeEnvValue("'value")).toBe("'value");
    });
  });

  describe('normalizeSupabaseUrl', () => {
    it('keeps a valid https url', () => {
      expect(
        normalizeSupabaseUrl('https://zzckbomchrebuyetgvqv.supabase.co'),
      ).toBe('https://zzckbomchrebuyetgvqv.supabase.co');
    });

    it('accepts a quoted url', () => {
      expect(
        normalizeSupabaseUrl("'https://zzckbomchrebuyetgvqv.supabase.co'"),
      ).toBe('https://zzckbomchrebuyetgvqv.supabase.co');
    });

    it('prepends https when protocol is missing', () => {
      expect(normalizeSupabaseUrl('zzckbomchrebuyetgvqv.supabase.co')).toBe(
        'https://zzckbomchrebuyetgvqv.supabase.co',
      );
    });

    it('throws when url is malformed', () => {
      expect(() => normalizeSupabaseUrl('http://')).toThrow(
        'SUPABASE_URL must be a valid absolute URL',
      );
    });

    it('throws when protocol is not http/https', () => {
      expect(() => normalizeSupabaseUrl('ftp://example.com')).toThrow(
        'SUPABASE_URL must use http or https protocol',
      );
    });
  });
});
