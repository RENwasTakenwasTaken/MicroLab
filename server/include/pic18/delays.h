/* MPLAB C18 delays.h equivalents for XC8 (Virtual MCU Lab). Delays count instruction cycles (TCY). */
#ifndef __VLAB_DELAYS_H
#define __VLAB_DELAYS_H
#include <xc.h>
/* unused helpers below must not produce "function never called" (520) noise */
#pragma warning disable 520
#define Delay1TCY() _delay(1)
static void Delay10TCYx(unsigned char unit) { do { _delay(10); } while (--unit); }
static void Delay100TCYx(unsigned char unit) { do { _delay(100); } while (--unit); }
static void Delay1KTCYx(unsigned char unit) { do { _delay(1000); } while (--unit); }
static void Delay10KTCYx(unsigned char unit) { do { _delay(10000); } while (--unit); }
#endif
