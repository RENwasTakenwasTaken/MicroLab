// The lab computer for the 8051 kit: Keil µVision 5 (editor, Options for Target, Build with
// the Build Output window) and SST EasyIAP (Detect MCU, Download) as two programs on the
// monitor, switched from the title bar. A simplified practice mock-up of the PICT lab's tools.

import { useEffect, useRef, useState } from 'react';
import { useBench } from '../app/bench.ts';
import { COM_NAME, DETECT_WINDOW_MS, HEX_PATH, cancelDetect, detectMcu, downloadHex, hexUpToDate, keilBuild } from '../app/upload51.ts';
import { EDITOR_FONT, useLab } from '../app/store.ts';
import { CodeEditor } from '../ide/Editor.tsx';
import { Icon } from '../ui/icons.tsx';

const setKeil = (p: Partial<ReturnType<typeof useBench.getState>['keil']>) => useBench.setState({ keil: { ...useBench.getState().keil, ...p } });

const lineClass = (l: string) =>
  /error|fail|cannot|not detected|no com port|not created/i.test(l) && !/ 0 Error/.test(l) ? 'c-err'
    : /0 Error\(s\)|complete|detected:|Target detected|creating hex/i.test(l) ? 'c-ok'
      : /warning|note:|→|press reset/i.test(l) ? 'c-warn' : '';

function OptionsDialog() {
  const createHex = useBench((s) => s.keil.createHex);
  const [hex, setHex] = useState(createHex);
  const close = (save: boolean) => setKeil({ optionsOpen: false, ...(save ? { createHex: hex } : {}) });
  return (
    <div className="k51-modal" role="dialog" aria-label="Options for Target 'Target 1'">
      <div className="k51-dlg">
        <div className="k51-dlg-title">Options for Target &apos;Target 1&apos;</div>
        <div className="k51-tabs"><span>Device</span><span>Target</span><span className="on">Output</span><span>Listing</span><span>C51</span><span>BL51 Locate</span><span>Debug</span></div>
        <div className="k51-dlg-body">
          <div className="k51-row"><span>Device:</span><b>SST89E516RD2</b><span className="dim">(Target tab: Xtal 11.0592 MHz)</span></div>
          <div className="k51-row"><span>Select Folder for Objects…</span><code>.\Objects\</code></div>
          <div className="k51-row"><span>Name of Executable:</span><code>lab</code></div>
          <label className="k51-check">
            <input type="checkbox" checked={hex} onChange={(e) => setHex(e.target.checked)} /> Create HEX File
            <span className="dim">&nbsp;HEX Format: HEX-80</span>
          </label>
          <p className="dim">SST EasyIAP downloads the Intel HEX file <code>{HEX_PATH}</code>. Without this option µVision builds the program but writes no HEX file.</p>
        </div>
        <div className="k51-dlg-foot">
          <button className="pc-btn" onClick={() => close(true)}>OK</button>
          <button className="pc-btn" onClick={() => close(false)}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function EasyIap({ expId }: { expId: string }) {
  const iap = useBench((s) => s.iap);
  const up = useBench((s) => s.upload);
  const hexFile = useBench((s) => s.keil.hexFile);
  const usb = useBench((s) => s.plugs['usb:b']?.attachedTo === 'usb:uart');
  const source = useLab((s) => s.sources[expId]);
  const [, tick] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [iap.log]);
  useEffect(() => {
    if (!iap.waitUntil) return;
    const id = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [iap.waitUntil]);
  const busy = ['erasing', 'programming', 'verifying'].includes(up.phase);
  const left = iap.waitUntil ? Math.max(0, Math.ceil((iap.waitUntil - Date.now()) / 1000)) : 0;
  void source; // re-render when the editor text changes (HEX up-to-date check)
  const fresh = hexUpToDate(expId);
  return (
    <div className="iap">
      <div className="iap-menu"><span>File</span><span>Detect Chip/RS232</span><span>IAP Operation</span><span>Help</span><span className="iap-name">SST EasyIAP · FlashFlex51 In-Application Programming</span></div>
      <div className="iap-body">
        <div className="iap-grid">
          <label>Target MCU</label>
          <select value="SST89E516RD2" onChange={() => {}} title="The lab kit's microcontroller"><option>SST89E516RD2</option></select>
          <label>COM port</label>
          <select value={usb ? 'COM3' : ''} onChange={() => {}} title={usb ? COM_NAME : 'No COM port: plug the USB cable into the USB2UART port of the board'}>
            {usb ? <option value="COM3">{COM_NAME}</option> : <option value="">(no COM port found)</option>}
          </select>
          <label>Baud rate</label>
          <select value="9600" onChange={() => {}}><option>9600</option></select>
          <label>HEX file</label>
          <span className={`iap-file ${hexFile ? '' : 'c-err'}`}>
            {HEX_PATH} {hexFile ? <span className={fresh ? 'dim' : 'c-warn'}>({hexFile.bytes} bytes, built {new Date(hexFile.at).toLocaleTimeString('en-GB')}{fresh ? '' : ' · older than main.c'})</span> : <span>(not found: build with Create HEX File)</span>}
          </span>
        </div>
        <div className="iap-actions">
          {iap.waitUntil ? (
            <>
              <span className="iap-wait"><span className="spinner" /> Press RESET on the target board… {left} s</span>
              <button className="pc-btn" onClick={cancelDetect}>Cancel</button>
            </>
          ) : (
            <button className="pc-btn iap-detect" disabled={busy} onClick={() => detectMcu()} title="Open COM3 and call the chip's IAP boot firmware: press RESET on the board when asked">
              <Icon name="chip" size={13} /> Detect MCU
            </button>
          )}
          <button className="pc-upload iap-download" disabled={busy || !!iap.waitUntil} onClick={() => downloadHex(expId)} title={`Erase, program and verify ${HEX_PATH}`}>
            <Icon name="download" /> Download
          </button>
          <span className={`pc-chip ${iap.detected ? 'ok' : 'off'}`}>{iap.detected ? 'SST89E516RD2 detected' : 'Target not detected'}</span>
        </div>
        {(busy || up.phase === 'done') && <div className="pc-progress"><div style={{ width: `${up.progress * 100}%` }} /></div>}
        <div className="pc-log iap-log" ref={logRef}>
          {iap.log.length === 0 && <div className="dim">1. Detect MCU, then press RESET on the board within {DETECT_WINDOW_MS / 1000} s. 2. Download {HEX_PATH}. 3. Press RESET to run the program.</div>}
          {iap.log.map((l, i) => <div key={i} className={lineClass(l)}>{l}</div>)}
        </div>
      </div>
    </div>
  );
}

export function Keil51Overlay({ expId, rect }: { expId: string; rect: { x: number; y: number; w: number; h: number } }) {
  const k = useBench((s) => s.keil);
  const usb = useBench((s) => s.plugs['usb:b']?.attachedTo === 'usb:uart');
  const font = useLab((s) => s.editorFont);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [k.log]);
  const scale = Math.max(0.62, Math.min(1, rect.w / 1000));
  const app = k.app;
  return (
    <div className="pc-overlay pc51" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h, fontSize: 13 * scale }}>
      <div className="pc-title">
        <span className="k51-apps" role="tablist">
          <button className={`k51-app ${app === 'keil' ? 'on' : ''}`} role="tab" aria-selected={app === 'keil'} onClick={() => setKeil({ app: 'keil' })} title="Keil µVision 5: write and build the program">µVision</button>
          <button className={`k51-app ${app === 'iap' ? 'on' : ''}`} role="tab" aria-selected={app === 'iap'} onClick={() => setKeil({ app: 'iap' })} title="SST EasyIAP: detect the MCU and download the HEX file">SST EasyIAP</button>
        </span>
        <span className="pc-file" title="C:\Lab\lab.uvprojx — main.c · SST89E516RD2">{app === 'keil' ? 'lab.uvprojx — main.c · SST89E516RD2 · 11.0592 MHz' : `${HEX_PATH} → SST89E516RD2`}</span>
        {app === 'keil' && (
          <>
            <button className="pc-btn k51-options" onClick={() => setKeil({ optionsOpen: true })} title="Options for Target 'Target 1' (Alt+F7)"><Icon name="settings" size={13} /> Options</button>
            <button className="pc-btn pc-build" disabled={k.phase === 'building'} onClick={() => keilBuild(expId)} title="Build (F7)"><Icon name="hammer" /> Build</button>
          </>
        )}
        <span className={`pc-chip ${usb ? 'ok' : 'off'}`} title={usb ? COM_NAME : 'No COM port'}><Icon name="chip" size={12} /> {usb ? 'COM3 (CP210x)' : 'No COM port'}</span>
        {app === 'keil' && <span className={`pc-phase ${k.phase === 'failed' ? 'error' : k.phase === 'ok' ? 'done' : ''}`}>{{ idle: 'Ready', building: 'Building…', ok: k.createHex ? 'Build OK · HEX created' : 'Build OK · no HEX file', failed: 'Build failed' }[k.phase]}</span>}
        <span className="pc-font" title={`Editor font: ${font}px`}>
          <button className="pc-btn" disabled={font <= EDITOR_FONT.min} onClick={() => useLab.getState().setEditorFont(font - 1)} title="Smaller editor font">A−</button>
          <button className="pc-btn" disabled={font >= EDITOR_FONT.max} onClick={() => useLab.getState().setEditorFont(font + 1)} title="Larger editor font">A+</button>
        </span>
        <button className="pc-close" title="Close (back to the lab bench)" onClick={() => useBench.getState().setView('lab')}><Icon name="x" /></button>
      </div>
      {/* the editor stays mounted while EasyIAP is in front (keeps its undo history) */}
      <div className="pc-editor" style={{ display: app === 'keil' ? undefined : 'none' }}><CodeEditor expId={expId} /></div>
      {app === 'keil' && (
        <div className="pc-output">
          <div className="k51-out-title">Build Output</div>
          <div className="pc-log" ref={logRef}>
            {k.log.length === 0 && <div className="dim">Options → Output → tick Create HEX File, then Build (F7). Switch to SST EasyIAP (title bar) to download {HEX_PATH} to the board.</div>}
            {k.log.map((l, i) => <div key={i} className={lineClass(l)}>{l}</div>)}
          </div>
        </div>
      )}
      {app === 'iap' && <EasyIap expId={expId} />}
      {k.optionsOpen && <OptionsDialog />}
    </div>
  );
}
