import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useLab } from './app/store.ts';
import { Home } from './app/Home.tsx';
import { Landing } from './app/Landing.tsx';
import { Workspace } from './app/Workspace.tsx';
import { getExperiment } from './experiments/experiments.ts';
import { PceHome } from './pce/PceHome.tsx';
import { PceWorkspace } from './pce/PceWorkspace.tsx';
import { getPceExperiment } from './pce/experiments.ts';
import './styles.css';
import './app/app.css';

/**
 * Routes: #/ choose a lab · #/ep EP experiments · #/ep/exp/<id> an EP experiment ·
 * #/pce PCE experiments · #/pce/exp/<id> a PCE experiment. #/exp/<id> (links from before the
 * PCE lab existed) still opens the EP experiment.
 */
function parseHash() {
  const h = location.hash;
  const pce = h.match(/^#\/pce(?:\/exp\/(\w+))?/);
  if (pce) {
    const exp = pce[1] && getPceExperiment(pce[1]);
    return exp && exp.status === 'ready' ? ({ page: 'pce-exp', id: exp.id } as const) : ({ page: 'pce' } as const);
  }
  const ep = h.match(/^#\/(?:ep\/)?exp\/(\w+)/);
  if (ep) {
    const exp = getExperiment(ep[1]);
    if (exp && exp.status === 'ready') return { page: 'exp', id: exp.id } as const;
  }
  return /^#\/(ep|exp)\b/.test(h) ? ({ page: 'home' } as const) : ({ page: 'landing' } as const);
}

function App() {
  const route = useLab((s) => s.route);
  useEffect(() => {
    const on = () => useLab.getState().setRoute(parseHash());
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  switch (route.page) {
    case 'exp': return <Workspace key={route.id} expId={route.id} />;
    case 'home': return <Home />;
    case 'pce-exp': return <PceWorkspace key={route.id} expId={route.id} />;
    case 'pce': return <PceHome />;
    default: return <Landing />;
  }
}

if (import.meta.env.DEV) {
  // automation hooks for the UI tests (dev server only)
  Promise.all([import('./app/bench.ts'), import('./app/sim.ts'), import('./app/store.ts'), import('./pce/store.ts'), import('./pce/signals.ts'), import('./pce/fm/signals.ts'), import('./pce/Dmm.tsx')]).then(([bench, simMod, store, pce, signals, fm, dmm]) => {
    const w = window as unknown as { __vlab: unknown; __pce: unknown };
    w.__vlab = { bench: bench.useBench, sim: simMod.sim, frame: store.useFrame, lab: store.useLab };
    w.__pce = { store: pce.usePce, signals, fm, dmm: dmm.dmmLive };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
