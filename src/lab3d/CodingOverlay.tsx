// The lab computer's screen in coding mode: a real Monaco editor placed exactly
// over the 3D monitor, with UPLOAD (USB HID bootloader) and a close (X) button.

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import { useBench, usbConnected } from '../app/bench.ts';
import { buildOnly, cancelUpload, deviceReady, resetDevice, upload } from '../app/upload.ts';
import { EDITOR_FONT, useFrame, useLab } from '../app/store.ts';
import { CodeEditor } from '../ide/Editor.tsx';
import { Icon } from '../ui/icons.tsx';

export const useScreenRect = create<{ rect: { x: number; y: number; w: number; h: number } | null; set(r: { x: number; y: number; w: number; h: number } | null): void }>((set) => ({
  rect: null,
  set: (rect) => set({ rect }),
}));

const PHASE_TEXT: Record<string, string> = {
  idle: 'Ready', compiling: 'Compiling…', 'compile-error': 'Compilation failed', built: 'Build successful', waiting: 'Waiting for device…',
  erasing: 'Erasing…', programming: 'Programming…', verifying: 'Verifying…', done: 'Upload complete', error: 'Communication error',
};

export function CodingOverlay({ expId }: { expId: string }) {
  const rect = useScreenRect((s) => s.rect);
  const view = useBench((s) => s.view);
  const up = useBench((s) => s.upload);
  const usb = useBench((s) => s.plugs['usb:b']?.attachedTo === 'usb:board');
  const mode = useFrame((s) => s.frame?.device.mode);
  const ready = usb && mode === 'bootloader';
  const font = useLab((s) => s.editorFont);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [up.log]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && useBench.getState().view === 'computer' && !useBench.getState().carrying) useBench.getState().setView('lab'); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  if (view !== 'computer' || !rect) return null;
  const busy = ['compiling', 'erasing', 'programming', 'verifying'].includes(up.phase);
  const scale = Math.max(0.62, Math.min(1, rect.w / 1000));
  return (
    <div className="pc-overlay" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, fontSize: 13 * scale }}>
      <div className="pc-title">
        <span className="pc-app">MPLAB IDE</span>
        <span className="pc-file">Lab Project — main.c · PIC18F4550 · C18 conventions</span>
        <button className="pc-close" title="Close (back to the lab bench)" onClick={() => useBench.getState().setView('lab')}><Icon name="x" /></button>
      </div>
      <div className="pc-toolbar">
        <button className="pc-btn pc-build" disabled={busy} onClick={() => buildOnly(expId)} title="Compile only (Ctrl+B)">
          <Icon name="hammer" /> BUILD
        </button>
        <button className="pc-upload" disabled={busy} onClick={() => upload(expId)} title="Compile and program the board through the USB HID bootloader">
          <Icon name="download" /> UPLOAD
        </button>
        {up.phase === 'waiting' && <button className="pc-btn" onClick={cancelUpload}>Cancel</button>}
        <button className="pc-btn" disabled={!ready} onClick={resetDevice} title="Bootloader command: leave bootloader mode and run the application">Reset Device</button>
        <span className={`pc-chip ${usb ? 'ok' : ''}`}><Icon name="cable" size={12} /> USB {usb ? 'connected' : 'not connected'}</span>
        <span className={`pc-chip ${ready ? 'ok' : mode === 'running' ? 'blue' : ''}`}>
          <Icon name="chip" size={12} /> {!usb ? 'device not detected' : ready ? 'HID Bootloader attached' : mode === 'off' ? 'board power off' : 'not in bootloader mode'}
        </span>
        <span className={`pc-phase ${up.phase}`}>{PHASE_TEXT[up.phase]}</span>
        <span className="pc-font" title={`Editor font: ${font}px`}>
          <button className="pc-btn" disabled={font <= EDITOR_FONT.min} onClick={() => useLab.getState().setEditorFont(font - 1)} title="Smaller editor font">A−</button>
          <button className="pc-btn" disabled={font >= EDITOR_FONT.max} onClick={() => useLab.getState().setEditorFont(font + 1)} title="Larger editor font">A+</button>
        </span>
      </div>
      <div className="pc-editor"><CodeEditor expId={expId} /></div>
      <div className="pc-output">
        {['erasing', 'programming', 'verifying'].includes(up.phase) && <div className="pc-progress"><div style={{ width: `${up.progress * 100}%` }} /></div>}
        <div className="pc-log" ref={logRef}>
          {up.log.length === 0 && <div className="dim">Write your program, click BUILD to check it compiles, then UPLOAD. The board must be connected over USB and in bootloader mode.</div>}
          {up.log.map((l, i) => <div key={i} className={/error|fail|abort/i.test(l) ? 'c-err' : /complete|successful|attached/i.test(l) ? 'c-ok' : /→|warning/.test(l) ? 'c-warn' : ''}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

/** One-line status used by the workflow guide. */
export function workflowStatus() {
  const lab = useLab.getState();
  const f = useFrame.getState().frame;
  return { build: lab.build, usb: usbConnected(), ready: deviceReady(), mode: f?.device.mode, seq: f?.device.bootSeq, flashed: f?.device.flashed };
}
