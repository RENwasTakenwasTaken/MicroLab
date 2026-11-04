// Minimal ELF32 + DWARF .debug_line reader: produces (address -> file:line) rows
// used for source-level breakpoints and stepping of XC8-compiled programs.

function sections(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, false) !== 0x7f454c46) throw new Error('not an ELF file');
  if (buf[4] !== 1) throw new Error('only ELF32 supported');
  const le = buf[5] === 1;
  const shoff = dv.getUint32(0x20, le);
  const shentsize = dv.getUint16(0x2e, le);
  const shnum = dv.getUint16(0x30, le);
  const shstrndx = dv.getUint16(0x32, le);
  const hdr = (i) => {
    const o = shoff + i * shentsize;
    return { name: dv.getUint32(o, le), offset: dv.getUint32(o + 16, le), size: dv.getUint32(o + 20, le) };
  };
  const strtab = hdr(shstrndx);
  const out = {};
  for (let i = 0; i < shnum; i++) {
    const h = hdr(i);
    let n = '';
    for (let p = strtab.offset + h.name; buf[p]; p++) n += String.fromCharCode(buf[p]);
    out[n] = { offset: h.offset, size: h.size };
  }
  return { out, le, dv };
}

export function readDwarfLines(buf) {
  const { out, le, dv } = sections(buf);
  const sec = out['.debug_line'];
  if (!sec) return [];
  let p = sec.offset;
  const end = sec.offset + sec.size;
  const rows = [];
  const u8 = () => buf[p++];
  const u16 = () => { const v = dv.getUint16(p, le); p += 2; return v; };
  const u32 = () => { const v = dv.getUint32(p, le); p += 4; return v; };
  const uleb = () => { let r = 0, s = 0, b; do { b = buf[p++]; r += (b & 0x7f) * 2 ** s; s += 7; } while (b & 0x80); return r; };
  const sleb = () => { let r = 0, s = 0, b; do { b = buf[p++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80); if (s < 32 && b & 0x40) r |= -1 << s; return r; };
  const cstr = () => { let s = ''; while (buf[p]) s += String.fromCharCode(buf[p++]); p++; return s; };

  while (p < end) {
    const unitLen = u32();
    const unitEnd = p + unitLen;
    const version = u16();
    let addrSize = 4;
    if (version >= 5) { addrSize = u8(); u8(); }
    const headerLen = u32();
    const progStart = p + headerLen;
    const minInst = u8();
    if (version >= 4) u8();
    const defaultStmt = u8();
    const lineBase = (u8() << 24) >> 24;
    const lineRange = u8();
    const opcodeBase = u8();
    const stdLens = [0];
    for (let i = 1; i < opcodeBase; i++) stdLens.push(u8());
    const files = [''];
    if (version < 5) {
      while (buf[p]) cstr(); // include dirs
      p++;
      while (buf[p]) { files.push(cstr()); uleb(); uleb(); uleb(); }
      p++;
    }
    p = progStart;
    let addr = 0, file = 1, line = 1, isStmt = defaultStmt;
    const emit = () => { if (isStmt) rows.push({ addr, file: files[file] ?? '', line }); };
    while (p < unitEnd) {
      const op = u8();
      if (op >= opcodeBase) {
        const adj = op - opcodeBase;
        addr += Math.floor(adj / lineRange) * minInst;
        line += lineBase + (adj % lineRange);
        emit();
      } else if (op === 0) {
        const len = uleb();
        const next = p + len;
        const sub = u8();
        if (sub === 1) { addr = 0; file = 1; line = 1; isStmt = defaultStmt; }
        else if (sub === 2) addr = addrSize === 2 ? u16() : u32();
        else if (sub === 3) files.push(cstr());
        p = next;
      } else {
        switch (op) {
          case 1: emit(); break;
          case 2: addr += uleb() * minInst; break;
          case 3: line += sleb(); break;
          case 4: file = uleb(); break;
          case 5: uleb(); break;
          case 6: isStmt = isStmt ? 0 : 1; break;
          case 7: break;
          case 8: addr += Math.floor((255 - opcodeBase) / lineRange) * minInst; break;
          case 9: addr += u16(); break;
          default: for (let i = 0; i < stdLens[op]; i++) uleb();
        }
      }
    }
    p = unitEnd;
  }
  return rows;
}
