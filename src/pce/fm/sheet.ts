// Lab sheet text of Expt 2 (FM modulator and PLL demodulator).

export const FM_OBJECTIVES = [
  'Study the blocks used to generate FM.',
  'Study the FM waveform in the time domain.',
  'Study the effect of the modulating signal amplitude and frequency on the FM wave.',
  'Find the frequency deviation, modulation index and bandwidth, and relate them to the spectrum.',
  'Recover the message with the PLL demodulator.',
  'Plot the modulating signal, the carrier, the FM wave and the recovered signal.',
];

export const FM_APPARATUS = [
  'Kashtronica FM MODEM kit: IC 8038 modulator, IC 565 PLL demodulator, signal generator, filter',
  'Tektronix TDS1002 digital storage oscilloscope with two BNC-to-banana leads',
  'Digital multimeter on DC volts',
  '4 mm banana patch cords',
];

export const FM_THEORY = [
  'In frequency modulation the frequency of the carrier follows the modulating signal while its amplitude stays constant: $e_{fm} = E_c sin(ω_c t + β sin ω_m t)$.',
  'Frequency deviation $Δf$ is the largest swing of the carrier frequency from $f_c$. It is proportional to the modulating amplitude: $Δf = k_f E_m$.',
  'On this kit the 8038 is a voltage-controlled oscillator: its frequency follows the DC bias. Moving the bias 0.5 V up and down from its value X at 50 kHz gives $F_1$ and $F_2$, and $Δf = (F_1 - F_2) / 2$ is the deviation a 1 V peak-to-peak signal produces.',
  'Modulation index $β = Δf / f_m$. Unlike AM, it changes with the modulating frequency as well as the amplitude.',
  "Bandwidth by Carson's rule: $BW = 2 (Δf + f_m) = 2 f_m (β + 1)$.",
  'Spectrum: the carrier and pairs of sidebands at $f_c ± n f_m$, with amplitudes $J_n(β)$ from the Bessel-function table. More sidebands matter as β grows, and the carrier itself vanishes near β = 2.4 and 5.5.',
  'PLL demodulator (IC 565): its own oscillator locks to the incoming FM and follows its frequency. The voltage that steers the oscillator is then a copy of the modulating signal; the low-pass filter removes the carrier ripple. The loop locks only when its free-running frequency is close to the carrier.',
];

export const FM_PROCEDURE = [
  "Put the kit's mains plug in the wall socket and switch POWER ON: the red LED lights.",
  'Connect oscilloscope CH1 to the SIGNAL GEN output: red plug in the socket, black plug in GND. Set 1 V peak-to-peak, 1 kHz with AMPL. ADJ. and FREQ. ADJ.',
  'Connect the multimeter (DC volts): red lead in DC BIAS, black lead in GND. The GND plugs stack on one another.',
  "Move CH1 to BUFFER O/P and turn the modulator's FREQ. ADJ. (top left) until the carrier is 50 kHz. Note the DC bias on the multimeter: X volts.",
  'Turn FREQ. ADJ. until the multimeter reads X + 0.5 V and note the frequency $F_1$. Then X - 0.5 V and note $F_2$. Go back to 50 kHz and take the multimeter off.',
  'Calculate the frequency deviation $Δf = (F_1 - F_2) / 2$ and the modulation index $β = Δf / f_m$.',
  'Patch the SIGNAL GEN output to the modulator input (top-left socket). Watch the FM wave on BUFFER O/P with the modulating signal on the other channel; trigger on the modulating signal.',
  'Spectrum: MATH MENU, Operation FFT, Source the FM channel. SEC/DIV 1 ms gives a span of 0 to 125 kHz; bring the carrier to the centre with HORIZONTAL POSITION and use FFT Zoom. The sidebands are $f_m$ apart.',
  'Change the modulating frequency for another value of β and observe the wave and its spectrum again. Repeat for at least two more values.',
  'Demodulator: with nothing on PLL I/P, connect the oscilloscope to the PLL VCO output (the lowest socket) and turn the PLL FREQ. ADJ. for a 50 kHz free-running frequency.',
  'Patch BUFFER O/P to PLL I/P and PLL O/P to FILTER I/P. Connect the oscilloscope to FILTER O/P and observe the recovered message signal beside the original.',
];
