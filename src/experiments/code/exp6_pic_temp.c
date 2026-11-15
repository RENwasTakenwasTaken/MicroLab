/*
 * Experiment 6 : On-chip ADC programming, LM35 temperature sensor on the LCD
 * Target       : PIC18F4550 @ 48 MHz
 *
 *   LM35 output -> AN1 (RA1)          10 mV / degree C   (PICT board chart)
 *   LCD: data PORTD, RS=RE0, RW=RE1, EN=RE2   (FRC: PORT-E -> LCD_CNTRL)
 *
 * The LCD shows the 10-bit ADC result: "Result:0061" at 30 degree C.
 *   T(C) = ADC * 5000 mV / 1023 / 10 mV  = ADC * 500 / 1023   (about 2 counts per degree C)
 * The lab writeup's version reads the trimmer pot instead: ADCON0 = 0x09 (AN2), TRISAbits.RA2 = 1.
 *
 * delay_ms(): one count = 165 passes of the inner loop, about 125 us at 48 MHz.
 */
#include <p18f4550.h>
#include "vector_relocate.h"

#define RS PORTEbits.RE0
#define RW PORTEbits.RE1
#define EN PORTEbits.RE2

void delay_ms(unsigned int);

void lcd_cmd(unsigned char cmd) {
	PORTD = cmd;
	RW = 0;
	RS = 0;
	EN = 1;
	delay_ms(2);
	EN = 0;
}

void lcd_data(unsigned char dat) {
	PORTD = dat;
	RW = 0;
	RS = 1;
	EN = 1;
	delay_ms(2);
	EN = 0;
}

void lcd_send_string(unsigned char* str) {
	while (*str != '\0') {
		lcd_data(*str);
		str++;
		delay_ms(10);
	}
}

void lcd_init(void) {
	lcd_cmd(0x38);
	delay_ms(1);
	lcd_cmd(0x06);
	delay_ms(1);
	lcd_cmd(0x0E);
	delay_ms(1);
	lcd_cmd(0x01);
	delay_ms(100);		// More delay as after Clear Screen LCD needs 1.5ms minimum.
	lcd_cmd(0x80);
}

void initialize_ADC(void) {
	// Sequence is 1, 0, 2 as per datasheet (pg. 271)
	ADCON1 = 0x0C;	// Till AN2, declare all Analog and rest digital.
	ADCON0 = 0x05;	// Channel AN1 (LM35). Just turn ON the ADC module. Conversion will start later. Datasheet mandates this (pg. 275)
	ADCON2 = 0x8E;	// Right justified, shove all bits at L, rest at H. Use 2TAD, Fosc/64.
	// Fosc is 21ps. Conversion requires 1.35us at 30 deg temp., Fosc/64 gives 1.3us. Hence, 2TAD is suited.

	// Wait for at least 2us before triggering conversion actually.
	delay_ms(100);
}

void main(void) {
	unsigned int adc_result;
	unsigned char i = 0;

	unsigned char adc_result_text[16] = "Result:";
	unsigned char adc_result_value[4];

	TRISD = 0x00;
	TRISE = 0x00;
	TRISAbits.RA1 = 1;	// Mark as input.

	RW = 0;
	RS = 0;
	EN = 0;

	initialize_ADC();
	lcd_init();

	lcd_send_string(adc_result_text);

	while (1) {

		ADCON0 |= 0x02;	// Set only the GO bit.
		// ADC waits for 2TAD as set.
		while (ADCON0bits.GO == 1);

		adc_result = (ADRESH << 8) | ADRESL;

		for (i = 0; i < 4 ; i++) {
			adc_result_value[i] = adc_result % 10;
			adc_result_value[i] += 0x30;	// Shifts to ASCII character region.
			adc_result /= 10;
		}

		lcd_cmd(0x87);
		lcd_data(adc_result_value[3]);
		lcd_data(adc_result_value[2]);
		lcd_data(adc_result_value[1]);
		lcd_data(adc_result_value[0]);
		delay_ms(10);
	}
}

void delay_ms(unsigned int time) {
	unsigned int i, j;

	for (i = 0; i < time; i++) {
		for (j = 0; j < 165; j++);
	}
}
