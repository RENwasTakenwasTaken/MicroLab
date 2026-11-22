// First page: choose a laboratory. EP = Embedded Processors (the microcontroller kits),
// PCE = Principles of Communication Engineering (the communication trainer kits).

import { EXPERIMENTS } from '../experiments/experiments.ts';
import { PCE_EXPERIMENTS } from '../pce/experiments.ts';
import { Icon } from '../ui/icons.tsx';

const ready = (list: { status: string }[]) => list.filter((e) => e.status === 'ready').length;

export function Landing() {
  const labs = [
    {
      href: '#/ep', icon: 'chip', code: 'EP', name: 'EP Lab', sub: 'Embedded Processors',
      text: 'PIC18F4550 and 8051 kits on the bench: write the program, upload it and measure with the oscilloscope and multimeter.',
      chips: [`${ready(EXPERIMENTS)} experiments`, 'PIC18F4550', '8051'],
    },
    {
      href: '#/pce', icon: 'wave', code: 'PCE', name: 'PCE Lab', sub: 'Principles of Communication Engineering',
      text: 'Communication trainer kits with the oscilloscope: patch the kit, set the signals and read waveforms, trapezoid patterns and spectra.',
      chips: [`${ready(PCE_EXPERIMENTS)} of ${PCE_EXPERIMENTS.length} experiments`, 'AM kit', 'FM kit'],
    },
  ];
  return (
    <div className="home landing">
      <header className="home-head">
        <div className="brand">
          <div className="brand-mark"><Icon name="chip" size={20} /></div>
          <div>
            <div className="brand-name">PICT KA μLab</div>
            <div className="brand-sub">Virtual laboratories</div>
          </div>
        </div>
      </header>
      <main className="home-main">
        <section className="home-intro">
          <h1>Welcome to Microlab.</h1>
          <p>The lab&apos;s own kits and instruments, on a 3D bench. Choose a laboratory.</p>
        </section>
        <div className="lab-grid">
          {labs.map((l) => (
            <a key={l.code} className="exp-card lab-card" href={l.href}>
              <div className="exp-card-top">
                <span className="lab-mark"><Icon name={l.icon} size={22} /></span>
                <span className="exp-no">{l.code}</span>
              </div>
              <div className="lab-name">{l.name} <span>{l.sub}</span></div>
              <p className="lab-text">{l.text}</p>
              <div className="lab-chips">{l.chips.map((c) => <span key={c} className="exp-chip">{c}</span>)}</div>
              <span className="go" aria-hidden><Icon name="chevronRight" size={16} /></span>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
