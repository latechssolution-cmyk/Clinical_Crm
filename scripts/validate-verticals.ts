// Sanity-check every vertical pack against platform invariants.
// Run: npx tsx scripts/validate-verticals.ts
import { VERTICALS, getVertical } from '../packages/core/src/verticals.js';

const ids = Object.keys(VERTICALS);
console.log('Registered verticals:', ids.join(', '));
let ok = true;
const TERM_KEYS = ['contact', 'contacts', 'booking', 'bookings', 'provider', 'providers'] as const;

for (const id of ids) {
  const p = getVertical(id);
  const problems: string[] = [];
  if (p.id !== id) problems.push('id mismatch');
  if (!p.label) problems.push('no label');
  for (const k of TERM_KEYS) if (!p.terminology[k]) problems.push(`missing term ${k}`);
  if (!p.requiredContactFields.includes('phone')) problems.push('phone not required (breaks dedup)');
  if (!p.agentBrief || p.agentBrief.length < 50) problems.push('agentBrief too short');
  if (!p.emergencyGuidance) problems.push('no emergencyGuidance');
  for (const f of p.qualificationFields) {
    if (f.type === 'select' && (!f.options || f.options.length === 0)) problems.push(`select field without options: ${f.key}`);
  }
  // must satisfy the DB check constraint: ^[a-z][a-z0-9_-]{1,30}$
  if (!/^[a-z][a-z0-9_-]{1,30}$/.test(id)) problems.push('id fails DB shape constraint');
  console.log(problems.length ? 'FAIL' : 'PASS', id, `(${p.label})`, problems.join('; '));
  if (problems.length) ok = false;
}
process.exit(ok ? 0 : 1);
