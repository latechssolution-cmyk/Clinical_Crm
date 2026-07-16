// Phone normalization to E.164 without external deps.
// Handles the common ways people say numbers: local format with leading 0,
// missing +, spaces/dashes/parens. Country calling codes for markets we serve;
// extend as tenants onboard.

const COUNTRY_CODES: Record<string, string> = {
  US: '1', CA: '1', GB: '44', PK: '92', IN: '91', AE: '971', SA: '966',
  AU: '61', DE: '49', FR: '33', ES: '34', IT: '39', NL: '31', TR: '90',
  BD: '880', NG: '234', EG: '20', ZA: '27', PH: '63', ID: '62', MY: '60',
};

export interface NormalizedPhone {
  ok: boolean;
  /** E.164 (+923325858314) when ok */
  e164?: string;
  reason?: string;
}

/**
 * Normalize a spoken/typed phone number to E.164.
 * @param raw     what the caller said / typed
 * @param country tenant's default country (ISO alpha-2) for local formats
 */
export function normalizePhone(raw: string, country = 'US'): NormalizedPhone {
  if (!raw) return { ok: false, reason: 'empty' };
  let s = raw.replace(/[\s\-().]/g, '');

  // "00" international prefix → "+"
  if (s.startsWith('00')) s = '+' + s.slice(2);

  if (s.startsWith('+')) {
    const digits = s.slice(1);
    if (!/^\d{7,15}$/.test(digits)) return { ok: false, reason: 'invalid characters or length' };
    if (digits.startsWith('0')) {
      // "+0..." is never valid — treat as national format said with a stray plus.
      const cc = COUNTRY_CODES[country.toUpperCase()];
      if (!cc) return { ok: false, reason: `unknown country ${country}` };
      return finish(cc + digits.replace(/^0+/, ''));
    }
    return finish(digits);
  }

  if (!/^\d{5,15}$/.test(s)) return { ok: false, reason: 'invalid characters or length' };

  const cc = COUNTRY_CODES[country.toUpperCase()];
  if (!cc) return { ok: false, reason: `unknown country ${country}` };

  // National format with trunk prefix: 03325858314 → +923325858314
  if (s.startsWith('0')) return finish(cc + s.replace(/^0+/, ''));

  // Already includes the country code without "+"? (e.g. 923325858314)
  if (s.startsWith(cc) && s.length >= 10) return finish(s);

  // Bare national number without trunk prefix (common in US: 10 digits)
  return finish(cc + s);

  function finish(digits: string): NormalizedPhone {
    if (!/^\d{7,15}$/.test(digits) || digits.startsWith('0')) {
      return { ok: false, reason: 'not a valid E.164 number' };
    }
    return { ok: true, e164: '+' + digits };
  }
}

/** Last N digits — for fuzzy "is this you?" matching of near-miss numbers. */
export function phoneTail(phone: string, n = 7): string {
  return phone.replace(/\D/g, '').slice(-n);
}
