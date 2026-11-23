// Lab sheet text of Expt 8 (DSSS). Objectives and procedure follow the instructor's slides 28 and 36,
// the numbers the student's measured sheet (slide 39); theory is written for this lab.

export const SS_OBJECTIVES = [
  'Study direct sequence spread spectrum (DSSS) modulation and demodulation.',
  'Study BPSK modulation and coherent demodulation as used in DSSS.',
  'Generate a PN code and the spread signal, and sketch all the waveforms of the transmitter and receiver.',
  'Calculate the processing gain.',
];

export const SS_APPARATUS = [
  'Sigma DSSS100 direct sequence spread spectrum modulation / demodulation trainer',
  'Tektronix TDS1002 digital storage oscilloscope (dual channel, 60 MHz) with two probes',
  'Stackable 2 mm patch cords (nine)',
];

export const SS_THEORY = [
  'Direct-sequence spread spectrum multiplies the message by a fast pseudo-noise (PN) code. Each message bit of width $T_b$ is divided into $N$ chips of width $T_c$; the spread signal is about $N$ times wider than the message and its power density about $N$ times lower.',
  'Processing gain: $G_p = T_b / T_c = N$. On the lab\'s kit $T_b = 153.6$ µs (bit rate 6.51 kHz) and $T_c = 10.24$ µs (PN clock 97.62 kHz), so $G_p = 15$ (11.8 dB). All the clocks are divided from one master clock (nominally 1 MHz), which is why the panel prints 6.67 kHz and 100 kHz.',
  'PN generator: a shift register with modulo-2 (XOR) feedback gives a maximal-length sequence of $2^n - 1$ chips. A 4-stage register gives 15 chips: 1 0 1 0 0 1 1 0 1 1 1 0 0 0 0 on this kit, repeating once every bit. An all-zero register would stay at zero, so PRBS loads a starting state.',
  'Spreading: the spreading code is $SP = XNOR(m, PN)$: the PN code during a 1 and its complement during a 0. The uni-to-bipolar converter turns it into a polar signal (here ±4 V, inverted) for the balanced modulator.',
  'BPSK modulation: the carrier ($f_c$ = 488 kHz here, half the master clock, five cycles per chip) is multiplied by the polar spreading code, so its phase flips by 180° with every change of chip. The DSSS-BPSK spectrum is a $sin x / x$ shape around $f_c$ with its first nulls at $f_c ± 1 / T_c$: a null-to-null bandwidth of $2 / T_c$ ≈ 195 kHz, against $2 / T_b$ ≈ 13 kHz for BPSK of the message alone.',
  'Receiver: the coherent detector multiplies the received signal by the same carrier (same phase, set by PHASE); $cos^2$ leaves the spreading code plus a ripple at twice the carrier. A low pass filter removes the ripple and a comparator squares the result: the recovered spreading code. Multiplying it again by the same PN code (XNOR), in step, removes the spreading: $m = XNOR(SP, PN)$, delayed a little.',
  'Interference that does not carry the PN code is spread by the same multiplication at the receiver and mostly removed by the filtering that follows: this is the processing gain at work.',
];

// Slide 36 adapted to this kit. T1 ... T10 are the waveform numbers of the instructor's sheet.
export const SS_PROCEDURE = [
  'Put the kit mains plug in the wall socket and switch the kit on with its MAINS ON toggle.',
  'Observe the carrier clock (1 MHz, CC) of the clock generator: waveform T1. (Probe ground on a GND pin: the round sockets do not hold a clip.)',
  'Observe the bit clock BK and the PN clock PNCK, and measure their frequencies: waveform T2.',
  'Observe the RF carrier at RF CARRIER of the RF carrier generator and measure its frequency: waveform T3.',
  'Set a data word on switches S8 to S1 (a lit LED is a 1; D8 is sent first) and observe the NRZ data: waveform T4.',
  'Push the PRBS (PN start) switch and observe the PN signal: waveform T5. Count the chips in one bit.',
  'Patch PN Signal to PN Code and NRZ DATA to NRZ Data of the spreading code mixer. Observe the spreading code with the NRZ data: waveform T6.',
  'Patch the spreading code to the uni-to-bipolar converter, its Bipolar Sp Code output to Sp Code of the DSSS modulator, and RF CARRIER to RF Carrier of the modulator.',
  'Observe the DSSS signal at DSSS O/P with reference to the NRZ data and the spreading code: waveform T7. Observe its spectrum (MATH MENU, FFT; SEC/DIV 100 µs) and measure the null-to-null bandwidth.',
  'Patch DSSS O/P to DSSS I/P of the coherent detector and observe the recovered (noisy) spreading code at Noisy SP Code: waveform T8.',
  'Patch Noisy SP Code to SP Code I/P of the low pass filter comparator. Observe the filtered spreading code at Fil. O/P (waveform T9) and the clean one at SP Code O/P. (The lab sheet\'s "keep noise level at minimum" does not apply: this kit has no noise control.)',
  'Patch SP Code O/P to SP Code and PN Signal to PN Signal of the code despreading section (the PN plug stacks on the one already there). Observe the received data at Recvd. Data with the NRZ data: waveform T10.',
  'Plot all the waveforms in proper proportion, with a time axis on each, and calculate the processing gain $T_b / T_c$.',
];
