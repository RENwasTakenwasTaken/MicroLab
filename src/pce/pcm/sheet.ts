// Lab sheet text of Expt 4 (PCM). Objectives and the observation fields follow the journal (its
// Expt 4, pages 22 to 28 of the scan); the journal's procedure pages are missing, so the procedure is
// written for the COM110M on the lab's photograph, in the order of the journal's list of graphs and
// the instructor's video. Numbers: the journal's readings (1.32 MHz clock, 20 kHz sampling, 360 mV steps).

export const PCM_OBJECTIVES = [
  'Study the blocks of a PCM transmitter and receiver.',
  'Study the quantisation technique in detail.',
  'Generate a PCM signal from the sine of the kit, detect it again and recover the message.',
  'Observe the effect of a DC input on the PCM output.',
  'Sketch the PCM waveforms and compute the signalling rate and the bandwidth.',
];

export const PCM_APPARATUS = [
  'Sigma pulse code modulation / demodulation trainer, model COM110M',
  'Tektronix TDS1002 digital storage oscilloscope (dual channel, 60 MHz) with two probes',
  'Stackable 2 mm patch cords (four)',
];

export const PCM_THEORY = [
  'In pulse code modulation (PCM) the message is sampled, each sample is rounded to one of $L = 2^n$ levels (quantisation) and the level number is sent as an $n$-bit binary word. The receiver turns the words back into levels (raw data) and a low-pass filter smooths them into the message.',
  'Sampling: the sampling rate $f_s$ must be at least $2 f_m$ for a message of highest frequency $f_m$ (Nyquist). On this kit the sampling pulse generator runs at about 1.32 MHz and a frame lasts 64 of its clocks, so $f_s$ = 1.32 MHz / 64 ≈ 20.6 kHz, comfortably above $2 × 3.4$ kHz.',
  'Quantisation: for a quantiser range $V_{pp}$ the step size is $S = V_{pp} / L$. Rounding errs by at most $S/2$, the maximum quantisation noise. More bits give a smaller step: 3-bit PCM has 8 levels, 4-bit PCM has 16. On this kit the range is about 2.88 V, so $S$ ≈ 360 mV for 3 bits and 180 mV for 4 bits; a larger message is clipped at the end levels.',
  'Coding on this kit: a counter-type converter. A counter drives a resistor ladder that climbs a staircase ramp (8 or 16 steps) once per sample; a comparator stops the count where the ramp passes the held sample, and that count is the code word (shown on the LEDs D1 to D4).',
  'PCM frame on this kit: 16 slots of 4 clocks each. A long sync pulse (high), a start bit (low), the $n$ data bits (MSB first) and a stop bit (low), then the next sync pulse, once for every sample.',
  'Signalling rate: $r = n f_s$ bits per second of information (61.9 kb/s for 3 bits, 82.5 kb/s for 4 bits at 20.6 kHz). The minimum channel bandwidth of the bit stream is $B ≥ r / 2 = n f_s / 2$. (The kit itself sends faster, 16 slots per sample, because of the sync, start and stop bits.)',
  'Effect of a DC input: with the DC source in place of the message, every sample is the same, so the PCM word does not change from frame to frame; moving the DC level steps through the code words.',
];

export const PCM_PROCEDURE = [
  'Put the kit mains plug in the wall socket and switch the kit on (the green pilot lamp lights).',
  'With SLOW / FAST on FAST, observe the sampling clock at SAMP CLOCK and measure its frequency (journal: 1.32 MHz). The sampling frequency is this clock divided by 64.',
  'Set the audio generator to 1 kHz, 2 V peak-to-peak (AMPLITUDE, FREQUENCY) and observe the modulating signal at Sine O/P.',
  'Patch Sine O/P to MOD. I/P. Set BIT SELECT to 3 BIT and observe the ramp at RAMP: a staircase of 8 steps once per sample. Measure its period.',
  'Observe the PCM output at PCM O/P (trigger on it). Identify the sync, start, data and stop bits, sketch one frame, and measure the frame period $T_s$ (= 1 / $f_s$).',
  'Patch PCM O/P to PCM I/P. Observe RAW DATA with the sine on the other channel: a staircase that holds each level for one sample. A 2 V p-p message uses 6 of the 8 levels; all 8 appear only when it fills the 2.88 V range. Measure the step size $S$ and note the maximum quantisation noise $S/2$.',
  'Patch RAW DATA to Recvd I/P of the filter and observe the filtered output (the second pin beside RAW DATA): a sine of the message frequency. Set GAIN so its amplitude matches the message; compare the two.',
  'Set BIT SELECT to 4 BIT and repeat steps 4 to 7: 16 ramp steps, twice the levels, half the step.',
  'Remove the sine from MOD. I/P and patch VAR DC (DC source) to MOD. I/P. For at least three settings of the 100K pot, note the code word on the LEDs D1 to D4 and the data bits in the PCM frame, for 3 BIT and for 4 BIT. (On SLOW the LEDs show each new sample.)',
  'Audio test with a microphone and loudspeaker: not on this kit (the COM110M has no audio amplifiers).',
  'Compute the signalling rate $n f_s$ and the bandwidth $n f_s / 2$ for 3 and 4 bits. Plot every waveform with a time axis.',
];
