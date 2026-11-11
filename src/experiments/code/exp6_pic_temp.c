/*
 * Experiment 6 : LM35 temperature sensor with real-time display on the LCD
 * Target       : PIC18F4550 @ 48 MHz
 *
 *   LM35 output -> AN1 (RA1)          10 mV / degree C   (PICT board chart)
 *   LCD: data PORTD, RS=RE0, RW=RE1, EN=RE2
 *
 * ADC: Vref = VDD (5 V), 10-bit, right justified, TAD = Fosc/64
 *   T(C) = ADC * 5000 mV / 1023 / 10 mV  = ADC * 500 / 1023
 * Change the room temperature with the LM35 slider (Hardware tab or click the sensor),
 * and measure RA1 with the DMM.
 *
 * delay(): one count = 165 passes of the inner loop, about 125 us at 48 MHz.
 */
#include <p18f4550.h>
#include <stdio.h>		// For sprintf() function.
#include "vector_relocate.h"

#define RS PORTEbits.RE0
#define RW PORTEbits.RE1
#define EN PORTEbits.RE2

void delay(unsigned int);

void lcd_cmd(unsigned char cmd) {
	PORTD = cmd;
	RW = 0;
	RS = 0;
	EN = 1;
	delay(1);
	EN = 0;
	delay(16);			// ~2 ms: clear display needs 1.52 ms.
}

void lcd_data(unsigned char dat) {
	PORTD = dat;
	RW = 0;
	RS = 1;
	EN = 1;
	delay(1);
	EN = 0;
	delay(1);			// ~125 us: a character needs 37 us.
}

void lcd_send_string(unsigned char *str) {
	while (*str != '\0') {
		lcd_data(*str);
		str++;
	}
}

void lcd_init(void) {
	delay(160);			// ~20 ms power-on delay.
	lcd_cmd(0x38);		// 8-bit, 2 lines, 5x7 font.
	lcd_cmd(0x0C);		// Display ON, cursor OFF.
	lcd_cmd(0x06);		// Entry mode: increment, no shift.
	lcd_cmd(0x01);		// Clear display.
}

void initialize_ADC(void) {
	// Sequence is 1, 0, 2 as per datasheet.
	ADCON1 = 0x0D;		// AN0-AN1 analog, rest digital. Vref = VDD / VSS.
	ADCON0 = 0x05;		// Channel AN1 (LM35), ADC module ON. Conversion starts later.
	ADCON2 = 0x96;		// Right justified, 4 TAD acquisition, Fosc/64 (TAD = 1.33 us).

	// Wait for the acquisition time before triggering a conversion.
	delay(1);
}

void main(void) {
	unsigned int adc_result;
	unsigned int temperature;			// In 0.1 degree C.
	unsigned char title[] = "Temperature:";
	char temperature_text[10];

	TRISA = 0x02;		// RA1 analog input.
	TRISD = 0x00;
	TRISE = 0x00;

	RW = 0;
	RS = 0;
	EN = 0;

	initialize_ADC();
	lcd_init();

	lcd_cmd(0x80);
	lcd_send_string(title);

	while (1) {
		ADCON0 |= 0x02;					// Set only the GO bit.
		while ((ADCON0 & 0x02) != 0);	// Wait for the conversion to finish.

		adc_result = ((unsigned int)ADRESH << 8) | ADRESL;
		temperature = (unsigned int)(((unsigned long)adc_result * 5000UL) / 1023UL);

		sprintf(temperature_text, "%03u.%u", temperature / 10, temperature % 10);
		lcd_cmd(0xC0);
		lcd_send_string((unsigned char *)temperature_text);
		lcd_data(0xDF);					// Degree symbol.
		lcd_data('C');

		delay(4000);					// ~500 ms.
	}
}

void delay(unsigned int time) {
	unsigned int i, j;

	for (i = 0; i < time; i++) {
		for (j = 0; j < 165; j++);
	}
}
