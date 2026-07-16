import { describe, it, expect } from 'vitest';
import { normalizePhone, phoneTail } from '../src/phone.js';

describe('normalizePhone', () => {
  it('passes through valid E.164', () => {
    expect(normalizePhone('+923325858314').e164).toBe('+923325858314');
  });
  it('normalizes Pakistani national format (leading 0)', () => {
    expect(normalizePhone('03325858314', 'PK').e164).toBe('+923325858314');
  });
  it('handles spaces and dashes', () => {
    expect(normalizePhone('0332-585 8314', 'PK').e164).toBe('+923325858314');
  });
  it('fixes the "+0..." bug from the live test call', () => {
    expect(normalizePhone('+03325888314', 'PK').e164).toBe('+923325888314');
  });
  it('handles 00 international prefix', () => {
    expect(normalizePhone('00923325858314').e164).toBe('+923325858314');
  });
  it('handles country code without plus', () => {
    expect(normalizePhone('923325858314', 'PK').e164).toBe('+923325858314');
  });
  it('normalizes bare US 10-digit', () => {
    expect(normalizePhone('(762) 701-6557', 'US').e164).toBe('+17627016557');
  });
  it('rejects garbage', () => {
    expect(normalizePhone('hello').ok).toBe(false);
    expect(normalizePhone('123').ok).toBe(false);
    expect(normalizePhone('').ok).toBe(false);
  });
  it('rejects unknown country for national format', () => {
    expect(normalizePhone('0332123456', 'XX').ok).toBe(false);
  });
});

describe('phoneTail', () => {
  it('extracts trailing digits', () => {
    expect(phoneTail('+923325858314')).toBe('5858314');
    expect(phoneTail('0332-5858314', 4)).toBe('8314');
  });
});
