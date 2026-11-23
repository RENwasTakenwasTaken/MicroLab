// Lab sheet text of Expt 7 (BFSK). Objectives and procedure follow the instructor's slides 18 and 25,
// the numbers the answer sheet (slides 26, 27); theory is written for this lab.

export const FSK_OBJECTIVES = [
  'Study the blocks of a BFSK transmitter and receiver.',
  'Sketch the input bit sequence, the carriers, ASK1, ASK2 and BFSK waveforms and their spectra.',
  'Measure the bandwidth of BFSK practically and compare it with theory.',
  'Understand the difference between coherent and non-coherent BFSK reception.',
];

export const FSK_APPARATUS = [
  'Sigma COM115M "Generation & reception of FSK" trainer',
  'Tektronix TDS1002 digital storage oscilloscope (dual channel, 60 MHz) with two probes',
  '2 mm patch cords: two short, one long',
];

export const FSK_THEORY = [
  'In binary frequency-shift keying (BFSK) a 1 is sent as a burst of one carrier frequency and a 0 as a burst of another. The BFSK signal is the sum of two ASK signals: one carrier switched on by the data and the other switched on by the complement of the data.',
  'On this kit the data are NRZ at the bit rate $f_b = 80$ kHz ($T_b = 12.5$ µs). Balanced modulator-1 multiplies the complemented data NRZ̅ by the 640 kHz carrier ($f_H = 8 f_b$, 8 cycles per bit) and balanced modulator-2 multiplies the data NRZ by the 320 kHz carrier ($f_L = 4 f_b$, 4 cycles per bit); the adder gives the FSK signal: 320 kHz for a 1 and 640 kHz for a 0. (The instructor\'s answer sheet calls the 320 kHz bursts ASK1; on this panel they come out of modulator-2.)',
  'Each ASK signal has a sinc-shaped spectrum around its carrier with its first nulls $f_b$ either side: a bandwidth of $2 f_b$ = 160 kHz. The BFSK bandwidth is $(f_H - f_L) + 2 f_b = 4 f_b + 2 f_b = 6 f_b$ = 480 kHz, from 240 kHz to 720 kHz. (The textbook figure often quoted, $4 f_b$, counts from the carriers\' main lobes for a smaller frequency gap.)',
  'The data repeat every 8 bits, so each spectrum is made of lines $f_b / 8$ = 10 kHz apart; what matters is their envelope.',
  'Receiver: a phase-locked loop (the 4046) follows the frequency of the FSK signal; its control voltage, smoothed by the loop filter, is the raw data: low for 320 kHz and high for 640 kHz, rising and falling with the filter\'s time constant. A comparator (the data squarer) turns it back into clean NRZ data, a little delayed.',
  'This PLL receiver is non-coherent: it needs no copy of the carrier phase. A coherent receiver multiplies the signal by locally generated carriers in phase with the transmitted ones and integrates over each bit (a matched filter); it performs better in noise but needs carrier recovery.',
];

// Slide 25 adapted to this kit.
export const FSK_PROCEDURE = [
  'Put the kit mains plug in the wall socket and switch the kit on with its MAINS ON toggle. Set a data word on switches S8 to S1 (a lit LED is a 1; D8 is sent first).',
  'Connect DSO channel 1 to the NRZ pin and observe the data. Measure the bit width $T_b$ with the time cursors. (Probe ground on a GND pin: the round sockets do not hold a clip.)',
  'Connect DSO channel 1 to the NRZ̅ pin (complemented data) and observe it.',
  'Connect DSO channel 1 to the carrier test points f1 (640 kHz) and f2 (320 kHz) in the carrier generator and observe the two carriers; measure their frequencies.',
  'Patch NRZ̅ to the NRZ input of balanced modulator-1 (short cord) and NRZ to the NRZ input of balanced modulator-2 (long cord). The carriers reach the modulators inside the kit.',
  'Connect DSO channel 1 to NRZ and channel 2 to ASK1 O/P of balanced modulator-1. Observe the ASK output and its spectrum (MATH MENU, FFT; SEC/DIV 100 µs shows 0 to 1.25 MHz).',
  'In the same way, connect channel 2 to ASK2 O/P of balanced modulator-2. Observe the ASK output and its spectrum.',
  'The two ASK outputs reach the adder inside the kit. Connect channel 2 to FSK O/P of the adder: observe the FSK signal and its spectrum, and measure its bandwidth between the outer nulls.',
  'Steps 9, 10 and 13 of the lab sheet (Gaussian noise and its level pot) need a noise generator that this version of the kit (COM115M) does not have: skip them.',
  'Patch the FSK O/P socket to FSK I/P of the demodulator (short cord). Observe the raw data at RAW Data, with NRZ on the other channel.',
  'Observe the received data at NRZ O/P of the data squarer, with NRZ on the other channel, and note the delay.',
  'Sketch all the waveforms and spectra with proper proportion, and compare the measured bandwidths with $2 f_b$ and $(f_H - f_L) + 2 f_b$.',
];
