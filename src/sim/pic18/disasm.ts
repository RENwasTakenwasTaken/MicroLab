// PIC18 disassembler (standard instruction set), MPLAB-style mnemonics.
import { SFR } from './pic18.ts';

const SFR_NAMES: Record<number, string> = {};
for (const [k, v] of Object.entries(SFR)) SFR_NAMES[v] = k;
SFR_NAMES[0xfef] = 'INDF0'; SFR_NAMES[0xfee] = 'POSTINC0'; SFR_NAMES[0xfed] = 'POSTDEC0'; SFR_NAMES[0xfec] = 'PREINC0'; SFR_NAMES[0xfeb] = 'PLUSW0';
SFR_NAMES[0xfe7] = 'INDF1'; SFR_NAMES[0xfe6] = 'POSTINC1'; SFR_NAMES[0xfe5] = 'POSTDEC1'; SFR_NAMES[0xfe4] = 'PREINC1'; SFR_NAMES[0xfe3] = 'PLUSW1';
SFR_NAMES[0xfdf] = 'INDF2'; SFR_NAMES[0xfde] = 'POSTINC2'; SFR_NAMES[0xfdd] = 'POSTDEC2'; SFR_NAMES[0xfdc] = 'PREINC2'; SFR_NAMES[0xfdb] = 'PLUSW2';

export const pic18SfrName = (a: number) => SFR_NAMES[a];

const hex = (v: number, w = 2) => '0x' + v.toString(16).toUpperCase().padStart(w, '0');

function file(op: number, symbols?: Map<number, string>) {
  const f = op & 0xff;
  const banked = !!(op & 0x100);
  if (!banked) {
    const abs = f < 0x60 ? f : 0xf00 | f;
    const name = SFR_NAMES[abs] ?? symbols?.get(abs);
    return (name ?? hex(f)) + ', ACCESS';
  }
  return hex(f) + ', BANKED';
}

const fd = (op: number, s?: Map<number, string>) => {
  const parts = file(op, s).split(', ');
  return `${parts[0]}, ${op & 0x200 ? 'F' : 'W'}, ${parts[1]}`;
};
const fb = (op: number, s?: Map<number, string>) => {
  const parts = file(op, s).split(', ');
  return `${parts[0]}, ${(op >> 9) & 7}, ${parts[1]}`;
};

export interface DisasmLine { addr: number; words: number; text: string; raw: number[] }

export function disasmPic18(prog: Uint8Array, addr: number, symbols?: Map<number, string>, codeSyms?: Map<number, string>): DisasmLine {
  const word = (a: number) => (a < prog.length - 1 ? prog[a] | (prog[a + 1] << 8) : 0xffff);
  const op = word(addr);
  const op2 = word(addr + 2);
  const one = (text: string): DisasmLine => ({ addr, words: 1, text, raw: [op] });
  const two = (text: string): DisasmLine => ({ addr, words: 2, text, raw: [op, op2] });
  const target = (t: number) => codeSyms?.get(t) ?? hex(t, 4);
  const hi = op >> 8;
  switch (op >> 12) {
    case 0x0: {
      if (hi === 0) {
        const m: Record<number, string> = {
          0: 'NOP', 3: 'SLEEP', 4: 'CLRWDT', 5: 'PUSH', 6: 'POP', 7: 'DAW', 8: 'TBLRD*', 9: 'TBLRD*+', 10: 'TBLRD*-',
          11: 'TBLRD+*', 12: 'TBLWT*', 13: 'TBLWT*+', 14: 'TBLWT*-', 15: 'TBLWT+*', 0x10: 'RETFIE 0', 0x11: 'RETFIE FAST',
          0x12: 'RETURN 0', 0x13: 'RETURN FAST', 0xff: 'RESET',
        };
        return one(m[op & 0xff] ?? `DW ${hex(op, 4)}`);
      }
      if (hi === 1) return one(`MOVLB ${op & 0xf}`);
      if (hi === 2 || hi === 3) return one(`MULWF ${file(op, symbols)}`);
      if (hi >= 4 && hi <= 7) return one(`DECF ${fd(op, symbols)}`);
      const lit = ['SUBLW', 'IORLW', 'XORLW', 'ANDLW', 'RETLW', 'MULLW', 'MOVLW', 'ADDLW'][hi - 8];
      return one(`${lit} ${hex(op & 0xff)}`);
    }
    case 0x1: return one(`${['IORWF', 'ANDWF', 'XORWF', 'COMF'][(op >> 10) & 3]} ${fd(op, symbols)}`);
    case 0x2: return one(`${['ADDWFC', 'ADDWF', 'INCF', 'DECFSZ'][(op >> 10) & 3]} ${fd(op, symbols)}`);
    case 0x3: return one(`${['RRCF', 'RLCF', 'SWAPF', 'INCFSZ'][(op >> 10) & 3]} ${fd(op, symbols)}`);
    case 0x4: return one(`${['RRNCF', 'RLNCF', 'INFSNZ', 'DCFSNZ'][(op >> 10) & 3]} ${fd(op, symbols)}`);
    case 0x5: return one(`${['MOVF', 'SUBFWB', 'SUBWFB', 'SUBWF'][(op >> 10) & 3]} ${fd(op, symbols)}`);
    case 0x6: {
      const m = ['CPFSLT', 'CPFSEQ', 'CPFSGT', 'TSTFSZ', 'SETF', 'CLRF', 'NEGF', 'MOVWF'][(op >> 9) & 7];
      return one(`${m} ${file(op, symbols)}`);
    }
    case 0x7: return one(`BTG ${fb(op, symbols)}`);
    case 0x8: return one(`BSF ${fb(op, symbols)}`);
    case 0x9: return one(`BCF ${fb(op, symbols)}`);
    case 0xa: return one(`BTFSS ${fb(op, symbols)}`);
    case 0xb: return one(`BTFSC ${fb(op, symbols)}`);
    case 0xc: {
      const n = (a: number) => SFR_NAMES[a] ?? symbols?.get(a) ?? hex(a, 3);
      return two(`MOVFF ${n(op & 0xfff)}, ${n(op2 & 0xfff)}`);
    }
    case 0xd: {
      const n = ((op & 0x7ff) << 21) >> 21;
      return one(`${op & 0x800 ? 'RCALL' : 'BRA'} ${target(addr + 2 + 2 * n)}`);
    }
    case 0xe: {
      const h = hi & 0x0f;
      if (h < 8) {
        const m = ['BZ', 'BNZ', 'BC', 'BNC', 'BOV', 'BNOV', 'BN', 'BNN'][h];
        return one(`${m} ${target(addr + 2 + 2 * ((op << 24) >> 24))}`);
      }
      const t = (((op2 & 0xfff) << 8) | (op & 0xff)) << 1;
      if (h === 0xc || h === 0xd) return two(`CALL ${target(t)}${op & 0x100 ? ', FAST' : ''}`);
      if (h === 0xf) return two(`GOTO ${target(t)}`);
      if (h === 0xe && (op & 0xc0) === 0) return two(`LFSR ${(op >> 4) & 3}, ${hex(((op & 0xf) << 8) | (op2 & 0xff), 3)}`);
      return one(`DW ${hex(op, 4)}  ; extended`);
    }
    default:
      return one(op === 0xffff ? 'NOP  ; (erased)' : `NOP  ; ${hex(op, 4)}`);
  }
}
