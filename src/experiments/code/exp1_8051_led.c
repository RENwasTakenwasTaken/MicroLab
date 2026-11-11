/*
 * Experiment 1 : Toggle an LED using the 8051 microcontroller
 * Target       : AT89C51 @ 11.0592 MHz (Keil C51 dialect)
 * LED          : P1.0  (watch Peripherals > Port 1 or the virtual LED bar)
 *
 * delay(): one count of the outer loop (1275 passes of the inner loop) takes
 * about 9.7 ms in this lab (about 1 ms with Keil C51), so delay(52) is ~500 ms.
 */
#include <reg51.h>

sbit LED = P1^0;

// Prototype declaration.
void delay(unsigned int);

void main(void) {
	LED = 0;

	while (1) {
		LED = 1;		// LED ON: send high logic on P1.0.
		delay(52);		// ~500 ms.
		LED = 0;		// LED OFF: send low logic on P1.0.
		delay(52);		// ~500 ms.
	}
}

// Prototype definition.
void delay(unsigned int time) {
	unsigned int i, j;

	for (i = 0; i < time; i++) {
		for (j = 0; j < 1275; j++);
	}
}
