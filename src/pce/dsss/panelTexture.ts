// Front panel of the Sigma DSSS100, redrawn from the lab's photograph: black print on a yellow
// plate. Coordinates are millimetres on the plate, as in layout.ts.

import * as THREE from 'three';
import { CHIPS, DET_D, LEDS, NEON, PANEL, PARTS, POWER_SW, SWITCHES, TERMS, TRANSISTORS } from './layout.ts';

type Align = 'left' | 'center' | 'right';

export function dsssPanelTexture(): THREE.CanvasTexture {
  const S = 7, c = document.createElement('canvas');
  c.width = PANEL.w * S; c.height = PANEL.h * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const INK = '#2b2616', PLATE = '#dcc057';
  g.fillStyle = PLATE; g.fillRect(0, 0, PANEL.w, PANEL.h);
  for (let i = 0; i < 360; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,170' : '120,95,20'}, 0.035)`; g.beginPath(); g.arc(Math.random() * PANEL.w, Math.random() * PANEL.h, 4 + Math.random() * 14, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'middle';
  const line = (pts: number[], w = 0.3) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < pts.length; i += 2) (i ? g.lineTo(pts[i], pts[i + 1]) : g.moveTo(pts[i], pts[i + 1])); g.stroke(); };
  const rect = (x0: number, y0: number, x1: number, y1: number, w = 0.3) => { g.lineWidth = w; g.strokeRect(x0, y0, x1 - x0, y1 - y0); };
  const text = (t: string, x: number, y: number, size = 2.1, align: Align = 'center', weight = 600, under = false) => {
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = INK; g.fillText(t, x, y);
    if (under) { const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; line([x0, y + size * 0.62, x0 + w, y + size * 0.62], 0.25); }
  };
  const over = (t: string, x: number, y: number, size = 2.1) => { text(t, x, y, size, 'center', 700); g.font = `700 ${size}px Arial`; const w = g.measureText(t).width; line([x - w / 2, y - size * 0.62, x + w / 2, y - size * 0.62], 0.25); };
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

  // frame and sections
  rect(5, 5, 355, 273, 0.45);
  line([141.3, 5, 141.3, 273]); line([244.5, 5, 244.5, 273]);
  line([5, 69, 141.3, 69]); line([5, 107.5, 141.3, 107.5]); line([5, 169.5, 141.3, 169.5]);
  line([141.3, 41.3, 244.5, 41.3]); line([141.3, 77, 244.5, 77]); line([141.3, 169.5, 244.5, 169.5]);
  line([244.5, 96, 355, 96]); line([244.5, 170, 355, 170]); line([244.5, 243, 355, 243]);
  text('CLOCK GENERATOR', 83.8, 9.5, 2.7, 'center', 700, true);
  text('PN CODE GENERATOR', 73.8, 73, 2.7, 'center', 700, true);
  text('BINARY DATA GENERATOR', 76.3, 111.3, 2.7, 'center', 700, true);
  text('POWER SUPPLY', 68.8, 266.3, 2.7, 'center', 700, true);
  text('SPREADING CODE MIXER', 196.3, 9.5, 2.7, 'center', 700, true);
  text('UNI TO BIPOLAR CONVERTER', 193.8, 45.8, 2.7, 'center', 700, true);
  text('DSSS MODULATOR', 196.3, 83, 2.7, 'center', 700, true);
  text('RF CARRIER GENERATOR', 195, 265.5, 2.7, 'center', 700, true);
  text('DSSS MODULTOR - COHARENT DETECTOR', 300, 9.5, 2.7, 'center', 700, true);
  text('LOW PASS FILTER COMPARATOR', 300, 165.5, 2.7, 'center', 700, true);
  text('CODE DESPREADING SECTION', 305, 239.5, 2.7, 'center', 700, true);
  g.lineWidth = 0.5; g.beginPath(); g.roundRect(286, 245.8, 26, 5.6, 2.8); g.stroke();
  text('SIGMA', 299, 248.6, 3.2, 'center', 800);
  text('GENERATION & DETECTION OF', 300, 255.8, 3, 'center', 700, true);
  text('DIRECT SEQUENCE SPECTRUM & ANALYSIS', 300, 262.5, 3, 'center', 700, true);
  text('MODEL - DSSS100', 299, 268.8, 3, 'center', 700, true);

  // ICs, transistors, resistor outlines, terminal rings
  for (const ch of CHIPS) {
    const l = (ch.pins / 2) * 2.54 + 2.4;
    rect(ch.x - l / 2, ch.y - 5, ch.x + l / 2, ch.y + 5, 0.25);
    g.lineWidth = 0.25; g.beginPath(); g.arc(ch.x - l / 2, ch.y, 1, -Math.PI / 2, Math.PI / 2); g.stroke();
    if (ch.pins === 8) text(ch.name, ch.x + l / 2 + 1.5, ch.y - 7, 2, 'left', 700, true);
    else vtext(ch.name, ch.x - l / 2 - 2.2, ch.y, 1.9);
  }
  for (const tr of TRANSISTORS) { bjt(tr.x, tr.y); text(tr.name, tr.x, tr.y + 6.4, 1.9); }
  for (const p of PARTS) if (p.k === 'res') resistor(p.x, p.y, p.r === 90);
  for (const t of TERMS) ring(t.x, t.y, t.kind === 'pin' ? 1.9 : 3.3);

  // clock generator
  text('1MHz', 132.5, 14, 2, 'center', 700); text('CC', 132.5, 22, 2, 'center', 700);
  text('100KHz', 131.3, 33.4, 2, 'center', 700); text('PNCK', 132.5, 41.6, 2, 'center', 700);
  text('6.67KHz', 130, 51.6, 2, 'center', 700); text('BK', 132.5, 60.2, 2, 'center', 700);
  ring(112.8, 42.4, 1.8); dot(112.8, 42.4); text('500KHz', 117, 47.4, 2, 'center', 700);
  text('200KHz', 22.5, 63, 2, 'center', 700); over('200KHz', 110.8, 63, 2);
  ring(68, 56.2, 1.8); arrow(68, 59, 'down'); text('40', 73.8, 59.6, 2); text('KHz', 73.8, 63, 2);
  text('1Kpf', 28.8, 12, 1.9); vtext('100pF', 17.5, 32.5); text('180E', 16.3, 46.3, 1.8);
  line([24, 56.2, 34, 56.2]); arrow(25, 56.2, 'left'); line([34, 18, 60, 18]); line([47, 16.5, 47, 19.5]); line([48.5, 16.5, 48.5, 19.5]);
  line([120, 14, 129, 17.8]); arrow(128, 17.4, 'right'); line([118, 37.2, 129, 37.2]); line([118, 55.6, 128, 55.6]);
  for (const x of [32, 58, 66, 92, 100, 42, 54, 80, 90]) ground(x, x < 60 && x > 40 ? 61 : 33);

  // PN code generator
  text('PN', 132.5, 85, 2, 'center', 700); text('Signal', 132.5, 88.8, 2, 'center', 700); ground(131.8, 98.2);
  text('PNCK', 112.5, 104.5, 2, 'center', 700); text('+5', 83.8, 99.3, 1.8);
  line([12, 100, 125, 100]); arrow(104, 104.5, 'left'); line([110, 79.5, 129.6, 79.5]); line([107, 104.5, 120, 104.5]);

  // binary data generator
  text('BK', 12.5, 112.5, 2, 'center', 700); ring(12, 118, 1.8); dot(12, 118);
  text('+ H G F E', 80, 116.8, 2); text('A B C D', 77.5, 135, 2);
  text('PRBS', 119.5, 135.8, 2, 'center', 700); text('NRZ', 132.5, 122.5, 2, 'center', 700); text('DATA', 132.5, 126.3, 2, 'center', 700); ground(131, 139.2);
  text('Reset', 132, 164.5, 2, 'center', 700); line([106, 119, 112, 119]); arrow(126, 112, 'right'); line([100, 112, 126, 112]);
  vtext('MSB', 8.8, 143.8, 1.8); vtext('470E', 24.5, 160, 1.6);
  for (const l of LEDS) if (l.n < 8) text(`D${l.n}`, l.x - 6.2, l.y, 1.9, 'center', 700);
  for (const s of SWITCHES) text(`S${s.n}`, s.x, s.y + 10.6, 1.9, 'center', 700);

  // power supply
  text('15-0-15V/250mA', 52.5, 175, 1.9); text('15V', 41.3, 208.8, 1.9); text('D1-D8=1N4007', 60, 208.8, 1.9);
  text('0-9V/500mA', 51.3, 223.8, 1.9); text('0V', 38.8, 255.5, 1.9); text('-12V', 65.5, 258.8, 1.9);
  for (const [y0, ds] of [[178, ['D4', 'D3', 'D1', 'D2']], [228, ['D8', 'D7', 'D5', 'D6']]] as const) {
    coil(38, y0 + 2, y0 + 24); coil(41, y0 + 2, y0 + 24);
    const cx = 55, cy = y0 + 13;
    line([cx - 10, cy, cx, cy - 10, cx + 10, cy, cx, cy + 10, cx - 10, cy]);
    diode(cx - 5, cy - 5, -Math.PI / 4); diode(cx + 5, cy - 5, Math.PI / 4); diode(cx - 5, cy + 5, Math.PI / 4); diode(cx + 5, cy + 5, -Math.PI / 4);
    ds.forEach((t, i) => text(t, [46, 63, 46, 63][i], [cy - 7, cy - 7, cy + 7, cy + 7][i], 1.8));
    line([cx + 10, cy, 70, cy, 70, y0 + 2, 98, y0 + 2]); line([cx, cy + 10, cx, y0 + 34, 98, y0 + 34]); line([42, cy, 70, cy], 0.22);
  }
  for (const [y, t] of [[180, '7815'], [205.5, '7915'], [228, '7805'], [253.3, '7905']] as const) { rect(99, y - 1.4, 116, y + 1.4, 0.25); text(t, 106.3, y - 3.6, 1.9); line([116, y, 122, y]); }
  text('1000', 91.3, 184.3, 1.8); text('25', 91.3, 188, 1.8); text('1000', 91.3, 198.8, 1.8); text('25', 91.3, 202.5, 1.8);
  text('1000', 91.3, 231.8, 1.8); text('16', 91.3, 235.5, 1.8); text('1000', 91.3, 246.3, 1.8); text('16', 91.3, 250, 1.8);
  text('+15V', 131, 182, 2, 'left', 700); text('-15V', 131, 205, 2, 'left', 700); text('+5V', 131, 229.5, 2, 'left', 700); text('-5V', 131, 252.5, 2, 'left', 700);
  text('NEON', NEON.x + 0.7, 203, 2.1, 'center', 700); text('MAINS  ON', POWER_SW.x + 2.5, 224.3, 2.1, 'center', 700); line([29, 214, 29, 219]); arrow(29, 219, 'down');
  text('230V AC', 19.5, 265.5, 2.1, 'center', 700);

  // spreading code mixer and uni to bipolar converter
  text('PN Code', 156.3, 13, 2, 'left', 700); text('NRZ Data', 157, 26.3, 2, 'left', 700); text('+5', 217.5, 36.3, 1.8);
  line([155, 17, 175, 17, 175, 20]); line([155, 29.4, 168, 29.4, 168, 25, 177, 25]); line([195, 22.5, 222, 22.5, 222, 12, 227, 12]); arrow(226, 12, 'right');
  text('Spreading', 227, 18.6, 1.9, 'right', 700); text('Code', 227, 22.4, 1.9, 'right', 700); ground(230.3, 34.2);
  line([150, 39, 150, 37, 240, 37]); arrow(200, 37, 'left');
  text('4052', 180.5, 70, 1.9); text('5', 193, 72.5, 1.8); ground(152.5, 71);
  line([155, 53.5, 178, 53.5]); line([197, 53.5, 228, 54.9]); arrow(227, 54.8, 'right');
  text('Bipolar', 227, 58.6, 1.9, 'right', 700); text('Sp Code', 227, 62.2, 1.9, 'right', 700); ground(230.3, 71.6);
  line([146, 74, 230, 74]); arrow(170, 74, 'left'); line([146, 74, 146, 40]); arrow(146, 60, 'up');

  // DSSS modulator and coherent detector (the same print, twice)
  for (const [dx, dy] of [[0, 0], [DET_D.x, DET_D.y]] as const) {
    const X = (x: number) => x + dx, Y = (y: number) => y + dy;
    ['10K Pr', '330K', '470E', '470E', '100 pf', '470E', '470E', '470E'].forEach((t, i) => vtext(t, X([166, 174.5, 181.5, 188, 196, 209.5, 215.5, 221.5][i]), Y(95)));
    vtext('0.47 PPC', X(155.5), Y(104)); vtext('10K', X(155.5), Y(121.3));
    ['5K1', '5K1', '1K', '10K', '6K8', '4K7'].forEach((t, i) => vtext(t, X([159.5, 167.3, 174.8, 181.5, 188, 195.5][i]), Y(132.5)));
    vtext('2K2', X(239.8), Y(132.5)); text('1496', X(180), Y(121.8), 1.9); text('2K Pr', X(232.5), Y(121.3), 1.9);
    vtext('10K', X(156), Y(150)); vtext('10K', X(176), Y(150)); vtext('1K Pr', X(183.5), Y(150)); text('1K Pr', X(212.5), Y(157.5), 1.9);
    vtext('470E', X(209.5), Y(150)); vtext('4K7', X(223.5), Y(150)); vtext('470E', X(231.5), Y(150));
  }
  text('RF', 162.5, 82.5, 2, 'center', 700); text('Carrier', 162.5, 86.3, 2, 'center', 700);
  text('Sp Code', 186.5, 161.5, 2, 'left', 700); arrow(180.5, 161.1, 'right'); line([150, 161.1, 180.5, 161.1]);
  text('DSSS', 234.5, 83.6, 2, 'center', 700); text('O/P', 233, 95, 2, 'center', 700); ground(233, 162.3);
  line([234.5, 88.2, 243, 88.2]); line([150, 168, 243, 168]); arrow(180, 168, 'left');
  text('DSSS', 257.5, 23, 2, 'center', 700); text('I/P', 257.5, 26.8, 2, 'center', 700); line([254, 30, 254, 85]); arrow(254, 60, 'up'); ground(258.5, 90.8);
  text('Noisy', 345, 24.5, 2, 'center', 700); text('SP Code', 341.3, 28.6, 2, 'center', 700); vtext('4n5 PPC', 337.5, 15);
  text('RF Carrier  500KHz', 292, 89.5, 2, 'left', 700); arrow(287, 86.6, 'up'); line([287, 91, 287, 94]);

  // low pass filter comparator
  text('SP', 253.3, 122.5, 2, 'center', 700); text('Code', 253.3, 126.6, 2, 'center', 700); text('I/P', 253.3, 130.6, 2, 'center', 700); arrow(252.9, 138, 'down'); ground(252.9, 144.7);
  vtext('1K', 264.5, 122); vtext('2.14K', 264, 136.3); text('1nP', 268.8, 151.3, 1.8); text('+15', 277, 115.8, 1.8); text('8', 279, 122.6, 1.6); text('1', 279, 130, 1.6); text('5', 292, 122.6, 1.6); text('4', 292, 130, 1.6);
  vtext('6.43K', 301.8, 130); text('6.43K', 285, 158.6, 1.8); text('-15', 292.5, 143, 1.8);
  text('+15', 313.8, 113.3, 1.8); text('8', 321.5, 122.6, 1.6); text('1', 321.5, 130, 1.6); text('-15', 333.8, 143, 1.8);
  text('Fil.', 306.3, 155.8, 2, 'center', 700); text('O/P', 306.3, 159.8, 2, 'center', 700); text('10K Pr', 335, 157.5, 1.9);
  text('+5V', 347.5, 105, 1.9); text('4K7', 331.3, 109.3, 1.9); line([326, 105, 344, 105, 344, 108.5]);
  text('SP', 345.8, 122.5, 2, 'center', 700); text('Code', 345.8, 126.6, 2, 'center', 700); text('O/P', 345.8, 130.6, 2, 'center', 700); arrow(345.3, 113.3, 'up'); ground(345.3, 144.2);
  line([255.8, 110.8, 262, 110.8, 262, 118]); line([290, 126.3, 306.4, 126.3, 306.4, 147.6]); line([306.4, 126.3, 318, 126.3]); line([334, 126.3, 340, 120, 344, 112.6]);

  // code despreading section
  text('SP Code', 256.3, 179.5, 2, 'center', 700); over('200KHz', 273.8, 177.5, 2); text('74266', 327.5, 177, 1.9);
  text('PN', 253.8, 207, 2, 'center', 700); text('Signal', 253.8, 211.1, 2, 'center', 700); ground(252.9, 226);
  text('+5', 332.5, 198, 1.8); text('Recvd.', 345.5, 198, 2, 'center', 700); text('Data', 345.5, 202.2, 2, 'center', 700); ground(344.6, 218);
  text('200KHz', 261.3, 237, 2, 'center', 700);
  line([254.2, 186.3, 262, 186.3, 262, 190, 296, 190]); line([254.9, 200.8, 268, 200.8, 268, 210]); line([318, 183.8, 342.5, 184.2]); arrow(341.5, 184.1, 'right');
  line([274, 180, 274, 183, 298, 183]); line([266, 232, 336, 232]); arrow(300, 232, 'right'); line([290, 222, 290, 232]); line([316, 222, 316, 232]);

  // RF carrier generator
  ring(178.8, 186.3, 7.4); coil(176.3, 181, 191.6); coil(181.3, 181, 191.6); line([178.8, 179.6, 178.8, 193]);
  text('0-8', 162, 187, 1.9); text('42', 187.5, 179.5, 1.8); text('0', 187.5, 185, 1.8); text('42', 187.5, 190.5, 1.8);
  text('1nPPC', 207.5, 186.3, 1.8); text('0.1 PPC', 176.3, 205, 1.8); text('470E', 195.5, 210.5, 1.8); text('-15V', 210, 207, 1.8);
  text('1K', 218.3, 193, 1.8); text('Pr', 218.3, 196.8, 1.8); text('PHASE', 220, 205, 2, 'center', 700, true);
  text('+5V', 183.3, 232, 1.8); text('1K Pr', 210.5, 227.5, 1.8);
  text('500', 149.5, 221.3, 2, 'center', 700); text('KHz', 149.5, 225, 2, 'center', 700); ground(148.3, 257.2);
  text('1K', 161.3, 225.8, 1.8); text('10K', 162.5, 242, 1.8); vtext('4K7', 179.5, 248.8); text('1K', 180, 238.2, 1.8);
  text('100uH', 197.5, 234.5, 1.9); vtext('100pf', 188.5, 252); vtext('100pf', 207, 252);
  text('GAIN', 228, 233.8, 2, 'center', 700, true); text('500', 236.3, 239.4, 2, 'center', 700); text('KHz', 236.3, 243.6, 2, 'center', 700);
  text('RF', 227, 248, 2, 'center', 700); text('CARRIER', 227, 252.4, 2, 'center', 700, true); text('-15V', 162.5, 259.5, 1.9);
  line([150.6, 214, 157, 214, 157, 220]); line([166, 242, 225, 242]); arrow(226.6, 241.8, 'right'); line([220, 228, 220, 242]);
  line([166, 194, 220, 194]); line([150, 172, 240, 172]); arrow(195, 172, 'right');

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
