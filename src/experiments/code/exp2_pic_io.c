/*
 * Experiment 2 : Interfacing push-buttons, LEDs, relay and buzzer
 * Target       : PIC18F4550 - 20 MHz crystal, PLL -> 48 MHz (Fcy = 12 MHz),
 *                configuration set by the USB HID bootloader
 * Conventions  : MPLAB C18
 *
 * Board connections (see the Hardware tab):
 *   LED bank L0..L7  <- PORTD via FRC cable (PORT-D -> L-BANK)
 *   SW0 / SW1        -> RB0 / RB1 (active LOW, pull-up on board)
 *   Relay            <- RA4      Buzzer <- RA5
 *
 * Behaviour:
 *   SW0 pressed  : relay ON, LEDs run left -> right
 *   SW1 pressed  : buzzer ON, LEDs run right -> left
 *   no key       : relay/buzzer OFF, LEDs blink 0x55 / 0xAA
 */
#include <p18f4550.h>
#include <delays.h>

/* ---- reset vector remapped for the USB HID bootloader (application at 0x1000) ---- */
extern void _startup(void);
#pragma code _RESET_INTERRUPT_VECTOR = 0x1000
void _reset(void)
{
    _asm goto _startup _endasm
}
#pragma code

#define SW0     PORTBbits.RB0
#define SW1     PORTBbits.RB1
#define RELAY   LATAbits.LATA4
#define BUZZER  LATAbits.LATA5
#define LEDS    LATD

void delay_ms(unsigned int ms)
{
    while (ms--)
        Delay1KTCYx(12);        /* 12 000 Tcy = 1 ms at Fcy = 12 MHz */
}

void main(void)
{
    unsigned char pattern = 0x01;

    ADCON1 = 0x0F;              /* all AN pins digital */
    TRISB  = 0x03;              /* RB0, RB1 inputs */
    TRISD  = 0x00;              /* PORTD output -> LEDs */
    TRISAbits.TRISA4 = 0;       /* relay driver */
    TRISAbits.TRISA5 = 0;       /* buzzer driver */
    LEDS = 0x00; RELAY = 0; BUZZER = 0;

    while (1) {
        if (SW0 == 0) {                         /* SW0 pressed */
            RELAY = 1; BUZZER = 0;
            LEDS = pattern;
            pattern = (pattern == 0x80) ? 0x01 : (unsigned char)(pattern << 1);
            delay_ms(150);
        } else if (SW1 == 0) {                  /* SW1 pressed */
            RELAY = 0; BUZZER = 1;
            LEDS = pattern;
            pattern = (pattern == 0x01) ? 0x80 : (unsigned char)(pattern >> 1);
            delay_ms(150);
        } else {
            RELAY = 0; BUZZER = 0;
            LEDS = 0x55; delay_ms(300);
            LEDS = 0xAA; delay_ms(300);
        }
    }
}
