// Source-compatibility layers. Both translations are strictly line-preserving so
// compiler diagnostics map 1:1 to the student's editor lines.

/** Splits source into code / non-code (comments, strings, chars) chunks. */
function segments(src) {
  const out = [];
  let i = 0, start = 0;
  const push = (end, code) => { if (end > start) out.push({ text: src.slice(start, end), code }); start = end; };
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') {
      push(i, true);
      while (i < src.length && src[i] !== '\n') i++;
      push(i, false);
    } else if (c === '/' && n === '*') {
      push(i, true);
      const e = src.indexOf('*/', i + 2);
      i = e < 0 ? src.length : e + 2;
      push(i, false);
    } else if (c === '"' || c === "'") {
      push(i, true);
      i++;
      while (i < src.length && src[i] !== c && src[i] !== '\n') i += src[i] === '\\' ? 2 : 1;
      i++;
      push(Math.min(i, src.length), false);
    } else i++;
  }
  push(src.length, true);
  return out;
}

const parseNum = (t) => {
  t = t.trim();
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t, 16);
  if (/^[0-9][0-9a-f]*h$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  return /^\d+$/.test(t) ? Number(t) : NaN;
};
const hexLit = (n) => `0x${n.toString(16).toUpperCase()}`;

const mapCode = (src, fn) => segments(src).map((s) => (s.code ? fn(s.text) : s.text)).join('');

// ----------------------------------------------------------------- Keil C51
export const KEIL_SFRS = {
  P0: 0x80, SP: 0x81, DPL: 0x82, DPH: 0x83, PCON: 0x87, TCON: 0x88, TMOD: 0x89, TL0: 0x8a, TL1: 0x8b,
  TH0: 0x8c, TH1: 0x8d, P1: 0x90, SCON: 0x98, SBUF: 0x99, P2: 0xa0, IE: 0xa8, P3: 0xb0, IP: 0xb8,
  T2CON: 0xc8, T2MOD: 0xc9, RCAP2L: 0xca, RCAP2H: 0xcb, TL2: 0xcc, TH2: 0xcd, PSW: 0xd0, ACC: 0xe0, B: 0xf0,
};

/**
 * Translates Keil C51 dialect to SDCC:
 *   sfr X = 0x90;        -> __sfr __at (0x90) X;
 *   sbit LED = P1^0;     -> __sbit __at (0x90) LED;
 *   bit flag;            -> __bit flag;
 *   code/data/idata/xdata/pdata -> __code/...
 *   void isr(void) interrupt 1 using 2 -> __interrupt(1) __using(2)
 */
export function keilToSdcc(src) {
  const sfrs = { ...KEIL_SFRS };
  const notes = new Set();
  const out = mapCode(src, (code) => {
    code = code.replace(/#\s*include\s*[<"]([^>"]+)[>"]/g, (m, f) => {
      const lower = f.toLowerCase();
      return /^(reg51|reg52|at89x51|at89x52|at89c51|regx51|regx52|intrins)\.h$/.test(lower) ? `#include <${lower}>` : m;
    });
    code = code.replace(/\bsfr16\s+(\w+)\s*=\s*([^;]+);/g, (m, n, a) => {
      const v = parseNum(a);
      return Number.isNaN(v) ? m : `__sfr16 __at (${hexLit(v)}) ${n};`;
    });
    code = code.replace(/\bsfr\s+(\w+)\s*=\s*([^;]+);/g, (m, n, a) => {
      const v = parseNum(a);
      if (Number.isNaN(v)) return m;
      sfrs[n] = v;
      notes.add('sfr');
      return `__sfr __at (${hexLit(v)}) ${n};`;
    });
    code = code.replace(/\bsbit\s+(\w+)\s*=\s*([^;^]+?)\s*(?:\^\s*([0-7]))?\s*;/g, (m, n, base, bitNo) => {
      notes.add('sbit');
      base = base.trim();
      let addr = sfrs[base] ?? parseNum(base);
      if (Number.isNaN(addr)) return m; // leave for SDCC to report
      if (bitNo !== undefined) addr += Number(bitNo);
      return `__sbit __at (0x${addr.toString(16).toUpperCase()}) ${n};`;
    });
    code = code.replace(/\binterrupt\s+(\d+)/g, (_, n) => { notes.add('interrupt'); return `__interrupt(${n})`; });
    code = code.replace(/\busing\s+(\d+)/g, '__using($1)');
    code = code.replace(/\breentrant\b/g, '__reentrant');
    code = code.replace(/(\w+)\s+_at_\s+(0x[0-9a-fA-F]+|\d+)/g, '__at($2) $1');
    code = code.replace(/\bbit\b(?=\s+[A-Za-z_])/g, '__bit');
    code = code.replace(/\b(code|data|idata|xdata|pdata|bdata)\b(?!\s*[=(\[.,;)])/g, (_, q) => (q === 'bdata' ? '__data' : `__${q}`));
    return code;
  });
  return { source: out, notes: [...notes] };
}

// ---------------------------------------------------------------- MPLAB C18
/**
 * Best-effort translation of Microchip C18 interrupt syntax to XC8:
 *   #pragma interrupt isr        -> (removed) and `void isr(void)` -> `void __interrupt(high_priority) isr(void)`
 *   #pragma interruptlow isr     -> __interrupt(low_priority)
 *   #pragma code xxx = 0x08 ... vector stub with _asm goto isr _endasm -> removed (XC8 places vectors itself)
 */
export function c18ToXc8(src) {
  const hi = new Set(), lo = new Set();
  for (const m of src.matchAll(/^\s*#\s*pragma\s+interrupt\s+(\w+)/gm)) hi.add(m[1]);
  for (const m of src.matchAll(/^\s*#\s*pragma\s+interruptlow\s+(\w+)/gm)) lo.add(m[1]);
  const uses = hi.size || lo.size || /#\s*pragma\s+code\b|_asm\b|\brom\b/.test(src);
  if (!uses) return { source: src, changed: false };
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*#\s*pragma\s+(interrupt|interruptlow)\b/.test(l)) { lines[i] = ''; continue; }
    if (/^\s*#\s*pragma\s+code\b/.test(l)) { lines[i] = ''; continue; }
    // vector stubs: a function whose body is just `_asm goto X _endasm`
    if (/_asm\s+goto\s+\w+\s+_endasm/i.test(l) || /^\s*_asm\b/.test(l)) {
      // blank the enclosing function (scan back to its signature, forward to closing brace)
      let s = i;
      while (s > 0 && !/^\s*void\s+\w+\s*\(/.test(lines[s])) s--;
      let e = i;
      while (e < lines.length - 1 && !/}/.test(lines[e])) e++;
      for (let k = s; k <= e; k++) lines[k] = '';
      i = e;
      continue;
    }
    for (const [set, prio] of [[hi, 'high_priority'], [lo, 'low_priority']]) {
      for (const name of set) {
        const re = new RegExp(`\\bvoid\\s+${name}\\s*\\(`);
        if (re.test(l) && !/;\s*$/.test(l)) lines[i] = l.replace(re, `void __interrupt(${prio}) ${name}(`);
        else if (re.test(l) && /;\s*$/.test(l)) lines[i] = ''; // prototype
      }
    }
  }
  return { source: lines.join('\n'), changed: true };
}
