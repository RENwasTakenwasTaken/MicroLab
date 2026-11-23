// Front panel of the Analog Sampling and Reconstruction Board, redrawn from the lab's photograph
// (coordinates are that photograph's pixels): coloured blocks on green, black header.

import * as THREE from 'three';
import { KNOBS, PHOTO, SHEET } from './layout.ts';

type Pt = [number, number];

export function pamPanelTexture(): THREE.CanvasTexture {
  const S = 7, c = document.createElement('canvas');
  c.width = SHEET.w * S; c.height = SHEET.h * S;
  const g = c.getContext('2d')!;
  const k = c.width / PHOTO.w;
  g.scale(k, k);
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const text = (t: string, x: number, y: number, size = 17, color = '#1c1c1c', weight = 600) => { g.fillStyle = color; g.font = `${weight} ${size}px Arial, Helvetica, sans-serif`; g.fillText(t, x, y); };
  const block = (x0: number, y0: number, x1: number, y1: number, fill: string) => { g.fillStyle = fill; g.fillRect(x0, y0, x1 - x0, y1 - y0); g.strokeStyle = '#1c1c1c'; g.lineWidth = 2.5; g.setLineDash([]); g.strokeRect(x0, y0, x1 - x0, y1 - y0); };
  const dashed = (pts: Pt[]) => { g.strokeStyle = '#1c1c1c'; g.lineWidth = 2.5; g.setLineDash([11, 8]); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); g.setLineDash([]); };

  g.fillStyle = '#b4d39a'; g.fillRect(0, 0, PHOTO.w, PHOTO.h);
  // header
  g.fillStyle = '#141414'; g.fillRect(0, 0, PHOTO.w, 88);
  g.fillStyle = '#f2f2f0'; g.beginPath(); g.arc(163, 50, 40, 0, 7); g.fill();
  text('PICT', 163, 50, 22, '#1f5fa8', 800);
  text('Pune Institute of Computer Technology', 655, 12, 22, '#f2f2f0', 500);
  text('Department of Electronics & Telecommunication', 655, 40, 24, '#f2f2f0', 500);
  text('Analog Sampling and Reconstruction Board', 655, 70, 34, '#3a9be0', 800);
  // the four blocks
  const BEIGE = '#e6c3a3', BLUE = '#a9cee2', RED = '#d6392c', NAVY = '#1f4a73';
  block(10, 92, 630, 485, BEIGE); text('AUDIO GENERATOR', 365, 142, 26, RED, 700);
  block(690, 90, 1310, 472, BLUE); text('MODULATOR', 945, 133, 26, NAVY, 700);
  block(15, 525, 640, 955, BEIGE); text('GATING PULSE GENERATOR', 330, 568, 26, RED, 700);
  block(695, 515, 1310, 950, BLUE); text('DEMODULATOR', 955, 545, 26, NAVY, 700);
  // signal paths printed on the panel
  dashed([[590, 165], [700, 165]]);
  dashed([[605, 600], [655, 600], [655, 318], [700, 318]]);
  dashed([[1175, 168], [1250, 168], [1250, 488], [675, 488], [675, 608], [710, 608]]);
  dashed([[1205, 237], [1250, 237]]); dashed([[1180, 305], [1250, 305]]);
  // socket labels
  text('Message Signal', 545, 212); text('GND', 580, 388);
  text('Gating Pulse Signal', 545, 656);
  text('Natural Sampled Signal', 1022, 196, 16); text('Sample & Hold Signal', 1000, 262, 16); text('Flat top sampled Signal', 1085, 356, 16);
  text('Modulated Signal', 767, 662); text('Recovered message signal', 1103, 660);
  g.strokeStyle = '#1c1c1c'; g.lineWidth = 2.5;
  for (const [w, y] of [[22, 452], [14, 459], [6, 466]]) { g.beginPath(); g.moveTo(1163 - w, y); g.lineTo(1163 + w, y); g.stroke(); }
  // pots: printed ring, tag and legend
  const legend: Record<string, string[]> = { p1: ['Amplitude Adjust', '(0-5V)'], p2: ['Frequency Adjust', '(300Hz-3.4KHz)'], p3: ['Frequency Adjust', '(2KHz-32KHz)'], p4: ['Pulse Width Adjust'] };
  for (const kn of KNOBS) {
    g.strokeStyle = '#1c1c1c'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(kn.x + 22, kn.y + 12, 62, 0, 7); g.stroke();
    text(kn.tag, kn.x + 24, kn.y - 68, 19, '#1c1c1c', 700);
    legend[kn.id].forEach((line, i) => text(line, kn.x + 22, kn.y + 94 + i * 26, 18));
  }
  // corner screws
  for (const [x, y] of [[37, 37], [1272, 30], [75, 965], [1272, 950]]) {
    g.fillStyle = '#c9c7bf'; g.beginPath(); g.arc(x, y, 17, 0, 7); g.fill();
    g.strokeStyle = '#6d6b64'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 11, y - 6); g.lineTo(x + 11, y + 6); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
