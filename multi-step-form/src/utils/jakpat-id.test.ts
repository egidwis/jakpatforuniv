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
check('leaves custom username alone', normalizeJakpatId('tegarerputra'), 'tegarerputra');
check('leaves default jakpat id alone', normalizeJakpatId('JAKPAT.50BX0'), 'JAKPAT.50BX0');
check('trims surrounding space', normalizeJakpatId('  tegarerputra  '), 'tegarerputra');
check('removes inner space', normalizeJakpatId('ks 8oh'), 'ks8oh');
check('strips https prefix with default ID', normalizeJakpatId('https://jakpat.net/s/JAKPAT.50BX0'), 'JAKPAT.50BX0');
check('strips https prefix with custom username', normalizeJakpatId('https://jakpat.net/s/tegarerputra'), 'tegarerputra');
check('strips http prefix', normalizeJakpatId('http://jakpat.net/s/50bx0'), '50bx0');
check('strips www prefix', normalizeJakpatId('https://www.jakpat.net/s/JAKPAT.50BX0'), 'JAKPAT.50BX0');
check('strips bare domain prefix', normalizeJakpatId('jakpat.net/s/ks8oh'), 'ks8oh');
check('is case-preserving', normalizeJakpatId('JAKPAT.50BX0'), 'JAKPAT.50BX0');
check('handles empty input', normalizeJakpatId(''), '');
check('pasted url with spaces', normalizeJakpatId(' https://jakpat.net/s/qt0yt '), 'qt0yt');

console.log('jakpatIdWarning — custom and default ids pass silently');
for (const id of [
  'ks8oh',
  'qt0yt',
  '50bx0',
  'JAKPAT.50BX0',
  'jakpat.50bx0',
  'tegarerputra',
  'indah',
  'dimas',
  'ayu',
  'jakpat123',
  'eefafa.eas',
  'user_name-123'
]) {
  check(`valid id pass silently: ${id}`, jakpatIdWarning(id), null);
}
check('normalises before judging', jakpatIdWarning('https://jakpat.net/s/tegarerputra'), null);
check('empty input is not warned about', jakpatIdWarning(''), null);

console.log('jakpatIdWarning — obvious mistakes get flagged');
check('email gets flagged', jakpatIdWarning('tegar@gmail.com') !== null, true);
check('phone number 08... gets flagged', jakpatIdWarning('081234567890') !== null, true);
check('phone number +628... gets flagged', jakpatIdWarning('+6281234567890') !== null, true);
check('other external URL gets flagged', jakpatIdWarning('https://docs.google.com/forms/d/e/123') !== null, true);
check('forms.gle link gets flagged', jakpatIdWarning('https://forms.gle/xyz') !== null, true);

console.log(failures === 0 ? '\nAll passed.' : `\n${failures} failure(s).`);
if (failures > 0) process.exit(1);
