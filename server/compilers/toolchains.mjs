// Drives the real compilers: Microchip XC8 (PIC18F4550) and SDCC (8051).
// Each build runs in its own temp directory and returns the HEX image,
// diagnostics, a tool-style build log and debug info (line map + symbols).

import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDwarfLines } from './dwarf.mjs';
import { c18ToXc8, keilToSdcc } from './compat.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const INCLUDE = path.resolve(here, '..', 'include');

function run(cmd, args, cwd, timeout = 90_000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd, timeout, windowsHide: true, maxBuffer: 8 << 20 }, (err, stdout, stderr) => {
      resolve({ code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, out: `${stdout}${stderr}`, timedOut: !!err?.killed });
    });
  });
}

function findLatest(dir, sub) {
  if (!existsSync(dir)) return null;
  const versions = readdirSync(dir).filter((d) => /^v\d/.test(d)).sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const v of versions) {
    const p = path.join(dir, v, sub);
    if (existsSync(p)) return p;
  }
  return null;
}

function which(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const e of exts) {
      const p = path.join(dir, name + e);
      if (dir && existsSync(p)) return p;
    }
  }
  return null;
}

export function locateToolchains() {
  const win = process.platform === 'win32';
  const xc8 = process.env.XC8_CC ?? which('xc8-cc') ??
    (win ? findLatest('C:\\Program Files\\Microchip\\xc8', 'bin\\xc8-cc.exe') : findLatest('/opt/microchip/xc8', 'bin/xc8-cc'));
  const sdcc = process.env.SDCC ?? which('sdcc') ?? (win && existsSync('C:\\Program Files\\SDCC\\bin\\sdcc.exe') ? 'C:\\Program Files\\SDCC\\bin\\sdcc.exe' : null);
  return { xc8, sdcc };
}

export async function toolchainInfo() {
  const { xc8, sdcc } = locateToolchains();
  const info = { xc8: null, sdcc: null };
  // only report a compiler that actually answers --version
  if (xc8 && existsSync(xc8)) {
    const r = await run(xc8, ['--version'], tmpdir(), 20_000);
    const v = r.out.match(/V\d+\.\d+/i);
    if (v) info.xc8 = { path: xc8, version: v[0] };
  }
  if (sdcc && existsSync(sdcc)) {
    const r = await run(sdcc, ['--version'], tmpdir(), 20_000);
    const v = r.out.match(/\d+\.\d+\.\d+/);
    if (v) info.sdcc = { path: sdcc, version: v[0] };
  }
  return info;
}

const DIAG = /^(.*?):(\d+):(?:(\d+):)?\s*(fatal error|error|warning|syntax error|note)[^:]*:\s*(.*)$/i;
const DIAG_XC8_OLD = /^(.*?):(\d+):\s*:?\s*(error|warning|advisory):\s*\((\d+)\)\s*(.*)$/i;

function parseDiagnostics(out, file) {
  const diags = [];
  for (const raw of out.split(/\r?\n/)) {
    const line = raw.trim();
    let m = line.match(DIAG_XC8_OLD);
    if (m && path.basename(m[1]) === file) {
      diags.push({ line: +m[2], col: 1, severity: m[3].toLowerCase() === 'error' ? 'error' : 'warning', message: `(${m[4]}) ${m[5]}` });
      continue;
    }
    m = line.match(DIAG);
    if (m && path.basename(m[1]) === file) {
      const sev = /error/i.test(m[4]) ? 'error' : m[4].toLowerCase() === 'note' ? 'info' : 'warning';
      diags.push({ line: +m[2], col: m[3] ? +m[3] : 1, severity: sev, message: m[5] });
    }
  }
  return diags;
}

const now = () => new Date().toLocaleTimeString('en-GB');

// ------------------------------------------------------------------- XC8
export async function compilePic18(source, opts = {}) {
  const { xc8 } = locateToolchains();
  if (!xc8) return { ok: false, log: 'XC8 compiler not found. Install MPLAB XC8 or set the XC8_CC environment variable.', diagnostics: [] };
  const dir = await mkdtemp(path.join(tmpdir(), 'vlab-pic-'));
  const t0 = Date.now();
  try {
    const compat = c18ToXc8(source);
    await writeFile(path.join(dir, 'main.c'), compat.source);
    const opt = ['-O0', '-O1', '-O2', '-Os'].includes(opts.optimization) ? opts.optimization : '-O1';
    // The board runs a USB HID bootloader in 0x0000-0x0FFF: the application is linked at 0x1000.
    // A C18 program states this itself with "#pragma code <vector> = 0x1000"; honour what it says.
    const remap = codeRemap(source);
    const offset = opts.codeOffset ?? remap?.addr ?? 0x1000;
    const offsetNote = remap
      ? remap.addr === 0x1000
        ? 'note: reset vector remapped to 0x1000 (#pragma code) - matches the board USB HID bootloader.'
        : `warning: reset vector remapped to 0x${remap.addr.toString(16).toUpperCase()} but the board bootloader starts the application at 0x1000.`
      : `note: application code offset 0x${offset.toString(16).toUpperCase()} (USB HID bootloader project setting).`;
    const args = ['-mcpu=18F4550', opt, '-std=c99', `-mcodeoffset=0x${offset.toString(16)}`, `-I${path.join(INCLUDE, 'pic18')}`, 'main.c', '-o', 'main.elf'];
    // XC8 v3+ ships without device files: point it at the PIC18Fxxxx device family pack's xc8/ folder
    if (process.env.XC8_DFP) args.unshift(`-mdfp=${process.env.XC8_DFP}`);
    const r = await run(xc8, args, dir);
    const out = r.out.replaceAll(dir + path.sep, '').replaceAll(dir, '.');
    const diagnostics = parseDiagnostics(out, 'main.c');
    const ok = r.code === 0 && existsSync(path.join(dir, 'main.hex'));
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const log = [
      `CLEAN SUCCESSFUL (total time: 0ms)`,
      `make -f nbproject/Makefile-default.mk SUBPROJECTS= .build-conf`,
      `"${path.basename(path.dirname(path.dirname(xc8)))}" xc8-cc ${args.join(' ')}`,
      compat.changed ? 'note: MPLAB C18 syntax detected - #pragma interrupt / vector stubs translated for XC8 (Virtual Lab compatibility layer).' : null,
      offsetNote,
      out.trim(),
      ok ? `\nBUILD SUCCESSFUL (total time: ${secs}s)` : `\nBUILD FAILED (exit value ${r.code}, total time: ${secs}s)`,
      `Loading completed`,
    ].filter(Boolean).join('\n');
    if (!ok) return { ok, log, diagnostics };

    const hex = await readFile(path.join(dir, 'main.hex'), 'utf8');
    const lines = [];
    try {
      for (const row of readDwarfLines(await readFile(path.join(dir, 'main.elf')))) {
        lines.push({ addr: row.addr, line: row.line, file: path.basename(row.file) });
      }
    } catch { /* debug info is optional */ }
    const symbols = await xc8Symbols(dir);
    const mem = out.match(/Program space\s+used\s+\w+h\s+\(\s*(\d+)\)\s+of\s+\w+h bytes/);
    const data = out.match(/Data space\s+used\s+\w+h\s+\(\s*(\d+)\)/);
    return {
      ok, log, diagnostics, hex,
      debug: { mainFile: 'main.c', lines, symbols },
      stats: { program: mem ? +mem[1] : null, data: data ? +data[1] : null, time: Date.now() - t0 },
      codeOffset: offset,
    };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Address of the remapped reset vector in C18 source (#pragma code NAME = ADDR), if any. */
function codeRemap(source) {
  const all = [...source.matchAll(/^\s*#\s*pragma\s+code\s+(\w+)\s*=\s*(0x[0-9a-fA-F]+|\d+)/gm)]
    .map((m) => ({ name: m[1], addr: Number(m[2]) }));
  if (!all.length) return null;
  const reset = all.find((r) => /reset/i.test(r.name)) ?? all.reduce((a, b) => (b.addr < a.addr ? b : a));
  return { addr: reset.addr & ~0xff };
}

const XC8_TYPE_SIZE = { c: 1, uc: 1, s: 2, us: 2, i: 2, ui: 2, l: 4, ul: 4, f: 4, d: 4, sx: 3, usx: 3, o: 8, uo: 8, b: 1 };

async function xc8Symbols(dir) {
  const sym = await readFile(path.join(dir, 'main.sym'), 'utf8').catch(() => '');
  const sdb = await readFile(path.join(dir, 'main.sdb'), 'utf8').catch(() => '');
  const types = new Map();
  for (const m of sdb.matchAll(/^\[v\s+(\S+)\s+(\S+)\s+`(\S+)\s+\d+\s+\w\s+(\d+)/gm)) types.set(m[1], { type: m[3], size: +m[4], cname: m[2] });
  const out = [];
  for (const line of sym.split(/\r?\n/)) {
    const [name, addrHex, , cls] = line.trim().split(/\s+/);
    if (!name || !cls) continue;
    const addr = parseInt(addrHex, 16);
    const t = types.get(name);
    const isGlobal = name.startsWith('_') && !name.startsWith('__');
    const isLocal = /^\w+@\w+$/.test(name);
    if (!isGlobal && !isLocal) continue;
    if (/^(COMRAM|BANK\d+|BIGRAM|RAM|ABS)$/.test(cls) && addr < 0x800 && (t || isLocal)) {
      const type = t?.type ?? 'uc';
      const elem = XC8_TYPE_SIZE[type.replace(/^\[\d+\]/, '')] ?? 1;
      out.push({ name: isGlobal ? name.slice(1) : name.replace('@', '::'), addr, size: t?.size ?? elem, type, space: 'data' });
    } else if (cls === 'CODE' && isGlobal) {
      out.push({ name: name.slice(1), addr, size: 0, type: 'func', space: 'code' });
    }
  }
  return out;
}

// ------------------------------------------------------------------- SDCC
export async function compile8051(source, opts = {}) {
  const { sdcc } = locateToolchains();
  if (!sdcc) return { ok: false, log: 'SDCC not found. Install SDCC (sdcc.sourceforge.net) or set the SDCC environment variable.', diagnostics: [] };
  const dir = await mkdtemp(path.join(tmpdir(), 'vlab-51-'));
  const t0 = Date.now();
  try {
    const keil = keilToSdcc(source);
    await writeFile(path.join(dir, 'main.c'), keil.source);
    const args = ['-mmcs51', '--model-small', '--debug', '--std-sdcc11', `-I${path.join(INCLUDE, 'mcs51')}`, 'main.c'];
    if (opts.codeSize) args.push(`--code-size`, String(opts.codeSize));
    const r = await run(sdcc, args, dir);
    const out = r.out.replaceAll(dir + path.sep, '');
    const diagnostics = parseDiagnostics(out, 'main.c');
    const ok = r.code === 0 && existsSync(path.join(dir, 'main.ihx'));
    const errors = diagnostics.filter((d) => d.severity === 'error').length || (ok ? 0 : 1);
    const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
    let sizeLine = '';
    let stats = null;
    if (ok) {
      const memTxt = await readFile(path.join(dir, 'main.mem'), 'utf8').catch(() => '');
      const code = memTxt.match(/ROM\/EPROM\/FLASH\s+0x\w+\s+0x\w+\s+(\d+)/);
      const iram = memTxt.match(/Stack starts at:\s*0x(\w+)/);
      const codeBytes = code ? +code[1] : 0;
      stats = { program: codeBytes, data: iram ? parseInt(iram[1], 16) : null, time: Date.now() - t0 };
      sizeLine = `Program Size: data=${stats.data ?? '?'}.0 xdata=0 code=${codeBytes}`;
    }
    const log = [
      `Rebuild started: Project: lab`,
      `Rebuild target 'Target 1'`,
      `compiling main.c...  (SDCC ${opts.sdccVersion ?? ''} with Keil C51 compatibility layer)`,
      keil.notes.length ? `note: translated Keil C51 extensions: ${keil.notes.join(', ')}` : null,
      out.trim() || null,
      ok ? 'linking...' : null,
      ok ? sizeLine : null,
      ok ? `creating hex file from "lab"...` : null,
      `"lab" - ${errors} Error(s), ${warnings} Warning(s).`,
      `Build Time Elapsed:  00:00:0${Math.min(9, Math.round((Date.now() - t0) / 1000))}`,
    ].filter(Boolean).join('\n');
    if (!ok) return { ok, log, diagnostics };
    const hex = await readFile(path.join(dir, 'main.ihx'), 'utf8');
    const cdb = await readFile(path.join(dir, 'main.cdb'), 'utf8').catch(() => '');
    return { ok, log, diagnostics, hex, debug: parseCdb(cdb), stats };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function parseCdb(cdb) {
  const lines = [];
  const addrs = new Map();
  const symbols = [];
  for (const l of cdb.split(/\r?\n/)) {
    let m = l.match(/^L:C\$([^$]+)\$(\d+)\$[^:]*:([0-9A-Fa-f]+)/);
    if (m) { lines.push({ file: m[1], line: +m[2], addr: parseInt(m[3], 16) }); continue; }
    m = l.match(/^L:([GF])\$([^:]+):([0-9A-Fa-f]+)$/);
    if (m) { addrs.set(`${m[1]}$${m[2]}`, parseInt(m[3], 16)); continue; }
  }
  for (const l of cdb.split(/\r?\n/)) {
    const m = l.match(/^S:([GF])\$(\w+)\$([^(]+)\(\{(\d+)\}([^)]*)\),(\w)/);
    if (!m) continue;
    const key = `${m[1]}$${m[2]}$${m[3]}`;
    const addr = addrs.get(key);
    if (addr === undefined) continue;
    const space = m[6];
    const kind = { E: 'data', G: 'data', H: 'data', B: 'data', F: 'xdata', A: 'xdata', I: 'sfr', J: 'bit', C: 'code', D: 'code' }[space];
    if (!kind || kind === 'sfr' || kind === 'bit') continue;
    const type = m[5];
    if (/DF/.test(type)) { symbols.push({ name: m[2], addr, size: 0, type: 'func', space: 'code' }); continue; }
    symbols.push({ name: m[2], addr, size: +m[4], type, space: kind });
  }
  return { mainFile: 'main.c', lines, symbols };
}
