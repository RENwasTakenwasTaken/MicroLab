// Lab index: experiment list grouped by course outcome.

import { EXPERIMENTS } from '../experiments/experiments.ts';
import { useLab } from './store.ts';
import { WHATS_NEW } from './whatsNew.ts';
import { Icon } from '../ui/icons.tsx';

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Collapsible list of recent updates, newest first. */
function WhatsNew() {
  if (!WHATS_NEW.length) return null;
  return (
    <details className="whats-new">
      <summary>
        <Icon name="chevronRight" size={14} />
        <b>What's new</b>
        <span>Updated {fmtDate(WHATS_NEW[0].date)}</span>
      </summary>
      <div className="wn-body">
        {WHATS_NEW.map((e) => (
          <section key={e.date}>
            <h3>{fmtDate(e.date)}</h3>
            <ul>{e.items.map((t) => <li key={t}>{t}</li>)}</ul>
          </section>
        ))}
      </div>
    </details>
  );
}

export function Home() {
  const sources = useLab((s) => s.sources);
  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <div className="brand-mark"><Icon name="chip" size={20} /></div>
          <div>
            <div className="brand-name">PICT KA μLab <span>EP Lab</span></div>
            <div className="brand-sub">Embedded Processors Lab</div>
          </div>
        </div>
        <a className="btn ghost" href="#/"><Icon name="chevronLeft" /> All labs</a>
      </header>

      <main className="home-main">
        <section className="home-intro">
          <h1>Welcome to Microlab.</h1>
          <p>
            PIC18F4550 kits are tested with actual lab code. 8051 kit is provided as well. ESP and STM32 are not in our scope.
          </p>
          <WhatsNew />
        </section>

        {['CO1', 'CO2'].map((co) =>  (
          <section key={co} className="exp-group">
            <h2>{co} <span>{co === 'CO1' ? 'Microcontroller programming & interfacing' : 'System configuration & connectivity'}</span></h2>
            <div className="exp-grid">
              {EXPERIMENTS.filter((e) => e.co === co).map((e) => {
                const ready = e.status === 'ready';
                return (
                  <a key={e.id} className={`exp-card ${ready ? '' : 'planned'}`} href={ready ? `#/ep/exp/${e.id}` : undefined} aria-disabled={!ready} title={e.objective}>
                    <div className="exp-card-top">
                      <span className="exp-no">{String(e.no).padStart(2, '0')}</span>
                      <span className={`exp-chip ${e.arch}`}>{e.mcu}</span>
                      {e.arch === 'mcs51' && !e.simulator && <span className="exp-chip lab3d">3D lab</span>}
                      {sources[e.id] !== undefined && <span className="exp-chip edited">edited</span>}
                      {!ready && <span className="exp-chip">planned</span>}
                    </div>
                    <div className="exp-card-title">{e.card ?? e.title}</div>
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
