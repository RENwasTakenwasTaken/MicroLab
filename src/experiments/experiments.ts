// Experiment definitions (SPPU / PICT Embedded Processors lab).
// Adding an experiment = adding an entry here (+ a reference program).

import type { Arch } from '../sim/core/types.ts';
import type { FrcTarget, PicBoardConfig, PinRef } from '../sim/board/types.ts';
import exp1 from './code/exp1_8051_led.c?raw';
import exp2 from './code/exp2_pic_io.c?raw';
import exp3 from './code/exp3_pic_timer0.c?raw';
import exp4 from './code/exp4_pic_pwm.c?raw';
import exp5 from './code/exp5_pic_lcd.c?raw';
import exp6 from './code/exp6_pic_temp.c?raw';

export interface DipReq { bank: keyof PicBoardConfig['dips']; index: number; on: boolean; label: string }
/** A probe / lead on a header pin: pin label ('RD0', 'GND'), or a list of pins any of which will do. */
export interface ProbeReq { plug: 'ch1' | 'ch2' | 'scope:gnd' | 'dmm:v' | 'dmm:com'; pin: string | string[]; label: string }

export interface Connection {
  signal: string;
  mcuPin: string;
  board: string;
  verified: boolean;
}

export type Measurement =
  | { kind: 'pinFreq'; label: string; pin: PinRef; expectHz?: number; tolerance?: number }
  | { kind: 'pinState'; label: string; pin: PinRef }
  | { kind: 'leds'; label: string }
  | { kind: 'lcd'; label: string }
  | { kind: 'relay'; label: string }
  | { kind: 'buzzer'; label: string }
  | { kind: 'motor'; label: string }
  | { kind: 'pwm'; label: string; channel: 0 | 1 }
  | { kind: 'temperature'; label: string }
  | { kind: 'ledbar51'; label: string };

export interface Experiment {
  id: string;
  no: number;
  title: string;
  co: string;
  arch: Arch | 'esp32' | 'stm32';
  mcu: string;
  status: 'ready' | 'planned';
  objective: string;
  problem: string;
  theory: string[];
  hardware: string[];
  connections: Connection[];
  /** Bench set-up the program expects. Everything starts unplugged / OFF; each item is a workflow step. */
  board?: {
    cables?: Partial<Record<FrcTarget, number | null>>;
    /** DIP switches to set (all start OFF); on: false items are switches that must stay OFF */
    switches?: DipReq[];
    /** oscilloscope probe jumpers: plug -> header pin label (e.g. 'RD0') or 'GND' */
    probes?: ProbeReq[];
    /** multimeter leads (a workflow step just before the USB cable) */
    dmm?: ProbeReq[];
    /** the gear motor's jumper wires on DCM1 */
    motor?: boolean;
    /** final step: change the LM35 temperature in the Hardware tab while the program runs */
    tempTask?: boolean;
  };
  starter: string;
  expected: string[];
  measurements: Measurement[];
  procedure: string[];
}

const PIC_PROCEDURE = [
  'Power the board: plug the 12 V adapter\'s 2-pin mains plug into the wall socket in front of the bench, then switch the board\'s POWER slide switch ON (the POWER LED lights).',
  'Set up the hardware listed under Connections: FRC ribbon cables (click a ribbon plug on the desk, then a PORT header and the peripheral connector), jumper wires and probes. Every DIP switch starts OFF: turn ON only the ones the program uses.',
  'Plug the Type-B USB cable into the board.',
  'Enter bootloader mode: hold RESET, press and hold BOOT, release RESET, release BOOT (Shift-click a button to hold it, click it again to release).',
  'Click the lab computer, write or modify the C18 program and BUILD it. The program must include vector_relocate.h (#include "vector_relocate.h") or remap its vectors to 0x1000 itself — otherwise uploading would erase the USB bootloader, so UPLOAD refuses it.',
  'Click UPLOAD, let it finish, then press RESET to run the program.',
  'Measure with the oscilloscope / DMM probes and compare the actual output with the expected output.',
];

const PB_ON: DipReq[] = [
  { bank: 'pb', index: 0, on: true, label: 'Push-button DIP 1 ON (SW0 → RB1)' },
  { bank: 'pb', index: 1, on: true, label: 'Push-button DIP 2 ON (SW1 → RB0)' },
];

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'exp1', no: 1, co: 'CO1', arch: 'mcs51', mcu: 'AT89C51', status: 'ready',
    title: 'LED toggling using the 8051 microcontroller',
    objective: 'Develop and implement an embedded program to toggle an LED using an 8051 microcontroller.',
    problem: 'Write an embedded C program for the 8051 that toggles an LED connected to P1.0 with a delay of 500 ms, and observe the port in the simulator.',
    theory: [
      'Port 1 is a quasi-bidirectional port with internal pull-ups; writing 0 drives the pin low.',
      'sbit declares a single addressable bit of a bit-addressable SFR (P1^0 = bit address 0x90).',
      'Timer 0 mode 1 is a 16-bit up-counter clocked at $F_{osc} / 12$; TF0 sets on overflow from 0xFFFF.',
    ],
    hardware: ['No physical board: Keil µVision simulator workflow', 'AT89C51, 11.0592 MHz crystal', 'Virtual LED bar on Port 1 (LED lit when pin = 1)'],
    connections: [{ signal: 'LED', mcuPin: 'P1.0', board: 'Virtual LED 0 (Port 1 window)', verified: true }],
    starter: exp1,
    expected: ['P1.0 toggles continuously', 'Each state lasts ≈ 500 ms (period ≈ 1 s, 1 Hz)', 'Port 1 window shows bit 0 changing'],
    measurements: [
      { kind: 'pinFreq', label: 'P1.0 toggle frequency', pin: { port: 1, bit: 0 }, expectHz: 1, tolerance: 0.05 },
      { kind: 'ledbar51', label: 'Port 1 LEDs' },
    ],
    procedure: [
      'Write the program in the editor (Keil C51 syntax is accepted).',
      'Build Target (F7) and check the Build Output for errors.',
      'Start the debug session (Ctrl+F5), then Run (F5).',
      'Open Peripherals → Port 1 and watch P1.0 toggle; use Step (F11) to single-step.',
    ],
  },
  {
    id: 'exp2', no: 2, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready',
    title: 'Interfacing push-buttons, LEDs, relay and buzzer',
    objective: 'Design and develop interfacing of push-buttons, LEDs, relay and buzzer with the PIC18F4550.',
    problem: 'When SW0 is pressed, energise the relay and run the LEDs left-to-right; when SW1 is pressed, sound the buzzer and run the LEDs right-to-left; otherwise blink the LEDs alternately.',
    theory: [
      'TRISx selects direction (1 = input), LATx drives outputs, PORTx reads pin levels.',
      'ADCON1 = 0x0F makes all analog-capable pins digital; otherwise they read as 0.',
      'Push-buttons are active-low: the pin reads 0 while the key is pressed.',
      'The relay coil and buzzer are switched through NPN transistors (logic 1 = ON).',
      'RC1 and RC2 are shared by the RGB LED, relay, buzzer and motor driver: PERI_SW connects only the ones in use.',
    ],
    hardware: ['EXCEL PIC V1.0 module (PIC18F4550, 20 MHz crystal)', 'LED array section (L0–L7)', 'Push-button interface SW0/SW1', 'Relay and buzzer (PERI_SW)'],
    connections: [
      { signal: 'LED L0–L7', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → L_BANK', verified: false },
      { signal: 'SW0', mcuPin: 'RB1', board: 'Push button interface (DIP 1 ON)', verified: true },
      { signal: 'SW1', mcuPin: 'RB0', board: 'Push button interface (DIP 2 ON)', verified: true },
      { signal: 'Relay driver', mcuPin: 'RC1', board: 'PERI_SW 4 ON', verified: true },
      { signal: 'Buzzer driver', mcuPin: 'RC2', board: 'PERI_SW 5 ON', verified: true },
    ],
    board: {
      cables: { LBANK: 3, KEY: null, LCD_DATA: null, LCD_CTRL: null },
      switches: [
        ...PB_ON,
        { bank: 'periph', index: 3, on: true, label: 'PERI_SW 4 ON (relay ← RC1)' },
        { bank: 'periph', index: 4, on: true, label: 'PERI_SW 5 ON (buzzer ← RC2)' },
      ],
    },
    starter: exp2,
    expected: ['No key: LEDs alternate 0x55 / 0xAA every 300 ms, relay and buzzer OFF', 'SW0 held: relay clicks ON, single LED runs L0 → L7', 'SW1 held: buzzer ON, single LED runs L7 → L0'],
    measurements: [
      { kind: 'leds', label: 'LED bank (PORTD)' },
      { kind: 'relay', label: 'Relay' },
      { kind: 'buzzer', label: 'Buzzer' },
      { kind: 'pinState', label: 'SW0 (RB1)', pin: { port: 1, bit: 1 } },
      { kind: 'pinState', label: 'SW1 (RB0)', pin: { port: 1, bit: 0 } },
    ],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp3', no: 3, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready',
    title: 'Timer0 interrupt — square wave generation',
    objective: 'Implement the Timer0 interrupt concept using the PIC18F4550 to generate a square wave of any given frequency.',
    problem: 'Generate a 1 kHz square wave on RD0 using the Timer0 overflow interrupt. Verify the frequency on the oscilloscope, then change it to another frequency.',
    theory: [
      'The USB bootloader runs the CPU at 48 MHz (20 MHz crystal + PLL): $F_{cy} = F_{osc} / 4 = 12 MHz$, so one Timer0 count takes $1 / F_{cy} = 83.3 ns$ (prescaler bypassed).',
      'Counts per half period for a frequency f: $N = F_{cy} / (2f)$. For 1 kHz, $N = 6000$; the ISR reloads $TMR0 = 65536 − N$.',
      'In 16-bit mode TMR0H is buffered: write TMR0H first, then TMR0L.',
      'TMR0IF must be cleared in software inside the ISR.',
    ],
    hardware: ['EXCEL PIC V1.0 module (PIC18F4550, 48 MHz via bootloader PLL)', 'Tektronix TDS1002 oscilloscope: crocodile clips on male-to-female jumper wires', 'MECO 801 DMM (optional)'],
    connections: [
      { signal: 'Square wave → scope CH1', mcuPin: 'RD0', board: 'Jumper on the PORT-D header pin RD0', verified: true },
      { signal: 'Scope ground', mcuPin: 'GND', board: 'Jumper on the UART header GND pin', verified: true },
    ],
    board: {
      probes: [
        { plug: 'ch1', pin: 'RD0', label: 'CH1 probe jumper → RD0 (PORT-D header)' },
        { plug: 'scope:gnd', pin: 'GND', label: 'Probe ground jumper → GND (UART header)' },
      ],
    },
    starter: exp3,
    expected: ['Square wave on RD0 at 1000 Hz (period 1 ms), 50 % duty, 0–5 V on the oscilloscope'],
    measurements: [
      { kind: 'pinFreq', label: 'RD0 frequency', pin: { port: 3, bit: 0 }, expectHz: 1000, tolerance: 0.01 },
    ],
    procedure: [...PIC_PROCEDURE, 'On the oscilloscope press AUTOSET and read the frequency; the Logic Analyzer tab also measures RD0\'s period and duty cycle.'],
  },
  {
    id: 'exp4', no: 4, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready',
    title: 'PWM based DC motor speed control (CCP)',
    objective: 'Design and develop a PWM-based motor speed control system using the CCP module in PWM mode.',
    problem: 'Drive the DC motor through the L293D, applying CCP1 PWM at 5 kHz to its EN1 (speed) input. Step the duty cycle through 20, 40, 60, 80 and 100 % (about 1.5 s each) and repeat, and view the changing duty cycle on RC2 with the oscilloscope.',
    theory: [
      'PWM period: $T_{PWM} = (PR2 + 1) × 4 × T_{osc} × prescale$. At 48 MHz, PR2 = 149 with a 1:16 TMR2 prescale gives $T_{PWM} = 200 µs$ (5 kHz).',
      'Duty cycle (10-bit): $T_{ON} = (CCPR1L:CCP1CON<5:4>) × T_{osc} × prescale$.',
      'CCP1CON = 0x0C selects PWM mode; RC2 must be configured as an output.',
      'The motor sees the average voltage $V_{avg} = D × V_{supply}$ (D = duty cycle), so a DMM on RC2 reads $D × 5 V$.',
      'L293D: EN1/EN2 gate each channel pair, so PWM on EN sets the speed while IN1/IN2 set the direction (IN1 = 1, IN2 = 0: forward; equal levels: brake).',
    ],
    hardware: ['EXCEL PIC V1.0 module', 'DC motor section (L293D, DCM1)', '5 V yellow gear motor with slotted wheel on a metal stand (jumper wires to DCM1)', 'RGB LED blue (RC2) as a PWM brightness indicator', 'Tektronix TDS1002 oscilloscope: crocodile clips on male-to-female jumper wires'],
    connections: [
      { signal: 'L293D EN1 (PWM speed)', mcuPin: 'RC2 / CCP1', board: 'DC motor section (DCM_SW 1 ON)', verified: true },
      { signal: 'L293D IN1 (direction)', mcuPin: 'RD6', board: 'DC motor section (DCM_SW 2 ON)', verified: true },
      { signal: 'L293D IN2 (direction)', mcuPin: 'RD5', board: 'DC motor section (DCM_SW 3 ON)', verified: true },
      { signal: 'L293D EN2 (DCM2, unused)', mcuPin: 'RC1 / CCP2', board: 'DCM_SW 4', verified: true },
      { signal: 'PWM check: blue LED', mcuPin: 'RC2', board: 'PERI_SW 3 ON (buzzer PERI_SW 5 OFF)', verified: true },
      { signal: 'Motor', mcuPin: 'L293D OUT1/OUT2', board: 'Motor jumper wires on DCM1', verified: true },
      { signal: 'PWM → scope CH1', mcuPin: 'RC2', board: 'Jumper on the PORT-C header pin RC2', verified: true },
      { signal: 'Scope ground', mcuPin: 'GND', board: 'Jumper on the UART header GND pin', verified: true },
    ],
    board: {
      motor: true,
      probes: [
        { plug: 'ch1', pin: 'RC2', label: 'CH1 probe jumper → RC2 (PORT-C header)' },
        { plug: 'scope:gnd', pin: 'GND', label: 'Probe ground jumper → GND (UART header)' },
      ],
      switches: [
        { bank: 'dcm', index: 0, on: true, label: 'DCM_SW 1 ON (EN1 ← RC2 / CCP1)' },
        { bank: 'dcm', index: 1, on: true, label: 'DCM_SW 2 ON (IN1 ← RD6)' },
        { bank: 'dcm', index: 2, on: true, label: 'DCM_SW 3 ON (IN2 ← RD5)' },
        { bank: 'periph', index: 2, on: true, label: 'PERI_SW 3 ON (blue LED ← RC2: brightness follows the duty)' },
        { bank: 'periph', index: 4, on: false, label: 'PERI_SW 5 OFF (buzzer shares RC2)' },
      ],
    },
    starter: exp4,
    expected: ['PWM frequency 5 kHz on RC2 (period 200 µs)', 'Duty cycle steps 20 → 40 → 60 → 80 → 100 %, about 1.5 s each, then repeats', 'On the oscilloscope the pulse width grows while the period stays the same', 'Motor speed and blue LED brightness follow the duty cycle'],
    measurements: [
      { kind: 'pwm', label: 'CCP1 PWM', channel: 0 },
      { kind: 'motor', label: 'DC motor' },
    ],
    procedure: [...PIC_PROCEDURE, 'On the oscilloscope press AUTOSET and watch the pulse width on RC2 change every ~1.5 s (20 → 100 % duty) while the motor speeds up.'],
  },
  {
    id: 'exp5', no: 5, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready',
    title: 'Interfacing a 16×2 LCD to display a string',
    objective: 'Design and implement interfacing of a 16x2 LCD module to the PIC18F4550 to display a string.',
    problem: 'Initialise the LCD in 8-bit, 2-line mode and display a string on each line.',
    theory: [
      'HD44780 commands: 0x38 function set, 0x0C display on, 0x06 entry mode, 0x01 clear, 0x80/0xC0 line address.',
      'Data is latched on the falling edge of EN; RS selects command (0) or data (1).',
      'Commands need 37 µs (clear/home 1.52 ms) before the next write.',
      'ADCON1 = 0x0F is required so that RE0–RE2 work as digital I/O.',
    ],
    hardware: ['EXCEL PIC V1.0 module', 'LCD/GLCD display section with JHD162A 16×2 LCD', 'VLCD contrast preset'],
    connections: [
      { signal: 'LCD D0–D7', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → LCD_DATA', verified: true },
      { signal: 'RS', mcuPin: 'RE0', board: 'FRC: PORT-E → LCD_CNTRL (line 1)', verified: true },
      { signal: 'RW', mcuPin: 'RE1', board: 'FRC: PORT-E → LCD_CNTRL (line 2)', verified: true },
      { signal: 'EN', mcuPin: 'RE2', board: 'FRC: PORT-E → LCD_CNTRL (line 3)', verified: true },
    ],
    board: { cables: { LBANK: null, KEY: null, LCD_DATA: 3, LCD_CTRL: 4 } },
    starter: exp5,
    expected: ['Line 1: "  PICT  PUNE"', 'Line 2: "EP Lab - Expt 5"'],
    measurements: [{ kind: 'lcd', label: 'LCD contents' }],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp6', no: 6, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready',
    title: 'Temperature sensor with real-time LCD display',
    objective: 'Interface and program a temperature sensor with the PIC18F4550 to display real-time readings on an LCD: understand the working of an A/D converter, study the on-chip ADC of the PIC and interface an analog input to it.',
    problem: 'Read the LM35 on AN1 (RA1) with the 10-bit on-chip ADC, convert to °C and display it on the LCD every 500 ms. The lab writeup\'s variant reads a 0–5 V input (the trimmer pot on AN2) and shows the result in BCD / voltage form on the LCD.',
    theory: [
      'An analog-to-digital converter (ADC) turns an analog voltage into a binary number the microcontroller can process. Its main characteristics are resolution (n bits), conversion time and reference voltage $V_{ref}$.',
      'Step size (the smallest change the ADC can resolve): $Step = V_{ref} / 2^{n}$. With $V_{ref} = 5 V$: 8-bit → 19.53 mV, 10-bit → 4.88 mV, 12-bit → 1.22 mV, 16-bit → 0.076 mV.',
      'The resolution is fixed by the chip, but $V_{ref}$ sets the input range and step: for a 10-bit ADC, 2.56 V → 2.5 mV and 1.024 V → 1 mV per step.',
      'Conversion time is how long the ADC takes to convert a sample; acquisition time is how long the sample-and-hold circuit needs to charge to the input voltage before conversion.',
      'The PIC18F4550 has a 10-bit ADC with 13 inputs, AN0–AN12 (RA0–RA3, RA5, RE0–RE2, RB0–RB4). RA2 and RA3 can also be $V_{ref}−$ and $V_{ref}+$. On this board the LM35 is on AN1 (RA1) and the trimmer pot on AN2 (RA2).',
      'ADCON0: CHS3:CHS0 select the channel; setting GO/DONE starts a conversion and it reads 0 when the result is ready; ADON switches the module on.',
      'ADCON1: VCFG1 chooses $V_{ref}−$ (AN2 or $V_{SS}$) and VCFG0 $V_{ref}+$ (AN3 or $V_{DD}$); PCFG3:PCFG0 choose which pins are analog. 0x0D makes AN0–AN1 analog, 0x0C AN0–AN2 (needed for the pot on AN2).',
      'ADCON2: ADFM = 1 right-justifies the 10-bit result in ADRESH:ADRESL; ACQT2:ACQT0 set the acquisition time in multiples of $T_{AD}$; ADCS2:ADCS0 select the conversion clock.',
      '$T_{AD}$ (conversion time per bit) must be at least 0.7 µs, and a 10-bit conversion takes $11 T_{AD}$. At $F_{osc} = 48 MHz$, ADCS = 110 ($F_{osc} / 64$) gives $T_{AD} = 64 / 48 MHz = 1.33 µs$, so one conversion takes $11 × 1.33 µs = 14.7 µs$.',
      'Required acquisition time: $T_{ACQ} = T_{AMP} + T_{C} + T_{COFF} = 0.2 µs + 1.05 µs + 1.2 µs = 2.45 µs$. ACQT = 001 gives $2 T_{AD} = 2.67 µs$; the reference program uses ACQT = 010, $4 T_{AD} = 5.33 µs$. Both exceed 2.45 µs.',
      'Conversion steps: configure ADCON1, ADCON0 and ADCON2 and turn the module on → wait the acquisition time → set GO/DONE → poll until GO/DONE = 0 (or wait for the ADIF interrupt) → read ADRESH:ADRESL. Wait at least $3 T_{AD}$ before the next acquisition.',
      'The analog pin must also be an input (TRISA bit = 1): an output pin\'s driver overrides the sensor and the ADC then reads 0 V or 5 V.',
      'Input voltage from the result: $V_{in} = ADC × 5 V / 1023$. LM35 output is 10 mV / °C (0 °C → 0 V), so $T(°C) = ADC × 500 / 1023$; one step is $5 V / 1024 ≈ 4.88 mV ≈ 0.49 °C$.',
    ],
    hardware: ['EXCEL PIC V1.0 module', 'LM35 at the analog input section (or the trimmer pot on AN2)', '16×2 LCD', 'MECO 801 DMM on DC volts (checks the analog input voltage)'],
    connections: [
      { signal: 'LM35 Vout', mcuPin: 'RA1 / AN1', board: 'Analog input section (ANALOG INP DIP 2 ON)', verified: true },
      { signal: 'Trimmer pot (alternative input)', mcuPin: 'RA2 / AN2', board: 'Analog input section (ANALOG INP DIP 1 ON)', verified: true },
      { signal: 'DMM (DC volts)', mcuPin: 'RA1 / RA2, GND', board: 'Red lead on the PORT-A header pin, black lead on a GND pin', verified: true },
      { signal: 'LCD data', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → LCD_DATA', verified: true },
      { signal: 'RS / RW / EN', mcuPin: 'RE0 / RE1 / RE2', board: 'FRC: PORT-E → LCD_CNTRL', verified: true },
    ],
    board: {
      cables: { LBANK: null, KEY: null, LCD_DATA: 3, LCD_CTRL: 4 },
      tempTask: true,
      dmm: [
        { plug: 'dmm:v', pin: ['RA1', 'RA2'], label: 'DMM red lead (VΩHz) → RA1 (LM35) or RA2 (pot) on the PORT-A header' },
        { plug: 'dmm:com', pin: 'GND', label: 'DMM black lead (COM) → a GND pin' },
      ],
      // both inputs are switched on: some batches run the program on the LM35, others on the pot
      switches: [
        { bank: 'analog', index: 0, on: true, label: 'ANALOG INP DIP 1 ON (trimmer pot → RA2 / AN2)' },
        { bank: 'analog', index: 1, on: true, label: 'ANALOG INP DIP 2 ON (LM35 → RA1 / AN1)' },
      ],
    },
    starter: exp6,
    expected: ['Line 1: "Temperature:"', 'Line 2: current temperature, e.g. "027.3°C"', 'Reading follows the LM35 temperature slider within ±0.5 °C'],
    measurements: [{ kind: 'temperature', label: 'LM35' }, { kind: 'lcd', label: 'LCD contents' }],
    procedure: [
      ...PIC_PROCEDURE.flatMap((p) => (p.startsWith('Plug the Type-B USB') ? ['Connect the multimeter on DC volts: red lead on RA1 (LM35) or RA2 (pot) on the PORT-A header, black lead on a GND pin.', p] : [p])),
      'With the program running, change the LM35 temperature in the Hardware tab and check that the LCD reading follows it (and the DMM reads 10 mV per °C on RA1).',
    ],
  },
  {
    id: 'exp7', no: 7, co: 'CO2', arch: 'esp32', mcu: 'ESP32', status: 'planned',
    title: 'ESP32 LED blinking and Wi-Fi connectivity',
    objective: 'Develop an ESP32-based LED blinking program and establish Wi-Fi connectivity for IoT applications.',
    problem: 'Blink the on-board LED and connect the ESP32 to a Wi-Fi network (station mode), reporting the IP address.',
    theory: [], hardware: ['ESP32 development board (model to be confirmed)'], connections: [],
    starter: '', expected: [], measurements: [], procedure: [],
  },
  {
    id: 'exp8', no: 8, co: 'CO2', arch: 'stm32', mcu: 'STM32', status: 'planned',
    title: 'STM32 GPIO and timer configuration',
    objective: 'Configure and evaluate STM32 GPIO and timer functionalities to optimize system performance.',
    problem: 'Configure GPIO outputs and a general-purpose timer interrupt on the STM32 and evaluate timing.',
    theory: [], hardware: ['STM32 board (model to be confirmed)'], connections: [],
    starter: '', expected: [], measurements: [], procedure: [],
  },
];

export const getExperiment = (id: string) => EXPERIMENTS.find((e) => e.id === id);
