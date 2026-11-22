// Screen of the TDS1002 (monochrome LCD, 10 x 8 divisions): YT traces, XY display, the FFT math
// waveform, cursors, the readout lines and the side menu beside the option buttons.

import type { CanvasScreen } from '../../lab3d/screens.ts';
import { fmtF, fmtRate, fmtT, fmtV } from './format.ts';
import { fftOn, menuView } from './menus.ts';
import { fftAxis, spectrum, type Acq } from './model.ts';
import { RECORD, type ScopeState } from './state.ts';

const W = 640, H = 480, GX = 22, GY = 42, DIV = 50, GW = 10 * DIV, GH = 8 * DIV, CX = GX + GW / 2, CY = GY + GH / 2;
const BG = '#d3e7ee', INK = '#0e1d28';
const clampY = (y: number) => Math.max(GY, Math.min(GY + GH, y));
const SANS = 'Arial, Helvetica, sans-serif';

function graticule(g: CanvasRenderingContext2D) {
  g.strokeStyle = INK; g.lineWidth = 1;
  g.strokeRect(GX + 0.5, GY + 0.5, GW, GH);
  g.fillStyle = INK;
  for (let i = 1; i < 10; i++) for (let y = GY + 10; y < GY + GH; y += 10) g.fillRect(GX + i * DIV, y, 1, 1);
  for (let j = 1; j < 8; j++) for (let x = GX + 10; x < GX + GW; x += 10) g.fillRect(x, GY + j * DIV, 1, 1);
  // tick marks along the centre lines, five to a division
  for (let x = GX + 10; x < GX + GW; x += 10) g.fillRect(x, CY - 2, 1, 5);
  for (let y = GY + 10; y < GY + GH; y += 10) g.fillRect(CX - 2, y, 5, 1);
}

/** A channel's record against time: one min-max column per pixel, joined to the next (vectors) or sample dots. */
function drawYT(g: CanvasRenderingContext2D, v: Float32Array, vdiv: number, pos: number, dots: boolean) {
  const per = RECORD / GW;
  const Y = (i: number) => CY - (v[i] / vdiv + pos) * DIV;
  g.beginPath();
  if (dots) {
    for (let i = 0; i < RECORD; i += 2) g.rect(GX + i / per, clampY(Y(i)) - 0.7, 1.4, 1.4);
    g.fill();
    return;
  }
  let prev = NaN;
  for (let x = 0; x < GW; x++) {
    const i0 = Math.floor(x * per), i1 = Math.floor((x + 1) * per);
    let lo = Infinity, hi = -Infinity;
    for (let i = i0; i < i1; i++) { const y = Y(i); if (y < lo) lo = y; if (y > hi) hi = y; }
    if (!Number.isNaN(prev)) { if (prev < lo) lo = prev; if (prev > hi) hi = prev; }
    lo = clampY(lo); hi = clampY(hi);
    g.moveTo(GX + x + 0.5, lo - 0.8);
    g.lineTo(GX + x + 0.5, hi + 0.8);
    prev = Y(i1 - 1);
  }
  g.stroke();
}

/** Nothing on the input: a slightly noisy line at the channel's ground level. */
function drawOpen(g: CanvasRenderingContext2D, pos: number) {
  g.beginPath();
  for (let x = 0; x <= GW; x += 4) {
    const y = clampY(CY - pos * DIV + (Math.random() - 0.5) * 2);
    if (x) g.lineTo(GX + x, y); else g.moveTo(GX + x, y);
  }
  g.stroke();
}

function drawXY(g: CanvasRenderingContext2D, sc: ScopeState, a: Acq) {
  const [c1, c2] = sc.ch, v1 = a.ch[0], v2 = a.ch[1];
  g.save();
  g.beginPath(); g.rect(GX, GY, GW, GH); g.clip();
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i < RECORD; i++) {
    const x = CX + ((v1 ? v1[i] / c1.vdiv : 0) + c1.pos) * DIV, y = CY - ((v2 ? v2[i] / c2.vdiv : 0) + c2.pos) * DIV;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  g.restore();
}

function drawFft(g: CanvasRenderingContext2D, sc: ScopeState, a: Acq) {
  const sp = spectrum(a, sc.math.source, sc.math.window);
  if (!sp) return;
  const ax = fftAxis(sc, sp.fs), bin = sp.fs / 2 / sp.db.length, n = sp.db.length;
  g.beginPath();
  let started = false;
  for (let x = 0; x <= GW; x++) {
    const f0 = ax.left + (x / DIV) * ax.hdiv, f1 = f0 + ax.hdiv / DIV;
    if (f1 < 0 || f0 > sp.fs / 2) continue;
    let db: number;
    const b0 = f0 / bin, b1 = f1 / bin;
    if (b1 - b0 < 1) {
      // zoomed in: a bin is wider than a pixel, so join the bin values
      const i = Math.max(0, Math.min(n - 2, Math.floor(b0))), t = Math.max(0, Math.min(1, b0 - i));
      db = sp.db[i] + (sp.db[i + 1] - sp.db[i]) * t;
    } else {
      db = -200;
      for (let i = Math.max(0, Math.floor(b0)); i <= Math.min(n - 1, Math.ceil(b1) - 1); i++) db = Math.max(db, sp.db[i]);
    }
    const y = clampY(CY - (db / 10 + sc.math.vpos) * DIV);
    if (started) g.lineTo(GX + x, y); else { g.moveTo(GX + x, y); started = true; }
  }
  g.stroke();
}

function dashed(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) {
  g.setLineDash([7, 5]); g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.setLineDash([]);
}

function sideMenu(g: CanvasRenderingContext2D, sc: ScopeState) {
  const view = menuView(sc);
  const mx = GX + GW + 8, mw = W - mx - 4, bh = GH / 5;
  g.textAlign = 'center';
  g.font = `700 15px ${SANS}`;
  g.fillText(view.title, mx + mw / 2, 21);
  view.items.forEach((it, i) => {
    if (!it) return;
    const y = GY + i * bh;
    g.strokeStyle = INK; g.lineWidth = 1;
    g.strokeRect(mx + 0.5, y + 0.5, mw, bh - 3);
    g.font = `700 14px ${SANS}`;
    g.fillStyle = INK;
    g.fillText(it.title, mx + mw / 2, y + 17);
    if (it.value !== undefined && it.value.trim()) {
      g.font = `14px ${SANS}`;
      if (it.sel) { g.fillRect(mx + 8, y + 28, mw - 16, 20); g.fillStyle = BG; }
      g.fillText(it.value, mx + mw / 2, y + 39);
      g.fillStyle = INK;
    } else if (it.sel) {
      // a selected item without a value (ACQUIRE: Sample): its whole title goes inverse
      g.fillRect(mx + 6, y + 6, mw - 12, 22); g.fillStyle = BG;
      g.fillText(it.title, mx + mw / 2, y + 17);
      g.fillStyle = INK;
    }
    if (it.more) { g.font = `14px ${SANS}`; g.fillText(it.more, mx + mw / 2, y + 61); }
  });
  g.textAlign = 'left';
}

const mark = (c: string) => (c === 'AC' ? '~' : c === 'GND' ? ' Gnd' : '');

/** Redraws the screen. `key` changes whenever anything shown has changed. */
export function drawScreen(s: CanvasScreen, sc: ScopeState, a: Acq | null, key: string) {
  if (!s.begin(key)) return;
  const g = s.g;
  g.globalAlpha = 1;
  g.fillStyle = BG; g.fillRect(0, 0, W, H);
  g.globalAlpha = 0.4 + 0.6 * sc.contrast;
  g.fillStyle = INK; g.strokeStyle = INK; g.textBaseline = 'middle'; g.textAlign = 'left';
  const fft = fftOn(sc);

  // top line
  g.font = `700 20px ${SANS}`; g.fillText('Tek', 6, 21);
  g.font = `15px ${SANS}`;
  const status = !sc.run ? 'Stop' : a?.triggered ? 'Trig\'d' : sc.trig.mode === 'normal' ? 'Ready' : 'Auto';
  if (status === 'Trig\'d') { g.fillRect(132, 11, 15, 19); g.fillStyle = BG; g.font = `700 14px ${SANS}`; g.fillText('T', 135, 21); g.fillStyle = INK; g.font = `15px ${SANS}`; }
  else if (status === 'Stop') { g.beginPath(); g.arc(140, 21, 6, 0, 7); g.fill(); }
  g.fillText(status, 152, 21);
  if (fft && a) g.fillText(`Pos: ${fmtF(fftAxis(sc, 1 / a.dt).centre)}`, 300, 21);
  else if (!sc.xy) g.fillText(`M Pos: ${fmtT(sc.hpos)}`, 300, 21);

  graticule(g);
  g.lineWidth = 1.5;
  const markers: [string, number][] = [];
  if (fft) {
    if (a) drawFft(g, sc, a);
    markers.push(['M', sc.math.vpos]);
  } else if (sc.xy) {
    if (a) drawXY(g, sc, a);
  } else {
    sc.ch.forEach((c, i) => {
      if (!c.on) return;
      const v = a?.ch[i];
      if (v) drawYT(g, v, c.vdiv, c.pos, sc.dots); else drawOpen(g, c.pos);
      markers.push([String(i + 1), c.pos]);
    });
    const [v1, v2] = a?.ch ?? [null, null];
    if (sc.math.on && v1 && v2) {
      // CH1 + CH2 or CH1 - CH2 on CH1's scale, around the centre line
      const k = sc.math.op === 'sub' ? -1 : 1, m = new Float32Array(RECORD);
      for (let i = 0; i < RECORD; i++) m[i] = v1[i] + k * (v2[i] * sc.ch[0].vdiv) / sc.ch[1].vdiv;
      drawYT(g, m, sc.ch[0].vdiv, 0, sc.dots);
      markers.push(['M', 0]);
    }
    // trigger: level arrow at the right edge, trigger point at the top
    const tc = sc.ch[sc.trig.source];
    if (tc.on) {
      const y = clampY(CY - (sc.trig.level / tc.vdiv + tc.pos) * DIV);
      g.beginPath(); g.moveTo(GX + GW - 9, y); g.lineTo(GX + GW, y - 5); g.lineTo(GX + GW, y + 5); g.fill();
    }
    const tx = Math.max(GX, Math.min(GX + GW, CX - (sc.hpos / sc.sdiv) * DIV));
    g.beginPath(); g.moveTo(tx - 6, GY - 8); g.lineTo(tx + 6, GY - 8); g.lineTo(tx, GY); g.fill();
  }
  g.font = `700 13px ${SANS}`;
  for (const [name, pos] of markers) {
    const y = clampY(CY - pos * DIV);
    g.fillText(name, 1, y);
    g.beginPath(); g.moveTo(12, y - 4); g.lineTo(GX - 1, y); g.lineTo(12, y + 4); g.fill();
  }

  // cursors
  const cu = sc.cursor;
  const cursorsShown = cu.type !== 'off' && !sc.xy && (cu.source === 'math') === fft;
  if (cursorsShown) {
    for (const p of [cu.a, cu.b]) {
      if (cu.type === 'v') { const y = clampY(CY - p * DIV); dashed(g, GX, y, GX + GW, y); }
      else { const x = Math.max(GX, Math.min(GX + GW, CX + p * DIV)); dashed(g, x, GY, x, GY + GH); }
    }
  }

  // readout lines
  g.font = `15px ${SANS}`;
  const y1 = GY + GH + 15, y2 = y1 + 17;
  if (fft && a) {
    g.fillText(`CH${sc.math.source + 1} 10.0dB`, GX, y1);
    g.fillText(`${fmtF(fftAxis(sc, 1 / a.dt).hdiv, 3)} (${fmtRate(1 / a.dt)})`, GX + 130, y1);
    g.fillText(sc.math.window === 'hanning' ? 'Hanning' : sc.math.window === 'flattop' ? 'Flattop' : 'Rectangular', GX + 330, y1);
  } else {
    sc.ch.forEach((c, i) => { if (c.on) g.fillText(`CH${i + 1} ${fmtV(c.vdiv)}${mark(c.coupling)}`, GX + i * 112, y1); });
    g.fillText(sc.xy ? 'XY Mode' : `M ${fmtT(sc.sdiv)}`, GX + 226, y1);
    g.fillText(`CH${sc.trig.source + 1} ${sc.trig.slope === 'rise' ? '/' : String.fromCharCode(92)} ${fmtV(sc.trig.level)}`, GX + 350, y1);
  }
  const note = sc.note && sc.note.until > performance.now() ? sc.note.text : '';
  if (note) g.fillText(note, GX, y2);
  g.textAlign = 'right';
  g.fillText(a?.triggered && a.trigFreq >= 10 ? fmtF(a.trigFreq, 6) : '<10Hz', GX + GW, y2);
  g.textAlign = 'left';

  sideMenu(g, sc);
  g.globalAlpha = 1;
  s.end();
}
