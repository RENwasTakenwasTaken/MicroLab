/*
 * Experiment 1 : Toggle an LED using the 8051 microcontroller
 * Target       : AT89C51 @ 11.0592 MHz (Keil C51 dialect)
 * LED          : P1.0  (watch Peripherals > Port 1 or the virtual LED bar)
 *
 * The delay uses Timer 0 in mode 1 so the timing is exact (1 ms per tick):
 *   machine cycle = 12 / 11.0592 MHz = 1.085 us
 *   1 ms          = 921.6 cycles  ->  reload = 65536 - 922 = 0xFC66
 */
#include <reg51.h>

sbit LED = P1^0;

void delay_ms(unsigned int ms)
{
    TMOD = (TMOD & 0xF0) | 0x01;    /* Timer 0, mode 1 (16-bit)          */
    while (ms--) {
        TH0 = 0xFC;                 /* load 0xFC66 -> 1 ms                */
        TL0 = 0x66;
        TR0 = 1;                    /* start timer                        */
        while (!TF0);               /* wait for overflow                  */
        TR0 = 0;                    /* stop timer                         */
        TF0 = 0;                    /* clear overflow flag                */
    }
}

void main(void)
{
    while (1) {
        LED = 0;                    /* LED OFF                            */
        delay_ms(500);
        LED = 1;                    /* LED ON                             */
        delay_ms(500);
    }
}
