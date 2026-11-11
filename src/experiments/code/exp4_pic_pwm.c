/*
 * Experiment 4 : PWM based DC motor speed control (CCP1 in PWM mode)
 * Target       : PIC18F4550 @ 48 MHz
 *
 *   L293D EN1 <- RC2 / CCP1 (PWM: speed)
 *   L293D IN1 <- RD6 = 1, IN2 <- RD5 = 0 (direction: forward)
 *   SW0 (RB1) : speed +10 %            SW1 (RB0) : speed -10 %
 *
 * PWM period   = (PR2 + 1) * 4 * Tosc * TMR2 prescale
 *              = 150 * 4 * (1/48 MHz) * 16 = 200 us  -> 5 kHz
 * Duty (10-bit)= CCPR1L:DC1B  (0 .. 600 for 0 .. 100 %)
 * Measure RC2 with the DMM (average voltage) and the oscilloscope.
 *
 * delay(): one count = 165 passes of the inner loop, about 125 us at 48 MHz.
 */
#include <p18f4550.h>
#include "vector_relocate.h"

void delay(unsigned int);

void set_pwm_duty(unsigned long duty)
{
	// duty in % (0 .. 100). 100 % = 4 x (PR2 + 1) = 600.
	unsigned long value = (600 * duty) / 100;

	// 2. Set PWM duty cycle by writing to CCPR1L and CCP1CON<5:4> bits.
	CCPR1L = (unsigned char)((unsigned int)(value) >> 2);
	CCP1CONbits.DC1B = (unsigned int)(value) & 0x03;
	// NOTE: Typecasting was used just to be safe from mismatching datalengths.
}

void main(void)
{
	unsigned char duty = 50;		// Start at 50 %.

	ADCON1 = 0x0F;					// All AN pins digital.
	INTCON2bits.RBPU = 0;			// Don't disable the pull-ups of Port B.
	TRISBbits.TRISB0 = 1;			// SW1 (RB0) as input.
	TRISBbits.TRISB1 = 1;			// SW0 (RB1) as input.

	// 3. Make CCP1 pin (RC2) an Output by clearing TRIS.
	TRISCbits.TRISC2 = 0;
	// 4. Make RD5 and RD6 as output to TURN ON Motor.
	TRISDbits.TRISD5 = 0;
	TRISDbits.TRISD6 = 0;

	// Forward direction rotation
	PORTDbits.RD6 = 1;	// IN1 is LOGIC HIGH
	PORTDbits.RD5 = 0;	// IN2 is LOGIC LOW

	// 5. Set TMR2 prescale value to 1:16
	T2CON = 0x03;
	T2CONbits.TMR2ON = 1;

	// 1. Set PWM period by setting PR2 register.
	PR2 = 149;
	// 6. Configure CCP1 module for PWM operation.
	CCP1CONbits.CCP1M = 0x0C;

	set_pwm_duty(duty);

	while (1)
	{
		if (PORTBbits.RB1 == 0 && duty < 100) {		// SW0: speed +10 %.
			duty = duty + 10;
			set_pwm_duty(duty);
			delay(2000);							// ~250 ms debounce / auto-repeat.
		}
		if (PORTBbits.RB0 == 0 && duty > 0) {		// SW1: speed -10 %.
			duty = duty - 10;
			set_pwm_duty(duty);
			delay(2000);
		}
	}
}

void delay(unsigned int time)
{
	unsigned int i, j;

	for (i = 0; i < time; i++)
		for (j = 0; j < 165; j++);
}
