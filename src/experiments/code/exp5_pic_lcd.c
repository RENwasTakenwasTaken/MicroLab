/*
 * Experiment 5 : Interfacing a 16x2 LCD (HD44780, JHD162A) - display a string
 * Target       : PIC18F4550 @ 48 MHz (Fcy = 12 MHz), MPLAB C18 conventions
 *
 *   LCD D0..D7 <- PORTD   (FRC: PORT-D -> LCD DATA)
 *   RS <- RE0, RW <- RE1, EN <- RE2   (FRC: PORT-E -> LCD CNTRL)
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

void delay_ms(unsigned int ms)
{
    while (ms--)
        Delay1KTCYx(12);            /* 1 ms at Fcy = 12 MHz */
}

void lcd_pulse(void)
{
    EN = 1;
    Delay10TCYx(6);                 /* 60 Tcy = 5 us enable pulse */
    EN = 0;
}

void lcd_cmd(unsigned char cmd)
{
    RS = 0; RW = 0;
    LCD_DATA = cmd;
    lcd_pulse();
    delay_ms(2);
}

void lcd_data(unsigned char ch)
{
    RS = 1; RW = 0;
    LCD_DATA = ch;
    lcd_pulse();
    Delay100TCYx(6);                /* 50 us */
}

void lcd_string(const rom char *s)
{
    while (*s)
        lcd_data(*s++);
}

void lcd_init(void)
{
    delay_ms(20);                   /* power-on delay */
    lcd_cmd(0x38);                  /* 8-bit, 2 lines, 5x7 font */
    lcd_cmd(0x0C);                  /* display ON, cursor OFF */
    lcd_cmd(0x06);                  /* entry mode: increment, no shift */
    lcd_cmd(0x01);                  /* clear display */
}

void main(void)
{
    ADCON1 = 0x0F;                  /* PORTE as digital I/O */
    TRISD = 0x00;
    TRISE = 0x00;

    lcd_init();
    lcd_cmd(0x80);                  /* line 1, column 0 */
    lcd_string("  PICT  PUNE  ");
    lcd_cmd(0xC0);                  /* line 2, column 0 */
    lcd_string("EP Lab - Expt 5");

    while (1);
}
