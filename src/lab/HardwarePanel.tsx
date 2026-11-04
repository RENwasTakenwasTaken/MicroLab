// Hardware configuration: FRC cable patching, DIP switches, environment inputs,
// and the editable table of unverified electrical assumptions.

import { useFrame, useLab } from '../app/store.ts';
import { sim } from '../app/sim.ts';
import type { FrcTarget, Mcs51BoardConfig, PicBoardConfig, PinRef } from '../sim/board/types.ts';
import { Icon } from '../ui/icons.tsx';

const PORTS = ['A', 'B', 'C', 'D', 'E'];
const FRC_NAMES: Record<FrcTarget, string> = { LBANK: 'L-BANK (LED array)', KEY: 'KEY (4×4 keypad)', LCD_DATA: 'LCD DATA (D0–D7)', LCD_CTRL: 'LCD CNTRL (RS/RW/EN)' };
const DIP_INFO: Record<string, [string, string[]]> = {
  pb: ['Push-button interface', ['SW0 → RB0', 'SW1 → RB1']],
  periph: ['Relay / buzzer', ['Relay ← RA4', 'Buzzer ← RA5', '—', '—', '—', '—']],
  dcm: ['DCM_SW (L293D)', ['EN1 → VCC', 'IN1 ← RC2', 'IN2 ← RC1', '—', '—', '—']],
  analog: ['Analog input', ['POT → AN0', 'LM35 → AN0']],
};

function commit(cfg: PicBoardConfig) {
  useLab.getState().set({ boardCfg: cfg });
  sim.input({ kind: 'config', cfg: structuredClone(cfg) });
}

function PinSelect({ value, onChange }: { value: PinRef; onChange(p: PinRef): void }) {
  return (
    <select value={`${value.port}:${value.bit}`} onChange={(e) => { const [p, b] = e.target.value.split(':').map(Number); onChange({ port: p, bit: b }); }}>
      {PORTS.map((P, p) => Array.from({ length: 8 }, (_, b) => <option key={`${p}:${b}`} value={`${p}:${b}`}>R{P}{b}</option>))}
    </select>
  );
}

function PicHardware() {
  const cfg = useLab((s) => s.boardCfg) as PicBoardConfig;
  const board = useFrame((s) => (s.frame?.board.kind === 'pic' ? s.frame.board : null));
  const set = (fn: (c: PicBoardConfig) => void) => { const c = structuredClone(cfg); fn(c); commit(c); };
  const a = cfg.assumptions;
  const used = (port: number, self: FrcTarget) => (Object.entries(cfg.cables) as [FrcTarget, number | null][]).some(([t, p]) => t !== self && p === port);
  return (
    <>
      <div className="section">
        <h4><Icon name="cable" size={13} /> FRC ribbon cables</h4>
        <p className="muted" style={{ fontSize: 12 }}>Patch a PIC module port header to a base-board connector, just like the 10-way ribbon cables in the lab.</p>
        {(Object.keys(FRC_NAMES) as FrcTarget[]).map((t) => (
          <div key={t} className="hw-row">
            <span>{FRC_NAMES[t]}</span>
            <select value={cfg.cables[t] ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : +e.target.value; set((c) => { c.cables[t] = v; }); }}>
              <option value="">— not connected —</option>
              {PORTS.map((P, i) => <option key={P} value={i} disabled={used(i, t)}>PORT-{P}{used(i, t) ? ' (in use)' : ''}</option>)}
            </select>
          </div>
        ))}
      </div>
      <div className="section">
        <h4>DIP switches</h4>
        {(Object.keys(DIP_INFO) as (keyof PicBoardConfig['dips'])[]).map((bank) => (
          <div key={bank} className="dip-row">
            <span className="muted">{DIP_INFO[bank][0]}</span>
            <div className="dip-group">
              {cfg.dips[bank].map((on, i) => (
                <button key={i} className={`dip ${on ? 'on' : ''}`} title={DIP_INFO[bank][1][i]}
                  onClick={() => { const c = structuredClone(cfg); c.dips[bank][i] = !on; useLab.getState().set({ boardCfg: c }); sim.input({ kind: 'dip', bank, index: i, on: !on }); }}>
                  <span className="dip-lever" />{i + 1}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="section">
        <h4>Environment & analog inputs</h4>
        <div className="field">
          <label>LM35 temperature: <b className="mono">{(board?.temperature ?? 27).toFixed(1)} °C</b> ({((board?.lm35Volts ?? 0.27) * 1000).toFixed(0)} mV)</label>
          <input type="range" min={-5} max={110} step={0.1} value={board?.temperature ?? 27} onChange={(e) => sim.input({ kind: 'temperature', celsius: +e.target.value })} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>Analog POT (AN0): <b className="mono">{(board?.potVolts ?? 2.5).toFixed(2)} V</b></label>
          <input type="range" min={0} max={1} step={0.001} value={board?.pot ?? 0.5} onChange={(e) => sim.input({ kind: 'pot', value: +e.target.value })} />
        </div>
        <div className="field" style={{ marginTop: 10 }}>
          <label>LCD contrast (VLCD): <b className="mono">{((board?.lcdContrast ?? 0.62) * 100).toFixed(0)} %</b></label>
          <input type="range" min={0} max={1} step={0.01} value={board?.lcdContrast ?? 0.62} onChange={(e) => sim.input({ kind: 'contrast', value: +e.target.value })} />
        </div>
        <div className="hw-row" style={{ marginTop: 10 }}>
          <span>Board power</span>
          <button className={`btn ${board?.power === false ? '' : 'active'}`} onClick={() => sim.input({ kind: 'power', on: board?.power === false })}><Icon name="power" /> {board?.power === false ? 'OFF' : 'ON'}</button>
        </div>
      </div>
      <div className="section">
        <h4>Electrical assumptions <span className="tag warn">unverified</span></h4>
        <p className="muted" style={{ fontSize: 12 }}>
          These connections are inferred from the board photograph and common lab programs (no schematic available). Correct them here once verified in the lab — the simulation updates immediately.
        </p>
        <div className="assume">
          <span>Crystal</span>
          <select value={cfg.crystalHz} onChange={(e) => set((c) => { c.crystalHz = +e.target.value; })}>
            {[4e6, 8e6, 10e6, 12e6, 16e6, 20e6].map((f) => <option key={f} value={f}>{f / 1e6} MHz</option>)}
          </select>
          <span>SW0</span><PinSelect value={a.sw0} onChange={(p) => set((c) => { c.assumptions.sw0 = p; })} />
          <span>SW1</span><PinSelect value={a.sw1} onChange={(p) => set((c) => { c.assumptions.sw1 = p; })} />
          <span>Relay driver</span><PinSelect value={a.relay} onChange={(p) => set((c) => { c.assumptions.relay = p; })} />
          <span>Buzzer driver</span><PinSelect value={a.buzzer} onChange={(p) => set((c) => { c.assumptions.buzzer = p; })} />
          <span>L293D IN1</span><PinSelect value={a.motorIn1} onChange={(p) => set((c) => { c.assumptions.motorIn1 = p; })} />
          <span>L293D IN2</span><PinSelect value={a.motorIn2} onChange={(p) => set((c) => { c.assumptions.motorIn2 = p; })} />
          <span>POT channel</span>
          <select value={a.potChannel} onChange={(e) => set((c) => { c.assumptions.potChannel = +e.target.value; })}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>AN{i}</option>)}</select>
          <span>LM35 channel</span>
          <select value={a.lm35Channel} onChange={(e) => set((c) => { c.assumptions.lm35Channel = +e.target.value; })}>{Array.from({ length: 13 }, (_, i) => <option key={i} value={i}>AN{i}</option>)}</select>
          <span>LCD RS / RW / EN line</span>
          <span style={{ display: 'flex', gap: 4 }}>
            {(['lcdRs', 'lcdRw', 'lcdEn'] as const).map((k) => (
              <select key={k} value={a[k]} onChange={(e) => set((c) => { c.assumptions[k] = +e.target.value; })}>{Array.from({ length: 8 }, (_, i) => <option key={i} value={i}>{i}</option>)}</select>
            ))}
          </span>
          <span>LED polarity</span>
          <select value={a.ledActiveHigh ? 'h' : 'l'} onChange={(e) => set((c) => { c.assumptions.ledActiveHigh = e.target.value === 'h'; })}><option value="h">Active high</option><option value="l">Active low</option></select>
          <span>Motor (no-load)</span>
          <select value={a.motorRatedRpm} onChange={(e) => set((c) => { c.assumptions.motorRatedRpm = +e.target.value; })}>{[100, 300, 500, 1000, 3000].map((r) => <option key={r} value={r}>{r} rpm @ 12 V</option>)}</select>
        </div>
      </div>
    </>
  );
}

function Mcs51Hardware() {
  const cfg = useLab((s) => s.boardCfg) as Mcs51BoardConfig;
  return (
    <div className="section">
      <h4>8051 target</h4>
      <div className="kv">
        <span>Device</span><span>{cfg.variant}</span>
        <span>Crystal</span><span>{(cfg.clockHz / 1e6).toFixed(4)} MHz</span>
        <span>Machine cycle</span><span>{(12e6 / cfg.clockHz).toFixed(3)} µs</span>
        <span>LED bar</span><span>Port {cfg.ledPort} ({cfg.ledActiveLow ? 'active low' : 'lit when pin = 1'})</span>
      </div>
      <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
        Like Keil µVision's simulator there is no physical board: drive input pins from the Port windows in the hardware view
        (click a pin bit to pull it low, as an external switch would).
      </p>
    </div>
  );
}

export function HardwarePanel() {
  const arch = useLab((s) => s.arch);
  return <div className="exp-sheet">{arch === 'pic18' ? <PicHardware /> : <Mcs51Hardware />}</div>;
}
