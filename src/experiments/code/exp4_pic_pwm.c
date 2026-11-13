/*
 * Experiment 4 : PWM based DC motor speed control (CCP1 in PWM mode)
 * Target       : PIC18F4550 @ 48 MHz
 *
 *   L293D EN1 <- RC2 / CCP1 (PWM: speed)
 *   L293D IN1 <- RD6 = 1, IN2 <- RD5 = 0 (direction: forward)
 *
 * The duty cycle steps through 20, 40, 60, 80 and 100 % (about 1.5 s each) and repeats.
 * Watch RC2 on the oscilloscope (CH1 jumper on the PORT-C header pin RC2): the pulse
 * width grows while the period stays 200 us.
 *
 * PWM period   = (PR2 + 1) * 4 * Tosc * TMR2 prescale
 *              = 150 * 4 * (1/48 MHz) * 16 = 200 us  -> 5 kHz
 * Duty (10-bit)= CCPR1L:DC1B  (0 .. 600 for 0 .. 100 %)
 *
 * delay(): one count = 165 passes of the inner loop, about 125 us at 48 MHz,
 * so delay(12000) is about 1.5 s.
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
	ADCON1 = 0x0F;				// All AN pins digital.

	// 3. Make CCP1 pin (RC2) an Output by clearing TRIS.
	TRISCbits.TRISC2 = 0;
	// 4. Make RD5 and RD6 as output to TURN ON Motor.
	TRISDbits.TRISD5 = 0;
	TRISDbits.TRISD6 = 0;

	// 5. Set TMR2 prescale value to 1:16
	T2CON = 0x03;
	T2CONbits.TMR2ON = 1;

	// Forward direction rotation
	PORTDbits.RD6 = 1;	// IN1 is LOGIC HIGH
	PORTDbits.RD5 = 0;	// IN2 is LOGIC LOW

	// 1. Set PWM period by setting PR2 register.
	PR2 = 149;
	// 6. Configure CCP1 module for PWM operation.
	CCP1CONbits.CCP1M = 0x0C;

	while (1)
	{
		set_pwm_duty(20);
		delay(12000);		// ~1.5 s

		set_pwm_duty(40);
		delay(12000);

		set_pwm_duty(60);
		delay(12000);

		set_pwm_duty(80);
		delay(12000);

		set_pwm_duty(100);
		delay(12000);
	}
}

void delay(unsigned int time)
{
	unsigned int i, j;

	for (i = 0; i < time; i++)
		for (j = 0; j < 165; j++);
}
