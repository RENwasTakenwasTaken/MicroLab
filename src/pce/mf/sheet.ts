// Lab sheet text of Expt 6 (noise and matched filter). Objective, apparatus, procedure and the list of
// observations follow the instructor's slides 12, 15, 16; theory is written for this lab.

export const MF_OBJECTIVES = [
  'Study the addition of Gaussian noise to NRZ data and its removal at the receiver.',
  'Study the integrate-and-dump (matched) filter and the decision device (comparator).',
  'Observe how the noise level affects the received data.',
];

export const MF_APPARATUS = [
  'Sigma COM120L "Detection of digital baseband signal using matched filter" trainer',
  'Tektronix TDS1002 digital storage oscilloscope (dual channel, 60 MHz) with two probes',
  '2 mm patch cords: three long, one short',
];

export const MF_THEORY = [
  'A baseband receiver has to decide, in every bit interval $T_b$, whether a 1 or a 0 was sent although noise has been added on the channel. For a known pulse in white Gaussian noise the best linear receiver is the matched filter: it gives the largest signal-to-noise ratio at the sampling instant.',
  'For a rectangular NRZ pulse of width $T_b$ the matched filter is an integrate-and-dump circuit: it integrates the input over one bit, the result is compared with a threshold, and the integrator is then dumped (reset) for the next bit. On this kit the dump is fired by the bit clock BK through a one-shot (4528) and an analogue switch (4052).',
  'Gaussian noise has a bell-shaped amplitude distribution and a flat power spectrum over the band of the kit. Its peak-to-peak value is about six times its RMS value $σ$. The AMPLITUDE pot sets its level; the noise adder adds it to the NRZ data. The adder is an inverting summer, so its output is −(data + noise).',
  'The integrator averages the noise over the bit. Its output, the raw data, is a ramp that rises through a 1 and falls through a 0 (a preset adds half the data level so that the two go opposite ways), with far less noise than its input: the signal part grows as $t$ but the noise part only as $√t$.',
  'The comparator (decision device) gives 5 V while the raw data is above 0 V and 0 V while it is below, so at low noise the received data is the sent data again. As the noise grows, the comparator chatters at the start of each bit, where the ramp is still small; at the end of the bit the ramp is large and the decision is safe until the noise is very large.',
  'The probability of error falls as the ratio of bit energy to noise power density, $E_b / N_0$, rises: for unipolar (on-off) NRZ with matched filtering $P_e = Q(√(E_b / N_0))$, $E_b$ being the average energy per bit.',
];

// Slide 15 adapted to this kit; W1 ... W12 are the waveform numbers of the instructor's sheet.
export const MF_PROCEDURE = [
  'Put the kit mains plug in the wall socket and switch the kit on with its MAINS ON toggle.',
  'Observe the carrier clock CK and note its frequency: waveform W1. (Probe ground on a GND pin: the coloured sockets do not hold a clip.)',
  'Observe the bit clock BK and note its frequency, the bit rate $f_b$: waveform W2.',
  'Step 3 of the lab sheet (word clock Wk, waveform W3) is not on this version of the kit (COM120L): skip it.',
  'Set a data word on switches S8 to S1 (a lit LED is a 1; D8 is sent first). Observe the NRZ data on the NRZ pin and measure the bit width $T_b$ with the time cursors: waveform W4.',
  'Step 5 of the lab sheet (NRZ, bipolar NRZ, RZ, bipolar RZ: W5 to W8) needs a line coding block that this kit does not have: skip it (the line codes are Expt 5).',
  'Observe the Gaussian noise output for a few settings of the AMPLITUDE pot: waveform W9. Then keep the noise level at minimum.',
  'Patch the NRZ socket of the generator to I/P of the noise adder, and the Gaussian Noise socket of the noise generator to the Gaussian Noise input of the adder (short cord).',
  'Observe the noisy baseband signal at the Noisy signal pin of the adder, with the NRZ data on the second probe: waveform W10. Note that the adder inverts.',
  'Patch the Noisy signal socket to Noise Data of the integrate and dump filter, and BK of the generator to the BK input of the filter.',
  'Observe the raw data at the output of the matched filter: waveform W11.',
  'Observe the received data at Recd O/P Data of the comparator, with the NRZ data on the second probe: waveform W12.',
  'Now raise the noise with the AMPLITUDE pot and observe its effect on the noisy signal, the raw data and the received data. Sketch them with minimum and with maximum noise.',
];
