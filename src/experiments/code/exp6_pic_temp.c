/*
 * Experiment 6 : LM35 temperature sensor with real-time display on the LCD
 * Target       : PIC18F4550 @ 48 MHz (Fcy = 12 MHz), MPLAB C18 conventions
 *
 *   LM35 output -> AN0 (RA0)          10 mV / degree C
 *   LCD: data PORTD, RS=RE0, RW=RE1, EN=RE2
 *
 * ADC: Vref = VDD (5 V), 10-bit, right justified, TAD = Fosc/64
 *   T(C) = ADC * 5000 mV / 1023 / 10 mV  = ADC * 500 / 1023
 * Change the room temperature with the LM35 slider (Hardware tab or click the sensor),
 * and measure RA0 with the DMM.
 */
#include <p18f4550.h>
#include <delays.h>

extern void _startup(void);
#pragma code _RESET_INTERRUPT_VECTOR = 0x1000
void _reset(void)
{
    _asm goto _startup _endasm
}
#pragma code

#define LCD_DATA  LATD
#define RS        LATEbits.LATE0
#define RW        LATEbits.LATE1
#define EN        LATEbits.LATE2

void delay_ms(unsigned int ms) { while (ms--) Delay1KTCYx(12); }

void lcd_cmd(unsigned char c)  { RS = 0; RW = 0; LCD_DATA = c; EN = 1; Delay10TCYx(6); EN = 0; delay_ms(2); }
void lcd_data(unsigned char c) { RS = 1; RW = 0; LCD_DATA = c; EN = 1; Delay10TCYx(6); EN = 0; Delay100TCYx(6); }
void lcd_string(const rom char *s) { while (*s) lcd_data(*s++); }

void lcd_init(void)
{
    delay_ms(20);
    lcd_cmd(0x38); lcd_cmd(0x0C); lcd_cmd(0x06); lcd_cmd(0x01);
}

unsigned int adc_read(unsigned char channel)
{
    ADCON0 = (unsigned char)((channel << 2) | 0x01);   /* select channel, ADC on */
    Delay10TCYx(24);                                    /* 20 us acquisition */
    ADCON0bits.GO = 1;                                  /* start conversion */
    while (ADCON0bits.GO);                              /* wait for completion */
    return ((unsigned int)ADRESH << 8) | ADRESL;
}

void main(void)
{
    unsigned int adc;
    unsigned long t10;              /* temperature x10 */

    TRISA = 0x01;                   /* RA0 analog input */
    TRISD = 0x00;
    TRISE = 0x00;
    ADCON1 = 0x0E;                  /* AN0 analog, others digital, Vref = VDD/VSS */
    ADCON2 = 0x96;                  /* right justified, 4 TAD, Fosc/64 */

    lcd_init();
    lcd_cmd(0x80);
    lcd_string("Temperature:");

    while (1) {
        adc = adc_read(0);
        t10 = (unsigned long)adc * 5000UL / 1023UL;     /* in 0.1 degree C */

        lcd_cmd(0xC0);
        lcd_data((unsigned char)('0' + (t10 / 1000) % 10));
        lcd_data((unsigned char)('0' + (t10 / 100) % 10));
        lcd_data((unsigned char)('0' + (t10 / 10) % 10));
        lcd_data('.');
        lcd_data((unsigned char)('0' + t10 % 10));
        lcd_data(0xDF);                                 /* degree symbol */
        lcd_string("C   ");

        delay_ms(500);
    }
}
