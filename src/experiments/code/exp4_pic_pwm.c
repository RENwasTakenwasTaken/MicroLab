/*
 * Experiment 4 : PWM based DC motor speed control (CCP1 in PWM mode)
 * Target       : PIC18F4550 @ 48 MHz, MPLAB C18 conventions
 *
 *   L293D EN1 <- RC2 / CCP1 (PWM: speed)
 *   L293D IN1 <- RD6 = 1, IN2 <- RD5 = 0 (direction: forward)
 *   SW0 (RB1) : speed +10 %            SW1 (RB0) : speed -10 %
 *
 * PWM period   = (PR2 + 1) * 4 * Tosc * TMR2 prescale
 *              = 150 * 4 * (1/48 MHz) * 16 = 200 us  -> 5 kHz
 * Duty (10-bit)= CCPR1L:DC1B  (0 .. 600 for 0 .. 100 %)
 * Measure RC2 with the DMM (average voltage) and the oscilloscope.
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

#define SW_UP   PORTBbits.RB1                           /* SW0 */
#define SW_DN   PORTBbits.RB0                           /* SW1 */

void delay_ms(unsigned int ms)
{
    while (ms--)
        Delay1KTCYx(12);
}

void pwm_set_duty(unsigned int duty10)
{
    CCPR1L = (unsigned char)(duty10 >> 2);              /* 8 MSBs */
    CCP1CON = (CCP1CON & 0xCF) | ((duty10 & 0x03) << 4);/* 2 LSBs -> DC1B1:DC1B0 */
}

void main(void)
{
    unsigned char level = 5;                            /* 0..10 -> 0..100 % */

    ADCON1 = 0x0F;
    TRISB  = 0x03;                                      /* RB0/RB1 switches */
    TRISDbits.TRISD6 = 0;                               /* L293D IN1 */
    TRISDbits.TRISD5 = 0;                               /* L293D IN2 */
    LATDbits.LATD6 = 1;                                 /* IN1 = 1 */
    LATDbits.LATD5 = 0;                                 /* IN2 = 0 -> forward */
    TRISCbits.TRISC2 = 0;                               /* CCP1 pin output -> EN1 */

    PR2     = 149;                                      /* period */
    T2CON   = 0x06;                                     /* TMR2 ON, prescale 1:16 */
    CCP1CON = 0x0C;                                     /* PWM mode */
    pwm_set_duty(level * 60);

    while (1) {
        if (!SW_UP && level < 10) {
            level++;
            pwm_set_duty(level * 60);
            delay_ms(250);                              /* debounce / auto-repeat */
        }
        if (!SW_DN && level > 0) {
            level--;
            pwm_set_duty(level * 60);
            delay_ms(250);
        }
    }
}
