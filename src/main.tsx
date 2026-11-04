import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useLab } from './app/store.ts';
import { Home } from './app/Home.tsx';
import { Workspace } from './app/Workspace.tsx';
import { getExperiment } from './experiments/experiments.ts';
import './styles.css';
import './app/app.css';

function parseHash() {
  const m = location.hash.match(/^#\/exp\/(\w+)/);
  const exp = m && getExperiment(m[1]);
  return exp && exp.status === 'ready' ? ({ page: 'exp', id: exp.id } as const) : ({ page: 'home' } as const);
}

function App() {
  const route = useLab((s) => s.route);
  useEffect(() => {
    const on = () => useLab.getState().setRoute(parseHash());
    on();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route.page === 'exp' ? <Workspace key={route.id} expId={route.id} /> : <Home />;
}

if (import.meta.env.DEV) {
  // automation hook for tests/ui-lab.mjs (dev server only)
  Promise.all([import('./app/bench.ts'), import('./app/sim.ts'), import('./app/store.ts')]).then(([bench, simMod, store]) => {
    (window as unknown as { __vlab: unknown }).__vlab = { bench: bench.useBench, sim: simMod.sim, frame: store.useFrame };
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
