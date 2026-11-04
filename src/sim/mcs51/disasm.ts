// 8051 disassembler (Keil A51 syntax).
import { LEN51, SFR51 } from './mcs51.ts';

const SFR_NAMES: Record<number, string> = {};
for (const [k, v] of Object.entries(SFR51)) SFR_NAMES[v] = k;

const BIT_NAMES: Record<number, string> = {
  0x88: 'IT0', 0x89: 'IE0', 0x8a: 'IT1', 0x8b: 'IE1', 0x8c: 'TR0', 0x8d: 'TF0', 0x8e: 'TR1', 0x8f: 'TF1',
  0x98: 'RI', 0x99: 'TI', 0x9a: 'RB8', 0x9b: 'TB8', 0x9c: 'REN', 0x9d: 'SM2', 0x9e: 'SM1', 0x9f: 'SM0',
  0xa8: 'EX0', 0xa9: 'ET0', 0xaa: 'EX1', 0xab: 'ET1', 0xac: 'ES', 0xad: 'ET2', 0xaf: 'EA',
  0xd7: 'CY', 0xd6: 'AC', 0xd5: 'F0', 0xd4: 'RS1', 0xd3: 'RS0', 0xd2: 'OV', 0xd0: 'P',
};

const h = (v: number, w = 2) => v.toString(16).toUpperCase().padStart(w, '0') + 'H';
const hx = (v: number, w = 2) => (/^[A-F]/.test(v.toString(16).toUpperCase().padStart(w, '0')) ? '0' : '') + h(v, w);
const dir = (a: number) => SFR_NAMES[a] ?? hx(a);
const bit = (b: number) => {
  if (BIT_NAMES[b]) return BIT_NAMES[b];
  if (b < 0x80) return `${hx(0x20 + (b >> 3))}.${b & 7}`;
  return `${dir(b & 0xf8)}.${b & 7}`;
};

export interface Disasm51Line { addr: number; len: number; text: string; raw: number[] }

export function disasm51(code: Uint8Array, addr: number, codeSyms?: Map<number, string>): Disasm51Line {
  const op = code[addr];
  const len = LEN51[op];
  const b1 = code[(addr + 1) & 0xffff], b2 = code[(addr + 2) & 0xffff];
  const next = (addr + len) & 0xffff;
  const rel = (o: number) => { const t = (next + ((o << 24) >> 24)) & 0xffff; return codeSyms?.get(t) ?? hx(t, 4); };
  const abs = (t: number) => codeSyms?.get(t) ?? hx(t, 4);
  const lo = op & 0x0f, hi = op >> 4;
  const rn = lo >= 8 ? `R${lo - 8}` : lo === 6 || lo === 7 ? `@R${lo - 6}` : lo === 5 ? dir(b1) : `#${hx(b1)}`;
  let t: string;
  if ((op & 0x1f) === 0x01) t = `AJMP ${abs((next & 0xf800) | ((op & 0xe0) << 3) | b1)}`;
  else if ((op & 0x1f) === 0x11) t = `ACALL ${abs((next & 0xf800) | ((op & 0xe0) << 3) | b1)}`;
  else {
    const fixed: Record<number, string> = {
      0x00: 'NOP', 0x02: `LJMP ${abs((b1 << 8) | b2)}`, 0x03: 'RR A', 0x04: 'INC A', 0x05: `INC ${dir(b1)}`,
      0x10: `JBC ${bit(b1)},${rel(b2)}`, 0x12: `LCALL ${abs((b1 << 8) | b2)}`, 0x13: 'RRC A', 0x14: 'DEC A', 0x15: `DEC ${dir(b1)}`,
      0x20: `JB ${bit(b1)},${rel(b2)}`, 0x22: 'RET', 0x23: 'RL A', 0x30: `JNB ${bit(b1)},${rel(b2)}`, 0x32: 'RETI', 0x33: 'RLC A',
      0x40: `JC ${rel(b1)}`, 0x42: `ORL ${dir(b1)},A`, 0x43: `ORL ${dir(b1)},#${hx(b2)}`,
      0x50: `JNC ${rel(b1)}`, 0x52: `ANL ${dir(b1)},A`, 0x53: `ANL ${dir(b1)},#${hx(b2)}`,
      0x60: `JZ ${rel(b1)}`, 0x62: `XRL ${dir(b1)},A`, 0x63: `XRL ${dir(b1)},#${hx(b2)}`,
      0x70: `JNZ ${rel(b1)}`, 0x72: `ORL C,${bit(b1)}`, 0x73: 'JMP @A+DPTR', 0x74: `MOV A,#${hx(b1)}`, 0x75: `MOV ${dir(b1)},#${hx(b2)}`,
      0x80: `SJMP ${rel(b1)}`, 0x82: `ANL C,${bit(b1)}`, 0x83: 'MOVC A,@A+PC', 0x84: 'DIV AB', 0x85: `MOV ${dir(b2)},${dir(b1)}`,
      0x90: `MOV DPTR,#${hx((b1 << 8) | b2, 4)}`, 0x92: `MOV ${bit(b1)},C`, 0x93: 'MOVC A,@A+DPTR',
      0xa0: `ORL C,/${bit(b1)}`, 0xa2: `MOV C,${bit(b1)}`, 0xa3: 'INC DPTR', 0xa4: 'MUL AB', 0xa5: 'DB 0A5H',
      0xb0: `ANL C,/${bit(b1)}`, 0xb2: `CPL ${bit(b1)}`, 0xb3: 'CPL C', 0xb4: `CJNE A,#${hx(b1)},${rel(b2)}`, 0xb5: `CJNE A,${dir(b1)},${rel(b2)}`,
      0xc0: `PUSH ${dir(b1)}`, 0xc2: `CLR ${bit(b1)}`, 0xc3: 'CLR C', 0xc4: 'SWAP A', 0xc5: `XCH A,${dir(b1)}`,
      0xd0: `POP ${dir(b1)}`, 0xd2: `SETB ${bit(b1)}`, 0xd3: 'SETB C', 0xd4: 'DA A', 0xd5: `DJNZ ${dir(b1)},${rel(b2)}`,
      0xe0: 'MOVX A,@DPTR', 0xe2: 'MOVX A,@R0', 0xe3: 'MOVX A,@R1', 0xe4: 'CLR A', 0xe5: `MOV A,${dir(b1)}`,
      0xf0: 'MOVX @DPTR,A', 0xf2: 'MOVX @R0,A', 0xf3: 'MOVX @R1,A', 0xf4: 'CPL A', 0xf5: `MOV ${dir(b1)},A`,
    };
    if (fixed[op] !== undefined) t = fixed[op];
    else {
      const r = lo >= 8 ? `R${lo - 8}` : `@R${lo - 6}`;
      switch (hi) {
        case 0x0: t = `INC ${r}`; break;
        case 0x1: t = `DEC ${r}`; break;
        case 0x2: t = `ADD A,${rn}`; break;
        case 0x3: t = `ADDC A,${rn}`; break;
        case 0x4: t = `ORL A,${rn}`; break;
        case 0x5: t = `ANL A,${rn}`; break;
        case 0x6: t = `XRL A,${rn}`; break;
        case 0x7: t = `MOV ${r},#${hx(b1)}`; break;
        case 0x8: t = `MOV ${dir(b1)},${r}`; break;
        case 0x9: t = `SUBB A,${rn}`; break;
        case 0xa: t = `MOV ${r},${dir(b1)}`; break;
        case 0xb: t = `CJNE ${r},#${hx(b1)},${rel(b2)}`; break;
        case 0xc: t = `XCH A,${r}`; break;
        case 0xd: t = lo >= 8 ? `DJNZ ${r},${rel(b1)}` : `XCHD A,${r}`; break;
        case 0xe: t = `MOV A,${r}`; break;
        default: t = `MOV ${r},A`; break;
      }
    }
  }
  const raw: number[] = [];
  for (let i = 0; i < len; i++) raw.push(code[(addr + i) & 0xffff]);
  return { addr, len, text: t, raw };
}
