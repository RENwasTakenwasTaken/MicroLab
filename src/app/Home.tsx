// Lab index: experiment list grouped by course outcome, toolchain status.

import { useEffect, useState } from 'react';
import { EXPERIMENTS } from '../experiments/experiments.ts';
import { useLab } from './store.ts';
import { Icon } from '../ui/icons.tsx';

export function Home() {
  const [tc, setTc] = useState<{ xc8: { version: string } | null; sdcc: { version: string } | null } | null | 'down'>(null);
  const sources = useLab((s) => s.sources);
  useEffect(() => {
    fetch('/api/toolchains').then((r) => r.json()).then((t) => { setTc(t); useLab.getState().set({ toolchains: t }); }).catch(() => setTc('down'));
  }, []);
  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <div className="brand-mark"><Icon name="chip" size={20} /></div>
          <div>
            <div className="brand-name">PICT μLab</div>
            <div className="brand-sub"></div>
          </div>
          
        </div>
        
        <div className="tc-status">
          {tc === null && <span className="tag"><span className="spinner" /> checking toolchains</span>}
          {tc === 'down' && <span className="tag err" title="Run: npm run dev">build server offline</span>}
          {/* {tc && tc !== 'down' && (
            <>
              <span className={`tag ${tc.xc8 ? 'ok' : 'err'}`}>MPLAB XC8 {tc.xc8?.version ?? 'missing'}</span>
              <span className={`tag ${tc.sdcc ? 'ok' : 'err'}`}>SDCC {tc.sdcc?.version ?? 'missing'}</span>
            </>
          )} */}
        </div>
      </header>

      <main className="home-main">
        <section className="home-intro">
          <h1>Welcome to Microlab.</h1>
          <p>
            PIC18F4550 kits have so far been tested. 8051, ESP and STM32 are not in our scope.
          </p>
            
        </section>

        {['CO1', 'CO2'].map((co) =>  (
          <section key={co} className="exp-group">
            <h2>{co} <span>{co === 'CO1' ? 'Microcontroller programming & interfacing' : 'System configuration & connectivity'}</span></h2>
            <div className="exp-grid">
              {EXPERIMENTS.filter((e) => e.co === co).map((e) => {
                const ready = e.status === 'ready';
                return (
                  <a key={e.id} className={`exp-card ${ready ? '' : 'planned'}`} href={ready ? `#/exp/${e.id}` : undefined} aria-disabled={!ready}>
                    <div className="exp-card-top">
                      <span className="exp-no">{String(e.no).padStart(2, '0')}</span>
                      <span className={`tag ${e.arch === 'mcs51' ? 'blue' : e.arch === 'pic18' ? 'ok' : ''}`}>{e.mcu}</span>
                      {sources[e.id] !== undefined && <span className="tag warn">edited</span>}
                      {!ready && <span className="tag">planned</span>}
                    </div>
                    <div className="exp-card-title">{e.title}</div>
                    <div className="exp-card-obj">{e.objective}</div>
                    <div className="exp-card-foot">
                      <span>{e.toolchain}</span>
                      {ready ? <span className="go">Open <Icon name="chevronRight" size={14} /></span> : <span className="dim">needs board photos</span>}
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
