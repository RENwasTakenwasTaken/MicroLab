// Lab sheet text of Expt 3 (sampling theorem, PAM and reconstruction).

export const PAM_OBJECTIVES = [
  'Generate a naturally sampled PAM signal and demodulate it.',
  'Verify the Nyquist sampling theorem.',
  'Understand and observe the aliasing effect.',
  'Generate sample-and-hold and flat-top sampled PAM signals and compare them with natural sampling.',
];

export const PAM_APPARATUS = [
  'Analog Sampling and Reconstruction Board (PICT, Department of E&TC) with its DC adapter',
  'Tektronix TDS1002 digital storage oscilloscope with two BNC-to-banana leads',
  '4 mm banana patch cords',
];

export const PAM_THEORY = [
  'Sampling turns a continuous-time signal into a train of samples taken every $T_s = 1 / f_s$.',
  'Sampling theorem: a signal with no frequency above $f_m$ can be recovered exactly from its samples if $f_s ≥ 2 f_m$. The rate $2 f_m$ is the Nyquist rate.',
  'Natural sampling: the message is multiplied by the gating pulses, so the top of each pulse follows the message.',
  'Flat-top sampling: each pulse keeps the value the message had at the start of the pulse. Sample and hold keeps that value until the next sample, giving a staircase.',
  'Spectrum of a sampled signal: the message spectrum repeated around 0, $f_s$, $2 f_s$ and so on. For a sine message the lines are at $f_m$, $f_s ± f_m$, $2 f_s ± f_m$.',
  'Reconstruction: a low-pass filter keeps the copy around 0 and removes the others. When $f_s < 2 f_m$ the copies overlap: the line at $f_s - f_m$ falls inside the filter and the output is no longer the message. This is aliasing.',
  'Flat-top pulses and sample and hold weight the spectrum by a sin x / x shape (aperture effect), which slightly lowers the higher message frequencies.',
];

export const PAM_PROCEDURE = [
  "Plug the board's adapter into the wall socket: the board has no switch of its own.",
  'Connect oscilloscope CH1 to Message Signal (red plug in the socket, black plug in a GND socket). Set a sine wave between 1 kHz and 3 kHz with P1 and P2.',
  'Move the red plug to Gating Pulse Signal and set 16 kHz with a 50 % duty cycle, using P3 and P4.',
  "Patch Message Signal to the modulator's upper yellow socket and Gating Pulse Signal to its lower yellow socket.",
  'Observe the Natural Sampled Signal with the message on the other channel; trigger on the message. Sketch it, then look at its spectrum (MATH MENU, FFT).',
  'Do the same for the Sample & Hold Signal and the Flat top sampled Signal.',
  "Patch the Natural Sampled Signal to the demodulator's input and observe the Recovered message signal beside the original.",
  'Lower the sampling frequency with P3. Note the frequency at which the recovered signal stops being a clean copy of the message, and compare it with $2 f_m$.',
  'Repeat the reconstruction with the sample-and-hold and flat-top signals.',
];
