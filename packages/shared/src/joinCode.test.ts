import { describe, it, expect } from 'vitest';
import { generateJoinCode, isValidJoinCode } from './joinCode.js';

describe('generateJoinCode', () => {
  it('returns a 6-character code by default', () => {
    const code = generateJoinCode();
    expect(code).toHaveLength(6);
  });

  it('respects the requested length', () => {
    expect(generateJoinCode(8)).toHaveLength(8);
    expect(generateJoinCode(4)).toHaveLength(4);
  });

  it('only uses unambiguous characters (no 0, O, 1, I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateJoinCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
      expect(code).not.toContain('0');
      expect(code).not.toContain('O');
      expect(code).not.toContain('1');
      expect(code).not.toContain('I');
    }
  });

  it('generated codes pass isValidJoinCode', () => {
    for (let i = 0; i < 100; i++) {
      expect(isValidJoinCode(generateJoinCode())).toBe(true);
    }
  });
});

describe('isValidJoinCode', () => {
  it('accepts well-formed codes', () => {
    expect(isValidJoinCode('ABC234')).toBe(true);
    expect(isValidJoinCode('ZZZZZZ')).toBe(true);
  });

  it('rejects wrong length', () => {
    expect(isValidJoinCode('ABC23')).toBe(false);
    expect(isValidJoinCode('ABC2345')).toBe(false);
    expect(isValidJoinCode('')).toBe(false);
  });

  it('rejects ambiguous and lowercase characters', () => {
    expect(isValidJoinCode('abc234')).toBe(false);
    expect(isValidJoinCode('ABC230')).toBe(false); // contains 0
    expect(isValidJoinCode('ABC23O')).toBe(false); // contains O
    expect(isValidJoinCode('ABC23I')).toBe(false); // contains I
    expect(isValidJoinCode('ABC231')).toBe(false); // contains 1
  });

  it('rejects symbols and whitespace', () => {
    expect(isValidJoinCode('ABC-23')).toBe(false);
    expect(isValidJoinCode(' ABC23')).toBe(false);
    expect(isValidJoinCode('ABC 23')).toBe(false);
  });
});
