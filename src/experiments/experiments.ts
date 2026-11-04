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
  toolchain: string;
  status: 'ready' | 'planned';
  objective: string;
  problem: string;
  theory: string[];
  hardware: string[];
  connections: Connection[];
  board?: {
    cables?: Partial<Record<FrcTarget, number | null>>;
    dips?: Partial<PicBoardConfig['dips']>;
  };
  starter: string;
  expected: string[];
  measurements: Measurement[];
  procedure: string[];
}

const PIC_TOOLCHAIN = 'MPLAB IDE · C18 conventions (built with XC8) · USB HID bootloader';
const PIC_PROCEDURE = [
  'Check the FRC ribbon cables and DIP switches (drag ribbon plugs between the PORT headers and the peripheral connectors).',
  'Click the lab computer, write or modify the C18 program and click UPLOAD.',
  'Plug the Type-B USB cable into the board.',
  'Enter bootloader mode: hold RESET, press and hold BOOT, release RESET, release BOOT (right-click a button to hold it).',
  'Let the upload finish, then press RESET to run the program.',
  'Measure with the oscilloscope / DMM probes and compare the actual output with the expected output.',
];

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'exp1', no: 1, co: 'CO1', arch: 'mcs51', mcu: 'AT89C51', status: 'ready',
    title: 'LED toggling using the 8051 microcontroller',
    toolchain: 'Keil µVision · C51 (simulated with SDCC + Keil compatibility)',
    objective: 'Develop and implement an embedded program to toggle an LED using an 8051 microcontroller.',
    problem: 'Write an embedded C program for the 8051 that toggles an LED connected to P1.0 with a delay of 500 ms, and observe the port in the simulator.',
    theory: [
      'Port 1 is a quasi-bidirectional port with internal pull-ups; writing 0 drives the pin low.',
      'sbit declares a single addressable bit of a bit-addressable SFR (P1^0 = bit address 0x90).',
      'Timer 0 mode 1 is a 16-bit up-counter clocked at Fosc/12; TF0 sets on overflow from 0xFFFF.',
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
    id: 'exp2', no: 2, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready', toolchain: PIC_TOOLCHAIN,
    title: 'Interfacing push-buttons, LEDs, relay and buzzer',
    objective: 'Design and develop interfacing of push-buttons, LEDs, relay and buzzer with the PIC18F4550.',
    problem: 'When SW0 is pressed, energise the relay and run the LEDs left-to-right; when SW1 is pressed, sound the buzzer and run the LEDs right-to-left; otherwise blink the LEDs alternately.',
    theory: [
      'TRISx selects direction (1 = input), LATx drives outputs, PORTx reads pin levels.',
      'ADCON1 = 0x0F makes all analog-capable pins digital; otherwise they read as 0.',
      'Push-buttons are active-low: the pin reads 0 while the key is pressed.',
      'The relay coil and buzzer are switched through NPN transistors (logic 1 = ON).',
    ],
    hardware: ['EXCEL PIC V1.0 module (PIC18F4550, 20 MHz crystal)', 'LED array section (L0–L7)', 'Push-button interface SW0/SW1', 'Relay and buzzer section'],
    connections: [
      { signal: 'LED L0–L7', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → L-BANK', verified: false },
      { signal: 'SW0', mcuPin: 'RB0', board: 'Push button interface (DIP 1 ON)', verified: false },
      { signal: 'SW1', mcuPin: 'RB1', board: 'Push button interface (DIP 2 ON)', verified: false },
      { signal: 'Relay driver', mcuPin: 'RA4', board: 'Relay section (DIP 1 ON)', verified: false },
      { signal: 'Buzzer driver', mcuPin: 'RA5', board: 'Buzzer (DIP 2 ON)', verified: false },
    ],
    board: { cables: { LBANK: 3, KEY: null, LCD_DATA: null, LCD_CTRL: null }, dips: { pb: [true, true], periph: [true, true, false, false, false, false] } },
    starter: exp2,
    expected: ['No key: LEDs alternate 0x55 / 0xAA every 300 ms, relay and buzzer OFF', 'SW0 held: relay clicks ON, single LED runs L0 → L7', 'SW1 held: buzzer ON, single LED runs L7 → L0'],
    measurements: [
      { kind: 'leds', label: 'LED bank (PORTD)' },
      { kind: 'relay', label: 'Relay' },
      { kind: 'buzzer', label: 'Buzzer' },
      { kind: 'pinState', label: 'SW0 (RB0)', pin: { port: 1, bit: 0 } },
      { kind: 'pinState', label: 'SW1 (RB1)', pin: { port: 1, bit: 1 } },
    ],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp3', no: 3, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready', toolchain: PIC_TOOLCHAIN,
    title: 'Timer0 interrupt — square wave generation',
    objective: 'Implement the Timer0 interrupt concept using the PIC18F4550 to generate a square wave of any given frequency.',
    problem: 'Generate a 1 kHz square wave on RD0 using the Timer0 overflow interrupt. Verify the frequency on the oscilloscope, then change it to another frequency.',
    theory: [
      'The USB bootloader runs the CPU at 48 MHz (20 MHz crystal + PLL): Fcy = Fosc / 4 = 12 MHz → one Timer0 count = 83.3 ns (prescaler bypassed).',
      'Half period for f: N = Fcy / (2f); 1 kHz → N = 6000, reload TMR0 = 65536 − N in the ISR.',
      'In 16-bit mode TMR0H is buffered: write TMR0H first, then TMR0L.',
      'TMR0IF must be cleared in software inside the ISR.',
    ],
    hardware: ['EXCEL PIC V1.0 module (PIC18F4550, 48 MHz via bootloader PLL)', 'Tektronix TDS1002 oscilloscope / MECO 801 DMM on RD0', 'LED L0 via PORT-D → L-BANK'],
    connections: [{ signal: 'Square wave', mcuPin: 'RD0', board: 'FRC: PORT-D → L-BANK (L0), logic analyzer CH0', verified: false }],
    board: { cables: { LBANK: 3, KEY: null, LCD_DATA: null, LCD_CTRL: null } },
    starter: exp3,
    expected: ['Square wave on RD0 at 1000 Hz (period 1 ms), 50 % duty', 'L0 appears half-bright (toggling faster than the eye can follow)'],
    measurements: [
      { kind: 'pinFreq', label: 'RD0 frequency', pin: { port: 3, bit: 0 }, expectHz: 1000, tolerance: 0.01 },
    ],
    procedure: [...PIC_PROCEDURE, 'Open the Logic Analyzer tab and probe RD0 to measure period and duty cycle.'],
  },
  {
    id: 'exp4', no: 4, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready', toolchain: PIC_TOOLCHAIN,
    title: 'PWM based DC motor speed control (CCP)',
    objective: 'Design and develop a PWM-based motor speed control system using the CCP module in PWM mode.',
    problem: 'Drive the DC motor through the L293D using CCP1 PWM at 5 kHz. Increase the speed in 10 % steps with SW0 and decrease with SW1; show the level on the LED bank.',
    theory: [
      'PWM period = (PR2 + 1) · 4 · Tosc · TMR2 prescale; at 48 MHz, PR2 = 149 and 1:16 give 200 µs (5 kHz).',
      'Duty = (CCPR1L:CCP1CON<5:4>) · Tosc · TMR2 prescale (10-bit resolution).',
      'CCP1CON = 0x0C selects PWM mode; RC2 must be configured as an output.',
      'The motor sees the average voltage: V_avg = duty × V_supply. A DMM on RC2 reads duty × 5 V.',
    ],
    hardware: ['EXCEL PIC V1.0 module', 'DC motor section (L293D, DCM1)', '12 V DC motor (external)', 'Push buttons SW0/SW1, LED bank'],
    connections: [
      { signal: 'L293D IN1 (PWM)', mcuPin: 'RC2 / CCP1', board: 'DC motor section (DCM_SW 2 ON)', verified: false },
      { signal: 'L293D IN2 (direction)', mcuPin: 'RC1', board: 'DC motor section (DCM_SW 3 ON)', verified: false },
      { signal: 'L293D EN1', mcuPin: '— (VCC)', board: 'DCM_SW 1 ON', verified: false },
      { signal: 'Speed + / −', mcuPin: 'RB0 / RB1', board: 'SW0 / SW1', verified: false },
      { signal: 'Level bar graph', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → L-BANK', verified: false },
    ],
    board: { cables: { LBANK: 3, KEY: null, LCD_DATA: null, LCD_CTRL: null }, dips: { pb: [true, true], dcm: [true, true, true, false, false, false] } },
    starter: exp4,
    expected: ['PWM frequency 5 kHz on RC2', 'Start: 50 % duty, motor at half speed', 'SW0 → +10 % per step, SW1 → −10 % per step (0 – 100 %)'],
    measurements: [
      { kind: 'pwm', label: 'CCP1 PWM', channel: 0 },
      { kind: 'motor', label: 'DC motor' },
      { kind: 'leds', label: 'Speed level (LEDs)' },
    ],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp5', no: 5, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready', toolchain: PIC_TOOLCHAIN,
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
      { signal: 'LCD D0–D7', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → LCD DATA', verified: false },
      { signal: 'RS', mcuPin: 'RE0', board: 'FRC: PORT-E → LCD CNTRL (line 1)', verified: false },
      { signal: 'RW', mcuPin: 'RE1', board: 'FRC: PORT-E → LCD CNTRL (line 2)', verified: false },
      { signal: 'EN', mcuPin: 'RE2', board: 'FRC: PORT-E → LCD CNTRL (line 3)', verified: false },
    ],
    board: { cables: { LBANK: null, KEY: null, LCD_DATA: 3, LCD_CTRL: 4 } },
    starter: exp5,
    expected: ['Line 1: "  PICT  PUNE"', 'Line 2: "EP Lab - Expt 5"'],
    measurements: [{ kind: 'lcd', label: 'LCD contents' }],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp6', no: 6, co: 'CO1', arch: 'pic18', mcu: 'PIC18F4550', status: 'ready', toolchain: PIC_TOOLCHAIN,
    title: 'Temperature sensor with real-time LCD display',
    objective: 'Interface and program a temperature sensor with the PIC18F4550 to display real-time readings on an LCD.',
    problem: 'Read the LM35 on AN0 with the 10-bit ADC, convert to °C and display it on the LCD every 500 ms.',
    theory: [
      'LM35 output: 10 mV / °C (0 °C → 0 V).',
      'With Vref = 5 V: 1 LSB = 5 / 1024 ≈ 4.88 mV ≈ 0.49 °C.',
      'ADCON0 selects the channel and starts conversion (GO/DONE); ADCON1 sets analog pins; ADCON2 sets justification and TAD.',
      'T(°C) = ADC × 500 / 1023.',
    ],
    hardware: ['EXCEL PIC V1.0 module', 'LM35 at the analog input section', '16×2 LCD'],
    connections: [
      { signal: 'LM35 Vout', mcuPin: 'RA0 / AN0', board: 'Analog input section (DIP 2 ON, pot DIP 1 OFF)', verified: false },
      { signal: 'LCD data', mcuPin: 'RD0–RD7', board: 'FRC: PORT-D → LCD DATA', verified: false },
      { signal: 'RS / RW / EN', mcuPin: 'RE0 / RE1 / RE2', board: 'FRC: PORT-E → LCD CNTRL', verified: false },
    ],
    board: { cables: { LBANK: null, KEY: null, LCD_DATA: 3, LCD_CTRL: 4 }, dips: { analog: [false, true] } },
    starter: exp6,
    expected: ['Line 1: "Temperature:"', 'Line 2: current temperature, e.g. "027.3°C"', 'Reading follows the LM35 temperature slider within ±0.5 °C'],
    measurements: [{ kind: 'temperature', label: 'LM35' }, { kind: 'lcd', label: 'LCD contents' }],
    procedure: PIC_PROCEDURE,
  },
  {
    id: 'exp7', no: 7, co: 'CO2', arch: 'esp32', mcu: 'ESP32', status: 'planned', toolchain: 'Arduino IDE / ESP-IDF',
    title: 'ESP32 LED blinking and Wi-Fi connectivity',
    objective: 'Develop an ESP32-based LED blinking program and establish Wi-Fi connectivity for IoT applications.',
    problem: 'Blink the on-board LED and connect the ESP32 to a Wi-Fi network (station mode), reporting the IP address.',
    theory: [], hardware: ['ESP32 development board (model to be confirmed)'], connections: [],
    starter: '', expected: [], measurements: [], procedure: [],
  },
  {
    id: 'exp8', no: 8, co: 'CO2', arch: 'stm32', mcu: 'STM32', status: 'planned', toolchain: 'STM32CubeIDE',
    title: 'STM32 GPIO and timer configuration',
    objective: 'Configure and evaluate STM32 GPIO and timer functionalities to optimize system performance.',
    problem: 'Configure GPIO outputs and a general-purpose timer interrupt on the STM32 and evaluate timing.',
    theory: [], hardware: ['STM32 board (model to be confirmed)'], connections: [],
    starter: '', expected: [], measurements: [], procedure: [],
  },
];

export const getExperiment = (id: string) => EXPERIMENTS.find((e) => e.id === id);
