// Lab sheet text of Expt 5 (line codes).

export const LC_OBJECTIVES = [
  'Study the concept of line coding.',
  'Study the characteristics of the line codes: DC component, bandwidth, and how well the receiver can recover the bit clock.',
  'Compare unipolar and bipolar NRZ, RZ, AMI and Manchester codes in the time and frequency domains.',
];

export const LC_APPARATUS = [
  'Sigma COM122N Line Coding and Decoding Trainer',
  'Tektronix TDS1002 digital storage oscilloscope (dual channel, 60 MHz) with two probes',
];

export const LC_THEORY = [
  'Line coding turns a sequence of bits into a signal that can be sent down a line. The sender encodes the data; the receiver decodes the signal back into bits.',
  'Bit duration $T_b$ and bit rate $f_b = 1 / T_b$. The spectrum of a code built from pulses of width $τ$ follows a $sin x / x$ shape with its first null at $1 / τ$: the first-null bandwidth.',
  'Unipolar NRZ: a level for 1 and 0 V for 0, held for the whole bit. First null at $f_b$. It has a DC component and long runs of equal bits give the receiver no edges to keep its clock.',
  'Polar (bipolar) NRZ: +V for 1 and -V for 0. Same bandwidth, half the power for the same distance between levels, but still a DC component for unequal numbers of 1s and 0s.',
  'RZ: the pulse lasts only half the bit and returns to zero, so $τ = T_b / 2$ and the first null moves out to $2 f_b$. Unipolar RZ has a spectral line at $f_b$ that the receiver can use as a clock.',
  'AMI (alternate mark inversion): 0 is 0 V and successive 1s alternate in polarity. No DC component, first null at $f_b$, and a single error shows up as a violation of the alternation.',
  'Manchester (split phase): every bit has a transition in its middle (1: high to low, 0: low to high). Its average does not depend on the data (zero in the bipolar form) and the clock is easy to recover, at the cost of bandwidth: first null at $2 f_b$. On this kit the Manchester output swings 0 V to 5 V.',
  'NRZ-M and biphase mark are differential: a 1 is a change of level, not a level, so the data survives an inverted line.',
];

export const LC_PROCEDURE = [
  'Put the kit mains plug in the wall socket and switch the kit on with its MAINS ON toggle.',
  'Observe the clock CK and note its frequency.',
  'Observe the bit clock BK and note its frequency: this is the bit rate $f_b$.',
  'Set the input data word (any, or as specified) with the data switches S8 to S1. A lit LED is a 1; D8 is sent first.',
  'Observe the NRZ data on the oscilloscope and measure the bit width $T_b$ with the time cursors.',
  'The data reaches the line coding section inside the kit, so no patch cord is needed.',
  'With the NRZ data on CH1 for reference, observe each line code on CH2: unipolar and bipolar NRZ, unipolar and bipolar RZ, AMI and Manchester (and NRZ-M and biphase mark). Sketch each with $T_b$ marked.',
  'Observe each code in the frequency domain (MATH MENU, FFT; SEC/DIV 250 µs and FFT Zoom X2 give 25 kHz per division) and measure the frequency of the first null with the cursors: its bandwidth.',
  'Compare the bandwidths with $f_b$ and $2 f_b$.',
];
