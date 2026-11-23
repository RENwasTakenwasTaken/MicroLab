// Signals on the bench: hands the oscilloscope (and the multimeter) to the signal model of the
// kit that is on the bench.

import * as am from './am/signals.ts';
import * as fm from './fm/signals.ts';
import * as pam from './pam/signals.ts';
import * as lc from './lc/signals.ts';
import * as mf from './mf/signals.ts';
import { usePce } from './store.ts';
import type { Source } from './wiring.ts';

export { now } from './wiring.ts';
export type { Source } from './wiring.ts';

const MODELS = { am, fm, pam, lc, mf };
const model = () => MODELS[usePce.getState().kit];

/** Bring the kit's oscillators up to date with its knobs and power switch. Call before reading signals. */
export const syncKit = (t?: number) => { model().syncKit(t); };
/** Signal at a scope channel's probe or red lead, measured against the scope's ground. null: not connected. */
export const tipSource = (ch: 0 | 1): Source | null => model().tipSource(ch);
/** What each scope channel is on, and whether the scope has a ground on the kit. */
export const scopeInfo = (): { ch1: string | null; ch2: string | null; ground: 'ok' | 'off' | 'none' } => model().scopeInfo();
