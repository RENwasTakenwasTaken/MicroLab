// Debug views: CPU registers & SFRs, watch variables, memory, pins, peripherals, disassembly.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useLab, type RightTab } from '../app/store.ts';
import { sim } from '../app/sim.ts';
import { SFR } from '../sim/pic18/pic18.ts';
import { SFR51 } from '../sim/mcs51/mcs51.ts';
import type { CpuRegs51, CpuRegsPic, FrameData, SymbolEntry } from '../sim/protocol.ts';
import { Icon } from '../ui/icons.tsx';

const h2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');
const h4 = (v: number) => v.toString(16).toUpperCase().padStart(4, '0');
const bin = (v: number) => v.toString(2).padStart(8, '0');

/** Remembers previous values to highlight changes (MPLAB/Keil style red values). */
function useChanged(values: number[]) {
  const prev = useRef<number[]>([]);
  const changed = values.map((v, i) => prev.current[i] !== undefined && prev.current[i] !== v);
  useEffect(() => { prev.current = values; });
  return changed;
}

// --------------------------------------------------------------- registers
const PIC_GROUPS: [string, string[]][] = [
  ['I/O ports', ['PORTA', 'PORTB', 'PORTC', 'PORTD', 'PORTE', 'LATA', 'LATB', 'LATC', 'LATD', 'LATE', 'TRISA', 'TRISB', 'TRISC', 'TRISD', 'TRISE']],
  ['Interrupts', ['INTCON', 'INTCON2', 'INTCON3', 'PIR1', 'PIE1', 'IPR1', 'PIR2', 'PIE2', 'RCON']],
  ['Timers', ['T0CON', 'TMR0H', 'TMR0L', 'T1CON', 'TMR1H', 'TMR1L', 'T2CON', 'TMR2', 'PR2', 'T3CON', 'TMR3H', 'TMR3L']],
  ['CCP / PWM', ['CCP1CON', 'CCPR1H', 'CCPR1L', 'CCP2CON', 'CCPR2H', 'CCPR2L']],
  ['ADC', ['ADCON0', 'ADCON1', 'ADCON2', 'ADRESH', 'ADRESL']],
  ['EUSART', ['TXSTA', 'RCSTA', 'BAUDCON', 'SPBRG', 'SPBRGH', 'TXREG', 'RCREG']],
  ['Core', ['WREG', 'STATUS', 'BSR', 'PCL', 'PCLATH', 'PCLATU', 'STKPTR', 'FSR0H', 'FSR0L', 'FSR1H', 'FSR1L', 'FSR2H', 'FSR2L', 'PRODH', 'PRODL', 'TBLPTRU', 'TBLPTRH', 'TBLPTRL', 'TABLAT', 'OSCCON', 'WDTCON']],
];
const C51_GROUP = ['P0', 'P1', 'P2', 'P3', 'TCON', 'TMOD', 'TH0', 'TL0', 'TH1', 'TL1', 'SCON', 'SBUF', 'IE', 'IP', 'PCON', 'T2CON', 'TH2', 'TL2', 'RCAP2H', 'RCAP2L'];

function Flags({ v, names }: { v: number; names: string[] }) {
  return (
    <span className="flags">
      {names.map((n, i) => <span key={n} className={(v >> (names.length - 1 - i)) & 1 ? 'f-on' : 'f-off'}>{n}</span>)}
    </span>
  );
}

function PicRegisters({ f }: { f: FrameData }) {
  const c = f.cpu as CpuRegsPic;
  const [open, setOpen] = useState<Record<string, boolean>>({ 'I/O ports': true, Interrupts: true, Timers: true });
  const core = [c.pc, c.w, c.status, c.bsr, c.sp, ...c.fsr, c.prod, c.tblptr];
  const ch = useChanged(core);
  const all = PIC_GROUPS.flatMap(([, names]) => names.map((n) => f.mem[(SFR as Record<string, number>)[n]]));
  const chS = useChanged(all);
  let k = 0;
  return (
    <div className="regs">
      <div className="reg-core">
        <div><span>PC</span><b className={ch[0] ? 'changed' : ''}>0x{c.pc.toString(16).toUpperCase().padStart(5, '0')}</b></div>
        <div><span>WREG</span><b className={ch[1] ? 'changed' : ''}>0x{h2(c.w)}</b></div>
        <div><span>BSR</span><b className={ch[3] ? 'changed' : ''}>{c.bsr}</b></div>
        <div><span>STKPTR</span><b className={ch[4] ? 'changed' : ''}>{c.sp}</b></div>
        <div className="wide"><span>STATUS</span><Flags v={c.status} names={['N', 'OV', 'Z', 'DC', 'C']} /></div>
        <div><span>FSR0</span><b className={ch[5] ? 'changed' : ''}>0x{c.fsr[0].toString(16).toUpperCase().padStart(3, '0')}</b></div>
        <div><span>FSR1</span><b className={ch[6] ? 'changed' : ''}>0x{c.fsr[1].toString(16).toUpperCase().padStart(3, '0')}</b></div>
        <div><span>FSR2</span><b className={ch[7] ? 'changed' : ''}>0x{c.fsr[2].toString(16).toUpperCase().padStart(3, '0')}</b></div>
        <div><span>PROD</span><b className={ch[8] ? 'changed' : ''}>0x{h4(c.prod)}</b></div>
        <div className="wide"><span>Stack</span><b className="mono">{c.stack.length ? c.stack.map((a) => a.toString(16).toUpperCase()).join(' › ') : '—'}</b></div>
      </div>
      <table className="grid">
        <thead><tr><th>SFR</th><th>Addr</th><th>Hex</th><th>Binary</th></tr></thead>
        {PIC_GROUPS.map(([g, names]) => (
          <tbody key={g}>
            <tr className="grp" onClick={() => setOpen({ ...open, [g]: !open[g] })}><td colSpan={4}>{open[g] ? '▾' : '▸'} {g}</td></tr>
            {names.map((n) => {
              const idx = k++;
              if (!open[g]) return null;
              const a = (SFR as Record<string, number>)[n];
              const v = f.mem[a];
              return (
                <tr key={n} className={chS[idx] ? 'changed' : ''}>
                  <td>{n}</td><td className="dim">{a.toString(16).toUpperCase()}</td><td>0x{h2(v)}</td><td className="bits">{bin(v)}</td>
                </tr>
              );
            })}
          </tbody>
        ))}
      </table>
    </div>
  );
}

function Registers51({ f }: { f: FrameData }) {
  const c = f.cpu as CpuRegs51;
  const core = [c.pc, c.a, c.b, c.sp, c.dptr, c.psw, ...c.r];
  const ch = useChanged(core);
  const sfrVals = C51_GROUP.map((n) => f.mem[256 + SFR51[n] - 0x80]);
  const chS = useChanged(sfrVals);
  return (
    <div className="regs">
      <div className="reg-core">
        {c.r.map((v, i) => <div key={i}><span>R{i}</span><b className={ch[6 + i] ? 'changed' : ''}>0x{h2(v)}</b></div>)}
        <div><span>A</span><b className={ch[1] ? 'changed' : ''}>0x{h2(c.a)}</b></div>
        <div><span>B</span><b className={ch[2] ? 'changed' : ''}>0x{h2(c.b)}</b></div>
        <div><span>SP</span><b className={ch[3] ? 'changed' : ''}>0x{h2(c.sp)}</b></div>
        <div><span>DPTR</span><b className={ch[4] ? 'changed' : ''}>0x{h4(c.dptr)}</b></div>
        <div><span>PC $</span><b className={ch[0] ? 'changed' : ''}>C:0x{h4(c.pc)}</b></div>
        <div><span>states</span><b>{f.cycles.toLocaleString()}</b></div>
        <div><span>sec</span><b>{f.simTime.toFixed(8)}</b></div>
        <div className="wide"><span>PSW</span><Flags v={c.psw} names={['CY', 'AC', 'F0', 'RS1', 'RS0', 'OV', '-', 'P']} /></div>
      </div>
      <table className="grid">
        <thead><tr><th>SFR</th><th>Addr</th><th>Hex</th><th>Binary</th></tr></thead>
        <tbody>
          {C51_GROUP.map((n, i) => (
            <tr key={n} className={chS[i] ? 'changed' : ''}><td>{n}</td><td className="dim">{h2(SFR51[n])}</td><td>0x{h2(sfrVals[i])}</td><td className="bits">{bin(sfrVals[i])}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ------------------------------------------------------------------ watch
function decode(mem: Uint8Array, s: SymbolEntry, arch: string, offset: number): string {
  const base = arch === 'mcs51' ? s.addr : s.addr;
  if (s.addr + s.size > mem.length || s.space !== 'data') return '—';
  const bytes = Array.from(mem.slice(base + offset, base + offset + Math.min(s.size, 4)));
  const t = s.type ?? '';
  const isFloat = /^f$|^d$|SF/.test(t);
  const unsigned = arch === 'mcs51' ? /:U$/.test(t) : /^u/.test(t.replace(/^\[\d+\]/, ''));
  if (isFloat && bytes.length === 4) {
    const dv = new DataView(new Uint8Array(bytes).buffer);
    return dv.getFloat32(0, true).toPrecision(6);
  }
  let v = 0;
  bytes.forEach((b, i) => { v += b * 2 ** (8 * i); });
  if (!unsigned && bytes.length && v >= 2 ** (8 * bytes.length - 1)) v -= 2 ** (8 * bytes.length);
  return `${v}  (0x${(v < 0 ? v + 2 ** (8 * bytes.length) : v).toString(16).toUpperCase().padStart(bytes.length * 2, '0')})`;
}

function Watch({ f }: { f: FrameData }) {
  const b = useLab((s) => s.build);
  const arch = useLab((s) => s.arch);
  const syms = (b?.debug?.symbols ?? []).filter((s) => s.space === 'data');
  const vals = syms.map((s) => decode(f.mem, s, arch, 0));
  const ch = useChanged(vals.map((v) => v.length * 1000 + [...v].reduce((a, c) => a + c.charCodeAt(0), 0)));
  if (!b?.ok) return <div className="empty">Build the program to list its variables.</div>;
  if (!syms.length) return <div className="empty">No RAM variables in this program (or they were optimised into registers).</div>;
  return (
    <table className="grid">
      <thead><tr><th>Name</th><th>Address</th><th>Type</th><th>Value</th></tr></thead>
      <tbody>
        {syms.map((s, i) => {
          const isArr = /^\[\d+\]/.test(s.type ?? '');
          return (
            <tr key={s.name + s.addr} className={ch[i] ? 'changed' : ''}>
              <td>{s.name}</td>
              <td className="dim">0x{s.addr.toString(16).toUpperCase().padStart(3, '0')}</td>
              <td className="dim">{s.type}</td>
              <td>{isArr ? Array.from(f.mem.slice(s.addr, s.addr + Math.min(s.size, 16))).map(h2).join(' ') : vals[i]}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ----------------------------------------------------------------- memory
function Memory({ f }: { f: FrameData }) {
  const arch = useLab((s) => s.arch);
  const [region, setRegion] = useState(arch === 'pic18' ? 0 : 0);
  const regions = arch === 'pic18'
    ? [...Array.from({ length: 8 }, (_, i) => ({ label: `Bank ${i}`, start: i * 0x100, len: 0x100, off: 0 })), { label: 'SFR', start: 0xf60, len: 0xa0, off: 0 }]
    : [{ label: 'IDATA', start: 0, len: 0x100, off: 0 }, { label: 'SFR', start: 0x80, len: 0x80, off: 256 - 0x80 }];
  const r = regions[Math.min(region, regions.length - 1)];
  const rows = [];
  for (let a = r.start; a < r.start + r.len; a += 16) {
    const bytes = Array.from(f.mem.slice(a + r.off, a + r.off + 16));
    rows.push(
      <div key={a} className="mem-row">
        <span className="dim">{arch === 'pic18' ? a.toString(16).toUpperCase().padStart(3, '0') : (r.label === 'SFR' ? 'D:' : 'I:') + h2(a)}</span>
        <span>{bytes.map(h2).join(' ')}</span>
        <span className="dim">{bytes.map((x) => (x >= 32 && x < 127 ? String.fromCharCode(x) : '.')).join('')}</span>
      </div>,
    );
  }
  return (
    <div>
      <div className="mem-tabs">{regions.map((x, i) => <button key={x.label} className={`seg-btn ${i === region ? 'on' : ''}`} onClick={() => setRegion(i)}>{x.label}</button>)}</div>
      <div className="mem">{rows}</div>
    </div>
  );
}

// ------------------------------------------------------------------- pins
function Pins({ f }: { f: FrameData }) {
  const arch = useLab((s) => s.arch);
  return (
    <div className="pins">
      {f.ports.map((p, pi) => (
        <div key={p.name} className="pin-port">
          <div className="pin-port-head"><b>{p.name}</b><span className="dim mono">LAT {h2(p.lat)} · {arch === 'pic18' ? `TRIS ${h2(p.tris)} · ` : ''}PIN {h2(p.level)}</span></div>
          <div className="pin-row">
            {Array.from({ length: 8 }, (_, i) => 7 - i).map((b) => {
              const isIn = arch === 'pic18' && (p.tris >> b) & 1;
              const analog = (p.analog >> b) & 1 && isIn;
              const lv = (p.level >> b) & 1;
              const duty = p.duty[b];
              const pwm = p.freq[b] > 0;
              const label = arch === 'pic18' ? `R${'ABCDE'[pi]}${b}` : `P${pi}.${b}`;
              return (
                <div key={b} className={`pin ${lv ? 'hi' : 'lo'} ${isIn ? 'in' : 'out'}`} title={`${label}: ${isIn ? (analog ? 'analog input' : 'input') : 'output'}, level ${lv}${pwm ? `, toggling ${p.freq[b].toFixed(p.freq[b] < 10 ? 3 : 1)} Hz, duty ${(duty * 100).toFixed(1)} %` : ''}`}>
                  <span className="pin-led" style={pwm ? { opacity: 0.35 + duty * 0.65 } : undefined} />
                  <span className="pin-name">{label}</span>
                  <span className="pin-dir">{analog ? 'AN' : isIn ? 'IN' : 'OUT'}</span>
                  {pwm && <span className="pin-pwm">~</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------ peripherals
function Peripherals({ f }: { f: FrameData }) {
  const arch = useLab((s) => s.arch);
  const p = f.periph as Record<string, unknown>;
  const m = f.mem;
  if (arch === 'mcs51') {
    const s = (n: string) => m[256 + SFR51[n] - 0x80];
    const tmod = s('TMOD'), tcon = s('TCON'), ie = s('IE'), scon = s('SCON');
    return (
      <div className="periph">
        <section><h5>Timer / Counter 0</h5><div className="kv mono">
          <span>Mode</span><span>{tmod & 3} {['13-bit', '16-bit', '8-bit auto-reload', 'split'][tmod & 3]}{tmod & 4 ? ' (counter)' : ''}</span>
          <span>TH0:TL0</span><span>0x{h2(s('TH0'))}{h2(s('TL0'))}</span>
          <span>TR0 / TF0</span><span>{(tcon >> 4) & 1} / {(tcon >> 5) & 1}</span>
        </div></section>
        <section><h5>Timer / Counter 1</h5><div className="kv mono">
          <span>Mode</span><span>{(tmod >> 4) & 3} {['13-bit', '16-bit', '8-bit auto-reload', 'stopped'][(tmod >> 4) & 3]}</span>
          <span>TH1:TL1</span><span>0x{h2(s('TH1'))}{h2(s('TL1'))}</span>
          <span>TR1 / TF1</span><span>{(tcon >> 6) & 1} / {(tcon >> 7) & 1}</span>
        </div></section>
        <section><h5>Serial channel</h5><div className="kv mono">
          <span>Mode</span><span>{scon >> 6}</span><span>Baud</span><span>{(p.baud as number).toFixed(0)}</span>
          <span>TI / RI</span><span>{(scon >> 1) & 1} / {scon & 1}</span>
        </div></section>
        <section><h5>Interrupts</h5><div className="kv mono">
          <span>EA</span><span>{(ie >> 7) & 1}</span><span>EX0 ET0 EX1 ET1 ES</span><span>{ie & 1} {(ie >> 1) & 1} {(ie >> 2) & 1} {(ie >> 3) & 1} {(ie >> 4) & 1}</span>
        </div></section>
      </div>
    );
  }
  const r = (n: keyof typeof SFR) => m[SFR[n]];
  const t0 = r('T0CON');
  const pwm = p.pwm as { mode: number; enabled: boolean; freq: number; duty: number }[];
  const adcon0 = r('ADCON0'), adcon1 = r('ADCON1');
  const pcfg = adcon1 & 15;
  const intcon = r('INTCON');
  return (
    <div className="periph">
      <section><h5>Timer0</h5><div className="kv mono">
        <span>State</span><span>{t0 & 0x80 ? 'ON' : 'off'} · {t0 & 0x40 ? '8-bit' : '16-bit'} · {t0 & 0x20 ? 'T0CKI' : 'Fosc/4'}</span>
        <span>Prescaler</span><span>{t0 & 0x08 ? 'bypassed' : `1:${2 << (t0 & 7)}`}</span>
        <span>TMR0</span><span>0x{h4(p.tmr0 as number)} ({p.tmr0 as number})</span>
        <span>TMR0IE / IF</span><span>{(intcon >> 5) & 1} / {(intcon >> 2) & 1}</span>
      </div></section>
      <section><h5>Timer1 · Timer2</h5><div className="kv mono">
        <span>TMR1</span><span>{r('T1CON') & 1 ? 'ON' : 'off'} 0x{h4(p.tmr1 as number)}</span>
        <span>TMR2 / PR2</span><span>{r('T2CON') & 4 ? 'ON' : 'off'} {p.tmr2 as number} / {r('PR2')}</span>
        <span>T2 prescale</span><span>1:{[1, 4, 16, 16][r('T2CON') & 3]} · post 1:{((r('T2CON') >> 3) & 15) + 1}</span>
      </div></section>
      {pwm.map((c, i) => (
        <section key={i}><h5>CCP{i + 1}</h5><div className="kv mono">
          <span>Mode</span><span>{c.mode === 0 ? 'off' : (c.mode & 0x0c) === 0x0c ? 'PWM' : c.mode >= 8 ? 'compare' : c.mode >= 4 ? 'capture' : `0x${c.mode.toString(16)}`}</span>
          {(c.mode & 0x0c) === 0x0c && <><span>Frequency</span><span>{c.freq >= 1000 ? `${(c.freq / 1000).toFixed(3)} kHz` : `${c.freq.toFixed(1)} Hz`}</span><span>Duty</span><span>{(c.duty * 100).toFixed(1)} %</span><span>Timer2</span><span>{c.enabled ? 'running' : 'STOPPED — no PWM output'}</span></>}
        </div></section>
      ))}
      <section><h5>ADC</h5><div className="kv mono">
        <span>ADON / GO</span><span>{adcon0 & 1} / {(adcon0 >> 1) & 1}{p.adcBusy ? ' (converting)' : ''}</span>
        <span>Channel</span><span>AN{(adcon0 >> 2) & 15}</span>
        <span>Analog pins</span><span>{pcfg === 15 ? 'none' : `AN0–AN${pcfg <= 2 ? 12 : 14 - pcfg}`}</span>
        <span>Result</span><span>{r('ADCON2') & 0x80 ? ((r('ADRESH') << 8) | r('ADRESL')) : ((r('ADRESH') << 2) | (r('ADRESL') >> 6))} ({r('ADCON2') & 0x80 ? 'right' : 'left'} justified)</span>
      </div></section>
      <section><h5>EUSART · Interrupts</h5><div className="kv mono">
        <span>TX / RX</span><span>{r('TXSTA') & 0x20 ? 'TXEN' : 'tx off'} · {r('RCSTA') & 0x80 ? 'SPEN' : 'port off'}</span>
        <span>Baud</span><span>{(p.baud as number).toFixed(0)}</span>
        <span>GIE PEIE</span><span>{(intcon >> 7) & 1} {(intcon >> 6) & 1} · IPEN {(r('RCON') >> 7) & 1}</span>
        <span>Sleep</span><span>{p.sleeping ? 'SLEEP' : 'running'}</span>
      </div></section>
    </div>
  );
}

// ------------------------------------------------------------ disassembly
function Disassembly({ f }: { f: FrameData }) {
  const [lines, setLines] = useState<{ addr: number; text: string; raw: number[]; line: number | null }[]>([]);
  const arch = useLab((s) => s.arch);
  const pc = f.cpu.pc;
  useEffect(() => sim.on((m) => { if (m.type === 'disasm') setLines(m.lines); }) as () => void, []);
  useEffect(() => {
    const start = Math.max(0, pc - (arch === 'pic18' ? 16 : 10));
    sim.send({ type: 'disasm', addr: arch === 'pic18' ? start & ~1 : start, count: 40 });
  }, [pc, arch, f.running ? Math.floor(f.simTime * 4) : 0]);
  return (
    <div className="disasm">
      {lines.map((l) => (
        <div key={l.addr} className={`dis-row ${l.addr === pc ? 'cur' : ''}`}>
          <span className="dim">{l.line !== null ? `${l.line}:` : ''}</span>
          <span>{arch === 'pic18' ? l.addr.toString(16).toUpperCase().padStart(5, '0') : `C:0x${h4(l.addr)}`}</span>
          <span className="dim">{arch === 'pic18' ? l.raw.map(h4).join(' ') : l.raw.map(h2).join(' ')}</span>
          <span>{l.text}</span>
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------- shell
export function DebugPanel() {
  const tab = useLab((s) => s.rightTab);
  const f = useFrame((s) => s.frame);
  const arch = useLab((s) => s.arch);
  const tabs: [RightTab, string, string][] = useMemo(() => [
    ['registers', arch === 'pic18' ? 'SFRs' : 'Registers', 'cpu'], ['watch', 'Watch', 'list'], ['pins', 'Pins', 'chip'],
    ['periph', 'Peripherals', 'gauge'], ['memory', 'Memory', 'file'], ['disasm', 'Disassembly', 'terminal'],
  ], [arch]);
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="tabs">
          {tabs.map(([id, label, icon]) => (
            <button key={id} className={`tab ${tab === id ? 'on' : ''}`} onClick={() => useLab.getState().set({ rightTab: id })} title={label}>
              <Icon name={icon} size={13} /> <span className="tab-text">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        {!f ? <div className="empty">Simulator not started.</div> : (
          <>
            {tab === 'registers' && (arch === 'pic18' ? <PicRegisters f={f} /> : <Registers51 f={f} />)}
            {tab === 'watch' && <Watch f={f} />}
            {tab === 'memory' && <Memory f={f} />}
            {tab === 'pins' && <Pins f={f} />}
            {tab === 'periph' && <Peripherals f={f} />}
            {tab === 'disasm' && <Disassembly f={f} />}
          </>
        )}
      </div>
    </div>
  );
}
