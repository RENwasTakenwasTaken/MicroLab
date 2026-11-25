// Front panel of the Sigma COM110M, redrawn from the lab's photograph: black print on a yellow plate.
// Labels are placed at the photo pixels where they are printed (px() turns them into millimetres);
// the dense tracking between the ICs is drawn as plausible routed lines, not copied trace by trace.

import * as THREE from 'three';
import { BLOCKS, CHIPS, KNOBS, LEDS, PANEL, PARTS, Q1, TERMS, TOGGLES, px } from './layout.ts';

type Align = 'left' | 'center' | 'right';

export function pcmPanelTexture(): THREE.CanvasTexture {
  const S = 7, c = document.createElement('canvas');
  c.width = PANEL.w * S; c.height = PANEL.h * S;
  const g = c.getContext('2d')!;
  g.scale(S, S);
  const INK = '#2b2616', PLATE = '#dcc04f';
  g.fillStyle = PLATE; g.fillRect(0, 0, PANEL.w, PANEL.h);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${i % 2 ? '255,240,170' : '120,95,20'}, 0.035)`; g.beginPath(); g.arc(Math.random() * PANEL.w, Math.random() * PANEL.h, 4 + Math.random() * 14, 0, 7); g.fill(); }
  g.strokeStyle = INK; g.fillStyle = INK; g.lineCap = 'round'; g.lineJoin = 'round'; g.textBaseline = 'middle';
  /** a polyline through photo pixels */
  const line = (pts: number[], w = 0.3) => { g.lineWidth = w; g.beginPath(); for (let i = 0; i < pts.length; i += 2) { const [x, y] = px(pts[i], pts[i + 1]); if (i) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); };
  const text = (t: string, X: number, Yp: number, size = 2.1, align: Align = 'center', weight = 700, under = false) => {
    const [x, y] = px(X, Yp);
    g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.textAlign = align; g.fillStyle = INK; g.fillText(t, x, y);
    if (under) { const w = g.measureText(t).width, x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; g.lineWidth = 0.25; g.beginPath(); g.moveTo(x0, y + size * 0.62); g.lineTo(x0 + w, y + size * 0.62); g.stroke(); }
  };
  const boxed = (t: string, X: number, Yp: number, size = 2.2) => {
    const [x, y] = px(X, Yp); g.font = `700 ${size}px Arial`; const w = g.measureText(t).width;
    text(t, X, Yp, size); g.lineWidth = 0.3; g.strokeRect(x - w / 2 - 1, y - size * 0.75, w + 2, size * 1.5);
  };
  const vtext = (t: string, X: number, Yp: number, size = 1.7) => { const [x, y] = px(X, Yp); g.save(); g.translate(x, y); g.rotate(-Math.PI / 2); g.font = `700 ${size}px Arial`; g.textAlign = 'center'; g.fillText(t, 0, 0); g.restore(); };
  const ringMm = (x: number, y: number, r: number) => { g.lineWidth = 0.3; g.beginPath(); g.arc(x, y, r, 0, 7); g.stroke(); };
  const ground = (X: number, Yp: number) => { const [x, y] = px(X, Yp); g.lineWidth = 0.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 1.6); g.stroke(); for (const [w, d] of [[1.8, 1.6], [1.2, 2.3], [0.6, 3]]) { g.beginPath(); g.moveTo(x - w, y + d); g.lineTo(x + w, y + d); g.stroke(); } };
  const arrow = (X: number, Yp: number, dir: 'up' | 'down' | 'left' | 'right') => {
    const [x, y] = px(X, Yp), [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir], qx = -dy, qy = dx;
    g.lineWidth = 0.3; g.beginPath(); g.moveTo(x - dx * 1.3 + qx * 1, y - dy * 1.3 + qy * 1); g.lineTo(x, y); g.lineTo(x - dx * 1.3 - qx * 1, y - dy * 1.3 - qy * 1); g.stroke();
  };
  const dot = (X: number, Yp: number) => { const [x, y] = px(X, Yp); g.beginPath(); g.arc(x, y, 0.45, 0, 7); g.fill(); };

  // ---- frame, sections, title
  const [fx0, fy0] = px(85, 75), [fx1, fy1] = px(1295, 950);
  g.lineWidth = 0.45; g.strokeRect(fx0, fy0, fx1 - fx0, fy1 - fy0);
  for (const [, x0, y0, x1, y1] of BLOCKS) { g.lineWidth = 0.4; g.strokeRect(x0, y0, x1 - x0, y1 - y0); }
  { const [x, y] = px(190, 52); g.lineWidth = 0.7; g.beginPath(); g.roundRect(x - 12, y - 3.2, 24, 6.4, 3.2); g.stroke(); }
  text('SIGMA', 190, 52, 3.6, 'center', 800);
  text('PULSE CODE MODULATION/DEMODULATION TRAINER - COM110M', 680, 49, 4.1, 'center', 800);
  text('AUDIO', 240, 567, 3, 'center', 800, true); text('GENERATOR', 228, 597, 3, 'center', 800, true);
  text('PCM MODULATOR', 625, 84, 3, 'center', 800, true);
  text('PCM DEMODULATOR', 1060, 84, 3, 'center', 800, true);
  text('FILTER', 945, 725, 2.6, 'center', 800, true);
  text('SAMPLING PULSE GENERATOR', 840, 940, 2.6, 'center', 800, true);
  text('DC SOURCE', 1185, 930, 2.8, 'center', 800);

  // ---- routed tracks between the ICs of the modulator and demodulator (seeded, so the print never changes)
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pinEnds = (ch: (typeof CHIPS)[number]) => {
    const n = ch.pins / 2, out: [number, number][] = [];
    for (let i = 0; i < n; i++) { const x = ch.x + (i - (n - 1) / 2) * 2.54; out.push([x, ch.y - 5.6], [x, ch.y + 5.6]); }
    return out;
  };
  const inBlock = (b: string, x: number, y: number) => { const r = BLOCKS.find((q) => q[0] === b)!; return x > r[1] + 3 && x < r[3] - 3 && y > r[2] + 7 && y < r[4] - 4; };
  for (const blk of ['mod', 'dem'] as const) {
    const chips = CHIPS.filter((ch) => inBlock(blk, ch.x, ch.y) && ch.pins > 8);
    const ends = chips.flatMap(pinEnds);
    for (let i = 0; i < (blk === 'mod' ? 46 : 40); i++) {
      const [ax, ay] = ends[Math.floor(rnd() * ends.length)], [bx, by] = ends[Math.floor(rnd() * ends.length)];
      if (Math.abs(ax - bx) + Math.abs(ay - by) < 6) continue;
      const jog = ay + (ay < by ? 1 : -1) * (2 + rnd() * 6), mid = ax + (bx - ax) * (0.3 + rnd() * 0.4);
      g.lineWidth = 0.22; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, jog); g.lineTo(mid, jog); g.lineTo(mid, by + (ay < by ? -2 : 2)); g.lineTo(bx, by + (ay < by ? -2 : 2)); g.lineTo(bx, by); g.stroke();
    }
  }

  // ---- ICs, transistor, resistor outlines, terminal rings
  for (const ch of CHIPS) {
    const l = (ch.pins / 2) * 2.54 + 2.4;
    g.lineWidth = 0.25; g.strokeRect(ch.x - l / 2 - 0.8, ch.y - 5.4, l + 1.6, 10.8);
    g.beginPath(); g.arc(ch.x - l / 2 - 0.8, ch.y, 1, -Math.PI / 2, Math.PI / 2); g.stroke();
    g.font = '700 2px Arial'; g.textAlign = 'center';
    if (ch.name === 'XR2206') { /* printed inside its outline, see below */ } else if (ch.pins === 8) g.fillText(ch.name, ch.x + l / 2 + 2.5, ch.y - 6.6);
    else g.fillText(ch.name, ch.x, ch.y + 8.3);
    for (const [x, y] of pinEnds(ch)) { g.beginPath(); g.arc(x, y + (y < ch.y ? -1.5 : 1.5), 0.35, 0, 7); g.fill(); }
  }
  ringMm(Q1.x, Q1.y, 3.6); text('Q1', 945, 150, 1.9); text('2n2907', 905, 205, 1.9);
  for (const p of PARTS) {
    if (p.k === 'res') { g.lineWidth = 0.25; if (p.r === 90) g.strokeRect(p.x - 0.9, p.y - 2.8, 1.8, 5.6); else g.strokeRect(p.x - 2.8, p.y - 0.9, 5.6, 1.8); }
    if (p.k === 'preset') ringMm(p.x, p.y, 4.4);
    if (p.k === 'elcoS' || p.k === 'elcoL') ringMm(p.x, p.y, p.k === 'elcoL' ? 6 : 3.8);
  }
  for (const t of TERMS) ringMm(t.x, t.y, t.kind === 'pin' ? 2.2 : 3.6);

  // ---- audio generator
  text('16  15  14', 150, 207, 1.8); text('1    2    3', 150, 240, 1.8); text('9', 300, 207, 1.8); text('8', 300, 240, 1.8);
  text('XR2206', 165, 224, 2.1);
  { const [x0, y0] = px(115, 197), [x1, y1] = px(310, 250); g.lineWidth = 0.28; g.strokeRect(x0, y0, x1 - x0, y1 - y0); }
  text('22K Pr.', 132, 156, 1.9); text('1K Pr.', 205, 150, 1.9); text('1K', 190, 172, 1.8); text('-12V', 330, 108, 1.9);
  text('10', 307, 147, 1.8); text('16', 307, 161, 1.8); vtext('100KP', 345, 142); vtext('10KPr', 330, 232);
  text('-12V', 125, 290, 1.9); text('+12V', 205, 290, 1.9); vtext('22KPr', 148, 345); vtext('47n PPC', 214, 345); vtext('22K', 100, 372); vtext('22KP', 98, 422);
  text('+12V', 182, 410, 1.9); text('8', 165, 452, 1.7); text('1', 165, 492, 1.7); text('5', 265, 452, 1.7); text('-12V', 272, 522, 1.9); vtext('10K Pr', 290, 470);
  text('10', 280, 395, 1.8); text('Sine', 349, 435, 2, 'center', 700); text('O/P', 349, 452, 2, 'center', 700); text('1K5', 150, 556, 1.9);
  line([350, 300, 350, 342]); line([350, 358, 350, 538]); arrow(350, 420, 'down'); ground(350, 556);
  line([115, 270, 380, 270], 0.22); line([128, 250, 128, 300, 200, 300], 0.22); line([308, 380, 340, 380, 340, 300], 0.22); line([100, 565, 205, 565, 205, 500], 0.22);
  text('22KP', 125, 597, 1.9); text('100KP', 300, 597, 1.9); text('AMPLITUDE', 150, 720, 2.2, 'center', 800, true); text('FREQUENCY', 310, 720, 2.2, 'center', 800, true);
  text('0V', 96, 699, 1.9); text('5Vpp', 203, 699, 1.9); text('300Hz', 276, 699, 1.9); text('3.4KHz', 347, 699, 1.9);
  for (const k of [KNOBS.agAmp, KNOBS.agFreq]) {
    g.lineWidth = 0.22;
    for (let i = 0; i <= 30; i++) {
      const a = -Math.PI * 1.25 + (i / 30) * Math.PI * 1.5, r0 = 10.6, r1 = i % 5 ? 11.8 : 12.6;
      g.beginPath(); g.moveTo(k.x + r0 * Math.cos(a), k.y + r0 * Math.sin(a)); g.lineTo(k.x + r1 * Math.cos(a), k.y + r1 * Math.sin(a)); g.stroke();
    }
  }

  // ---- PCM modulator
  text('MOD. I/P', 420, 146, 2.1, 'center', 800, true); boxed('BUFFER', 490, 136, 2); text('741', 487, 168, 1.9); text('10n DC', 512, 110, 1.8); text('10n DC', 512, 244, 1.8);
  vtext('10K', 430, 255); vtext('10K', 462, 255); boxed('COMPARATOR', 475, 298, 2); text('15K', 552, 291, 1.8); vtext('527', 432, 375);
  text('8K2', 440, 436, 1.8); text('2z7', 420, 456, 1.8); boxed('RAMP', 525, 426, 2); text('5K6', 737, 292, 1.8);
  text('S3', 670, 86, 1.9); text('a', 574, 98, 1.8); text('c', 590, 90, 1.8); text('b', 632, 96, 1.8); text('f', 553, 230, 1.8); text('d', 600, 226, 1.8); text('e', 606, 262, 1.8);
  text('-6V', 396, 556, 1.9); text('• -5V', 428, 600, 1.9); text('S4', 401, 606, 1.9); text('3BIT', 478, 604, 2); text('4BIT', 478, 668, 2); arrow(438, 607, 'up'); arrow(438, 682, 'down');
  text('BIT SELECT', 440, 700, 2.2, 'center', 800, true); text('33 pf', 520, 708, 1.9);
  text('S', 544, 528, 1.8); text('0', 546, 544, 1.8); text('a', 540, 557, 1.8); text('b', 580, 557, 1.8); text('e', 610, 557, 1.8); text('f', 650, 550, 1.8); text('S3', 575, 577, 1.9);
  text('c', 685, 640, 1.8); text('d', 667, 657, 1.8); text('1K', 683, 605, 1.8); text('K5', 805, 605, 1.8); text('+6V', 812, 645, 1.9);
  for (const l of LEDS) { const [, y] = px(0, 700); g.font = '700 2px Arial'; g.textAlign = 'center'; g.fillText(`D${l.n}`, l.x, y); }
  text('PCM O/P', 782, 84, 2.1, 'center', 800, true);
  line([410, 177, 410, 222]); line([418, 227, 440, 227, 440, 210, 455, 210]); arrow(452, 210, 'right'); ground(407, 102); line([407, 97, 407, 101]);
  line([770, 110, 800, 110]); line([815, 110, 838, 110]); arrow(836, 110, 'right'); line([807, 120, 807, 160, 795, 160]); arrow(807, 125, 'up');
  ground(810, 312); line([517, 447, 500, 447, 500, 400]); arrow(507, 447, 'left');
  line([722, 752, 722, 720, 640, 720, 640, 705]); arrow(640, 708, 'up'); line([560, 720, 640, 720]); arrow(600, 720, 'left'); arrow(670, 720, 'right');
  line([700, 682, 800, 682, 810, 660], 0.22); line([400, 600, 400, 735], 0.22);

  // ---- PCM demodulator
  text('PCM I/P', 868, 84, 2.1, 'center', 800, true); line([855, 107, 880, 107]); arrow(878, 107, 'right'); line([900, 107, 960, 107]); arrow(950, 107, 'right');
  vtext('10K', 895, 150); vtext('27K', 995, 150); text('560 pf', 897, 226, 1.9); text('C1', 916, 241, 1.9);
  vtext('27K', 868, 300); text('3140', 922, 376, 1.9); vtext('27K', 880, 382); vtext('22K', 940, 396);
  text('10K', 872, 576, 1.9); text('42K', 1000, 533, 1.8); text('10K', 1030, 566, 1.8); text('1K5', 1100, 553, 1.9); vtext('22K', 1148, 505);
  text('RAW', 1262, 515, 2.1, 'center', 800, true); text('DATA', 1262, 535, 2.1, 'center', 800, true);
  line([1220, 527, 1220, 550]); line([1220, 564, 1220, 600, 1210, 610]); arrow(1220, 580, 'down'); line([1120, 520, 1212, 520]);
  line([860, 180, 860, 260, 1000, 260], 0.22); line([1000, 240, 1000, 330], 0.22); arrow(1000, 280, 'down'); line([960, 210, 1040, 210], 0.22); arrow(1030, 210, 'right');

  // ---- filter
  text('Recvd', 868, 650, 2, 'center', 800); text('I/P', 868, 667, 2, 'center', 800); arrow(870, 625, 'up'); arrow(870, 688, 'down'); ground(870, 712);
  line([878, 607, 920, 607, 920, 630]); arrow(885, 607, 'left'); line([878, 705, 960, 705, 960, 680]); arrow(885, 705, 'left');
  text('+5V', 900, 612, 1.8); text('+5V', 1018, 607, 1.8); text('+5V', 1148, 612, 1.8); text('741', 972, 612, 1.8); vtext('741', 1036, 640); vtext('741', 1158, 640);
  vtext('6K8', 988, 620); vtext('1n5', 982, 690); boxed('L.P.F', 1042, 708, 1.9); text('-5V', 948, 708, 1.8); text('-5V', 1078, 708, 1.8); vtext('10n P', 1102, 680);
  text('6K8', 1182, 726, 1.9); text('GAIN', 1246, 603, 2.1, 'center', 800, true); text('47K', 1272, 622, 1.9); text('Pr.', 1276, 636, 1.9); ground(1270, 707);
  line([960, 655, 1010, 655]); line([1095, 655, 1140, 655]); line([1200, 655, 1220, 655, 1220, 620]);

  // ---- power supply
  text('S1', 135, 812, 2); text('230V AC', 150, 862, 2); text('15V', 213, 752, 1.9); text('15V', 196, 876, 1.9); text('1N4002 X 4', 292, 873, 1.9);
  text('D1', 222, 860, 1.7); text('D2', 300, 860, 1.7); text('D3', 300, 762, 1.7); text('D4', 222, 762, 1.7);
  text('1000', 396, 808, 1.8); text('25', 396, 822, 1.8); text('1000', 396, 882, 1.8); text('25', 396, 896, 1.8);
  text('10', 455, 806, 1.8); text('16', 455, 820, 1.8); text('10', 455, 882, 1.8); text('16', 455, 896, 1.8); text('10', 605, 806, 1.8); text('16', 605, 820, 1.8); text('10', 605, 882, 1.8); text('16', 605, 896, 1.8);
  for (const [X, Yp, t] of [[425, 767, '7812'], [425, 935, '7912'], [580, 767, '7805'], [580, 935, '7905']] as const) {
    const [x, y] = px(X, Yp); g.lineWidth = 0.25; g.strokeRect(x - 6, y - 1.2, 12, 2.4); text(t, X, Yp + (Yp < 850 ? 18 : -20), 1.9);
  }
  text('+12V', 548, 800, 1.9); text('-12V', 520, 903, 1.9); text('+5V', 640, 800, 1.9); text('-5V', 645, 903, 1.9); text('ON', 165, 945, 2);
  { const coil = (X: number) => { const [x, y0] = px(X, 772), [, y1] = px(X, 862); const n = 9; g.lineWidth = 0.28; for (let i = 0; i < n; i++) { g.beginPath(); g.arc(x, y0 + (i + 0.5) * ((y1 - y0) / n), (y1 - y0) / n / 2, -Math.PI / 2, Math.PI / 2); g.stroke(); } };
    coil(178); coil(195); line([186, 765, 186, 868], 0.4); }
  line([215, 808, 260, 765, 305, 808, 260, 850, 215, 808]); line([110, 905, 110, 790, 150, 790]); line([100, 850, 120, 850]);
  line([305, 808, 340, 808, 340, 767, 400, 767]); line([450, 767, 505, 767]); line([530, 767, 555, 767]); line([605, 767, 655, 767]);
  line([260, 850, 260, 900, 340, 900, 340, 935, 400, 935]); line([450, 935, 505, 935]); line([530, 935, 555, 935]); line([605, 935, 655, 935]);
  line([340, 852, 690, 852], 0.25); ground(470, 852);

  // ---- sampling pulse generator
  text('SAMP', 738, 790, 2.1, 'center', 800, true); text('CLOCK', 742, 806, 2.1, 'center', 800, true); text('10K', 842, 760, 1.9); text('Pr.', 846, 778, 1.9); text('4K7', 905, 757, 1.8);
  text('+5V', 896, 820, 1.8); text('13', 911, 823, 1.6); text('11', 931, 823, 1.6); text('4011', 790, 857, 2, 'center', 800, true); text('S', 716, 846, 1.9);
  vtext('10pf', 737, 895); text('10K', 857, 920, 1.8); vtext('150K', 920, 880); text('-5V', 896, 905, 1.8);
  text('SLOW', 991, 756, 2.1, 'center', 800); text('FAST', 1000, 881, 2.1, 'center', 800); text('FREQ.', 995, 921, 2.1, 'center', 800, true);
  arrow(990, 785, 'up'); arrow(990, 845, 'down'); line([735, 760, 790, 760]); arrow(745, 760, 'left'); line([820, 770, 1030, 770], 0.25);
  line([705, 820, 705, 940], 0.25); line([700, 830, 720, 845], 0.3); line([955, 850, 965, 870], 0.3); for (const yy of [790, 845]) dot(1015, yy);

  // ---- DC source
  text('VAR DC', 1080, 790, 2.1, 'center', 800); text('0.1DC', 1205, 786, 1.9); text('+12V', 1106, 808, 1.9); text('-12V', 1205, 808, 1.9);
  vtext('100K Pr.', 1050, 842); text('100K', 1262, 808, 1.9); text('Pr.', 1270, 822, 1.9); text('100K Pot', 1232, 902, 1.9); ground(1080, 925);
  line([1092, 762, 1250, 762]); line([1162, 762, 1162, 860]); line([1080, 850, 1080, 868, 1245, 868, 1245, 852]); line([1240, 762, 1250, 762, 1250, 755]);

  // ---- pilot lamp, toggles
  ringMm(TOGGLES.bit3.x, TOGGLES.bit3.y, 4.6); ringMm(TOGGLES.slow.x, TOGGLES.slow.y, 4.6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
