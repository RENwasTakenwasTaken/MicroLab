// Principles of Communication Engineering Lab (PCEL, 2403206): experiment list and lab sheets.
// Each experiment has its own trainer kit; only the kits that have been modelled are 'ready'.

import { FM_APPARATUS, FM_OBJECTIVES, FM_PROCEDURE, FM_THEORY } from './fm/sheet.ts';

export interface PceExperiment {
  id: string;
  no: number;
  co: string;
  status: 'ready' | 'planned';
  /** problem statement as in the syllabus */
  title: string;
  /** short name for cards and the title bar */
  card: string;
  kit: string;
  objectives: string[];
  apparatus: string[];
  theory: string[];
  procedure: string[];
}

const planned = (no: number, co: string, card: string, title: string, kit: string): PceExperiment =>
  ({ id: `p${no}`, no, co, status: 'planned', title, card, kit, objectives: [], apparatus: [], theory: [], procedure: [] });

const AM_THEORY = [
  'Modulating signal $e_m = E_m cos ω_m t$, carrier $e_c = E_c cos ω_c t$.',
  'AM wave with full carrier (DSB-FC): $e_{am} = [E_c + e_m] cos ω_c t = E_c [1 + m cos ω_m t] cos ω_c t$, where the modulation index is $m = E_m / E_c$.',
  'For m between 0 and 1 the envelope follows the modulating signal. For m > 1 (over-modulation) the envelope crosses zero and the carrier reverses phase: the envelope is distorted.',
  'From the AM wave: $m = (E_{max} - E_{min}) / (E_{max} + E_{min})$, with $E_{max}$ and $E_{min}$ the largest and smallest peak-to-peak heights of the envelope. For m > 1 take $E_{min}$ as negative.',
  'From the trapezoidal pattern (XY display: modulating signal across, AM wave up): $m = (L_1 - L_2) / (L_1 + L_2)$, with $L_1$ and $L_2$ the long and short vertical sides. At m = 1 it is a triangle; for m > 1 a second small triangle appears beyond the point and $L_2$ is negative.',
  'Spectrum: the carrier at $f_c$ and two sidebands at $f_c - f_m$ and $f_c + f_m$, each of amplitude $m E_c / 2$: 6 dB below the carrier at m = 1.',
  'Power in a load R (the lab sheet takes R = 50 Ω): $P_c = E_c^2 / 2R$, $P_{SB} = m^2 E_c^2 / 4R$, $P_T = P_c + P_{SB} = P_c (1 + m^2 / 2)$.',
  'On this kit the short link joins RF LINK to a -1 V pin, which adds 1 V to the modulating signal inside the balanced modulator (MC1496). So $m = E_m(peak) / 1 V$: with the carrier set to 2 V peak-to-peak, that is $E_m / E_c$ with both read peak-to-peak. The 1 V is negative, so the envelope is largest at the negative peak of the modulating signal and the trapezoid points to the right.',
];

const AM_PROCEDURE = [
  'Put the kit\'s mains plug in the wall socket and switch the kit ON with the toggle in the POWER SUPPLY block: the pilot lamp lights.',
  'Push the CH1 probe tip into a SINE O/P pin and clip its ground lead to the GND pin just below. Set the audio generator to 1 kHz with FREQUENCY, and its AMPLITUDE below 2 V peak-to-peak for the first case (m < 1). Read the values on the oscilloscope (MEASURE or cursors): the printed scales are only approximate.',
  'Move the CH1 probe to RF O/P, with the ground clip on the GND pin between the two RF dials. Set the carrier to 455 kHz, 2 V peak-to-peak with the RF FREQUENCY and AMPLITUDE controls. Note $E_c$, then take the probe back to SINE O/P.',
  'Join RF LINK to the -1 V pin below it with the short link. Patch the free SINE O/P pin to MOD I/P with a long cord. (The carrier reaches RF CARRIER I/P inside the kit: no cord is needed there.)',
  'Push the CH2 probe tip into an AM MOD O/P pin. CH1 now shows the modulating signal and CH2 the AM wave. Trigger on CH1 (TRIG MENU, Source CH1; SET TO 50%) and set SEC/DIV to about 250 µs.',
  'Measure $E_{max}$ and $E_{min}$ of the AM wave: CURSOR, Type Voltage, Source CH2; the two VERTICAL POSITION knobs move the cursors. Measure $E_m$ on CH1 the same way.',
  'DISPLAY, Format XY: the trapezoidal pattern. Read $L_1$ and $L_2$ as divisions x VOLTS/DIV of CH2. Go back to Format YT.',
  'Repeat for m = 1 (audio amplitude 2 V peak-to-peak) and for m > 1 (more than 2 V), and fill in the observation table.',
  'Spectrum: MATH MENU, Operation FFT, Source CH2. At SEC/DIV 250 µs the sample rate is 1 MS/s, so the screen spans 0 to 500 kHz. Bring the carrier peak to the centre line with HORIZONTAL POSITION, then use FFT Zoom. Raise the audio frequency towards 3.4 kHz to pull the sidebands clear of the carrier. Measure with CURSOR, Source MATH: Type Frequency for $f_c$ and $f_c ± f_m$, Type Magnitude for the levels in dB.',
  'Calculate m by the three methods and the carrier, sideband and total power. Sketch the waveforms, trapezoids and spectra for the three cases.',
];

export const PCE_EXPERIMENTS: PceExperiment[] = [
  {
    id: 'am', no: 1, co: 'CO1', status: 'ready', kit: 'Sigma COM101 AM trainer',
    card: 'Amplitude modulation (DSB-FC): modulation index, trapezoid pattern and spectrum',
    title: 'Analyze AM transmitter and receiver using block diagrams; generate DSB-FC AM signals, compute modulation index and power, and evaluate waveform and spectral changes across various modulation indices.',
    objectives: [
      'Study the AM waveform in the time domain.',
      'Calculate the modulation index m by different methods.',
      'Study the effect of m on the AM wave and on the trapezoidal pattern.',
      'Verify the results theoretically.',
      'Plot the waveform for m = 0, m < 1, m = 1 and m > 1 with the corresponding trapezoidal pattern.',
      'Calculate the power in the carrier and the sidebands.',
    ],
    apparatus: [
      'Sigma AM/DSB/SSB modulation and demodulation trainer, model COM101',
      'Tektronix TDS1002 digital storage oscilloscope with two 1X probes',
      '2 mm patch cords: one short link, two long cords',
    ],
    theory: AM_THEORY,
    procedure: AM_PROCEDURE,
  },
  {
    id: 'fm', no: 2, co: 'CO1', status: 'ready', kit: 'Kashtronica FM MODEM kit',
    card: 'Frequency modulation: 8038 modulator and PLL demodulator, modulation index and bandwidth',
    title: 'Analyze frequency modulator and demodulator systems using block diagrams; generate FM signals, compute modulation index and bandwidth, and interpret waveform and spectral characteristics.',
    objectives: FM_OBJECTIVES, apparatus: FM_APPARATUS, theory: FM_THEORY, procedure: FM_PROCEDURE,
  },
  planned(3, 'CO2', 'Sampling theorem: natural and flat-top PAM, reconstruction and aliasing', 'Apply the Sampling Theorem to generate PAM (natural and flat-top) signals, reconstruct the original waveform, and evaluate aliasing effects in the frequency domain.', 'Sampling kit'),
  planned(4, 'CO2', 'PCM system: waveforms, signalling rate and bandwidth', 'Construct and analyze a PCM system, sketch PCM waveforms, and compute signaling rate and bandwidth.', 'PCM kit'),
  planned(5, 'CO2', 'Line codes: NRZ, RZ, AMI and Manchester', 'Generate and compare line codes (NRZ, RZ, AMI, Manchester), sketch corresponding waveforms, and analyze bandwidth requirements.', 'Line code kit'),
  planned(6, 'CO3', 'Baseband receiver in noise (matched filter)', 'Generate baseband input bit sequences and evaluate receiver performance in noisy environments using appropriate hardware setup.', 'Matched filter kit'),
  planned(7, 'CO3', 'BFSK: ASK1, ASK2 and BFSK waveforms', 'Analyze BFSK modulation using block diagrams; generate ASK1, ASK2, BFSK waveforms, sketch input and carrier signals, and evaluate bandwidth using practical methods.', 'BFSK kit'),
  planned(8, 'CO3', 'Direct sequence spread spectrum: PN codes and DSSS signals', 'Demonstrate DSSS modulation; generate PN codes and DSSS signals using hardware setup and sketch the associated waveforms.', 'DSSS kit'),
];

export const getPceExperiment = (id: string) => PCE_EXPERIMENTS.find((e) => e.id === id);
