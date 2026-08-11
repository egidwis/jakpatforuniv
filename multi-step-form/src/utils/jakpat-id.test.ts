// Standalone test (no framework in this project).
// Run: node_modules/.bin/esbuild src/utils/jakpat-id.test.ts --bundle --platform=node --format=esm | node --input-type=module
import { normalizeJakpatId, jakpatIdWarning } from './jakpat-id';

let failures = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    console.log(`  ok  - ${name}`);
  } else {
    failures++;
    console.log(`  FAIL- ${name}\n        expected ${e}\n        actual   ${a}`);
  }
}

console.log('normalizeJakpatId');
check('leaves a clean id alone', normalizeJakpatId('ks8oh'), 'ks8oh');
check('trims surrounding space', normalizeJakpatId('  ks8oh  '), 'ks8oh');
check('removes inner space', normalizeJakpatId('ks 8oh'), 'ks8oh');
check('strips https prefix', normalizeJakpatId('https://jakpat.net/s/ks8oh'), 'ks8oh');
check('strips http prefix', normalizeJakpatId('http://jakpat.net/s/ks8oh'), 'ks8oh');
check('strips bare domain prefix', normalizeJakpatId('jakpat.net/s/ks8oh'), 'ks8oh');
check('preserves jakpat. prefix', normalizeJakpatId('jakpat.ks8oh'), 'jakpat.ks8oh');
check('is case-preserving', normalizeJakpatId('KS8OH'), 'KS8OH');
check('handles empty input', normalizeJakpatId(''), '');
check('pasted url with spaces', normalizeJakpatId(' https://jakpat.net/s/qt0yt '), 'qt0yt');

console.log('jakpatIdWarning — real-looking ids pass silently');
for (const id of ['ks8oh', 'qt0yt', '50bx0', '0bxr5', '8uvvh', '2fuad', 'z8wii', 'vq4c9', 'eefafa.eas']) {
  check(id, jakpatIdWarning(id), null);
}
check('normalises before judging', jakpatIdWarning('https://jakpat.net/s/ks8oh'), null);
check('uppercase is not warned about', jakpatIdWarning('KS8OH'), null);
check('empty input is not warned about', jakpatIdWarning(''), null);
check('ids with dot pass without warning', jakpatIdWarning('eefafa.eas'), null);

console.log('jakpatIdWarning — junk gets flagged');
check('five letters, no digit', jakpatIdWarning('indah') !== null, true);
check('too short', jakpatIdWarning('ayu') !== null, true);
check('too long', jakpatIdWarning('jakpat123') !== null, true);

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} failure(s).`);
if (failures > 0) process.exit(1);
