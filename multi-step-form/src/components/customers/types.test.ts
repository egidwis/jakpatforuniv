// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/components/customers/types.test.ts --bundle --platform=node --format=esm | node --input-type=module
import { aggregateCustomers, emailLocalPart, type RawSubmission } from './types';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) console.log(`  ok  - ${name}`);
  else { failures++; console.log(`FAIL  - ${name}\n        expected ${e}\n        actual   ${a}`); }
}

function sub(over: Partial<RawSubmission>): RawSubmission {
  return {
    id: 'x', auth_user_id: null, full_name: null, email: null, phone_number: null,
    university: null, department: null, status: null, total_cost: 0,
    payment_status: null, submission_status: null, title: null,
    created_at: '2026-01-01T00:00:00Z', actual_paid: 0, ...over,
  };
}

// Multi-invoice-name account → one customer named from auth; identity (name + email)
// comes from the auth account, never the per-survey biodata.
const authNames = new Map([['acc-1', { name: 'Diajeng Reztrianti', email: 'diajeng@jakpat.net' }]]);
const multi = aggregateCustomers([
  sub({ id: 's1', auth_user_id: 'acc-1', full_name: 'Tri Rusilawati', email: 'd@x.com', created_at: '2026-02-01T00:00:00Z' }),
  sub({ id: 's2', auth_user_id: 'acc-1', full_name: 'NISMA', email: 'd@x.com', created_at: '2026-03-01T00:00:00Z' }),
  sub({ id: 's3', auth_user_id: 'acc-1', full_name: 'NISMA', email: 'd@x.com', created_at: '2026-04-01T00:00:00Z' }),
], authNames);

check('multi-name account collapses to ONE customer', multi.length, 1);
check('customer name = auth name (not latest full_name)', multi[0].name, 'Diajeng Reztrianti');
check('customer email = auth email (not biodata)', multi[0].email, 'diajeng@jakpat.net');
check('invoiceNames distinct + counted, most-recent first',
  multi[0].invoiceNames,
  [{ name: 'NISMA', count: 2, lastUsed: '2026-04-01T00:00:00Z' },
   { name: 'Tri Rusilawati', count: 1, lastUsed: '2026-02-01T00:00:00Z' }]);

// Linked account NOT resolved by profiles → 'Unknown' (NEVER the biodata Nama Invoice).
const noName = aggregateCustomers([
  sub({ id: 's4', auth_user_id: 'acc-2', full_name: 'SomeTeam', email: 'legacy@mail.com' }),
], new Map());
check('linked + not resolved → Unknown (never biodata name)', noName[0].name, 'Unknown');

// Orphan (no auth_user_id) → accepted exception: name = its invoice name.
const orphan = aggregateCustomers([
  sub({ id: 's5', auth_user_id: null, full_name: 'Orphan Team', email: 'o@mail.com', phone_number: '0811111111' }),
], new Map());
check('orphan customer is unlinked', orphan[0].isLinked, false);
check('orphan name falls back to invoice name', orphan[0].name, 'Orphan Team');

check('emailLocalPart splits at @', emailLocalPart('foo@bar.com'), 'foo');
check('emailLocalPart null → empty', emailLocalPart(null), '');

if (failures > 0) throw new Error(`${failures} test failure(s)`);
console.log('\nALL PASS');
