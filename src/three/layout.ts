// Parametric layout of the Smart Logic Technologies "EXCEL PIC V1.0" trainer,
// reconstructed from the single reference photograph.
//
// Coordinates are millimetres in PHOTO orientation (x → right, y → down) with the
// origin at the top-left corner of the base board. Scale was calibrated from the
// JHD162A LCD module (80 × 36 mm) and the 40-pin DIP (52 mm), giving ≈ 10 px/mm
// on the 1482 × 2000 reference image. Every value here is an estimate and can be
// refined without touching any rendering code.

import type { FrcTarget } from '../sim/board/types.ts';

export const BASE = { w: 139, h: 188, t: 1.6, color: '#1d6b3c' };
export const MODULE = { x: 0, y: 49.5, w: 83, h: 92, t: 1.6, elevation: 11, color: '#1f7542' };

export type PortFrc = 'PORT-A' | 'PORT-B' | 'PORT-C' | 'PORT-D' | 'PORT-E' | 'P0' | 'P1' | 'P2' | 'P3';
/** Which module sits on the base board: the EXCEL PIC V1.0 (PIC18F4550) or the EXCEL-51 v1.0 (SST89E516RD2). */
export type BoardVariant = 'pic18' | 'mcs51';

interface Base { id?: string; x: number; y: number; rot?: number; name?: string; info?: string; onModule?: boolean }

export type Part = Base & (
  | { kind: 'dip'; pins: number; label?: string; sub?: string; socket?: boolean; wide?: boolean }
  | { kind: 'socket'; pins: number }
  | { kind: 'header'; n: number; rows?: 1 | 2; female?: boolean }
  | { kind: 'boxHeader'; color: 'black' | 'white'; frc?: FrcTarget | PortFrc }
  | { kind: 'tact'; cap: 'white' | 'black' | 'silver'; input?: string; size?: number }
  | { kind: 'dipSwitch'; n: number; bank?: 'pb' | 'periph' | 'dcm' | 'analog' }
  | { kind: 'led'; color: 'red' | 'green' | 'yellow'; d?: 3 | 5; signal?: string }
  | { kind: 'rgbLed' }
  | { kind: 'resistor'; bands?: string[] }
  | { kind: 'capE'; d: number; h: number; color?: string }
  | { kind: 'capC'; color?: string }
  | { kind: 'crystal'; type: 'hc49' | 'cyl'; label?: string }
  | { kind: 'dcJack' }
  | { kind: 'usbB' }
  | { kind: 'db9' }
  | { kind: 'relay' }
  | { kind: 'buzzer'; d: number }
  | { kind: 'lcd' }
  | { kind: 'trimpot'; input?: 'pot' | 'contrast' }
  | { kind: 'terminal'; n: number; color?: string; labels?: string[] }
  | { kind: 'regulator' }
  | { kind: 'zif' }
  | { kind: 'to92'; label?: string; sensor?: boolean }
  | { kind: 'slide'; input?: 'power' }
  | { kind: 'jumper'; n: number; cap?: number }
  | { kind: 'relimate'; n: number }
  | { kind: 'screw' }
  | { kind: 'qfn'; size: number }
  | { kind: 'sip'; n: number }
  | { kind: 'diode' }
);

export interface SilkLabel { text: string; x: number; y: number; size: number; rot?: number; bold?: boolean; align?: CanvasTextAlign; onModule?: boolean }
export interface SilkRect { x: number; y: number; w: number; h: number; onModule?: boolean }

const keys: Part[] = [];
const keyX = [99.5, 108.5, 117.8, 127.2];
const keyY = [37, 46.3, 55.5, 65];
for (let c = 0; c < 4; c++) {
  for (let r = 0; r < 4; r++) {
    const ms = c * 4 + (3 - r);
    keys.push({
      kind: 'tact', cap: 'white', id: `key${ms}`, input: `key${ms}`, x: keyX[c], y: keyY[r], size: 7.2,
      name: `MS${ms}`, info: `Matrix keypad key MS${ms} — row ${ms & 3}, column ${ms >> 2} (KEY connector lines ${ms & 3} and ${4 + (ms >> 2)})`,
    });
  }
}

const ledY = [2.2, 6, 9.6, 13.3, 17, 20.8, 24.5, 28.3];

export const PARTS: Part[] = [
  // ------------------------------------------------------------ power
  { kind: 'dcJack', x: 9, y: 9.5, rot: 0, name: '12 VDC input', info: 'Base board DC input jack: the 12 V adapter\'s barrel plug. The adapter brick lies behind the kit; its 2-pin plug goes into the wall socket.' },
  { kind: 'slide', id: 'power', input: 'power', x: 18.5, y: 11, rot: 90, name: 'Power switch', info: 'ON / OFF slide switch. Click to toggle board power.' },
  { kind: 'regulator', x: 3, y: 25, rot: 90, name: 'U1 7805', info: '5 V linear regulator with heatsink.' },
  { kind: 'capE', x: 12.5, y: 19.5, d: 6.3, h: 11, color: '#1d3f8f', name: 'C3 1000 µF' },
  { kind: 'capC', x: 18.5, y: 23, color: '#d08a2a' },
  { kind: 'capC', x: 18.5, y: 27, color: '#d08a2a' },
  { kind: 'resistor', x: 13, y: 37.8, rot: 0 },
  { kind: 'led', id: 'pwr-led', color: 'green', d: 3, x: 18.5, y: 38, signal: 'POWER', name: 'LP1 power LED' },
  { kind: 'jumper', x: 19.5, y: 44, n: 3, rot: 90, cap: 0, name: 'JP1', info: 'Power source select (DC jack / USB). Unverified.' },
  { kind: 'screw', x: 1.5, y: 7.5 },

  // DIP switches (checked against the board photo): switch 1 at the photo-left end, ON towards
  // photo-up (-y) for the horizontal ones; PERI_SW stands vertical with switch 1 at the bottom, ON to the left.
  // ------------------------------------------------------- push buttons
  { kind: 'tact', cap: 'white', id: 'sw0', input: 'sw0', x: 28.8, y: 10.5, size: 7.2, name: 'SW0', info: 'Push button SW0 → RB1 (active low, pull-up; PICT chart).' },
  { kind: 'tact', cap: 'white', id: 'sw1', input: 'sw1', x: 37.8, y: 10.5, size: 7.2, name: 'SW1', info: 'Push button SW1 → RB0 (active low, pull-up; PICT chart).' },
  { kind: 'resistor', x: 33, y: 18.5, rot: 0, name: 'R3 10k pull-up' },
  { kind: 'resistor', x: 33, y: 21.5, rot: 0, name: 'R2 10k pull-up' },
  { kind: 'dipSwitch', id: 'dip-pb', n: 2, bank: 'pb', x: 32.8, y: 28, rot: 0, name: 'Push button DIP', info: 'ON connects SW0 / SW1 to the port pins.' },
  { kind: 'jumper', x: 33.8, y: 35.5, n: 3, rot: 0, cap: 1, name: 'JP2' },
  { kind: 'tact', cap: 'white', id: 'reset-base', input: 'reset', x: 30.5, y: 44.5, size: 7.2, name: 'RESET', info: 'Base-board RESET (MCLR). Hold to keep the PIC in reset.' },
  { kind: 'tact', cap: 'white', id: 'boot-base', input: 'boot', x: 38, y: 44.5, size: 7.2, name: 'BOOT', info: 'USB bootloader entry: hold BOOT while releasing RESET.' },

  // ------------------------------------------------------------- I2C
  { kind: 'dip', pins: 8, x: 47.5, y: 9.2, rot: 90, label: 'DS1307', sub: 'RTC', name: 'U2 DS1307 RTC', info: 'I2C real-time clock, SCL ← RB1, SDA ↔ RB0 (PICT chart; visual only in this version).' },
  { kind: 'dip', pins: 8, x: 47.5, y: 24.7, rot: 90, label: '24C04', sub: 'EEPROM', name: 'U3 24C04 EEPROM', info: 'I2C EEPROM, SCL ← RB1, SDA ↔ RB0 (PICT chart; visual only in this version).' },
  { kind: 'crystal', type: 'cyl', x: 53.8, y: 14, rot: 90, label: '32.768k', name: 'Y1 32.768 kHz' },
  { kind: 'jumper', x: 55.5, y: 6.5, n: 3, rot: 90, cap: 0, name: 'BAT SEL' },
  { kind: 'capC', x: 47, y: 16.8, color: '#d08a2a' },
  { kind: 'capC', x: 46, y: 32, color: '#d08a2a' },
  { kind: 'dipSwitch', n: 2, x: 47.8, y: 38.5, rot: 0, name: 'I2C DIP', info: 'Connects SDA/SCL pull-ups (visual only).' },
  { kind: 'resistor', x: 53, y: 38.5, rot: 90 },
  { kind: 'resistor', x: 55.2, y: 38.5, rot: 90 },
  { kind: 'jumper', x: 48.5, y: 46, n: 3, rot: 0, cap: 0, name: 'I2C' },

  // ------------------------------------------------------------- SPI
  { kind: 'terminal', n: 2, x: 62, y: 5.5, rot: 0, name: 'T1', info: 'Screw terminal (function not identified).' },
  { kind: 'terminal', n: 2, x: 74.5, y: 5.5, rot: 0, name: 'T2', info: 'Screw terminal (function not identified).' },
  { kind: 'socket', pins: 8, x: 69, y: 17.5, rot: 0, name: 'U5 (empty)', info: 'Empty DIP-8 socket for an SPI device.' },
  { kind: 'socket', pins: 8, x: 69, y: 27.5, rot: 0, name: 'U4 (empty)', info: 'Empty DIP-8 socket for an SPI device.' },
  { kind: 'capC', x: 62, y: 21, color: '#d08a2a' },
  { kind: 'capC', x: 62, y: 27, color: '#d08a2a' },
  { kind: 'dipSwitch', n: 6, x: 70, y: 37.8, rot: 0, name: 'SPI_SW', info: 'SPI routing: SCK ← RB1, SDI ← RB0, SDO → RC7, CS_EEPROM ← RA5, CS_DAC ← RA4 (PICT chart; visual only).' },
  { kind: 'header', n: 6, rows: 2, x: 70.5, y: 45.2, rot: 0 },

  // -------------------------------------------------------- DC motor
  { kind: 'relimate', n: 2, x: 90.2, y: 3.5, rot: 0, name: 'DCM1', info: 'DC motor 1 connector (L293D OUT1/OUT2). Plug the gear motor jumper wires onto its two pins.' },
  { kind: 'relimate', n: 2, x: 99.5, y: 3.5, rot: 0, name: 'DCM2', info: 'DC motor 2 connector (L293D OUT3/OUT4: EN2 ← RC1, IN3 ← RD1, IN4 ← RD0).' },
  { kind: 'dip', pins: 16, x: 93.2, y: 12.3, rot: 0, label: 'L293D', sub: 'ST', name: 'U6 L293D', info: 'Dual H-bridge motor driver. EN1 ← RC2/CCP1, EN2 ← RC1/CCP2 (PWM speed); IN1 ← RD6, IN2 ← RD5, IN3 ← RD1, IN4 ← RD0 (direction). PICT chart; editable in the Hardware tab.' },
  { kind: 'dipSwitch', id: 'dip-dcm', n: 6, bank: 'dcm', x: 94.7, y: 21.8, rot: 0, name: 'DCM_SW', info: '1: EN1 ← RC2/CCP1   2: IN1 ← RD6   3: IN2 ← RD5   4: EN2 ← RC1/CCP2   (PICT chart)' },
  { kind: 'header', n: 6, x: 95, y: 28, rot: 0 },

  // ------------------------------------------------------- LED array
  { kind: 'boxHeader', color: 'black', frc: 'LBANK', x: 113.8, y: 15, rot: 90, name: 'L_BANK', info: 'LED bank FRC connector: line n drives LED Ln (active high, assumed).' },
  ...ledY.map((y, i): Part => ({ kind: 'led', id: `L${i}`, color: 'red', d: 3, x: 123, y, signal: `L${i}`, name: `L${i}`, info: `LED L${i} on LED-bank line ${i}.` })),
  { kind: 'sip', n: 9, x: 128.3, y: 16.5, rot: 90, name: 'RP1 resistor network' },
  { kind: 'screw', x: 132.5, y: 3.5 },

  // -------------------------------------------------- matrix keypad
  { kind: 'boxHeader', color: 'black', frc: 'KEY', x: 88.5, y: 49.3, rot: 90, name: 'MAT_KEY', info: 'Keypad FRC: lines 0–3 = rows, 4–7 = columns (assumed). Pull-ups on board (assumed).' },
  ...keys,

  // ------------------------------------------------- relay / buzzer
  { kind: 'to92', x: 93.2, y: 75.5, rot: 0, label: 'BC547', name: 'Q1 relay driver' },
  { kind: 'diode', x: 103.2, y: 76.5, rot: 90, name: 'D1 flyback diode' },
  { kind: 'resistor', x: 100.5, y: 81.5, rot: 90 },
  { kind: 'relay', id: 'relay', x: 113.5, y: 79.5, rot: 0, name: 'REL1 relay', info: '5 V SPDT relay (HLS8L-DC5V-S-C) driven from RC1 via Q1 when PERI_SW 4 is ON (PICT chart). Contacts NO / COM / NC.' },
  { kind: 'terminal', n: 3, x: 131.5, y: 78, rot: 90, color: '#2f9e57', labels: ['NO', 'COM', 'NC'], name: 'Relay contacts', info: 'NO / COM / NC screw terminal. A test lamp is connected between COM and NO.' },
  { kind: 'dipSwitch', id: 'dip-periph', n: 6, bank: 'periph', x: 91.5, y: 87.5, rot: 270, name: 'PERI_SW', info: '1: RGB red ← RA3   2: RGB green ← RC1   3: RGB blue ← RC2   4: relay ← RC1   5: buzzer ← RC2   (PICT chart)' },
  { kind: 'header', n: 6, x: 98.2, y: 87.5, rot: 90, name: 'JP3' },
  { kind: 'rgbLed', id: 'rgb', x: 107.2, y: 91, name: 'RGB_LED', info: 'RGB LED: red ← RA3, green ← RC1, blue ← RC2 through PERI_SW 1–3 (PICT chart). Mixed colours follow the PWM duty of each pin.' },
  { kind: 'capE', x: 103, y: 96, d: 5, h: 7, color: '#222' },
  { kind: 'buzzer', id: 'buzzer', d: 12, x: 130.5, y: 93.5, name: 'BZ1 buzzer', info: 'Active buzzer driven from RC2 via Q2 when PERI_SW 5 is ON (PICT chart).' },
  { kind: 'to92', x: 115, y: 97, rot: 0, label: 'BC547', name: 'Q2 buzzer driver' },
  { kind: 'diode', x: 117, y: 91, rot: 0 },
  { kind: 'resistor', x: 114.5, y: 93.5, rot: 0 },

  // ---------------------------------------------------- LCD / GLCD
  // LCD DATA / LCD CNTRL boxes share one column, 2.2 mm apart, clear of the GLCD header
  { kind: 'lcd', id: 'lcd', x: 120.5, y: 141, rot: -90, name: 'JHD162A 16×2 LCD', info: 'HD44780 character LCD. Data ← LCD_DATA FRC, RS/RW/EN ← LCD_CNTRL FRC lines 0/1/2 (assumed).' },
  { kind: 'boxHeader', color: 'black', frc: 'LCD_DATA', x: 92.8, y: 131, rot: 90, name: 'LCD_DATA', info: 'LCD D0–D7 on FRC lines 0–7.' },
  { kind: 'boxHeader', color: 'black', frc: 'LCD_CTRL', x: 92.8, y: 153.5, rot: 90, name: 'LCD_CNTRL', info: 'LCD control FRC: line 0 = RS, 1 = RW, 2 = EN (assumed).' },
  { kind: 'header', n: 20, x: 99.5, y: 143, rot: 90, name: 'GLCD 128×64 header' },
  { kind: 'trimpot', id: 'vlcd', input: 'contrast', x: 90.7, y: 178.5, name: 'VLCD contrast', info: 'LCD contrast preset. Scroll or drag to adjust.' },
  { kind: 'jumper', x: 100, y: 183, n: 2, rot: 90, cap: 0, name: 'JP4 (GLCD)' },

  // ----------------------------------------------------- serial / USB
  { kind: 'usbB', x: 10.7, y: 173, rot: 0, name: 'USB2UART', info: 'USB to UART bridge (CP2102). Opens the virtual serial terminal.' },
  { kind: 'qfn', size: 4, x: 15, y: 151.5, name: 'U10 CP2102' },
  { kind: 'led', color: 'green', d: 3, x: 27, y: 162, signal: 'TXLED', name: 'LP2 TX' },
  { kind: 'led', color: 'green', d: 3, x: 28, y: 167, signal: 'RXLED', name: 'LP3 RX' },
  { kind: 'resistor', x: 24, y: 172, rot: 0 },
  { kind: 'resistor', x: 24, y: 175, rot: 0 },
  { kind: 'capE', x: 28, y: 155.5, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'capE', x: 35.5, y: 155.5, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'capE', x: 41, y: 155.5, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'capE', x: 46.5, y: 155.5, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'capE', x: 51.8, y: 155.5, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'capE', x: 22.5, y: 180, d: 5, h: 7, color: '#1d3f8f' },
  { kind: 'dip', pins: 16, x: 43.5, y: 165, rot: 0, label: 'MAX232', sub: 'ST', name: 'U8 MAX232', info: 'RS-232 level shifter for the DB9 serial port (TX ← RC6, RX → RC7).' },
  { kind: 'db9', x: 44.5, y: 182.5, rot: 0, name: 'DB9 serial', info: 'RS-232 port. Serial data is shown in the UART terminal tab.' },
  { kind: 'header', n: 6, x: 49.8, y: 150.8, rot: 0, name: 'UART header', info: 'GND · RXD1 · TXD1 · RXD0 · TXD0 · VCC. Its GND pin is the ground point for the oscilloscope probe jumpers.' },
  { kind: 'jumper', x: 36, y: 150.5, n: 3, rot: 0, cap: 0, name: 'UART' },

  // ------------------------------------------------------ analog in
  { kind: 'dipSwitch', id: 'dip-analog', n: 2, bank: 'analog', x: 64.3, y: 153, rot: 0, name: 'ANALOG INP DIP', info: '1: trimmer pot → RA2/AN2   2: LM35 → RA1/AN1   (PICT chart)' },
  { kind: 'jumper', x: 64.5, y: 158.5, n: 3, rot: 0, cap: 1, name: 'JP6' },
  { kind: 'trimpot', id: 'pot', input: 'pot', x: 64.5, y: 167, name: 'Analog POT (PIC AN2)', info: '10 kΩ trimmer, 0–5 V on RA2/AN2 when DIP 1 is ON. Scroll or drag to adjust.' },
  { kind: 'to92', id: 'lm35', x: 66, y: 179.5, rot: 0, label: 'LM35', sensor: true, name: 'LM35 temperature sensor', info: '10 mV/°C on RA1/AN1 when DIP 2 is ON. Set the temperature in the Hardware tab.' },

  // ------------------------------------------------------------ CAN
  { kind: 'jumper', x: 76.5, y: 150.5, n: 3, rot: 0, cap: 1, name: 'JP5' },
  { kind: 'dip', pins: 8, x: 79, y: 160, rot: 90, label: 'MCP2551', name: 'U9 MCP2551 CAN transceiver', info: 'Visual only.' },
  { kind: 'resistor', x: 77, y: 171.5, rot: 0 },
  { kind: 'resistor', x: 77, y: 174.5, rot: 0 },
  { kind: 'relimate', n: 2, x: 81.5, y: 180, rot: 90, name: 'CAN' },
  { kind: 'capC', x: 75, y: 178, color: '#d08a2a' },

  { kind: 'screw', x: 136, y: 185 },
  { kind: 'screw', x: 3, y: 185 },

  // ======================================================= PIC MODULE
  { onModule: true, kind: 'dcJack', x: 7.5, y: 57, rot: 0, name: '9–12 V DC-IN (module)' },
  { onModule: true, kind: 'header', n: 18, female: true, x: 39.8, y: 52.6, rot: 0, name: 'CN1' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'PORT-B', x: 29, y: 62.9, rot: 0, name: 'PORT-B FRC', info: 'PORT-B 10-pin FRC: pins 1–8 = RB0–RB7, 9 = GND, 10 = VCC.' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'PORT-D', x: 54.5, y: 62.9, rot: 0, name: 'PORT-D FRC', info: 'PORT-D 10-pin FRC: RD0–RD7, GND, VCC.' },
  { onModule: true, kind: 'header', n: 10, x: 31, y: 74, rot: 0, name: 'PORT-B pins' },
  { onModule: true, kind: 'header', n: 10, x: 57.5, y: 74, rot: 0, name: 'PORT-D pins' },
  { onModule: true, kind: 'led', color: 'green', d: 3, x: 69, y: 54.2, signal: 'LP4', name: 'LP4', info: 'Lights while RESET is pressed; blinks with LP3 while the USB bootloader is active.' },
  { onModule: true, kind: 'led', color: 'green', d: 3, x: 74, y: 54.2, signal: 'LP3', name: 'LP3', info: 'Lights while BOOT is pressed; blinks with LP4 while the USB bootloader is active.' },
  { onModule: true, kind: 'tact', cap: 'silver', id: 'boot-mod', input: 'boot', x: 75.3, y: 61.3, size: 6, name: 'BOOT (module)', info: 'USB bootloader entry: hold BOOT while releasing RESET.' },
  { onModule: true, kind: 'tact', cap: 'silver', id: 'reset-mod', input: 'reset', x: 75.3, y: 74, size: 6, name: 'RESET (module)', info: 'MCLR reset. Hold to keep the PIC18F4550 in reset.' },
  { onModule: true, kind: 'resistor', x: 79, y: 67.5, rot: 90 },
  { onModule: true, kind: 'resistor', x: 80.5, y: 77, rot: 90 },
  { onModule: true, kind: 'zif', x: 46, y: 94.5, rot: 0, name: '40-pin ZIF socket' },
  { onModule: true, kind: 'dip', pins: 40, wide: true, x: 47.5, y: 95, rot: 0, label: 'PIC18F4550-I/P', sub: '1546XYZ', name: 'U2 PIC18F4550', info: 'PIC18F4550 @ 20 MHz crystal (assumed). 32 KB flash, 2 KB RAM.' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 54.3, y: 82, rot: 0, name: 'Pins 40–21' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 54.8, y: 108, rot: 0, name: 'Pins 1–20' },
  { onModule: true, kind: 'led', color: 'red', d: 3, x: 79.5, y: 83, signal: 'POWER', name: 'LP2' },
  { onModule: true, kind: 'crystal', type: 'hc49', x: 55.3, y: 113, rot: 0, label: '20.000', name: 'Y1 20 MHz crystal', info: 'Primary oscillator crystal. 20 MHz is an assumption (configurable).' },
  { onModule: true, kind: 'capC', x: 48, y: 113, color: '#c98a3a' },
  { onModule: true, kind: 'capC', x: 63, y: 113, color: '#c98a3a' },
  { onModule: true, kind: 'jumper', x: 78, y: 113, n: 3, rot: 0, cap: 0, name: 'JP4 (UBLP / NORM)' },
  { onModule: true, kind: 'led', color: 'red', d: 3, x: 19, y: 113, signal: 'POWER', name: 'LP1 POWER' },
  { onModule: true, kind: 'capC', x: 6, y: 106, color: '#3a7bd5' },
  { onModule: true, kind: 'jumper', x: 2, y: 118.3, n: 3, rot: 90, cap: 1, name: 'EXT / USB' },
  // opening faces the module's left edge (towards the lab PC); exact spot on the module is an approximation
  { onModule: true, kind: 'usbB', x: 7, y: 134.5, rot: -90, name: 'USB (PIC)', info: 'Type-B USB to the PIC18F4550 (USB HID bootloader). Plug the cable from the lab PC here. Position on the module is approximate (unverified).' },
  { onModule: true, kind: 'jumper', x: 7, y: 118.3, n: 3, rot: 90, cap: 1, name: 'RB0' },
  { onModule: true, kind: 'jumper', x: 12, y: 118.3, n: 3, rot: 90, cap: 1, name: 'RB1' },
  { onModule: true, kind: 'header', n: 8, x: 26.8, y: 119.6, rot: 0, name: 'PORT-A pins' },
  { onModule: true, kind: 'header', n: 5, x: 47.3, y: 119.6, rot: 0, name: 'PORT-E pins' },
  { onModule: true, kind: 'header', n: 10, x: 70.5, y: 119.6, rot: 0, name: 'PORT-C pins' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'PORT-A', x: 25.5, y: 130.8, rot: 0, name: 'PORT-A FRC', info: 'PORT-A 10-pin FRC: RA0–RA5 (+RA6/RA7 n.c.), GND, VCC.' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'PORT-E', x: 49, y: 130.8, rot: 0, name: 'PORT-E FRC', info: 'PORT-E 10-pin FRC: RE0–RE2, GND, VCC.' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'PORT-C', x: 72.3, y: 130.8, rot: 0, name: 'PORT-C FRC', info: 'PORT-C 10-pin FRC: RC0–RC7, GND, VCC.' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 48, y: 139.5, rot: 0, name: 'CN2' },
];

export const SECTIONS: SilkRect[] = [
  { x: 0.5, y: 0.5, w: 24.5, h: 48 },
  { x: 25, y: 0.5, w: 16.5, h: 48 },
  { x: 41.5, y: 0.5, w: 17.5, h: 48 },
  { x: 59, y: 0.5, w: 22.5, h: 48 },
  { x: 81.5, y: 0.5, w: 26.5, h: 31 },
  { x: 108, y: 0.5, w: 30.5, h: 31 },
  { x: 84, y: 31.5, w: 54.5, h: 38.5 },
  { x: 84, y: 70, w: 54.5, h: 30 },
  { x: 84, y: 100, w: 54.5, h: 87.5 },
  { x: 17, y: 142, w: 42, h: 45.5 },
  { x: 59, y: 142, w: 12, h: 45.5 },
  { x: 71, y: 142, w: 13, h: 45.5 },
  { x: 0.5, y: 142, w: 16.5, h: 45.5 },
];

const V = -90; // base-board text reads bottom-to-top in the photo
export const LABELS: SilkLabel[] = [
  { text: 'POWER SECTION', x: 24, y: 32, size: 2.4, rot: V, bold: true },
  { text: '12VDC Input', x: 2.2, y: 18, size: 1.6, rot: V },
  { text: 'ON', x: 21.5, y: 6.5, size: 1.6, rot: V },
  { text: 'OFF', x: 21.5, y: 16.5, size: 1.6, rot: V },
  { text: 'JP1', x: 23.5, y: 44, size: 1.5, rot: V },
  { text: 'LP1', x: 22, y: 38, size: 1.2, rot: V },
  { text: 'JP2', x: 38.2, y: 35.5, size: 1.2, rot: V },
  { text: 'PUSH BUTTON', x: 41, y: 30, size: 2.2, rot: V, bold: true },
  { text: 'INTERFACE', x: 43.4, y: 30, size: 2.2, rot: V, bold: true },
  { text: 'SW0', x: 28.8, y: 5.3, size: 1.6, rot: V },
  { text: 'SW1', x: 37.8, y: 5.3, size: 1.6, rot: V },
  { text: 'RESET', x: 30.5, y: 39, size: 1.4, rot: V },
  { text: 'BOOT', x: 38, y: 39, size: 1.4, rot: V },
  { text: 'I2C SECTION', x: 58, y: 38, size: 2.4, rot: V, bold: true },
  { text: 'BAT SEL', x: 58.2, y: 8, size: 1.4, rot: V },
  { text: 'SPI SECTION', x: 80, y: 38, size: 2.4, rot: V, bold: true },
  { text: 'SPI_SW', x: 62, y: 37.8, size: 1.3, rot: V },
  { text: 'DC MOTOR SECTION', x: 106.5, y: 16, size: 2.4, rot: V, bold: true },
  { text: 'DCM1', x: 86, y: 3.5, size: 1.4, rot: V },
  { text: 'DCM2', x: 104, y: 3.5, size: 1.4, rot: V },
  { text: 'DCM_SW', x: 86, y: 21.8, size: 1.3, rot: V },
  { text: 'U6', x: 104, y: 12.3, size: 1.4, rot: V },
  { text: 'LED ARRAY SECTION', x: 135.2, y: 16, size: 2.4, rot: V, bold: true },
  { text: 'L_BANK', x: 108.6, y: 15, size: 1.5, rot: V },
  ...ledY.map((y, i): SilkLabel => ({ text: `L${i}`, x: 119.3, y, size: 1.3, rot: V })),
  { text: 'MATRIX KEYPAD SECTION', x: 135.2, y: 51, size: 2.4, rot: V, bold: true },
  { text: 'MAT_KEY', x: 84.6, y: 49.3, size: 1.5, rot: V },
  ...keys.map((k): SilkLabel => ({ text: k.name!, x: k.x - 4.8, y: k.y, size: 1.25, rot: V })),
  { text: 'RELAY', x: 86.5, y: 76, size: 1.6, rot: V, bold: true },
  { text: 'NO  COM  NC', x: 136.5, y: 78, size: 1.4, rot: V },
  { text: 'BUZZER', x: 138, y: 93.5, size: 1.5, rot: V, bold: true },
  { text: 'RGB_LED', x: 111.2, y: 91, size: 1.2, rot: V },
  { text: 'PERI_SW', x: 87.3, y: 87.5, size: 1.3, rot: V },
  { text: 'RGBLED, BUZZER, RELAY', x: 96.8, y: 79.5, size: 1, rot: V },
  { text: 'LCD/GLCD', x: 88.5, y: 108, size: 2.2, rot: V, bold: true },
  { text: 'DISPLAY', x: 91, y: 108, size: 2.2, rot: V, bold: true },
  { text: 'SECTION', x: 93.5, y: 108, size: 2.2, rot: V, bold: true },
  { text: 'LCD_DATA', x: 87.4, y: 131, size: 1.5, rot: V },
  { text: 'LCD_CNTRL', x: 87.4, y: 153.5, size: 1.5, rot: V },
  { text: 'GLCD 128X64', x: 97.2, y: 123, size: 1.3, rot: V },
  { text: 'VLCD', x: 85.8, y: 178.5, size: 1.4, rot: V },
  { text: 'JP4', x: 97, y: 183, size: 1.3, rot: V },
  { text: 'JHD 162A', x: 104.2, y: 152, size: 1.6, rot: V, bold: true },
  { text: 'USB2UART', x: 5, y: 168, size: 1.8, rot: V, bold: true },
  { text: 'SECTION', x: 7.3, y: 168, size: 1.8, rot: V, bold: true },
  { text: 'CP2102', x: 19.2, y: 151.5, size: 1.2, rot: V },
  { text: 'SERIAL', x: 56, y: 160, size: 2.1, rot: V, bold: true },
  { text: 'INTERFACE', x: 58.3, y: 160, size: 2.1, rot: V, bold: true },
  { text: 'VCC TXD0 RXD0 TXD1 RXD1 GND', x: 49.8, y: 147.6, size: 1.05 },
  { text: 'ANALOG INP', x: 69.8, y: 152, size: 1.8, rot: V, bold: true },
  { text: 'PIC AN2', x: 69.5, y: 167, size: 1.3, rot: V },
  { text: 'CAN INTERFACE', x: 84.6, y: 156, size: 1.8, rot: V, bold: true },

  // ---- PIC module (text is upside-down in the photo)
  { text: 'PIC uC Development Board', x: 46, y: 136.6, size: 2.2, rot: 180, bold: true, onModule: true },
  { text: 'USB', x: 7, y: 124.6, size: 1.5, rot: 180, onModule: true },
  { text: 'SMART LOGIC TECHNOLOGIES', x: 49, y: 78.2, size: 1.9, rot: 180, bold: true, onModule: true },
  { text: 'EXCEL-PIC V1.0', x: 55, y: 76.2, size: 1.7, rot: 180, onModule: true },
  { text: 'PORT-B', x: 29, y: 68.6, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-D', x: 54.5, y: 68.6, size: 1.6, rot: 180, onModule: true },
  { text: 'RB7 RB6 RB5 RB4 RB3 RB2 RB1 RB0 GND VCC', x: 31, y: 71.4, size: 0.85, rot: 180, onModule: true },
  { text: 'RD7 RD6 RD5 RD4 RD3 RD2 RD1 RD0 GND VCC', x: 57.5, y: 71.4, size: 0.85, rot: 180, onModule: true },
  { text: 'VCC GND RA0 RA1 RA2 RA3 RA4 RA5', x: 26.8, y: 122, size: 0.85, rot: 180, onModule: true },
  { text: 'VCC GND RE0 RE1 RE2', x: 47.3, y: 122, size: 0.85, rot: 180, onModule: true },
  { text: 'VCC GND RC0 RC1 RC2 RC3 RC4 RC5 RC6 RC7', x: 70.5, y: 122, size: 0.85, rot: 180, onModule: true },
  { text: 'PORT-A', x: 25.5, y: 125.4, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-E', x: 49, y: 125.4, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-C', x: 72.3, y: 125.4, size: 1.6, rot: 180, onModule: true },
  { text: '9V-12V DC-IN', x: 2, y: 60, size: 1.4, rot: V, onModule: true },
  { text: 'REV1.0  NOV-15', x: 3.5, y: 72, size: 1.4, rot: V, onModule: true },
  { text: 'PICkit2/3', x: 6.5, y: 95.5, size: 1.3, rot: V, onModule: true },
  { text: 'POWER', x: 19, y: 109.5, size: 1.3, rot: V, onModule: true },
  { text: 'BOOT', x: 75.3, y: 57.3, size: 1.2, rot: 180, onModule: true },
  { text: 'RESET', x: 75.3, y: 70, size: 1.2, rot: 180, onModule: true },
  { text: 'LP3  LP4', x: 71.5, y: 51.3, size: 1.2, rot: 180, onModule: true },
  { text: 'EXT  RB0  RB1', x: 7, y: 114.6, size: 1.1, rot: V, onModule: true },
  { text: 'CN1', x: 15.5, y: 52.6, size: 1.2, rot: 180, onModule: true },
  { text: 'CN2', x: 21.5, y: 139.5, size: 1.2, rot: 180, onModule: true },
  { text: '40', x: 30.5, y: 82, size: 1.1, rot: 180, onModule: true },
  { text: '1', x: 31, y: 108, size: 1.1, rot: 180, onModule: true },
];

/** Silkscreen names of the base-board FRC connectors (and of the 8051 module's port headers). */
export const FRC_LABEL: Record<string, string> = { LBANK: 'L_BANK', KEY: 'MAT_KEY', LCD_DATA: 'LCD_DATA', LCD_CTRL: 'LCD_CNTRL', P0: 'PORT-0', P1: 'PORT-1', P2: 'PORT-2', P3: 'PORT-3' };

type FrcPoints = Record<string, { x: number; y: number; rot: number; module: boolean }>;
const frcPoints = (parts: Part[]): FrcPoints => Object.fromEntries(
  parts.filter((p): p is Part & { kind: 'boxHeader' } => p.kind === 'boxHeader' && !!p.frc).map((p) => [p.frc!, { x: p.x, y: p.y, rot: p.rot ?? 0, module: !!p.onModule }]),
);
/** Where each FRC connector's ribbon attaches (centre, photo mm) and on which board (PIC kit). */
export const FRC_POINTS: FrcPoints = frcPoints(PARTS);

// =================================================================== EXCEL-51 MODULE
// Smart Logic Technologies "51 uC DEVELOPMENT BOARD" EXCEL-51 v1.0 (REV1.0 MAY-17): same
// footprint and stacking connectors as the PIC module, on the same base board. Positions were
// measured on the lab photo of the kit (approximate, same photo coordinates as the base board).
const ledY51 = [82.5, 86.4, 90.3, 94.2, 98.1, 102, 105.9, 109.9]; // L0..L7
export const MODULE51_PARTS: Part[] = [
  { onModule: true, kind: 'header', n: 20, female: true, x: 39.3, y: 53.6, rot: 0, name: 'CN1' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'P0', x: 28, y: 61.9, rot: 0, name: 'PORT-0 FRC', info: 'PORT-0 10-pin FRC: P0.0–P0.7, GND, VCC. Port 0 is open-drain: RP1 gives it pull-ups.' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'P2', x: 55, y: 60.7, rot: 0, name: 'PORT-2 FRC', info: 'PORT-2 10-pin FRC: P2.0–P2.7, GND, VCC.' },
  { onModule: true, kind: 'header', n: 10, x: 29.7, y: 75.4, rot: 0, name: 'PORT-0 pins' },
  { onModule: true, kind: 'header', n: 10, x: 56, y: 75.2, rot: 0, name: 'PORT-2 pins' },
  { onModule: true, kind: 'sip', n: 9, x: 31, y: 79.5, rot: 0, name: 'RP1 resistor network', info: 'Pull-up network for the open-drain Port 0 (assumed 10 kΩ).' },
  { onModule: true, kind: 'tact', cap: 'silver', id: 'reset-51', input: 'reset', x: 76.2, y: 72.2, size: 6, name: 'RESET (module)', info: 'Resets the SST89E516RD2 (RST held high while pressed). Releasing it starts your program, or, while SST EasyIAP is detecting the chip, enters the IAP boot firmware.' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 45.2, y: 83, rot: 0, name: 'CN4 (pins 40–21)' },
  { onModule: true, kind: 'zif', x: 40.7, y: 95.9, rot: 0, name: '40-pin ZIF socket' },
  { onModule: true, kind: 'dip', pins: 40, wide: true, x: 42.2, y: 96.4, rot: 0, label: 'SST89E516RD2', sub: '40-C-PIE', name: 'SST89E516RD2', info: 'SST FlashFlex51: 8052-compatible core, 64 KB flash, 1 KB RAM, 11.0592 MHz crystal. Programmed over the UART by its IAP boot firmware (SST EasyIAP).' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 45.2, y: 109.7, rot: 0, name: 'CN3 (pins 1–20)' },
  { onModule: true, kind: 'crystal', type: 'hc49', x: 68.5, y: 114.3, rot: 0, label: '11.0592', name: 'Y1 11.0592 MHz crystal', info: '11.0592 MHz: gives standard baud rates (9600 with TH1 = 0xFD) and a 921.6 kHz machine cycle.' },
  { onModule: true, kind: 'capC', x: 71.5, y: 118.5, color: '#c98a3a', name: 'C5' },
  { onModule: true, kind: 'capC', x: 75, y: 118.5, color: '#c98a3a', name: 'C6' },
  ...ledY51.map((y, i): Part => ({ onModule: true, kind: 'led', id: `M${i}`, color: 'red', d: 3, x: 77.8, y, signal: `M${i}`, name: `L${i} (module)`, info: `Module LED L${i} on P1.${i}: lights when P1.${i} = 1 (active high).` })),
  { onModule: true, kind: 'jumper', x: 80.2, y: 114.7, n: 2, rot: 90, cap: 0, name: 'JP3', info: 'Module LED enable jumper (assumed: fitted).' },
  { onModule: true, kind: 'resistor', x: 80.6, y: 122.6, rot: 90, name: 'R4' },
  { onModule: true, kind: 'resistor', x: 80.6, y: 131.3, rot: 90, name: 'R3' },
  { onModule: true, kind: 'tact', cap: 'white', id: 'pb1-51', x: 72.6, y: 127.8, size: 6, name: 'PB1', info: 'Module push button PB1 (connection not identified; not simulated).' },
  { onModule: true, kind: 'tact', cap: 'white', id: 'pb0-51', x: 72.6, y: 138.5, size: 6, name: 'PB0', info: 'Module push button PB0 (connection not identified; not simulated).' },
  { onModule: true, kind: 'header', n: 10, x: 28.2, y: 118.7, rot: 0, name: 'PORT-1 pins' },
  { onModule: true, kind: 'header', n: 10, x: 56, y: 118.7, rot: 0, name: 'PORT-3 pins' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'P1', x: 25.8, y: 131.3, rot: 0, name: 'PORT-1 FRC', info: 'PORT-1 10-pin FRC: P1.0–P1.7, GND, VCC. P1 also drives the module LEDs L0–L7.' },
  { onModule: true, kind: 'boxHeader', color: 'white', frc: 'P3', x: 55.8, y: 131.5, rot: 0, name: 'PORT-3 FRC', info: 'PORT-3 10-pin FRC: P3.0–P3.7 (RXD, TXD, INT0, INT1, T0, T1, WR, RD), GND, VCC.' },
  { onModule: true, kind: 'header', n: 20, female: true, x: 40.3, y: 141.3, rot: 0, name: 'CN2' },
  { onModule: true, kind: 'header', n: 3, rows: 2, x: 5.6, y: 94.4, rot: 0, name: '2×3 header', info: 'Function not identified (not used in the practicals).' },
  { onModule: true, kind: 'led', color: 'green', d: 3, x: 2, y: 79, signal: 'POWER', name: 'LP1 POWER', info: 'Module power LED.' },
  { onModule: true, kind: 'jumper', x: 10.1, y: 80.2, n: 3, rot: 90, cap: 1, name: 'USB / POWER / EXT', info: 'Module supply select (left as found: powered from the base board).' },
];

const V51 = -90;
export const MODULE51_LABELS: SilkLabel[] = [
  { text: '51 \u00b5C DEVELOPMENT BOARD', x: 40.5, y: 137.4, size: 2.1, rot: 180, bold: true, onModule: true },
  { text: 'SMART LOGIC TECHNOLOGIES', x: 56, y: 79.9, size: 1.5, rot: 180, bold: true, onModule: true },
  { text: 'EXCEL-51 v1.0', x: 56, y: 77.9, size: 1.4, rot: 180, onModule: true },
  { text: 'REV1.0  MAY-17', x: 3.2, y: 112, size: 1.4, rot: V51, onModule: true },
  { text: 'PORT-0', x: 28, y: 68.3, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-2', x: 55, y: 67.6, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-1', x: 25.8, y: 125.1, size: 1.6, rot: 180, onModule: true },
  { text: 'PORT-3', x: 55.8, y: 125.1, size: 1.6, rot: 180, onModule: true },
  { text: 'P0.7 P0.6 P0.5 P0.4 P0.3 P0.2 P0.1 P0.0 GND VCC', x: 29.7, y: 72.8, size: 0.8, rot: 180, onModule: true },
  { text: 'P2.7 P2.6 P2.5 P2.4 P2.3 P2.2 P2.1 P2.0 GND VCC', x: 56, y: 72.6, size: 0.8, rot: 180, onModule: true },
  { text: 'VCC GND P1.0 P1.1 P1.2 P1.3 P1.4 P1.5 P1.6 P1.7', x: 28.2, y: 121.2, size: 0.8, rot: 180, onModule: true },
  { text: 'VCC GND P3.0 P3.1 P3.2 P3.3 P3.4 P3.5 P3.6 P3.7', x: 56, y: 121.2, size: 0.8, rot: 180, onModule: true },
  { text: 'RESET', x: 76.2, y: 68, size: 1.2, rot: 180, onModule: true },
  { text: 'PB1', x: 72.6, y: 123.6, size: 1.2, rot: 180, onModule: true },
  { text: 'PB0', x: 72.6, y: 134.3, size: 1.2, rot: 180, onModule: true },
  ...ledY51.map((y, i): SilkLabel => ({ text: `L${i}`, x: 81, y, size: 1.1, rot: 180, onModule: true })),
  { text: 'JP3', x: 80.2, y: 118.6, size: 1, rot: 180, onModule: true },
  { text: 'LP1', x: 2, y: 75.6, size: 1.1, rot: V51, onModule: true },
  { text: 'USB POWER EXT', x: 13.8, y: 80.2, size: 1, rot: V51, onModule: true },
  { text: 'PS', x: 7.5, y: 58, size: 1.3, rot: 180, onModule: true },
  { text: 'U4', x: 15, y: 104, size: 1.2, rot: 180, onModule: true },
  { text: 'CN1', x: 12, y: 53.6, size: 1.2, rot: 180, onModule: true },
  { text: 'CN2', x: 13.5, y: 141.3, size: 1.2, rot: 180, onModule: true },
  { text: 'CN3', x: 18, y: 109.7, size: 1.1, rot: 180, onModule: true },
  { text: 'CN4', x: 18, y: 83, size: 1.1, rot: 180, onModule: true },
  { text: 'Y1', x: 68.5, y: 110.8, size: 1.1, rot: 180, onModule: true },
  { text: 'RP1', x: 44.5, y: 79.5, size: 1.1, rot: 180, onModule: true },
];

/**
 * Base-board tooltips with the 8051 kit fitted: the SST column of PICT's "Explore Board
 * Connections" chart. The 8051 model drives the module LEDs and the base-board LED bank; the
 * other base-board peripherals are not simulated with this module yet.
 */
const NOT51 = ' Not simulated with the 8051 module in this version.';
const INFO51: Record<string, string> = {
  sw0: 'Push button SW0 \u2192 P0.2 (SST column of the PICT chart).' + NOT51,
  sw1: 'Push button SW1 \u2192 P0.3 (SST column of the PICT chart).' + NOT51,
  'reset-base': 'Base-board RESET: resets the SST89E516RD2 like the module\u2019s RESET button (assumed).',
  'boot-base': 'BOOT is the PIC module\u2019s USB-bootloader button: the 8051 module does not use it.',
  'U2 DS1307 RTC': 'I2C real-time clock: SCL \u2190 P0.5, SDA \u2194 P0.4 (SST column; visual only).',
  'U3 24C04 EEPROM': 'I2C EEPROM: SCL \u2190 P0.5, SDA \u2194 P0.4 (SST column; visual only).',
  SPI_SW: 'SPI routing: SCK \u2190 P1.7, SDI \u2190 P1.6, SDO \u2192 P1.5, CS_EEPROM \u2190 P1.4, CS_DAC \u2190 P1.3 (SST column; visual only).',
  'U6 L293D': 'Dual H-bridge: EN1 \u2190 P1.0, IN1 \u2190 P2.4, IN2 \u2190 P2.3, EN2 \u2190 P1.1, IN3 \u2190 P0.7, IN4 \u2190 P0.6 (SST column).' + NOT51,
  'dip-dcm': '1: EN1 \u2190 P1.0   2: IN1 \u2190 P2.4   3: IN2 \u2190 P2.3   4: EN2 \u2190 P1.1   (SST column).' + NOT51,
  relay: '5 V SPDT relay \u2190 P2.5 through PERI_SW 4 (SST column).' + NOT51,
  'dip-periph': '1: RGB red \u2190 P3.7   2: RGB green \u2190 P1.1   3: RGB blue \u2190 P1.0   4: relay \u2190 P2.5   5: buzzer \u2190 P1.0   (SST column).' + NOT51,
  rgb: 'RGB LED: red \u2190 P3.7, green \u2190 P1.1, blue \u2190 P1.0 through PERI_SW 1\u20133 (SST column).' + NOT51,
  buzzer: 'Buzzer \u2190 P1.0 through PERI_SW 5 (SST column).' + NOT51,
  'dip-analog': 'The SST89E516RD2 has no ADC: the pot and the LM35 have no 8051 pin (SST column: none).',
  pot: 'The SST89E516RD2 has no ADC: the trimmer pot is not used with the 8051 kit.',
  lm35: 'The SST89E516RD2 has no ADC: the LM35 is not used with the 8051 kit.',
  USB2UART: 'USB to UART bridge (CP2102): TXD \u2192 P3.0 (RXD), RXD \u2190 P3.1 (TXD). On the 8051 kit this is the programming port: plug the lab PC\u2019s Type-B cable in here, then use SST EasyIAP.',
  'U8 MAX232': 'RS-232 level shifter for the DB9 port (8051 UART: P3.1 TXD, P3.0 RXD).',
  L_BANK: 'LED bank FRC connector: line n drives LED Ln. With the 8051 kit, run a ribbon from a PORT-0..3 header.',
  MAT_KEY: 'Keypad FRC connector.' + NOT51,
  LCD_DATA: 'LCD D0\u2013D7 FRC connector.' + NOT51,
  LCD_CNTRL: 'LCD control FRC connector (RS, RW, EN).' + NOT51,
  lcd: 'HD44780 16\u00d72 character LCD.' + NOT51,
};

const BASE_PARTS = PARTS.filter((p) => !p.onModule);
const BASE_PARTS_51 = BASE_PARTS.map((p) => {
  const info = INFO51[p.id ?? ''] ?? INFO51[p.name ?? ''];
  return info ? { ...p, info } : p;
});
const PARTS_51 = [...BASE_PARTS_51, ...MODULE51_PARTS];
const LABELS_51 = [...LABELS.filter((l) => !l.onModule), ...MODULE51_LABELS];
const FRC_POINTS_51 = frcPoints(PARTS_51);

export const partsFor = (v: BoardVariant): Part[] => (v === 'mcs51' ? PARTS_51 : PARTS);
export const labelsFor = (v: BoardVariant): SilkLabel[] => (v === 'mcs51' ? LABELS_51 : LABELS);
export const frcPointsFor = (v: BoardVariant): FrcPoints => (v === 'mcs51' ? FRC_POINTS_51 : FRC_POINTS);
