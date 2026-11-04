// USB HID bootloader model for the EXCEL PIC V1.0 module.
//
// Boards of this kind ship with Microchip's USB HID bootloader in the first 4 KB
// of flash: it owns the configuration bits (20 MHz crystal, HSPLL -> 48 MHz for
// USB) and forwards the reset / interrupt vectors to the application at 0x1000.
// That is why C18 lab programs remap their vectors with
//   #pragma code _RESET_INTERRUPT_VECTOR = 0x1000
//
// The USB stack itself is not emulated; entering/leaving bootloader mode is
// handled by the simulation engine (RESET + BOOT sequence), and the flash write
// path below enforces the same rules the real bootloader does.

import { parseIntelHex } from '../core/hex.ts';
import type { Pic18 } from './pic18.ts';

export const APP_START = 0x1000;
export const FLASH_END = 0x8000;

/** CONFIG1L..CONFIG7H as programmed with the bootloader (assumed: 20 MHz crystal, 48 MHz CPU). */
export const BOOTLOADER_CONFIG = [
  0x24, // CONFIG1L: PLLDIV = 5 (20 MHz / 5 = 4 MHz PLL in), CPUDIV = OSC1_PLL2 (96/2 = 48 MHz), USBDIV = 2
  0x0e, // CONFIG1H: FOSC = HSPLL_HS
  0x1f, // CONFIG2L: PWRT off, BOR, VREGEN on (USB)
  0x1e, // CONFIG2H: WDT off
  0x00,
  0x81, // CONFIG3H: MCLRE on, PBADEN off, CCP2 on RC1
  0x81, // CONFIG4L: STVREN on, LVP off, XINST off
  0x00, 0x0f, 0xc0, 0x0f, 0xe0, 0x0f, 0x40,
];

/** GOTO k encoded as two little-endian PIC18 words. */
function gotoBytes(target: number): number[] {
  const k = target >> 1;
  const w1 = 0xef00 | (k & 0xff);
  const w2 = 0xf000 | ((k >> 8) & 0xfff);
  return [w1 & 0xff, w1 >> 8, w2 & 0xff, w2 >> 8];
}

/** Installs the bootloader image: vector forwarding + configuration bits. */
export function installBootloader(mcu: Pic18) {
  mcu.prog.fill(0xff, 0, APP_START);
  mcu.prog.set(gotoBytes(APP_START), 0x0000);
  mcu.prog.set(gotoBytes(APP_START + 0x08), 0x0008);
  mcu.prog.set(gotoBytes(APP_START + 0x18), 0x0018);
  mcu.config.set(BOOTLOADER_CONFIG);
  mcu.recalcClock();
}

export function eraseApplication(mcu: Pic18) {
  mcu.prog.fill(0xff, APP_START, FLASH_END);
}

export function applicationBlank(mcu: Pic18): boolean {
  for (let a = APP_START; a < APP_START + 0x40; a++) if (mcu.prog[a] !== 0xff) return false;
  return true;
}

export interface FlashResult {
  bytes: number;
  skippedBoot: number;
  skippedConfig: boolean;
  warnings: string[];
}

/** Writes a HEX image the way the HID bootloader does: application flash and EEPROM only. */
export function flashApplication(mcu: Pic18, hex: string): FlashResult {
  eraseApplication(mcu);
  let bytes = 0, skippedBoot = 0, skippedConfig = false;
  for (const seg of parseIntelHex(hex)) {
    for (let i = 0; i < seg.data.length; i++) {
      const a = seg.address + i;
      if (a < APP_START) skippedBoot++;
      else if (a < FLASH_END) { mcu.prog[a] = seg.data[i]; bytes++; }
      else if (a >= 0x300000 && a < 0x30000e) skippedConfig = true;
      else if (a >= 0xf00000 && a < 0xf00100) mcu.eeprom[a - 0xf00000] = seg.data[i];
    }
  }
  const warnings: string[] = [];
  if (skippedBoot) warnings.push(`${skippedBoot} byte(s) below 0x${APP_START.toString(16).toUpperCase()} were not written: that region holds the bootloader. Remap the reset/interrupt vectors to 0x1000.`);
  if (skippedConfig) warnings.push('Configuration bits in the HEX file are ignored — the bootloader owns them (HSPLL, 48 MHz CPU clock). Use _XTAL_FREQ / delays for 48 MHz.');
  if (applicationBlank(mcu)) warnings.push('Nothing was written at the application reset vector 0x1000 — the program will not start.');
  installBootloader(mcu);
  return { bytes, skippedBoot, skippedConfig, warnings };
}
