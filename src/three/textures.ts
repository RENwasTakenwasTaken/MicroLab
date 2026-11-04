// Procedural canvas textures: PCB silkscreen, IC markings, LED glow and the LCD glass.

import * as THREE from 'three';
import { BASE, LABELS, MODULE, PARTS, SECTIONS } from './layout.ts';
import { glyphRows } from './font5x7.ts';
import type { LcdSnapshot } from '../sim/board/hd44780.ts';

const PX = 12; // texture pixels per mm

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function seeded(seed: number) {
  return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
}

/** Silkscreen + solder mask for the base board or the PIC module. */
export function silkscreenTexture(module: boolean): THREE.CanvasTexture {
  const area = module ? MODULE : { x: 0, y: 0, w: BASE.w, h: BASE.h };
  const [c, g] = canvas(Math.round(area.w * PX), Math.round(area.h * PX));
  const tx = (x: number) => (x - area.x) * PX;
  const ty = (y: number) => (y - area.y) * PX;
  // solder mask
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, module ? '#1f7a45' : '#1c6e3d');
  grad.addColorStop(1, module ? '#1a6b3c' : '#175f34');
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  // copper traces under the mask (decorative, deterministic)
  const rnd = seeded(module ? 7 : 3);
  g.strokeStyle = module ? 'rgba(80,170,100,0.22)' : 'rgba(70,160,95,0.2)';
  g.lineWidth = 0.45 * PX;
  g.lineCap = 'round';
  for (let i = 0; i < (module ? 70 : 140); i++) {
    let x = rnd() * c.width, y = rnd() * c.height;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 3; k++) {
      const len = (4 + rnd() * 22) * PX;
      const dir = Math.floor(rnd() * 8) * (Math.PI / 4);
      x += Math.cos(dir) * len; y += Math.sin(dir) * len;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  // vias
  g.fillStyle = 'rgba(200,190,120,0.35)';
  for (let i = 0; i < (module ? 60 : 120); i++) {
    g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, 0.35 * PX, 0, Math.PI * 2); g.fill();
  }
  // section outlines
  g.strokeStyle = 'rgba(235,240,235,0.85)';
  g.lineWidth = 0.28 * PX;
  for (const s of SECTIONS) {
    if (!!s.onModule !== module) continue;
    g.strokeRect(tx(s.x), ty(s.y), s.w * PX, s.h * PX);
  }
  if (module) g.strokeRect(0.6 * PX, 0.6 * PX, (area.w - 1.2) * PX, (area.h - 1.2) * PX);
  // component outlines / pads
  g.strokeStyle = 'rgba(235,240,235,0.55)';
  g.lineWidth = 0.18 * PX;
  for (const p of PARTS) {
    if (!!p.onModule !== module) continue;
    if (p.kind === 'tact') {
      const s = (p.size ?? 6) + 1.2;
      g.strokeRect(tx(p.x - s / 2), ty(p.y - s / 2), s * PX, s * PX);
    } else if (p.kind === 'led') {
      g.beginPath(); g.arc(tx(p.x), ty(p.y), 2 * PX, 0, Math.PI * 2); g.stroke();
    }
  }
  // text
  g.fillStyle = '#f2f4ee';
  g.textBaseline = 'middle';
  for (const l of LABELS) {
    if (!!l.onModule !== module) continue;
    g.save();
    g.translate(tx(l.x), ty(l.y));
    g.rotate(((l.rot ?? 0) * Math.PI) / 180);
    g.font = `${l.bold ? '700' : '500'} ${l.size * PX}px "Arial Narrow", Arial, sans-serif`;
    g.textAlign = l.align ?? 'center';
    g.fillText(l.text, 0, 0);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const chipCache = new Map<string, THREE.CanvasTexture>();
/** Laser-etched marking on an IC top face. w/h in mm. */
export function chipTexture(label: string, sub: string | undefined, w: number, h: number): THREE.CanvasTexture {
  const key = `${label}|${sub}|${w}|${h}`;
  const hit = chipCache.get(key);
  if (hit) return hit;
  const s = 24;
  const [c, g] = canvas(Math.round(w * s), Math.round(h * s));
  g.fillStyle = '#16171a';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(200,205,210,0.75)';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fs = Math.min(h * 0.26, (w / Math.max(6, label.length)) * 1.6) * s;
  g.font = `600 ${fs}px Arial, sans-serif`;
  g.fillText(label, c.width / 2, c.height * (sub ? 0.42 : 0.5));
  if (sub) {
    g.font = `500 ${fs * 0.72}px Arial, sans-serif`;
    g.fillText(sub, c.width / 2, c.height * 0.68);
  }
  // pin-1 notch dimple
  g.fillStyle = 'rgba(0,0,0,0.6)';
  g.beginPath(); g.arc(0, c.height / 2, Math.min(c.height * 0.12, 1.2 * s), -Math.PI / 2, Math.PI / 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.beginPath(); g.arc(1.6 * s, c.height * 0.78, 0.5 * s, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  chipCache.set(key, tex);
  return tex;
}

let glow: THREE.CanvasTexture | null = null;
export function glowTexture() {
  if (glow) return glow;
  const [c, g] = canvas(64, 64);
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  glow = new THREE.CanvasTexture(c);
  return glow;
}

// ------------------------------------------------------------------ LCD
export const LCD_CANVAS = { w: 760, h: 200 };

export class LcdRenderer {
  canvas: HTMLCanvasElement;
  texture: THREE.CanvasTexture;
  private g: CanvasRenderingContext2D;
  private last = '';

  constructor() {
    const [c, g] = canvas(LCD_CANVAS.w, LCD_CANVAS.h);
    this.canvas = c; this.g = g;
    this.texture = new THREE.CanvasTexture(c);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 8;
    this.draw(null, false, 0.6, false);
  }

  /** Redraws only when the visible state changes. */
  draw(lcd: LcdSnapshot | null, power: boolean, contrast: number, blinkPhase: boolean) {
    const key = JSON.stringify([lcd?.rows, lcd?.displayOn, lcd?.cursor, lcd?.blink && blinkPhase, lcd?.cursorCol, lcd?.cursorRow, lcd?.initialized, lcd?.cgram, power, Math.round(contrast * 50)]);
    if (key === this.last) return;
    this.last = key;
    const g = this.g;
    const { w, h } = LCD_CANVAS;
    // backlight
    const bg = g.createLinearGradient(0, 0, 0, h);
    if (power) { bg.addColorStop(0, '#a9cf4a'); bg.addColorStop(1, '#93bd38'); }
    else { bg.addColorStop(0, '#5f6e45'); bg.addColorStop(1, '#55633d'); }
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);
    const dot = 6.6, gap = 1.1, pitch = dot + gap;
    const cw = 5 * pitch, ch = 8 * pitch, colGap = 5.6, rowGap = 16;
    const x0 = (w - (16 * cw + 15 * colGap)) / 2;
    const y0 = (h - (2 * ch + rowGap)) / 2;
    // contrast: ~0.6 ideal. Low -> faint pixels, high -> "off" pixels darken too
    const on = power ? Math.min(1, Math.max(0, (contrast - 0.15) / 0.45)) : 0;
    const off = power ? Math.max(0, (contrast - 0.7) / 0.3) * 0.75 : 0;
    const px = (a: number) => `rgba(28,40,12,${a.toFixed(3)})`;
    for (let r = 0; r < 2; r++) {
      for (let col = 0; col < 16; col++) {
        let rows: number[];
        let blockAll = false;
        if (!power) rows = new Array(8).fill(0);
        else if (!lcd || !lcd.initialized) { rows = new Array(8).fill(0); blockAll = r === 0; }
        else if (!lcd.displayOn) rows = new Array(8).fill(0);
        else {
          const code = lcd.rows[r][col];
          rows = code < 0 ? new Array(8).fill(0) : glyphRows(code, lcd.cgram);
          if (lcd.cursorRow === r && lcd.cursorCol === col) {
            if (lcd.cursor) rows[7] = 0x1f;
            if (lcd.blink && blinkPhase) rows = new Array(8).fill(0x1f);
          }
        }
        const cx = x0 + col * (cw + colGap), cy = y0 + r * (ch + rowGap);
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 5; x++) {
            const lit = blockAll ? true : (rows[y] >> (4 - x)) & 1;
            const a = blockAll ? Math.max(0.05, Math.min(0.85, (contrast - 0.35) * 2.2)) : lit ? 0.12 + on * 0.8 : 0.06 + off;
            g.fillStyle = px(a);
            g.fillRect(cx + x * pitch, cy + y * pitch, dot, dot);
          }
        }
      }
    }
    // glass sheen
    const sheen = g.createLinearGradient(0, 0, w, h);
    sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, w, h);
    this.texture.needsUpdate = true;
  }
}
