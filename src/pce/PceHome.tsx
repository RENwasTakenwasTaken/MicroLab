// PCE lab index: the eight practicals of the course, grouped by course outcome.

import { Icon } from '../ui/icons.tsx';
import { PCE_EXPERIMENTS } from './experiments.ts';

const CO_NAME: Record<string, string> = {
  CO1: 'Analog modulation: AM and FM',
  CO2: 'Pulse modulation and line codes',
  CO3: 'Digital modulation and spread spectrum',
};

export function PceHome() {
  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <div className="brand-mark"><Icon name="wave" size={20} /></div>
          <div>
            <div className="brand-name">PICT KA μLab <span>PCE Lab</span></div>
            <div className="brand-sub">Principles of Communication Engineering Lab</div>
          </div>
        </div>
        <a className="btn ghost" href="#/"><Icon name="chevronLeft" /> All labs</a>
      </header>
      <main className="home-main">
        <section className="home-intro">
          <h1>PCE Lab.</h1>
          <p>
            Every practical here has its own trainer kit, rebuilt in 3D from the lab&apos;s kit photographs and videos, with the
            oscilloscope beside it. The AM, FM and sampling kits are ready; the other kits will follow.
          </p>
        </section>
        {Object.keys(CO_NAME).map((co) => (
          <section key={co} className="exp-group">
            <h2>{co} <span>{CO_NAME[co]}</span></h2>
            <div className="exp-grid">
              {PCE_EXPERIMENTS.filter((e) => e.co === co).map((e) => {
                const ready = e.status === 'ready';
                return (
                  <a key={e.id} className={`exp-card ${ready ? '' : 'planned'}`} href={ready ? `#/pce/exp/${e.id}` : undefined} aria-disabled={!ready} title={e.title}>
                    <div className="exp-card-top">
                      <span className="exp-no">{String(e.no).padStart(2, '0')}</span>
                      {ready ? <><span className="exp-chip pic18">{e.kit}</span><span className="exp-chip lab3d">3D lab</span></> : <span className="exp-chip">planned</span>}
                    </div>
                    <div className="exp-card-title">{e.card}</div>
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
