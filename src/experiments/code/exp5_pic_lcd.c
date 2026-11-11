/*
 * Experiment 5 : Interfacing a 16x2 LCD (HD44780, JHD162A) - display a string
 * Target       : PIC18F4550 @ 48 MHz
 *
 *   LCD D0..D7 <- PORTD   (FRC: PORT-D -> LCD DATA)
 *   RS <- RE0, RW <- RE1, EN <- RE2   (FRC: PORT-E -> LCD CNTRL)
 *
 * delay(): one count = 165 passes of the inner loop, about 125 us at 48 MHz.
 */
#include <p18f4550.h>
#include "vector_relocate.h"

#define RS PORTEbits.RE0
#define RW PORTEbits.RE1
#define EN PORTEbits.RE2

void delay(unsigned int time) {
	unsigned int i, j;

	for (i = 0; i < time; i++) {
		for (j = 0; j < 165; j++);
	}
}

void init_pins(void) {
	ADCON1 = 0x0F;		// PORTE as digital I/O.

	TRISD = 0x00;
	TRISE = 0x00;
}

void lcd_cmd_send(unsigned char cmd) {
	PORTD = cmd;
	RW = 0;
	RS = 0;
	EN = 1;
	delay(1);
	EN = 0;
	delay(16);			// ~2 ms: clear display needs 1.52 ms.
}

void lcd_data_send(unsigned char data) {
	PORTD = data;
	RW = 0;
	RS = 1;
	EN = 1;
	delay(1);
	EN = 0;
	delay(1);			// ~125 us: a character needs 37 us.
}

void lcd_init(void) {
	EN = 0;
	RW = 0;
	delay(160);			// ~20 ms power-on delay.
	lcd_cmd_send(0x38);	// 8-bit, 2 lines, 5x7 font.
	lcd_cmd_send(0x0C);	// Display ON, cursor OFF.
	lcd_cmd_send(0x06);	// Entry mode: increment, no shift.
	lcd_cmd_send(0x01);	// Clear display.
}

void send_string(unsigned char *str) {
	while (*str != '\0') {
		lcd_data_send(*str);
		str++;
	}
}

void main(void) {
	unsigned char line1[16] = "  PICT  PUNE  ";
	unsigned char line2[16] = "EP Lab - Expt 5";

	init_pins();
	lcd_init();

	// String on line 1.
	lcd_cmd_send(0x80);
	send_string(line1);

	// String on line 2.
	lcd_cmd_send(0xC0);
	send_string(line2);

	while (1);
}
