// Front panel of the FM MODEM kit: white printing on black, redrawn from the lab's photograph.
// Coordinates are those of the flattened photograph of the printed border, 1300 x 1000 units.

import * as THREE from 'three';
import { SHEET } from './layout.ts';

type Pt = [number, number];

export function fmPanelTexture(): THREE.CanvasTexture {
  const S = 6, c = document.createElement('canvas');
  c.width = SHEET.w * S; c.height = SHEET.h * S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0c0c0d'; g.fillRect(0, 0, c.width, c.height);
  const kx = ((SHEET.w - 2 * SHEET.margin) * S) / 1300, ky = ((SHEET.h - 2 * SHEET.margin) * S) / 1000, o = SHEET.margin * S;
  const X = (x: number) => o + x * kx, Y = (y: number) => o + y * ky;
  g.strokeStyle = g.fillStyle = '#f1f1ee'; g.lineJoin = 'round'; g.lineCap = 'round';
  const line = (pts: Pt[], w = 3, dash?: number[]) => { g.lineWidth = w * kx; g.setLineDash(dash ? dash.map((d) => d * kx) : []); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)))); g.stroke(); g.setLineDash([]); };
  const box = (x0: number, y0: number, x1: number, y1: number, fill = false, w = 3) => { if (fill) g.fillRect(X(x0), Y(y0), (x1 - x0) * kx, (y1 - y0) * ky); else { g.lineWidth = w * kx; g.strokeRect(X(x0), Y(y0), (x1 - x0) * kx, (y1 - y0) * ky); } };
  const dot = (x: number, y: number, r: number, fill = true) => { g.lineWidth = 3 * kx; g.beginPath(); g.arc(X(x), Y(y), r * kx, 0, 7); if (fill) g.fill(); else g.stroke(); };
  const text = (t: string, x: number, y: number, size = 18, bold = true) => { g.font = `${bold ? 700 : 500} ${size * kx}px Arial, Helvetica, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, X(x), Y(y)); };
  const head = (x: number, y: number, dx: number, dy: number, s = 13) => { g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x - dx * s - dy * s * 0.55), Y(y - dy * s + dx * s * 0.55)); g.lineTo(X(x - dx * s + dy * s * 0.55), Y(y - dy * s - dx * s * 0.55)); g.fill(); };

  box(0, 0, 1300, 1000, false, 4);
  box(627, 25, 1112, 122, false, 4); text('FM  MODEM', 870, 77, 64);
  // 8038 modulator
  text('FREQ.  ADJ.', 205, 62, 16);
  dot(480, 107, 11, false); text('+12V', 542, 85);
  line([[196, 110], [469, 110]]);
  for (const x of [308, 378]) { line([[x, 110], [x, 218]]); box(x - 11, 130, x + 11, 190, true); }
  line([[437, 110], [437, 235], [408, 235]]);
  line([[196, 110], [196, 185]]); box(180, 185, 202, 232, true);
  line([[205, 197], [240, 197], [240, 270]]); head(203, 197, -1, 0);
  line([[150, 165], [180, 193]], 3, [9, 8]);
  dot(238, 270, 11); line([[238, 270], [262, 270]]);
  line([[100, 270], [135, 270]]); line([[135, 250], [135, 290]], 4); line([[147, 250], [147, 290]], 4); line([[147, 270], [227, 270]]);
  line([[190, 232], [190, 330]]); box(169, 330, 191, 395, true); line([[180, 395], [180, 526]]);
  line([[100, 412], [180, 412]]);
  dot(168, 537, 11, false); text('- 12 V', 232, 551);
  box(262, 218, 408, 392); text('IC 8038', 336, 300, 20);
  line([[268, 392], [268, 425]]); line([[250, 425], [288, 425]], 4); line([[250, 437], [288, 437]], 4); line([[268, 437], [268, 490]]);
  line([[180, 490], [362, 490]]); line([[322, 392], [322, 447], [362, 447]]);
  line([[362, 437], [362, 492]]); line([[665, 437], [665, 492]]);
  line([[362, 437], [665, 437]]); line([[362, 492], [665, 492]]);
  box(418, 427, 482, 447, true); box(557, 427, 627, 447, true); box(414, 482, 480, 502, true); box(555, 482, 625, 502, true);
  line([[665, 462], [715, 462]]); dot(715, 462, 6);
  line([[408, 362], [452, 362], [452, 415]]); head(452, 426, 0, 1);
  line([[408, 325], [527, 325], [527, 465], [447, 465], [447, 480]]); line([[447, 504], [447, 525]]); head(447, 537, 0, 1);
  // buffer
  line([[408, 262], [560, 262], [560, 215], [612, 215]]); box(612, 205, 680, 225, true); line([[680, 215], [752, 215]]);
  line([[752, 183], [752, 315], [872, 249], [752, 183]]); line([[872, 249], [960, 249]]);
  line([[900, 249], [900, 357], [705, 357], [705, 285], [752, 285]]);
  line([[830, 185], [830, 224]]); line([[830, 274], [830, 315]]);
  text('BUFFER', 918, 193); text('O/P', 1073, 252);
  // signal generator
  box(893, 452, 1037, 563); text('SIGNAL', 965, 493, 19); text('GEN.', 965, 522, 19);
  line([[850, 495], [893, 495]]); line([[1037, 495], [1075, 495]]);
  line([[1100, 436], [1100, 420], [1215, 420], [1215, 445]], 3, [10, 8]); head(1100, 446, 0, 1);
  text('AMPL.  ADJ.', 745, 562); text('FREQ.  ADJ.', 1200, 584);
  // PLL 565 demodulator
  text('FREQ.  ADJ.', 70, 610);
  line([[265, 615], [485, 615]]); line([[320, 615], [320, 742]]);
  line([[374, 615], [374, 742]]); box(363, 625, 385, 695, true);
  line([[345, 702], [400, 640]]); head(404, 636, 0.68, -0.73, 12);
  line([[200, 685], [345, 685]], 3, [10, 8]);
  line([[485, 615], [485, 650]]); line([[463, 650], [507, 650]], 4); line([[463, 662], [507, 662]], 4); line([[485, 662], [485, 775]]);
  line([[374, 715], [432, 715]]); line([[432, 695], [432, 735]], 4); line([[444, 695], [444, 735]], 4); line([[444, 715], [485, 715]]);
  box(290, 742, 412, 895); text('PLL', 352, 805, 20); text('565', 352, 833, 20);
  line([[130, 775], [228, 775]]); line([[228, 750], [228, 800]], 4); line([[240, 750], [240, 800]], 4); line([[240, 775], [290, 775]]);
  line([[412, 775], [520, 775]]); text('O/P', 628, 787); text('I/P', 42, 768);
  line([[290, 845], [215, 845], [215, 885]]); line([[192, 885], [238, 885]], 4);
  line([[320, 895], [320, 930]]); line([[300, 930], [340, 930]], 4); line([[300, 942], [340, 942]], 4); line([[320, 942], [320, 962]]);
  line([[412, 845], [440, 845], [440, 880]]);
  // filter, ground, power
  line([[830, 682], [888, 682]]); line([[888, 620], [888, 760], [1005, 688], [888, 620]]); line([[1005, 688], [1060, 688]]);
  line([[965, 622], [965, 664]]); line([[965, 712], [965, 756]]);
  text('I/P', 780, 752); text('O/P', 1078, 752); text('FILTER', 955, 797, 19);
  box(1152, 730, 1248, 840); line([[1200, 795], [1200, 815]]); line([[1178, 815], [1222, 815]], 4); text('GND.', 1195, 866);
  text('POWER ON', 708, 947); text('M/s. KASHTRONICA', 1068, 945, 34);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
