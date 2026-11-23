// Front panel of the Sigma COM115M, redrawn from the lab's photograph: black print on a yellow
// plate. Coordinates are millimetres on the plate, as in layout.ts.

import * as THREE from 'three';
import { BM_DX, CHIPS, LEDS, NEON, PANEL, PARTS, POWER_SW, SWITCHES, TERMS, TRANSISTORS } from './layout.ts';

type Align = 'left' | 'center' | 'right';

export function fskPanelTexture(): THREE.CanvasTexture {
  const S = 8, c = document.createElement('canvas');
  c.width = PANEL.w * S; c.height = PANEL.h * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const INK = '#2b2616', PLATE = '#dcc057';
  g.fillStyle = PLATE; g.fillRect(0, 0, PANEL.w, PANEL.h);
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,170' : '120,95,20'}, 0.035)`; g.beginPath(); g.arc(Math.random() * PANEL.w, Math.random() * PANEL.h, 4 + Math.random() * 14, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'middle';
  const line = (pts: number[], w = 0.3) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1])); g.stroke(); };
  const rect = (x0: number, y0: number, x1: number, y1: number, w = 0.3) => { g.lineWidth = w; g.strokeRect(x0, y0, x1 - x0, y1 - y0); };
  const text = (t: string, x: number, y: number, size = 2.1, align: Align = 'center', weight = 600, under = false) => {
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = INK; g.fillText(t, x, y);
    if (under) { const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; line([x0, y + size * 0.62, x0 + w, y + size * 0.62], 0.25); }
  };
  /** text with a bar over it (a complement) */
  const barred = (t: string, x: number, y: number, size = 2.1) => { text(t, x, y, size, 'center', 700); g.font = `700 ${size}px Arial`; const w = g.measureText(t).width; line([x - w / 2, y - size * 0.62, x + w / 2, y - size * 0.62], 0.25); };
  const vtext = (t: string, x: number, y: number, size = 1.6) => { g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); text(t, 0, 0, size); g.restore(); };
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
  const bjt = (x: number, y: number) => { ring(x, y, 3.6); line([x - 1.2, y - 2, x - 1.2, y + 2], 0.4); line([x - 1.2, y - 0.7, x + 1.8, y - 2.6], 0.28); line([x - 1.2, y + 0.7, x + 1.8, y + 2.6], 0.28); };

  // frame, title strip and the sections
  rect(5, 5, 265, 193, 0.45);
  line([5, 11.6, 265, 11.6]);
  line([117, 11.6, 117, 193]); line([5, 101.6, 265, 101.6]); line([191.6, 11.6, 191.6, 101.6]); line([170, 101.6, 170, 193]); line([193, 101.6, 193, 193]);
  g.lineWidth = 0.5; g.beginPath(); g.roundRect(11, 6.3, 22, 4.6, 2.3); g.stroke();
  text('SIGMA', 22, 8.7, 2.9, 'center', 800);
  text('GENERATION & RECEPTION OF FSK MODEL - COM115M', 138, 8.7, 3.6, 'center', 800);
  text('DIGITAL DATA GENERATOR', 74, 16.8, 2.6, 'center', 700, true);
  text('BALANCED MODULATOR-1', 155, 16.8, 2.6, 'center', 700, true);
  text('BALANCED MODULATOR-2', 229, 16.8, 2.6, 'center', 700, true);
  text('POWER SUPPLY', 31, 159.4, 2.6, 'center', 700, true);
  text('CARRIER GENERATOR', 143, 188, 2.6, 'center', 700, true);
  text('ADDER', 182, 188, 2.6, 'center', 700, true);
  text('FSK DEMODULATOR', 230, 105.4, 2.6, 'center', 700, true);
  text('DATA SQUARER', 234, 189, 2.6, 'center', 700, true);

  // ICs, transistors, resistor outlines, terminal rings
  for (const ch of CHIPS) {
    const l = (ch.pins / 2) * 2.54 + 2.4;
    rect(ch.x - l / 2, ch.y - 5, ch.x + l / 2, ch.y + 5, 0.25);
    g.lineWidth = 0.25; g.beginPath(); g.arc(ch.x - l / 2, ch.y, 1, -Math.PI / 2, Math.PI / 2); g.stroke();
    if (ch.pins === 8) text(ch.name, ch.x + l / 2 + 1.5, ch.y - 7, 2, 'left', 700, true);
    else text(ch.name, ch.x - l / 2 + 0.5, ch.y + 7.4, 2, 'left', 600);
  }
  for (const tr of TRANSISTORS) { bjt(tr.x, tr.y); text(tr.name, tr.x, tr.y - 5.4, 1.9); }
  for (const p of PARTS) if (p.k === 'res') resistor(p.x, p.y, p.r === 90);
  for (const t of TERMS) ring(t.x, t.y, t.kind === 'pin' ? 1.9 : 3.3);

  // generator
  text('CK', 63.5, 24.4, 2.3, 'right', 700, true); text('BK', 76.5, 24.4, 2.3, 'right', 700, true);
  line([68, 26.5, 68, 30]); line([81, 26.5, 81, 30]);
  barred('NRZ', 112.2, 29.2); text('NRZ', 109.6, 66, 2.1, 'center', 700);
  line([109.6, 38, 109.6, 57.4]); arrow(109.6, 47, 'up'); line([109.6, 54, 60, 54]); arrow(84, 54, 'left');
  text('NRZ', 11.6, 48.2, 2); text('1K Pr.', 14.4, 52.6, 1.9); text('1n', 47.6, 22.4, 1.9); text('PPC', 49, 26, 1.9); text('180E', 53, 49.6, 1.8); text('+5V', 88, 47.2, 1.9);
  line([21, 21, 21, 28, 45, 28, 45, 21, 21, 21]); line([24, 23, 27, 23, 28, 21.8, 29.5, 24.2, 31, 21.8, 32.5, 24.2, 34, 23, 38, 23], 0.25);
  for (const x of [69, 73, 93]) ground(x, 43);
  ['H', 'G', 'F', 'E'].forEach((t, i) => text(t, [76, 84.4, 89, 93][i], 57, 2));
  ['A', 'B', 'C', 'D'].forEach((t, i) => text(t, 71 + i * 4.5, 76, 2));
  vtext('MSB', 10, 82, 1.8); vtext('470E', 10, 94, 1.6);
  for (const l of LEDS) { ring(l.x - 5.5, l.y, 1.9); dot(l.x - 5.5, l.y, 0.35); }
  for (const s of SWITCHES) { text(`D${s.n}`, s.x - 1, s.y - 5, 1.9); text(`S${s.n}`, s.x + 1.5, s.y + 6.2, 1.9); }

  // the two balanced modulators (same print, side by side)
  for (const [dx, n] of [[0, 1], [BM_DX, 2]] as const) {
    const X = (x: number) => x + dx;
    if (n === 1) barred('NRZ', X(125), 17.6, 2); else text('NRZ', X(123.2), 17.6, 2, 'center', 700);
    line([X(124.4), 25.5, X(124.4), 30]);
    ['330K', '470E', '470E', '100 pf', '470E', '470E'].forEach((t, i) => vtext(t, X([137.6, 144.6, 150.6, 156.6, 162.6, 169.6][i]), 35.6));
    text('1496', X(140), 58, 1.9); text('2K Pr.', X(184), 56.6, 1.9); text('10K', X(129.4), 59.4, 1.8);
    ['5K1', '1K', '10K', '6K8', '4K7'].forEach((t, i) => vtext(t, X([123.6, 130.6, 140.6, 146.6, 154.6][i]), 68));
    vtext('2K2', X(189), 65); vtext('5K1', X(119.5), 76); vtext('10K', X(134.6), 82); vtext('0.47 ppc', X(150.6), 80); vtext('1K Pr', X(143), 82); vtext('1K Pr', X(164.6), 82);
    vtext('4K7', X(175.6), 82); vtext('470E', X(181.6), 82); vtext('470E', X(188.6), 82);
    text('10K', X(127), 95.4, 1.8); vtext('1K', X(138.6), 94); text('100K Pr.', X(151), 99.4, 1.9);
    line([X(124.4), 26, X(118.5), 26, X(118.5), 98, X(190), 98], 0.22);
  }
  text('ASK1', 183.6, 28.8, 2.1, 'center', 700); text('O/P', 184.4, 33.6, 2.1, 'center', 700); line([184.4, 21.4, 184.4, 18], 0.25);
  text('640KHz', 175, 91.6, 2.1, 'center', 700); text('RF', 171.6, 95.4, 2.1, 'center', 700); ground(188, 94.6);
  text('ASK2', 255, 23.4, 2.1, 'right', 700); text('O/P', 258.6, 36, 2.1, 'center', 700);
  text('320KHz', 249.6, 90, 2.1, 'center', 700); text('RF', 246.4, 93.6, 2.1, 'center', 700); ground(261, 94.2);

  // carrier generator: two LC oscillators, each wired up to its modulator
  for (const [dy, f, l, cs] of [[0, '640KHz', '100uH', ['560pf', '100pf']], [41.6, '320KHz', '200uH', ['1nDC', '1nDC']]] as const) {
    const Y = (y: number) => y + dy;
    text(f, 128, Y(106.4), 2, 'center', 700); text('1K', 124, Y(113), 1.8, 'left'); text('548', 136, Y(114.6), 1.8, 'left'); text('+5V', 142.6, Y(118.2), 1.8, 'left');
    text('1K', 140.6, Y(123.8), 1.8); text(l, 156.6, Y(120.4), 1.9); text('10K', 124.4, Y(127), 1.8, 'left'); vtext('4K7', 129.6, Y(137));
    vtext(cs[0], 143.2, Y(133)); vtext(cs[1], 165.2, Y(133)); text('-15V', 137, Y(142.6), 1.9);
    line([120.6, Y(108), 120.6, Y(140)]); line([129, Y(122.6), 129, Y(126.4), 150, Y(126.4)]); line([158, Y(126.4), 164.4, Y(126.4), 164.4, Y(110.5)]); arrow(164.4, Y(112), 'up');
    ground(120.6, Y(140)); ground(148, Y(138)); ground(161, Y(138));
  }
  text('f1-640', 154, 107.4, 2, 'center', 700); text('KHz', 155, 110.6, 2, 'center', 700); text('~', 155, 114.2, 2.6);
  text('f2 - 320', 156, 148.6, 2, 'center', 700); text('KHz', 156.6, 152, 2, 'center', 700);
  line([164.4, 105.6, 164.4, 103, 168.5, 103, 168.5, 96]); line([166, 147, 166, 140, 169, 140, 169, 102.6]);

  // adder
  text('FSK', 186.6, 117.2, 2.1, 'center', 700); text('O/P', 186.6, 120.4, 2.1, 'center', 700); arrow(187, 113, 'up');
  line([178, 108, 183.7, 108]); line([190.3, 108, 197, 108]); arrow(196, 108, 'right'); line([179, 108, 179, 137, 182, 137, 182, 139]);
  vtext('1K', 173.2, 127); ground(186.6, 127.8);
  vtext('330E', 173.2, 163); vtext('1K', 178.4, 163); vtext('1K', 186, 163);
  dot(175.6, 175, 0.5); dot(191.6, 175, 0.5); text('ASK-1 ASK-2', 182, 180.6, 2, 'center', 700);

  // FSK demodulator and data squarer
  text('+47K', 214.4, 110.6, 1.9); text('pr', 215.6, 115, 1.9); vtext('VCO', 216, 120.5, 1.9); vtext('10nP', 209, 119.6);
  vtext('12K', 235, 113.6); vtext('27K', 240, 113.6); vtext('150E', 246.4, 118); vtext('100pf', 254, 116); text('10E', 254.4, 126.8, 1.8); vtext('3K3', 227.4, 130);
  text('+5', 215, 129.4, 1.8); vtext('1n5p', 253, 143); text('CK', 224, 158, 2, 'center', 700); vtext('100pf', 238, 153); text('1K5', 211.6, 161, 1.8);
  text('FSK', 201.6, 134.4, 2.1, 'center', 700); text('I/P', 200.6, 139, 2.1, 'center', 700); line([200.4, 111.5, 200.4, 130]); arrow(200.4, 113.5, 'down'); ground(200.6, 159.2);
  line([203, 112, 205.6, 115]); line([205.6, 124, 205.6, 126, 222, 126, 222, 134.6]);
  text('RAW', 202.4, 174, 2.1, 'center', 700); text('Data', 202.4, 177.6, 2.1, 'center', 700);
  line([204, 168, 236, 168, 236, 172]); line([212, 164, 212, 150, 222, 150]);
  text('+15', 219, 171.4, 1.8); text('-15', 215, 187, 1.8); text('+15', 231.6, 169.2, 1.8); text('-15', 247, 185.2, 1.8);
  line([246, 172, 246, 168.4, 258.6, 168.4]); arrow(257.6, 168.4, 'right');
  text('NRZ', 258.6, 174, 2.1, 'center', 700); text('O/P', 258.6, 177.6, 2.1, 'center', 700); ground(259.6, 187.4);

  // power supply
  text('18V/500mA', 42.6, 108, 1.9); text('S1', 17, 115.4, 1.9); line([13, 112, 17, 109]); coil(23, 110, 128); coil(31, 110, 128); coil(33.6, 110, 128);
  line([9, 128, 11, 128, 11, 131]); line([8.5, 131.5, 13.5, 131.5]);
  const cx = 50, cy = 121;
  line([cx - 10, cy, cx, cy - 10, cx + 10, cy, cx, cy + 10, cx - 10, cy]);
  diode(cx - 5, cy - 5, -Math.PI / 4); diode(cx + 5, cy - 5, Math.PI / 4); diode(cx - 5, cy + 5, Math.PI / 4); diode(cx + 5, cy + 5, -Math.PI / 4);
  ['D3', 'D2', 'D4', 'D1'].forEach((t, i) => text(t, [42, 58, 42, 58][i], [113, 113, 129, 129][i], 1.8));
  text('D1-D4 =', 48, 134, 1.8); text('IN4002', 48, 137.4, 1.8); text('18', 34, 135, 1.8);
  text('1000', 79, 116, 1.8); text('25', 79, 119.4, 1.8); text('1000', 79, 136, 1.8); text('25', 79, 139.4, 1.8);
  text('7815', 90, 113.4, 1.9); text('7915', 90, 140, 1.9); text('7805', 79, 165.6, 1.9);
  text('10', 93, 121, 1.8); text('16', 93, 124, 1.8); text('10', 93, 131, 1.8); text('16', 93, 134, 1.8); text('10', 93, 169, 1.8); text('16', 93, 172.4, 1.8);
  rect(73, 108.4, 89, 111, 0.25); rect(73, 143.2, 89, 145.8, 0.25); rect(73, 159.6, 89, 162.2, 0.25);
  line([60, 121, 66, 121, 66, 109.7, 73, 109.7]); line([89, 109.7, 103, 109.7]); line([89, 144.5, 103, 144.5]); line([89, 160.9, 103, 160.9]); line([50, 131, 50, 144.5, 73, 144.5]);
  line([66, 126, 103, 126], 0.22); ground(106.6, 128); line([66, 160.9, 73, 160.9]); line([60, 160.9, 66, 160.9]); line([62.6, 157, 62.6, 160.9]);
  text('+15V', 107, 115.4, 1.9, 'center', 700); text('-15V', 107, 139.4, 1.9, 'center', 700); text('+5V', 107, 165, 1.9, 'center', 700); text('+15V', 62.6, 160.6 - 4.4, 1.9);
  ground(106.6, 181);
  text('230V AC', 14, 186, 2.1, 'center', 700); text('MAINS  ON', POWER_SW.x + 4, 186, 2.1, 'center', 700);
  line([49.6, 175, 49.6, 181]); arrow(49.6, 181, 'down');
  text('NEON', NEON.x, 186, 2.1, 'center', 700);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
