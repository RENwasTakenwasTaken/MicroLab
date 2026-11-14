// Canvas renderers for screens on the bench: PC monitor, oscilloscope,
// multimeter LCD and signal-generator readout. Each returns a CanvasTexture
// that is redrawn only when its content changes.

import * as THREE from 'three';
import type { UploadState } from '../app/bench.ts';

export class CanvasScreen {
  canvas: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  last = '';
  constructor(w: number, h: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w; this.canvas.height = h;
    this.g = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
  }
  /** Returns false when the key is unchanged (skip redraw). */
  begin(key: string) { if (key === this.last) return false; this.last = key; return true; }
  end() { this.texture.needsUpdate = true; }
}

// ------------------------------------------------------------ PC monitor
const KW = /^(void|char|int|unsigned|signed|long|short|float|double|const|rom|ram|static|volatile|extern|struct|union|enum|typedef|if|else|while|for|do|return|break|continue|switch|case|default|sizeof)$/;

function drawCodeLine(g: CanvasRenderingContext2D, line: string, x: number, y: number, cw: number, inComment: boolean): boolean {
  let i = 0;
  const put = (text: string, color: string) => { g.fillStyle = color; g.fillText(text, x + i * cw, y); i += text.length; };
  let rest = line;
  if (inComment) {
    const end = rest.indexOf('*/');
    if (end < 0) { put(rest, '#6a7a8c'); return true; }
    put(rest.slice(0, end + 2), '#6a7a8c'); rest = rest.slice(end + 2);
  }
  if (/^\s*#/.test(rest)) { put(rest, '#f78c6c'); return false; }
  while (rest.length) {
    let m: RegExpMatchArray | null;
    if ((m = rest.match(/^\/\/.*/))) { put(m[0], '#6a7a8c'); rest = ''; }
    else if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/', 2);
      if (end < 0) { put(rest, '#6a7a8c'); return true; }
      put(rest.slice(0, end + 2), '#6a7a8c'); rest = rest.slice(end + 2);
    } else if ((m = rest.match(/^"(?:[^"\\]|\\.)*"?|^'(?:[^'\\]|\\.)*'?/))) { put(m[0], '#a5d6a7'); rest = rest.slice(m[0].length); }
    else if ((m = rest.match(/^(0x[0-9a-fA-F]+|\d+)[uUlL]*/))) { put(m[0], '#f9c97c'); rest = rest.slice(m[0].length); }
    else if ((m = rest.match(/^[A-Za-z_]\w*/))) { put(m[0], KW.test(m[0]) ? '#c792ea' : /^[A-Z][A-Z0-9_]+(bits)?$/.test(m[0]) ? '#82aaff' : '#dbe3ee'); rest = rest.slice(m[0].length); }
    else { put(rest[0], '#9aa7b8'); rest = rest.slice(1); }
  }
  return false;
}

/** What the lab computer shows: MPLAB + HID bootloader (PIC kit) or Keil µVision + SST EasyIAP (8051 kit). */
export interface MonitorIde { title: string; button: string; output: string; taskbar: string; log: string[] }
const MPLAB: Omit<MonitorIde, 'log'> = {
  title: 'MPLAB IDE — Lab Project — main.c   [PIC18F4550 · C18]', button: '⬆ UPLOAD',
  output: 'OUTPUT — USB HID Bootloader', taskbar: 'MPLAB IDE   ·   HID Bootloader',
};

export function drawMonitor(s: CanvasScreen, code: string, up: UploadState, device: string, usb: boolean, power: boolean, ide?: MonitorIde) {
  const T = ide ?? { ...MPLAB, log: up.log };
  const key = JSON.stringify([code.length, code.slice(0, 4000), up.phase, Math.round(up.progress * 20), up.log.length, device, usb, power, ide?.title, ide?.log.length, ide?.log.at(-1)]);
  if (!s.begin(key)) return;
  const g = s.g, W = s.canvas.width, H = s.canvas.height;
  if (!power) { g.fillStyle = '#050607'; g.fillRect(0, 0, W, H); s.end(); return; }
  // desktop
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#0b3a5c'); bg.addColorStop(1, '#09243a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // IDE window
  const x0 = 18, y0 = 14, w = W - 36, h = H - 58;
  g.fillStyle = '#12161c'; g.fillRect(x0, y0, w, h);
  g.fillStyle = '#1d232c'; g.fillRect(x0, y0, w, 34);
  g.font = '600 17px Segoe UI, Arial'; g.fillStyle = '#dbe3ee'; g.textBaseline = 'middle';
  g.fillText(T.title, x0 + 14, y0 + 17);
  g.fillStyle = '#e25555'; g.fillRect(x0 + w - 40, y0 + 6, 30, 22);
  g.fillStyle = '#fff'; g.font = '700 15px Arial'; g.fillText('×', x0 + w - 30, y0 + 17);
  // toolbar
  g.fillStyle = '#171c23'; g.fillRect(x0, y0 + 34, w, 40);
  g.fillStyle = '#2f8f6c'; g.fillRect(x0 + 12, y0 + 41, 120, 26);
  g.fillStyle = '#fff'; g.font = '700 14px Segoe UI, Arial'; g.fillText(T.button, x0 + 30, y0 + 54);
  g.font = '13px Segoe UI, Arial'; g.fillStyle = usb ? '#3fb68b' : '#8592a5';
  g.fillText(`USB: ${usb ? 'cable connected' : 'not connected'}   ·   Device: ${device}`, x0 + 150, y0 + 54);
  // code
  const lines = code.split('\n');
  const lh = 19, cw = 9.6;
  g.font = '15.5px Consolas, "Cascadia Code", monospace';
  let inC = false;
  const top = y0 + 84, maxLines = Math.floor((h - 84 - 120) / lh);
  for (let i = 0; i < Math.min(lines.length, maxLines); i++) {
    const y = top + i * lh + 9;
    g.fillStyle = '#4a5566'; g.textAlign = 'right'; g.fillText(String(i + 1), x0 + 44, y); g.textAlign = 'left';
    inC = drawCodeLine(g, lines[i].replace(/\t/g, '    ').slice(0, 118), x0 + 58, y, cw, inC);
  }
  // output pane
  const oy = y0 + h - 118;
  g.fillStyle = '#0c0f12'; g.fillRect(x0, oy, w, 118);
  g.fillStyle = '#8592a5'; g.font = '600 12px Segoe UI, Arial'; g.fillText(T.output, x0 + 12, oy + 14);
  g.font = '13px Consolas, monospace';
  T.log.slice(-5).forEach((l, i) => {
    g.fillStyle = /error|fail|abort/i.test(l) ? '#ef5b5b' : /complete|successful/i.test(l) ? '#3fb68b' : /→|warning/i.test(l) ? '#e8b04a' : '#b8c2d0';
    g.fillText(l.slice(0, 150), x0 + 12, oy + 36 + i * 17);
  });
  if (['erasing', 'programming', 'verifying'].includes(up.phase)) {
    g.fillStyle = '#26303d'; g.fillRect(x0 + w - 330, oy + 8, 310, 12);
    g.fillStyle = '#4c9df3'; g.fillRect(x0 + w - 330, oy + 8, 310 * up.progress, 12);
  }
  // taskbar
  g.fillStyle = '#0b0e12'; g.fillRect(0, H - 34, W, 34);
  g.fillStyle = '#4c9df3'; g.fillRect(14, H - 26, 18, 18);
  g.fillStyle = '#b8c2d0'; g.font = '13px Segoe UI, Arial'; g.fillText(T.taskbar, 44, H - 17);
  g.fillText(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }), W - 60, H - 17);
  s.end();
}

// ----------------------------------------------------------- oscilloscope
export interface ScopeView {
  traces: ({ pts: { t: number; v: number }[] } | null)[];
  t0: number; t1: number;
  vdiv: [number, number];
  sdiv: number;
  running: boolean;
  triggered: boolean;
  meas: { pkpk: number; freq: number; period: number; rms: number } | null;
  /** input coupling per channel (DC / AC / GND) */
  coupling: [string, string];
  /** side menu: 0 = AUTOSET, 1 / 2 = CH1 / CH2 MENU */
  menu: 0 | 1 | 2;
}

const fmtV = (v: number) => (v >= 1 ? `${v.toFixed(2)}V` : `${(v * 1000).toFixed(0)}mV`);
const fmtS = (s: number) => (s >= 1 ? `${s}s` : s >= 1e-3 ? `${+(s * 1e3).toFixed(2)}ms` : `${+(s * 1e6).toFixed(1)}µs`);

export function drawScope(s: CanvasScreen, v: ScopeView, key: string) {
  if (!s.begin(key)) return;
  const g = s.g, W = s.canvas.width, H = s.canvas.height;
  g.fillStyle = '#f4f5f0'; g.fillRect(0, 0, W, H);
  const gx = 18, gy = 34, gw = W - 150, gh = H - 104;
  // header
  g.fillStyle = '#111'; g.font = '700 20px Arial'; g.textBaseline = 'middle';
  g.fillText('Tek', 8, 17);
  g.font = '15px Arial';
  g.fillText(v.running ? (v.triggered ? 'Trig\'d' : 'Auto') : 'Stop', 120, 17);
  g.fillText('M Pos: 0.000s', 260, 17);
  // graticule
  g.strokeStyle = '#9a9a96'; g.lineWidth = 1;
  g.strokeRect(gx, gy, gw, gh);
  g.setLineDash([2, 4]);
  for (let i = 1; i < 10; i++) { g.beginPath(); g.moveTo(gx + (gw * i) / 10, gy); g.lineTo(gx + (gw * i) / 10, gy + gh); g.stroke(); }
  for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(gx, gy + (gh * i) / 8); g.lineTo(gx + gw, gy + (gh * i) / 8); g.stroke(); }
  g.setLineDash([]);
  // traces: CH1 ground at +1 div above centre, CH2 at 3 div below
  const zero = [gy + gh / 2 - gh / 8, gy + gh / 2 + (3 * gh) / 8];
  v.traces.forEach((tr, ch) => {
    g.fillStyle = '#111'; g.font = '700 13px Arial'; g.fillText(`${ch + 1}→`, 1, zero[ch]);
    g.strokeStyle = ch === 0 ? '#111' : '#333';
    g.lineWidth = 2;
    g.beginPath();
    if (!tr || !tr.pts.length) {
      // open input: a little noise around 0 V
      for (let i = 0; i <= 60; i++) {
        const x = gx + (gw * i) / 60, y = zero[ch] + (Math.random() - 0.5) * 2.2;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
    } else {
      const px = (t: number) => gx + ((t - v.t0) / (v.t1 - v.t0)) * gw;
      const py = (volt: number) => Math.max(gy, Math.min(gy + gh, zero[ch] - (volt / v.vdiv[ch]) * (gh / 8)));
      tr.pts.forEach((p, i) => { const x = px(p.t), y = py(p.v); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    }
    g.stroke();
  });
  // trigger marker
  g.fillStyle = '#111';
  g.beginPath(); g.moveTo(gx + gw / 2 - 6, gy - 7); g.lineTo(gx + gw / 2 + 6, gy - 7); g.lineTo(gx + gw / 2, gy); g.fill();
  // measurements box
  g.font = '15px Arial';
  if (v.meas) {
    g.fillText('CH1', gx + 4, gy + gh - 52);
    g.fillText(`Pk-Pk ${fmtV(v.meas.pkpk)}`, gx + 4, gy + gh - 34);
    g.fillText(`Period ${v.meas.period ? fmtS(v.meas.period) : '?'}`, gx + 4, gy + gh - 16);
    g.fillText(`Cyc RMS ${fmtV(v.meas.rms)}`, gx + gw / 2, gy + gh - 34);
    g.fillText(`Freq ${v.meas.freq ? (v.meas.freq >= 1000 ? `${(v.meas.freq / 1000).toFixed(3)}kHz` : `${v.meas.freq.toFixed(2)}Hz`) : '?'}`, gx + gw / 2, gy + gh - 16);
  }
  // footer: volts/div with the coupling marker (~ = AC, GND = input grounded)
  const mark = (c: string) => (c === 'AC' ? ' ~' : c === 'GND' ? ' GND' : '');
  g.fillText(`CH1 ${fmtV(v.vdiv[0])}${mark(v.coupling[0])}`, gx, H - 52);
  g.fillText(`CH2 ${fmtV(v.vdiv[1])}${mark(v.coupling[1])}`, gx + 130, H - 52);
  g.fillText(`M ${fmtS(v.sdiv)}`, gx + 270, H - 52);
  g.fillText('CH1 ↗ 2.50V', gx + gw - 110, H - 52);
  // side menu
  const mx = gx + gw + 10, mw = W - mx - 8;
  g.strokeStyle = '#555'; g.strokeRect(mx, gy, mw, gh);
  if (v.menu === 0) {
    g.font = '700 15px Arial'; g.fillText('AUTOSET', mx + 14, gy + 18);
    g.font = '14px Arial';
    ['Multi-cycle', 'Single cycle', 'Rising edge', 'Undo Autoset'].forEach((t, i) => g.fillText(t, mx + 10, gy + 70 + i * 62));
  } else {
    // channel menu: five boxes, one beside each option button (the top one sets the coupling)
    const c = v.coupling[v.menu - 1];
    const items: [string, string][] = [['Coupling', c === 'GND' ? 'Ground' : c], ['BW Limit', 'Off'], ['Volts/Div', 'Coarse'], ['Probe', '1X Voltage'], ['Invert', 'Off']];
    g.font = '700 15px Arial'; g.fillText(`CH${v.menu}`, mx + mw / 2 - 14, 17);
    const bh = gh / 5;
    items.forEach(([title, value], i) => {
      const y = gy + i * bh;
      if (i) { g.beginPath(); g.moveTo(mx, y); g.lineTo(mx + mw, y); g.stroke(); }
      g.font = '700 14px Arial'; g.fillText(title, mx + 8, y + bh * 0.35);
      if (i === 0) { g.fillStyle = '#111'; g.fillRect(mx + 6, y + bh * 0.52, mw - 12, 22); g.fillStyle = '#f4f5f0'; }
      g.font = '14px Arial'; g.fillText(value, mx + 10, y + bh * 0.52 + 11);
      g.fillStyle = '#111';
    });
  }
  s.end();
}

// ------------------------------------------------------------------- DMM
const SEG: Record<string, number> = { '0': 0x3f, '1': 0x06, '2': 0x5b, '3': 0x4f, '4': 0x66, '5': 0x6d, '6': 0x7d, '7': 0x07, '8': 0x7f, '9': 0x6f, '-': 0x40, ' ': 0, O: 0x3f, L: 0x38, E: 0x79, r: 0x50, C: 0x39 };

function seven(g: CanvasRenderingContext2D, ch: string, x: number, y: number, w: number, h: number, on: string, off: string) {
  const bits = SEG[ch] ?? 0;
  const t = w * 0.16;
  const segs: [number, number, number, number][] = [
    [x + t, y, w - 2 * t, t], [x + w - t, y + t, t, h / 2 - 1.5 * t], [x + w - t, y + h / 2 + t / 2, t, h / 2 - 1.5 * t],
    [x + t, y + h - t, w - 2 * t, t], [x, y + h / 2 + t / 2, t, h / 2 - 1.5 * t], [x, y + t, t, h / 2 - 1.5 * t], [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  ];
  segs.forEach((sg, i) => { g.fillStyle = (bits >> i) & 1 ? on : off; g.fillRect(...sg); });
}

export function drawDigits(g: CanvasRenderingContext2D, text: string, x: number, y: number, dw: number, dh: number, gap: number, on: string, off: string) {
  let cx = x;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '.') { g.fillStyle = on; g.fillRect(cx - gap * 0.85, y + dh - dw * 0.2, dw * 0.22, dw * 0.2); continue; }
    seven(g, c, cx, y, dw, dh, on, off);
    cx += dw + gap;
  }
}

export function drawDmm(s: CanvasScreen, on: boolean, value: string, unit: string, flags: string[]) {
  if (!s.begin(JSON.stringify([on, value, unit, flags]))) return;
  const g = s.g, W = s.canvas.width, H = s.canvas.height;
  g.fillStyle = '#b8c4b0'; g.fillRect(0, 0, W, H);
  if (on) {
    g.fillStyle = '#1b231a'; g.font = '700 22px Arial'; g.textBaseline = 'middle';
    flags.forEach((f, i) => g.fillText(f, 18 + i * 70, 26));
    drawDigits(g, value.padStart(5, ' '), 40, 52, 52, 96, 14, '#141a14', 'rgba(20,26,20,0.06)');
    g.font = '700 34px Arial'; g.fillText(unit, W - 92, 150);
  }
  s.end();
}

// --------------------------------------------------------- signal generator
export function drawGen(s: CanvasScreen, on: boolean, freq: number) {
  let text = '', unit = 0;
  if (freq >= 1e6) { text = (freq / 1e6).toFixed(3); unit = 2; }
  else if (freq >= 1e3) { text = (freq / 1e3).toFixed(freq >= 1e5 ? 1 : freq >= 1e4 ? 2 : 3); unit = 1; }
  else text = freq >= 100 ? freq.toFixed(1) : freq.toFixed(2);
  if (!s.begin(JSON.stringify([on, text, unit]))) return;
  const g = s.g, W = s.canvas.width, H = s.canvas.height;
  g.fillStyle = '#1a0606'; g.fillRect(0, 0, W, H);
  if (on) drawDigits(g, text.padStart(5, ' '), 16, 18, 42, 76, 12, '#ff3a2a', 'rgba(255,58,42,0.07)');
  s.end();
  return unit;
}
