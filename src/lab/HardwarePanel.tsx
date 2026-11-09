// Hardware configuration: FRC cable patching, DIP switches, environment inputs,
// and the editable pin connections (defaults: PICT "Explore Board Connections" chart).

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFrame, useLab } from '../app/store.ts';
import { sim } from '../app/sim.ts';
import { mainsConnected, useBench } from '../app/bench.ts';
import type { FrcTarget, Mcs51BoardConfig, PicBoardConfig, PinRef } from '../sim/board/types.ts';
import { Icon } from '../ui/icons.tsx';

const PORTS = ['A', 'B', 'C', 'D', 'E'];
const FRC_NAMES: Record<FrcTarget, string> = { LBANK: 'L_BANK (LED array)', KEY: 'MAT_KEY (4×4 keypad)', LCD_DATA: 'LCD_DATA (D0–D7)', LCD_CTRL: 'LCD_CNTRL (RS/RW/EN)' };
const DIP_INFO: Record<string, [string, string[]]> = {
  pb: ['Push-button interface', ['SW0 → RB1', 'SW1 → RB0']],
  periph: ['PERI_SW (RGB LED, relay, buzzer)', ['RGB red ← RA3', 'RGB green ← RC1', 'RGB blue ← RC2', 'Relay ← RC1', 'Buzzer ← RC2', '—']],
  dcm: ['DCM_SW (L293D)', ['EN1 ← RC2/CCP1', 'IN1 ← RD6', 'IN2 ← RD5', 'EN2 ← RC1/CCP2', '—', '—']],
  analog: ['Analog input', ['POT → RA2/AN2', 'LM35 → RA1/AN1']],
};

function commit(cfg: PicBoardConfig) {
  useLab.getState().set({ boardCfg: cfg });
  sim.input({ kind: 'config', cfg: structuredClone(cfg) });
}

/** PIC18F4550 pins with a CCP (PWM) output; CCP2 sits on RC1 unless CCP2MX moves it to RB3. */
const CCP_PINS: Record<string, string> = { '2:2': 'CCP1', '2:1': 'CCP2', '1:3': 'CCP2 alt' };

function PinSelect({ value, onChange }: { value: PinRef; onChange(p: PinRef): void }) {
  return (
    <select value={`${value.port}:${value.bit}`} onChange={(e) => { const [p, b] = e.target.value.split(':').map(Number); onChange({ port: p, bit: b }); }}>
      {PORTS.map((P, p) => Array.from({ length: 8 }, (_, b) => <option key={`${p}:${b}`} value={`${p}:${b}`}>R{P}{b}{CCP_PINS[`${p}:${b}`] ? ` · ${CCP_PINS[`${p}:${b}`]}` : ''}</option>))}
    </select>
  );
}

/** An L293D enable: a (preferably CCP) pin for PWM speed control, or tied high. */
function EnableSelect({ value, onChange }: { value: PinRef | null; onChange(p: PinRef | null): void }) {
  return (
    <select value={value ? `${value.port}:${value.bit}` : 'vcc'} onChange={(e) => { if (e.target.value === 'vcc') return onChange(null); const [p, b] = e.target.value.split(':').map(Number); onChange({ port: p, bit: b }); }}>
      <optgroup label="PWM (CCP)">
        {Object.entries(CCP_PINS).map(([k, n]) => { const [p, b] = k.split(':').map(Number); return <option key={k} value={k}>R{PORTS[p]}{b} · {n}</option>; })}
      </optgroup>
      <option value="vcc">VCC (always enabled)</option>
      <optgroup label="Other pins (on/off only, or software PWM)">
        {PORTS.map((P, p) => Array.from({ length: 8 }, (_, b) => `${p}:${b}`).filter((k) => !CCP_PINS[k]).map((k) => <option key={k} value={k}>R{P}{k.split(':')[1]}</option>))}
      </optgroup>
    </select>
  );
}

const CHART_SRC = '/pict-board-connections.jpg';

/** PICT's "Explore Board Connections" chart, shown above the whole UI. */
function ChartViewer({ onClose }: { onClose(): void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  // portal: the glass pane's backdrop-filter would otherwise trap a fixed overlay inside it
  return createPortal(
    <div className="chart-viewer" role="dialog" aria-label="PICT board connections chart" onClick={onClose}>
      <figure onClick={(e) => e.stopPropagation()}>
        <figcaption>
          <b>Explore Board Connections</b> — PICT Embedded System Lab A3-206 (pin defaults use the PIC18F4550 column)
          <button className="btn ghost icon" onClick={onClose} title="Close (Esc)"><Icon name="x" /></button>
        </figcaption>
        <img src={CHART_SRC} alt="PICT Explore Board Connections chart: LPC2148, LPC1768, PIC18F4520, PIC18F4550 and SST89E516RD2 pin connections" />
      </figure>
    </div>,
    document.body,
  );
}

function PicHardware() {
  const [chart, setChart] = useState(false);
  const cfg = useLab((s) => s.boardCfg) as PicBoardConfig;
  const board = useFrame((s) => (s.frame?.board.kind === 'pic' ? s.frame.board : null));
  const powerSw = useBench((s) => s.powerSwitch);
  const mains = useBench((s) => mainsConnected(s.plugs));
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
          <input type="range" min={-5} max={110} step={0.1} value={board?.temperature ?? 27} onChange={(e) => {
            sim.input({ kind: 'temperature', celsius: +e.target.value });
            // Expt 6's last step: the temperature is changed while the student's program runs
            const d = sim.latest?.device;
            if (d?.mode === 'running' && d.flashed && !useBench.getState().tempAdjusted) useBench.setState({ tempAdjusted: true });
          }} />
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
          <span>Board POWER switch{powerSw && !mains ? <span className="dim"> · adapter not plugged in</span> : null}</span>
          <button className={`btn ${powerSw ? 'active' : ''}`} onClick={() => useBench.getState().setPowerSwitch(!powerSw)} title="The same switch as the slide switch on the board. The board is powered only when the adapter is also plugged into the wall socket."><Icon name="power" /> {powerSw ? 'ON' : 'OFF'}</button>
        </div>
      </div>
      <div className="section">
        <h4>Pin connections <span className="tag ok">PICT chart</span></h4>
        <p className="muted" style={{ fontSize: 12 }}>
          Defaults follow PICT's “Explore Board Connections” chart (PIC18F4550 column). Change them here if a board differs — the simulation updates immediately.
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
          <span>RGB LED red</span><PinSelect value={a.rgbRed} onChange={(p) => set((c) => { c.assumptions.rgbRed = p; })} />
          <span>RGB LED green</span><PinSelect value={a.rgbGreen} onChange={(p) => set((c) => { c.assumptions.rgbGreen = p; })} />
          <span>RGB LED blue</span><PinSelect value={a.rgbBlue} onChange={(p) => set((c) => { c.assumptions.rgbBlue = p; })} />
          <span>L293D EN1 (DCM1 speed)</span><EnableSelect value={a.motorEn1} onChange={(p) => set((c) => { c.assumptions.motorEn1 = p; })} />
          <span>L293D EN2 (DCM2 speed)</span><EnableSelect value={a.motorEn2} onChange={(p) => set((c) => { c.assumptions.motorEn2 = p; })} />
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
          <select value={a.motorRatedRpm} onChange={(e) => set((c) => { c.assumptions.motorRatedRpm = +e.target.value; })}>{[100, 150, 200, 300, 500].map((r) => <option key={r} value={r}>{r} rpm @ 5 V</option>)}</select>
        </div>
        <button className="btn chart-btn" onClick={() => setChart(true)}><Icon name="board" size={13} /> View board connection chart</button>
      </div>
      {chart && <ChartViewer onClose={() => setChart(false)} />}
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
