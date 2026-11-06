// Directive-injection protection: a program must not be able to read files on the server
// through the compiler's #include (or inline-assembly include), while normal programs still
// build. Uses the installed XC8 / SDCC like run-all.mjs.
// Usage: node tests/security.mjs
import { readFileSync } from 'node:fs';
import { checkSource } from '../server/security.mjs';
import { compile8051, compilePic18 } from '../server/compilers/toolchains.mjs';

let failures = 0;
const check = (name, cond, detail = '') => {
  console.log(`${cond ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!cond) failures++;
};

const SECRET = process.platform === 'win32' ? 'C:/Windows/win.ini' : '/etc/passwd';
const SECRET_LINE = process.platform === 'win32' ? 'for 16-bit app support' : 'root:';

console.log('Source checks — rejected');
const bad = {
  'absolute #include': `#include "${SECRET}"`,
  'absolute <include>': `#include <${SECRET}>`,
  'parent directory': '#include "../../server/index.mjs"',
  'macro-computed include': `#define F "${SECRET}"\n#include F`,
  'include_next': `#include_next "${SECRET}"`,
  'digraph %:include': `%:include "${SECRET}"`,
  'trigraph ??=include': `??=include "${SECRET}"`,
  'line continuation': `#inc\\\nlude "${SECRET}"`,
  'comment between # and include': `# /* x */ include "${SECRET}"`,
  'directive after a string holding a comment marker': `const char *a = "/*";\n#include "${SECRET}"\nconst char *b = "*/";`,
  '#embed': `const char d[] = {\n#embed "${SECRET}"\n};`,
  '__has_include with a path': `#if __has_include("${SECRET}")\n#endif`,
  'SDCC inline asm .include': `void main(void){ __asm\n .include "${SECRET}"\n __endasm; }`,
  'XC8 asm block include': `#asm\n include "${SECRET}"\n#endasm`,
};
for (const [name, src] of Object.entries(bad)) check(name, checkSource(src) !== null, checkSource(src)?.message ?? 'accepted!');

console.log('Source checks — accepted');
const good = {
  'reference program': readFileSync(new URL('../src/experiments/code/exp5_pic_lcd.c', import.meta.url), 'utf8'),
  'quoted local header': '#include "lcd.h"\nvoid main(void){}',
  'header in a subfolder': '#include <sys/types.h>\n',
  'string mentioning #include': 'const char *s = "#include \\"/etc/passwd\\"";\n',
  'commented-out bad include': `// #include "${SECRET}"\n/* #include "${SECRET}" */\nvoid main(void){}`,
  'inline asm without include': 'void main(void){ __asm\n nop\n __endasm; }',
};
for (const [name, src] of Object.entries(good)) check(name, checkSource(src) === null, checkSource(src)?.message ?? '');

console.log('Real compilers');
const r1 = await compilePic18(`#include "${SECRET}"\nvoid main(void){}`);
check('XC8: file include refused, nothing leaked', !r1.ok && !r1.log.includes(SECRET_LINE) && r1.diagnostics[0]?.severity === 'error', r1.diagnostics[0]?.message);
const r2 = await compile8051(`void main(void){ __asm\n .include "${SECRET}"\n __endasm; }`);
check('SDCC: asm include refused, nothing leaked', !r2.ok && !r2.log.includes(SECRET_LINE));
const r3 = await compilePic18('#include <p18f4550.h>\nvoid main(void){ TRISD = 0; while(1) LATD ^= 0xFF; }');
check('XC8: a normal program still builds', r3.ok, r3.ok ? '' : r3.log.slice(-200));

console.log(failures ? `\n${failures} security check(s) FAILED` : '\nsecurity checks passed');
process.exit(failures ? 1 : 0);
