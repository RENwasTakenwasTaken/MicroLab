/*
 * Experiment 3 : Timer0 interrupt - square wave of a given frequency
 * Target       : PIC18F4550 @ 48 MHz (Fcy = Fosc/4 = 12 MHz)
 * Output       : RD0  (probe it with the oscilloscope / DMM, L0 via PORT-D -> L-BANK)
 *
 * Timer0 in 16-bit mode, prescaler bypassed: one count = 1/12 MHz = 83.3 ns.
 * Each overflow toggles RD0, so the timer must overflow every half period:
 *   counts = Fcy / (2 * f)    f = 1 kHz -> 12 MHz / 2 kHz = 6000 counts
 *   reload = 65536 - 6000 + 12 (cycles the ISR spends before reloading)
 *          = 59548 = 0xE89C   -> TMR0H = 0xE8, TMR0L = 0x9C
 * For another frequency, work out the new reload value, upload again and measure.
 */
#include <p18f4550.h>

extern void _startup(void);
void timer0_isr(void);

#pragma code RESET_INTERRUPT_VECTOR = 0x1000
void _reset(void)
{
	_asm
		goto _startup
	_endasm
}
#pragma code

#pragma code HIGH_INTERRUPT_VECTOR = 0x1008
void high_ISR(void)
{
	_asm
		goto timer0_isr
	_endasm
}
#pragma code

#pragma code LOW_INTERRUPT_VECTOR = 0x1018
void low_ISR(void)
{
}
#pragma code

#pragma interrupt timer0_isr

void timer0_isr(void)
{
	// 6. a. Reload timer values (TMR0H first: it is buffered until TMR0L is written).
	TMR0H = 0xE8;
	TMR0L = 0x9C;

	// 6. b. Clear the TMR0IF flag.
	INTCONbits.TMR0IF = 0;

	// 6. c. Toggle the PORT pin RD0.
	LATDbits.LATD0 = ~LATDbits.LATD0;
}
#pragma code

void main(void)
{
	// 1. Configure Port pin RD0 as output and initial value 0.
	ADCON1 = 0x0F;
	TRISD = 0x00;
	LATD = 0x00;

	// 2. Load value in T0CON. 16-bit mode, internal clock, prescaler bypassed.
	T0CON = 0x08;

	// 3. Load the registers TMR0H and TMR0L.
	TMR0H = 0xE8;
	TMR0L = 0x9C;

	// 4. Enable Timer 0 Interrupt and Global Interrupt.
	INTCON = 0xA0;	// PEIE is un-programmed (0).

	// 5. Start the timer by setting TMR0ON bit in T0CON.
	T0CONbits.TMR0ON = 1;

	while (1);
}
