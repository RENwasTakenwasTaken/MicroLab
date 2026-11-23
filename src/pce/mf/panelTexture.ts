// Front panel of the Sigma COM120L, redrawn from the lab's photograph: black print on a yellow
// plate. Coordinates are millimetres on the plate, as in layout.ts.

import * as THREE from 'three';
import { AMP_KNOB, CHIPS, LEDS, NEON, PANEL, PARTS, POWER_SW, SWITCHES, TERMS, TRANSISTORS } from './layout.ts';

type Align = 'left' | 'center' | 'right';

export function mfPanelTexture(): THREE.CanvasTexture {
  const S = 8, c = document.createElement('canvas');
  c.width = PANEL.w * S; c.height = PANEL.h * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const INK = '#2b2616', PLATE = '#dcc057';
  g.fillStyle = PLATE; g.fillRect(0, 0, PANEL.w, PANEL.h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,170' : '120,95,20'}, 0.035)`; g.beginPath(); g.arc(Math.random() * PANEL.w, Math.random() * PANEL.h, 4 + Math.random() * 14, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'middle';
  const line = (pts: number[], w = 0.3) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1])); g.stroke(); };
  const dashed = (pts: number[]) => { g.setLineDash([1.6, 1.1]); line(pts, 0.28); g.setLineDash([]); };
  const rect = (x0: number, y0: number, x1: number, y1: number, w = 0.3) => { g.lineWidth = w; g.strokeRect(x0, y0, x1 - x0, y1 - y0); };
  const text = (t: string, x: number, y: number, size = 2.1, align: Align = 'center', weight = 600, under = false) => {
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = INK; g.fillText(t, x, y);
    if (under) { const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; line([x0, y + size * 0.62, x0 + w, y + size * 0.62], 0.25); }
  };
  const vtext = (t: string, x: number, y: number, size = 1.7) => { g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); text(t, 0, 0, size); g.restore(); };
  const ring = (x: number, y: number, r = 2.1) => { g.lineWidth = 0.3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
  const dot = (x: number, y: number, r = 0.45) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  const ground = (x: number, y: number) => { line([x, y, x, y + 1.6]); for (const [w, d] of [[1.8, 1.6], [1.2, 2.3], [0.6, 3]]) line([x - w, y + d, x + w, y + d], 0.25); };
  const arrow = (x: number, y: number, dir: 'up' | 'down' | 'left' | 'right') => {
    const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir], px = -dy, py = dx;
    line([x - dx * 1.2 + px * 0.9, y - dy * 1.2 + py * 0.9, x, y, x - dx * 1.2 - px * 0.9, y - dy * 1.2 - py * 0.9], 0.28);
  };
  const resistor = (x: number, y: number, vertical: boolean) => { g.lineWidth = 0.25; if (vertical) g.strokeRect(x - 0.9, y - 2.6, 1.8, 5.2); else g.strokeRect(x - 2.6, y - 0.9, 5.2, 1.8); };
  const diode = (x: number, y: number, a: number) => { g.save(); g.translate(x, y); g.rotate(a); g.fillRect(-2.6, -0.9, 5.2, 1.8); g.fillStyle = PLATE; g.fillRect(1.2, -0.9, 0.5, 1.8); g.restore(); g.fillStyle = INK; };
  const coil = (x: number, y0: number, y1: number) => { g.lineWidth = 0.3; const n = Math.round((y1 - y0) / 2.2); for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x, y0 + (i + 0.5) * ((y1 - y0) / n), (y1 - y0) / n / 2, -Math.PI / 2, Math.PI / 2); g.stroke(); } };
  const bjt = (x: number, y: number) => { ring(x, y, 4.2); line([x - 1.4, y - 2.4, x - 1.4, y + 2.4], 0.4); line([x - 1.4, y - 0.8, x + 2, y - 3], 0.28); line([x - 1.4, y + 0.8, x + 2, y + 3], 0.28); line([x - 4.2, y, x - 1.4, y]); };

  // frame, title strip and the sections
  rect(5, 5, 265, 193, 0.45);
  line([5, 14.5, 265, 14.5]);
  line([119, 14.5, 119, 193]); line([5, 102, 119, 102]);
  line([119, 115, 265, 115]); line([216, 14.5, 216, 115]); line([197, 115, 197, 193]);
  g.lineWidth = 0.5; g.beginPath(); g.roundRect(13, 6.9, 25, 5.4, 2.7); g.stroke();
  text('SIGMA', 25.5, 9.7, 3.1, 'center', 800);
  text('DETECTION OF DIGITAL BASEBAND SIGNAL USING MATCHED FILTER - COM120L', 154, 9.9, 3.9, 'center', 800);
  text('DIGITAL DATA GENERATOR', 75, 18.6, 2.6, 'center', 700, true);
  ['GAUSSIAN', 'NOISE', 'GENERATOR'].forEach((t, i) => text(t, 138, 52.6 + i * 4.7, 2.6, 'center', 700, true));
  text('NOISE ADDER', 245, 21, 2.6, 'center', 700, true);
  text('Integrator & Dump Filter (MATCHED FILTER)', 170, 120.6, 2.6, 'center', 700, true);
  text('COMPARATOR', 240, 120.6, 2.6, 'center', 700, true);
  text('(DECISION DEVICE)', 240, 124.9, 2.1, 'center', 700, true);

  // ICs: outline, notch and type number
  for (const ch of CHIPS) {
    const l = (ch.pins / 2) * 2.54 + 2.4;
    rect(ch.x - l / 2, ch.y - 5, ch.x + l / 2, ch.y + 5, 0.25);
    g.lineWidth = 0.25; g.beginPath(); g.arc(ch.x - l / 2, ch.y, 1, -Math.PI / 2, Math.PI / 2); g.stroke();
    if (ch.pins === 8) text(ch.name, ch.x - l / 2 - 1, ch.y - 7, 2, 'left', 700, true);
    else text(ch.name, ch.x + l / 2 - 0.5, ch.y + 7.2, 1.9, 'right', 600);
  }
  for (const tr of TRANSISTORS) { bjt(tr.x, tr.y); const [a, b] = tr.name.split(' '); text(a, tr.x + 5, tr.y - 4.5, 1.9, 'left'); text(b, tr.x + 5, tr.y - 1.7, 1.9, 'left'); }

  // terminals: a ring round each; resistors: their outline under the part
  for (const t of TERMS) ring(t.x, t.y, t.kind === 'pin' ? 1.9 : 3.3);
  for (const p of PARTS) if (p.k === 'res') resistor(p.x, p.y, p.r === 90);

  // generator
  text('CK', 63.5, 25.6, 2.3, 'right', 700, true); text('BK', 77, 25.6, 2.3, 'right', 700, true); text('NRZ', 109.5, 19.6, 2.1, 'center', 800);
  line([68, 27.5, 68, 32]); line([81.4, 27, 81.4, 32]); line([109.5, 27.5, 109.5, 53]); arrow(109.5, 40, 'up'); ground(110, 64.5);
  line([109.5, 58, 109.5, 73, 61, 73]); arrow(85, 73, 'right');
  line([21, 22, 21, 30, 46, 30, 46, 22, 21, 22]); line([24, 24, 27, 24, 28, 22.8, 29.5, 25.2, 31, 22.8, 32.5, 25.2, 34, 24, 38, 24], 0.25);
  text('1n', 50, 23.6, 1.9); text('PPC', 52, 27.2, 1.9);
  text('NRZ', 10.5, 49.8, 2); text('1K Pr', 33, 48, 1.9); text('NRZ', 41, 52.6, 1.9); line([38.4, 50.9, 43.6, 50.9], 0.22); text('180E', 54, 51.3, 1.8);
  line([20, 58, 112, 58]); arrow(96, 58, 'left');
  for (const x of [72, 76, 93]) ground(x, 45);
  text('+5V', 90, 48.6, 1.9); ground(45, 44); ground(95, 75); ground(45, 75);
  ['H', 'G', 'F', 'E'].forEach((t, i) => text(t, [76, 85, 89.5, 94][i], 59.5, 2));
  ['A', 'B', 'C', 'D'].forEach((t, i) => text(t, 72 + i * 4.5, 77.5, 2));
  vtext('MSB', 11.4, 82.5, 1.8);
  for (const l of LEDS) { ring(l.x - 5.4, l.y, 1.9); dot(l.x - 5.4, l.y, 0.35); }
  for (const s of SWITCHES) { text(`D${s.n}`, s.x - 3.2, s.y - 4.4, 1.9); text(`S${s.n}`, s.x - 0.5, s.y + 7.2, 1.9); }
  vtext('470E', 11.4, 94, 1.6);

  // noise generator: a sketch of the print
  line([123, 23, 214, 23]); text('+12V', 207, 24.4, 1.9);
  line([123, 69, 214, 69]); text('+12V', 205, 69.4, 1.9);
  text('180K', 128, 24.8, 1.6, 'left'); text('1DC', 146, 36, 1.8); text('100K', 146, 44.5, 1.7); text('220K', 156, 29, 1.6, 'left'); text('220K', 156, 51, 1.6, 'left');
  text('10K', 167, 54, 1.6, 'right'); text('1K', 179, 54, 1.6, 'right'); text('1K', 185, 25, 1.6, 'right'); text('100/16', 198, 24.6, 1.6); text('27K', 200, 41, 1.6, 'right');
  text('100', 190, 54, 1.7); text('16', 190, 57.2, 1.7); text('2K2', 205, 57.5, 1.7); text('pr', 207, 60.5, 1.7);
  text('100', 130, 79.7, 1.7); text('16', 130, 82.4, 1.7); text('27K', 140, 74, 1.6, 'left'); text('6K8', 155, 74, 1.6, 'left'); text('680E', 174, 73, 1.6, 'right');
  text('6K8', 140, 103, 1.6, 'left'); text('1K8', 152, 103, 1.6, 'left'); text('100', 166, 103, 1.7); text('25', 166, 106, 1.7);
  text('10 PPC', 193, 75.6, 1.7); vtext('10K p', 191, 83.5, 1.6);
  for (const [x, y] of [[123, 60], [153, 60], [170, 60], [182, 60], [193, 60], [137, 108], [149, 108], [158, 108], [176, 108]]) ground(x, y);
  ring(AMP_KNOB.x, AMP_KNOB.y, 10.6);
  text('AMPLITUDE', AMP_KNOB.x - 1, 110.8, 2.3, 'center', 700);
  line([198.6, 83, 198.6, 86, 196, 86]); line([201, 80.5, 205, 80.5]);
  text('Gaussian', 208, 90.6, 2.1); text('Noise', 208, 93.8, 2.1); arrow(208, 85, 'up'); ground(207.7, 107);

  // noise adder
  text('I/P', 227.5, 32.7, 1.9, 'left'); text('Noisy signal', 249, 27.4, 2, 'center');
  text('+12V', 238, 33.6, 1.9); text('-12V', 249, 58.6, 1.9); text('8', 233.5, 42, 1.8); text('1', 233.5, 48, 1.8);
  line([222, 36, 222, 70, 229.4, 70]); arrow(222, 52, 'down'); line([234.6, 70, 239, 70, 239, 50]);
  line([226.5, 80.6, 229.4, 81]); line([234.6, 81, 242.4, 81]); line([247.6, 81, 254, 81, 254, 36]);
  line([243, 63.4, 243, 50]); ground(243, 69); line([247.7, 35, 247.7, 40]); arrow(247.7, 37.5, 'up');
  text('1K', 232, 67.2, 1.8); text('1K', 232, 78.2, 1.8); text('1K', 245, 84.2, 1.8); vtext('330E', 246.5, 66, 1.6);
  text('Gaussian', 226, 87.4, 2.1); text('Noise', 226, 90.6, 2.1); ground(255.5, 106.4);
  dashed([113, 18.5, 219, 18.5, 219, 28]); arrow(219, 26.5, 'down');
  dashed([261, 36.5, 261, 96.5, 236, 96.5]); arrow(238, 96.5, 'left'); dashed([212, 80.5, 219.5, 80.5]);
  dashed([236, 96.5, 236, 117.5, 125.5, 117.5, 125.5, 137]); arrow(125.5, 135.5, 'down');

  // integrate and dump filter
  text('Noise', 127, 157.8, 2.1); text('Data', 127, 161.6, 2.1); text('+5V', 128, 166, 1.9);
  line([125, 145, 125, 152]); arrow(125, 172, 'down'); line([124, 168, 124, 177.5]); ground(124, 183);
  text('+5', 141, 129, 1.8); text('-5', 147.5, 147.5, 1.8); vtext('27K', 134.5, 148, 1.6); vtext('47K', 157, 141, 1.6);
  text('27K', 152, 154.4, 1.7); text('+5', 160, 145, 1.8); text('-5V', 160.5, 161.5, 1.8); vtext('10K pr.', 169.5, 155, 1.6);
  text('100pf', 166, 135, 1.6); text('10K', 170, 126.4, 1.7); text('100pf', 150, 163, 1.6);
  text('BK', 174, 142.2, 2, 'center', 700); line([173.5, 150, 173.5, 156]); arrow(173.5, 155, 'down'); text('10K', 180.5, 151.4, 1.7, 'right'); text('+5', 182, 158, 1.8);
  text('-5V', 147, 189.2, 1.8); text('4052', 137, 183.6, 2, 'center', 700, true); text('4013', 179.5, 174, 2, 'right', 700, true);
  text('Raw', 209, 158, 2.1); text('Data', 209, 161.6, 2.1); line([208.6, 145, 208.6, 154]); arrow(208.6, 147, 'up'); line([208.6, 165, 208.6, 172]); arrow(208.6, 171, 'down'); ground(208.3, 181);
  line([200, 131, 208.6, 131, 208.6, 138]); arrow(208.6, 136.5, 'down');
  line([129, 129, 129, 124, 205, 124, 205, 131]); line([150, 190, 150, 186]); line([160, 168, 175, 168]); arrow(160, 168, 'left');

  // comparator
  text('+5V', 252, 131.8, 1.9); text('4K7', 243, 135.6, 1.8); text('+5V', 231, 139.4, 1.9); text('311', 245, 150, 1.9, 'left', 700, true); text('-5V', 247, 167.6, 1.9);
  line([211, 142.3, 222, 142.3, 222, 176, 230, 176]); arrow(222, 160, 'down'); arrow(229, 176, 'right');
  line([236, 147, 236, 142.7, 252.5, 142.7]); arrow(248, 142.7, 'right'); line([236, 142.7, 236, 132, 240, 132]); line([246, 132, 250, 132]);
  text('Recd', 255, 156.6, 2.1); text('O/P', 255, 160.2, 2.1); text('Data', 255, 163.8, 2.1); line([254.9, 145, 254.9, 153]); arrow(254.9, 147, 'up'); line([254.5, 167, 254.5, 174]); arrow(254.5, 173, 'down'); ground(254.1, 181);
  line([226, 180.5, 226, 176]); text('1K', 229, 183.5, 1.8, 'left'); ground(236, 160); ground(240, 160);

  // power supply: two transformers, bridges, regulators and the printed test points
  text('S1', 13.6, 113.6, 2); line([10, 110, 14, 107]); coil(19, 108, 126); line([8, 126, 10, 126, 10, 129]); line([7.5, 129.5, 12.5, 129.5]);
  const supply = (y0: number, sec: string, pos: string, neg: string, top: string, bot: string) => {
    text(sec, 33, y0 + 0.4, 1.9);
    coil(24, y0 + 3, y0 + 30); coil(27, y0 + 3, y0 + 30);
    const cx = 42, cy = y0 + 15;
    line([cx - 9, cy, cx, cy - 9, cx + 9, cy, cx, cy + 9, cx - 9, cy]);
    diode(cx - 4.5, cy - 4.5, -Math.PI / 4); diode(cx + 4.5, cy - 4.5, Math.PI / 4); diode(cx - 4.5, cy + 4.5, Math.PI / 4); diode(cx + 4.5, cy + 4.5, -Math.PI / 4);
    line([cx, cy - 9, cx + 38, cy - 9, cx + 38, y0 + 3.5]); line([cx, cy + 9, cx + 38, cy + 9, cx + 38, y0 + 36.5]);
    rect(79, y0 + 2, 92, y0 + 5, 0.25); rect(79, y0 + 35, 92, y0 + 38, 0.25);
    text(pos, 86, y0 + 0, 1.9); text(neg, 86, y0 + 32, 1.9);
    line([92, y0 + 3.5, 109.9, y0 + 3.5]); line([92, y0 + 36.5, 109.9, y0 + 36.5]); line([80, y0 + 20, 109.9, y0 + 20], 0.25); ground(111, y0 + 22);
    for (const yy of [y0 + 3.5, y0 + 20, y0 + 36.5]) { ring(112, yy, 1.6); dot(112, yy, 0.45); }
    text('1000', 77, y0 + 12.5, 1.8); text('25', 77, y0 + 15.5, 1.8); text('1000', 77, y0 + 26.5, 1.8); text('25', 77, y0 + 29.5, 1.8);
    text('10', 93, y0 + 12.5, 1.8); text('16', 93, y0 + 15.5, 1.8); text('10', 93, y0 + 26.5, 1.8); text('16', 93, y0 + 29.5, 1.8);
    text(top, 117, y0 + 5.5, 2, 'center', 700); text(bot, 117, y0 + 33, 2, 'center', 700);
  };
  supply(105, '15V/100mA', '7812', '7912', '+12V', '-12V');
  supply(148, '9V/500mA', '7805', '7905', '+5V', '-5V');
  text('D1 - D8 = 1N4002', 57, 138, 1.9);
  text('230V AC', 17, 188.6, 2.1, 'center', 700); text('MAINS  ON', POWER_SW.x + 4, 188.6, 2.1, 'center', 700);
  line([39, 178, 39, 184]); arrow(39, 184, 'down');
  text('NEON', NEON.x, 188.6, 2.1, 'center', 700); text('-15V', 63, 188.6, 1.9);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
