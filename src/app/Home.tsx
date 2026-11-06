// Lab index: experiment list grouped by course outcome.

import { EXPERIMENTS } from '../experiments/experiments.ts';
import { useLab } from './store.ts';
import { Icon } from '../ui/icons.tsx';

export function Home() {
  const sources = useLab((s) => s.sources);
  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <div className="brand-mark"><Icon name="chip" size={20} /></div>
          <div>
            <div className="brand-name">PICT KA μLab</div>
            <div className="brand-sub"></div>
          </div>
          
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
                  <a key={e.id} className={`exp-card ${ready ? '' : 'planned'}`} href={ready ? `#/exp/${e.id}` : undefined} aria-disabled={!ready} title={e.objective}>
                    <div className="exp-card-top">
                      <span className="exp-no">{String(e.no).padStart(2, '0')}</span>
                      <span className={`exp-chip ${e.arch}`}>{e.mcu}</span>
                      {sources[e.id] !== undefined && <span className="exp-chip edited">edited</span>}
                      {!ready && <span className="exp-chip">planned</span>}
                    </div>
                    <div className="exp-card-title">{e.title}</div>
                    {ready && <span className="go" aria-hidden><Icon name="chevronRight" size={16} /></span>}
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
