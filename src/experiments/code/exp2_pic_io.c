/*
 * Experiment 2 : Interfacing push-buttons, LEDs, relay and buzzer
 * Target       : PIC18F4550 @ 48 MHz (20 MHz crystal + PLL, set by the USB HID bootloader)
 *
 * Board connections (PICT board chart, see the Hardware tab):
 *   LED bank L0..L7  <- PORTD via FRC cable (PORT-D -> L_BANK)
 *   SW0 / SW1        -> RB1 / RB0 (active LOW)
 *   Relay            <- RC1      Buzzer <- RC2   (PERI_SW 4 and 5 ON)
 *
 * Behaviour:
 *   SW0 pressed  : relay ON, LEDs run left -> right
 *   SW1 pressed  : buzzer ON, LEDs run right -> left
 *   no key       : relay/buzzer OFF, LEDs blink 0x55 / 0xAA
 *
 * delay(): one count = 165 passes of the inner loop, about 125 us at 48 MHz.
 */
#include <p18f4550.h>
#include "vector_relocate.h"

void delay(unsigned int);

void init_pins(void) {
	ADCON1 = 0x0F;				// All AN pins digital.
	INTCON2bits.RBPU = 0;		// Don't disable the pull-ups of Port B.

	TRISBbits.TRISB0 = 1;		// SW1 (RB0) as input.
	TRISBbits.TRISB1 = 1;		// SW0 (RB1) as input.

	TRISD = 0x00;				// Port D (all LEDs) as output.

	TRISCbits.TRISC1 = 0;		// Relay (RC1) as output.
	TRISCbits.TRISC2 = 0;		// Buzzer (RC2) as output.

	PORTD = 0x00;
	PORTCbits.RC1 = 0;
	PORTCbits.RC2 = 0;
}

void SW0_pressed(void) {
	/* Relay ON, buzzer OFF. */
	PORTCbits.RC1 = 1;
	PORTCbits.RC2 = 0;
}

void SW1_pressed(void) {
	/* Relay OFF, buzzer ON. */
	PORTCbits.RC1 = 0;
	PORTCbits.RC2 = 1;
}

void no_key_pressed(void) {
	/* Relay OFF, buzzer OFF. */
	PORTCbits.RC1 = 0;
	PORTCbits.RC2 = 0;
}

void main(void) {
	unsigned char pattern = 0x01;

	init_pins();

	while (1) {
		if (PORTBbits.RB1 == 0) {				// SW0 pressed.
			SW0_pressed();
			PORTD = pattern;					// LEDs run L0 -> L7.
			pattern = (pattern == 0x80) ? 0x01 : (unsigned char)(pattern << 1);
			delay(1200);						// ~150 ms.
		}
		else if (PORTBbits.RB0 == 0) {			// SW1 pressed.
			SW1_pressed();
			PORTD = pattern;					// LEDs run L7 -> L0.
			pattern = (pattern == 0x01) ? 0x80 : (unsigned char)(pattern >> 1);
			delay(1200);						// ~150 ms.
		}
		else {									// No key: blink alternately.
			no_key_pressed();
			PORTD = 0x55;
			delay(2400);						// ~300 ms.
			PORTD = 0xAA;
			delay(2400);						// ~300 ms.
		}
	}
}

void delay(unsigned int time) {
	unsigned int i, j;

	for (i = 0; i < time; i++) {
		for (j = 0; j < 165; j++);
	}
}
