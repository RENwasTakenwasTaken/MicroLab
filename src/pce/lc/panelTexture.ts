// Front panel of the Sigma COM122N, redrawn from the lab's photograph: black print on a yellow
// plate. Coordinates are millimetres on the plate, as in layout.ts.

import * as THREE from 'three';
import { CHIPS, LEDS, NEON, PANEL, POWER_SW, SWITCHES, TERMS } from './layout.ts';

type Align = 'left' | 'center' | 'right';

export function lcPanelTexture(): THREE.CanvasTexture {
  const S = 8, c = document.createElement('canvas');
  c.width = PANEL.w * S; c.height = PANEL.h * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const INK = '#2b2616';
  g.fillStyle = '#dcc057'; g.fillRect(0, 0, PANEL.w, PANEL.h);
  // a little unevenness, as on the printed plate
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,170' : '120,95,20'}, 0.035)`; g.beginPath(); g.arc(Math.random() * PANEL.w, Math.random() * PANEL.h, 4 + Math.random() * 14, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'middle';
  const line = (pts: number[], w = 0.3) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1])); g.stroke(); };
  const rect = (x0: number, y0: number, x1: number, y1: number, w = 0.3) => { g.lineWidth = w; g.strokeRect(x0, y0, x1 - x0, y1 - y0); };
  const text = (t: string, x: number, y: number, size = 2.1, align: Align = 'center', weight = 600, under = false) => {
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = INK; g.fillText(t, x, y);
    if (under) { const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; line([x0, y + size * 0.62, x0 + w, y + size * 0.62], 0.25); }
  };
  const ring = (x: number, y: number, r = 2.1) => { g.lineWidth = 0.3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
  const dot = (x: number, y: number, r = 0.45) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  const ground = (x: number, y: number) => { line([x, y, x, y + 1.6]); for (const [w, d] of [[1.8, 1.6], [1.2, 2.3], [0.6, 3]]) line([x - w, y + d, x + w, y + d], 0.25); };
  const diode = (x: number, y: number, a: number) => { g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-2.6, -0.9, 5.2, 1.8); g.fillStyle = '#dcc057'; g.fillRect(1.2, -0.9, 0.5, 1.8); g.restore(); g.fillStyle = INK; };
  const coil = (x: number, y0: number, y1: number) => { g.lineWidth = 0.3; const n = Math.round((y1 - y0) / 2.2); for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x, y0 + (i + 0.5) * ((y1 - y0) / n), (y1 - y0) / n / 2, -Math.PI / 2, Math.PI / 2); g.stroke(); } };

  // frame, title strip and the six sections
  rect(5, 5, 265, 193, 0.45);
  line([5, 13, 265, 13]); line([115.5, 13, 115.5, 148.5]); line([206, 13, 206, 193]); line([5, 148.5, 206, 148.5]); line([206, 87.5, 265, 87.5]); line([206, 130, 265, 130]);
  g.lineWidth = 0.5; g.beginPath(); g.roundRect(15, 6.6, 20, 4.8, 2.4); g.stroke();
  text('SIGMA', 25, 9.1, 2.9, 'center', 800);
  text('LINE CODING AND DECODING TRAINER  MODEL - COM122N', 134, 9.1, 3.3, 'center', 800, true);
  text('DIGITAL DATA GENERATOR', 63, 17, 2.5, 'center', 700, true);
  text('LINE CODING SECTION', 166, 17, 2.5, 'center', 700, true);
  text('COMPARATORS', 231, 83, 2.5, 'center', 700, true);
  text('BIT CLOCK DECODER', 236, 91.2, 2.5, 'center', 700, true);
  text('BIT CLOCK RECOVERY', 234, 189, 2.5, 'center', 700, true);
  text('POWER SUPPLY', 136, 181, 2.8, 'center', 800, true);

  // ICs: outline, notch and type number
  for (const ch of CHIPS) {
    const l = (ch.pins / 2) * 2.54 + 2.4;
    rect(ch.x - l / 2, ch.y - 5, ch.x + l / 2, ch.y + 5, 0.25);
    g.lineWidth = 0.25; g.beginPath(); g.arc(ch.x - l / 2, ch.y, 1, -Math.PI / 2, Math.PI / 2); g.stroke();
    text(ch.name, ch.x - l / 2 + 0.5, ch.y + 7.2, 1.9, 'left', 600);
  }

  // terminals: a ring round each, and its legend
  for (const t of TERMS) ring(t.x, t.y, t.kind === 'pin' ? 1.9 : 3.3);
  text('CK', 65, 26.6); text('BK', 79, 26.6); text('NRZ', 107.5, 24.3); line([105, 22.8, 110, 22.8], 0.25);
  text('NRZ', 108.5, 84); ground(106.5, 100.5);
  const legend: [string, string?][] = [['NRZ', 'UNIPOLAR'], ['NRZ-M'], ['NRZ', 'BIPOLAR'], ['RZ', 'UNIPOLAR'], ['RZ', 'BIPOLAR'], ['BIPHASE', 'MANCHESTER'], ['BIPHASE', 'MARK'], ['AMI', 'BIPOLAR']];
  TERMS.filter((t) => t.block === 'lc').forEach((t, i) => {
    const [a, b] = legend[i];
    text(a, 203.5, t.y + 5.6, 1.9, 'right', 700, true);
    if (b) text(b, 203.5, t.y + 8.9, 1.9, 'right', 700, true);
  });
  text('I/P1', 207, 26.5, 1.8, 'left'); text('I/P2', 207, 39, 1.8, 'left'); ground(212, 50.8);
  text('O/P-1', 259, 57.5, 1.9); text('O/P-2', 259, 70.5, 1.9); text('O/P-3', 259, 83.5, 1.9);
  text('P1', 228, 55, 1.9); text('BIAS', 238, 52, 1.8, 'center', 600, true); text('P2', 247.5, 55, 1.9);
  ring(228, 45, 7.2); ring(247.5, 46, 6);
  text('2K2', 237.5, 16.3, 1.7); text('2K2', 257, 16.3, 1.7); text('10K', 243, 60.3, 1.7); text('100K', 214.5, 57, 1.6);
  text('SW', 220, 104.2, 1.9); text('1', 212.5, 100.4, 1.8); text('2', 227.5, 100.4, 1.8); line([213.5, 97, 226.5, 97], 0.25); line([225.3, 96.2, 226.5, 97, 225.3, 97.8], 0.25); line([214.7, 96.2, 213.5, 97, 214.7, 97.8], 0.25);
  text('NRZ', 258.5, 105.3, 1.8); text('O/P', 258.5, 108.6, 1.8, 'center', 600, true); ground(258.5, 126);
  text('I/P', 214, 124, 1.9, 'center', 600, true);
  text('P1', 210, 136, 1.8); text('10KP', 222.5, 156.5, 1.8); text('47K Pr', 241, 150.5, 1.8); text('10np', 240, 133.5, 1.7); text('100pf', 229.5, 152, 1.6);
  ring(215, 143, 6);
  text('I/P', 207.8, 158, 1.8, 'left', 600, true); text('BK', 258.5, 159.3, 1.8); text('O/P', 258.5, 162.6, 1.8, 'center', 600, true); ground(258.5, 176);
  ['47K', '270pf', '12K', '2n2p', '', '', '150E'].forEach((t, i) => { if (t) { g.save(); g.translate([209.6, 217.6, 225.6, 233.6, 0, 0, 253.6][i], 184); g.rotate(-Math.PI / 2); text(t, 0, 0, 1.6); g.restore(); } });

  // data word: LEDs D8..D1 and switches S8..S1
  text('MSB', 13, 102.5, 1.9);
  for (const l of LEDS) { ring(l.x - 4.6, l.y, 1.9); dot(l.x - 4.6, l.y, 0.35); text(`D${l.n}`, l.x - 3.4, l.y + 5.4, 1.9); }
  for (const s of SWITCHES) text(`S${s.n}`, s.x + 1, s.y + 8.2, 1.9);
  g.save(); g.translate(20.4, 131.5); g.rotate(-Math.PI / 2); text('670E', 0, 0, 1.6); g.restore();

  // generator: what the print shows of its wiring
  text('1K Pr', 31, 66.5, 1.8); text('180E', 45, 61, 1.7); text('+5V', 86, 59, 1.8);
  line([15.5, 31.5, 15.5, 36, 33, 36, 33, 31.5, 15.5, 31.5]); line([18, 33.7, 20, 33.7, 21, 32.3, 22.5, 35, 24, 32.3, 25.5, 35, 27, 33.7, 30.5, 33.7], 0.25);
  line([65, 33, 65, 41]); line([79, 33, 79, 41]); line([107.5, 33.5, 107.5, 64, 58, 64, 58, 90]);
  line([15, 52, 15, 68.5, 96, 68.5]); line([96, 67.7, 97.2, 68.5, 96, 69.3], 0.25); line([19.5, 54, 19.5, 57]); line([36, 60, 42, 60]); line([48, 60, 60, 60, 60, 52]);
  line([58, 90, 30, 90, 30, 88]); line([78, 68.5, 78, 77.5]);
  for (const x of [68, 73, 86.5, 93]) ground(x, 53.5);
  ground(44, 54); ground(44.5, 89.5); ground(86.5, 89.5); ground(95.5, 89.5);
  ['H', 'G', 'F', 'E'].forEach((t, i) => text(t, [74, 82.5, 86.8, 91][i], 73, 2));
  ['A', 'B', 'C', 'D'].forEach((t, i) => text(t, 69.5 + i * 4.6, 94.2, 2));

  // power supply: transformers, bridges, regulators and their outputs
  const supply = (x: number, sec: string, pos: string, neg: string, caps: string, top: string, bot: string, outX: number) => {
    text(sec, x + 22, 150.6, 1.8);
    coil(x + 2, 154, 176); coil(x + 4.6, 154, 176);
    line([x + 12, 165, x + 24, 153, x + 36, 165, x + 24, 177, x + 12, 165]);
    diode(x + 18, 159, -Math.PI / 4); diode(x + 30, 159, Math.PI / 4); diode(x + 18, 171, Math.PI / 4); diode(x + 30, 171, -Math.PI / 4);
    text('1N4002 X 4', x + 26, 179.8, 1.7);
    line([x + 36, 165, x + 40, 165, x + 40, 152, outX, 152]); line([x + 40, 165, x + 40, 187.5, outX, 187.5]); line([x + 24, 177, x + 24, 169.5, outX, 169.5], 0.25);
    rect(x + 56, 150.4, x + 70, 153.6, 0.25); rect(x + 56, 185.9, x + 70, 189.1, 0.25);
    text(pos, x + 68, 157, 1.8); text(neg, x + 68, 183, 1.8); text(caps, x + 58, 164.5, 1.6, 'left'); text(caps, x + 58, 182, 1.6, 'left');
    text(top, outX - 0.5, 157.2, 1.9); text(bot, outX - 0.5, 182.6, 1.9);
  };
  rect(17, 152, 31, 163, 0.25); text('S1', 23.5, 157.5, 1.9); text('230V AC', 25, 170.5, 1.9);
  supply(32, '15-0-15/100mA', '7812', '7912', '1000/25', '+12V', '-12V', 109);
  supply(124, '9V/500mA', '7805', '7905', '1000/16', '+5V', '-5V', 196.5);
  text('MAINS  ON', POWER_SW.x + 2, POWER_SW.y + 7.6, 2.1, 'center', 700); line([36, 179.5, 36, 184.5]); line([34.9, 183.2, 36, 184.5, 37.1, 183.2], 0.3);
  text('NEON', NEON.x, NEON.y + 7.6, 2.1, 'center', 700);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
