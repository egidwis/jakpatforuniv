// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/utils/submissionMode.test.ts --bundle --platform=node --format=esm | node --input-type=module
import { resolveSubmissionMode } from './submissionMode';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.log(`FAIL  - ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

const URL_A = 'https://bit.ly/KoperasiPanganBerkelanjutan';
const URL_B = 'https://bit.ly/PersepsiPekerjaanAplikasi';

// 1. Genuine reschedule: same survey being re-submitted → update existing.
check(
  'genuine reschedule (matching survey_url) → reschedule',
  resolveSubmissionMode({ isReschedule: true, submissionIdToReplace: 'sub-1' }, URL_A, URL_A),
  { mode: 'reschedule', submissionId: 'sub-1' },
);

// 2. THE BUG: stale intent + a *different* survey → must NOT overwrite; insert new.
check(
  'stale intent, different survey_url → create (no overwrite)',
  resolveSubmissionMode({ isReschedule: true, submissionIdToReplace: 'sub-1' }, URL_B, URL_A),
  { mode: 'create' },
);

// 3. No reschedule intent at all → create.
check(
  'no intent → create',
  resolveSubmissionMode({}, URL_A, null),
  { mode: 'create' },
);

// 4. Intent present but target row not found → create (cannot reschedule a missing row).
check(
  'intent but target missing → create',
  resolveSubmissionMode({ isReschedule: true, submissionIdToReplace: 'sub-1' }, URL_A, null),
  { mode: 'create' },
);

// 5. Matching url with whitespace/case noise → still a reschedule.
check(
  'url match modulo trim/case → reschedule',
  resolveSubmissionMode(
    { isReschedule: true, submissionIdToReplace: 'sub-1' },
    '  HTTPS://BIT.LY/KoperasiPanganBerkelanjutan  ',
    URL_A,
  ),
  { mode: 'reschedule', submissionId: 'sub-1' },
);

// 6. submissionIdToReplace present but isReschedule not explicitly true → create.
check(
  'id present without explicit isReschedule flag → create',
  resolveSubmissionMode({ submissionIdToReplace: 'sub-1' }, URL_A, URL_A),
  { mode: 'create' },
);

if (failures > 0) throw new Error(`${failures} test failure(s)`);
console.log('\nALL PASS');
