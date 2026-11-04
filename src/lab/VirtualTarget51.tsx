// Keil µVision-style simulation view for the 8051: Parallel Port dialogs,
// a virtual LED bar and a pin-out diagram of the AT89C51 with live pin states.

import { useFrame } from '../app/store.ts';
import { sim } from '../app/sim.ts';
import './target51.css';

const h2 = (v: number) => v.toString(16).toUpperCase().padStart(2, '0');

// DIP-40 pin-out of the AT89C51 (pin number -> label)
const LEFT = ['P1.0', 'P1.1', 'P1.2', 'P1.3', 'P1.4', 'P1.5', 'P1.6', 'P1.7', 'RST', 'P3.0', 'P3.1', 'P3.2', 'P3.3', 'P3.4', 'P3.5', 'P3.6', 'P3.7', 'XTAL2', 'XTAL1', 'GND'];
const RIGHT = ['VCC', 'P0.0', 'P0.1', 'P0.2', 'P0.3', 'P0.4', 'P0.5', 'P0.6', 'P0.7', 'EA', 'ALE', 'PSEN', 'P2.7', 'P2.6', 'P2.5', 'P2.4', 'P2.3', 'P2.2', 'P2.1', 'P2.0'];

export function VirtualTarget51() {
  const f = useFrame((s) => s.frame);
  const b = f?.board.kind === 'mcs51' ? f.board : null;
  const pinLevel = (label: string) => {
    const m = label.match(/^P(\d)\.(\d)$/);
    if (!m || !f) return null;
    return (f.ports[+m[1]].level >> +m[2]) & 1;
  };
  return (
    <div className="t51">
      <div className="t51-left">
        <div className="t51-chip">
          <div className="t51-pins">
            {LEFT.map((l, i) => { const v = pinLevel(l); return <div key={l} className={`t51-pin ${v === null ? '' : v ? 'hi' : 'lo'}`}><span className="n">{i + 1}</span>{l}</div>; })}
          </div>
          <div className="t51-body">
            <div className="t51-notch" />
            <div className="t51-mark">AT89C51</div>
            <div className="t51-sub">24PC · 11.0592 MHz</div>
          </div>
          <div className="t51-pins right">
            {[...RIGHT].reverse().map((l, i) => { const v = pinLevel(l); return <div key={l} className={`t51-pin ${v === null ? '' : v ? 'hi' : 'lo'}`}>{l}<span className="n">{40 - (19 - i)}</span></div>; })}
          </div>
        </div>
        <div className="t51-leds">
          <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>Virtual LED bar on Port {b?.ledPort ?? 1} (P{b?.ledPort ?? 1}.7 … P{b?.ledPort ?? 1}.0)</div>
          <div className="t51-ledrow">
            {(b?.leds ?? Array(8).fill(0)).slice().reverse().map((v, i) => (
              <div key={i} className="t51-led" style={{ background: `rgba(255,${50 + 40 * (1 - v)},${50 + 40 * (1 - v)},${0.18 + v * 0.82})`, boxShadow: v > 0.2 ? `0 0 ${6 + v * 14}px rgba(255,60,60,${v})` : 'none' }}>
                <span>{7 - i}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="t51-ports">
        {[0, 1, 2, 3].map((p) => {
          const port = f?.ports[p];
          const ext = b?.extLow[p] ?? 0;
          return (
            <div key={p} className="kport">
              <div className="kport-title">Parallel Port {p}</div>
              <div className="kport-row">
                <span className="kport-lbl">P{p}:</span>
                <span className="kport-hex mono">0x{h2(port?.lat ?? 0xff)}</span>
                <span className="kport-bits">
                  {Array.from({ length: 8 }, (_, i) => 7 - i).map((bit) => <span key={bit} className={`kbit ${((port?.lat ?? 0xff) >> bit) & 1 ? 'on' : ''}`}>{bit}</span>)}
                </span>
              </div>
              <div className="kport-row">
                <span className="kport-lbl">Pins:</span>
                <span className="kport-hex mono">0x{h2(port?.level ?? 0xff)}</span>
                <span className="kport-bits">
                  {Array.from({ length: 8 }, (_, i) => 7 - i).map((bit) => (
                    <button key={bit} className={`kbit pin ${((port?.level ?? 0xff) >> bit) & 1 ? 'on' : ''} ${(ext >> bit) & 1 ? 'forced' : ''}`}
                      title={`P${p}.${bit}: click to ${(ext >> bit) & 1 ? 'release' : 'pull low (external switch)'}`}
                      onClick={() => sim.input({ kind: 'pinDrive', port: p, bit, low: !((ext >> bit) & 1) })}>{bit}</button>
                  ))}
                </span>
              </div>
            </div>
          );
        })}
        <p className="dim" style={{ fontSize: 11, margin: '4px 2px' }}>Pins: click a bit to pull the pin low externally (like toggling a pin in µVision's port dialog).</p>
      </div>
    </div>
  );
}
