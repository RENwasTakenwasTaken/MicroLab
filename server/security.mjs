// Directive-injection protection for the public build server.
//
// Anyone on the internet can send C source to /api/compile. A compiler reads every file the
// source names in an #include and echoes offending lines in its error messages, so without this
// check a request could read files from the server a line at a time (e.g.
// #include "/home/<account>/some/config.php"). checkSource() therefore allows only plain
// relative header names (no absolute paths, no "..", no macro-computed names, no #embed), and
// forbids inline assembly from including files.

/** Header names a program may include: relative, plain characters, no parent-directory steps. */
const SAFE_HEADER = /^[A-Za-z0-9_][A-Za-z0-9_.+\-/]*$/;
const safeHeader = (name) => SAFE_HEADER.test(name) && !name.split('/').includes('..') && !name.includes('//');

/**
 * The text the preprocessor sees: trigraphs / digraph '#' resolved, line continuations joined,
 * comments replaced by blanks (string and character literals respected, so a comment marker
 * inside a string cannot hide a directive, and a directive cannot hide inside a comment).
 */
function preprocessView(src) {
  const s = src.replace(/\?\?=/g, '#').replace(/\?\?\//g, '\\').replace(/\\\r?\n/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], d = s[i + 1];
    if (c === '/' && d === '*') {
      const end = s.indexOf('*/', i + 2);
      out += ' ';
      if (end < 0) break;
      out += s.slice(i, end + 2).replace(/[^\n]/g, ''); // keep line breaks for line-based checks
      i = end + 1;
    } else if (c === '/' && d === '/') {
      const end = s.indexOf('\n', i);
      if (end < 0) break;
      i = end - 1;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < s.length && s[j] !== c && s[j] !== '\n') j += s[j] === '\\' ? 2 : 1;
      out += s.slice(i, j + 1);
      i = j;
    } else out += c;
  }
  return out;
}

/** null when the source is acceptable, otherwise { line, message } explaining the rejection. */
export function checkSource(source) {
  if (source.includes('\0')) return { line: 1, message: 'Program contains a NUL character.' };
  const text = preprocessView(source);
  const lines = text.split('\n');
  const inAsmMention = /\b(?:__asm__|__asm|_asm|asm)\b|^\s*(?:#|%:)\s*asm\b/m.test(text);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*(?:#|%:)\s*([A-Za-z_]\w*)(.*)$/);
    if (!m) {
      if (inAsmMention && /(?:^|[\s.])(?:include|incbin|binclude)\b/i.test(lines[i]))
        return { line: i + 1, message: 'Inline assembly may not include files on the Virtual Lab build server.' };
      continue;
    }
    const [, directive, rest] = m;
    if (directive === 'embed') return { line: i + 1, message: '#embed is not supported on the Virtual Lab build server.' };
    if (directive === 'include' || directive === 'include_next' || directive === 'import') {
      const op = rest.trim().match(/^(?:<([^>]*)>|"([^"]*)")$/);
      if (!op) return { line: i + 1, message: `#${directive} must name a header directly, e.g. #include <p18f4550.h> or #include "lcd.h".` };
      const name = op[1] ?? op[2];
      if (!safeHeader(name)) return { line: i + 1, message: `#${directive} "${name}" is not allowed: use a plain header name (no absolute paths or "..").` };
    }
  }
  for (const m of text.matchAll(/__has_include(?:_next)?\s*\(\s*(?:<([^>]*)>|"([^"]*)")?/g)) {
    const name = m[1] ?? m[2];
    if (name === undefined || !safeHeader(name)) {
      const line = text.slice(0, m.index).split('\n').length;
      return { line, message: '__has_include must name a plain header, e.g. __has_include(<xc.h>).' };
    }
  }
  return null;
}

/** Rejection in the shape of a failed build, so the student sees it in Output and Problems. */
export function rejectedBuild(problem, tool) {
  return {
    ok: false,
    diagnostics: [{ line: problem.line, col: 1, severity: 'error', message: problem.message }],
    log: `${tool}\nmain.c:${problem.line}: error: ${problem.message}\n\nBUILD FAILED (rejected by the Virtual Lab build server before compiling)`,
  };
}
