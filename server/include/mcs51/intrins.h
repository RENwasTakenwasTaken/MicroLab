/* Keil C51 INTRINS.H equivalents for SDCC. */
#ifndef __VLAB_INTRINS_H
#define __VLAB_INTRINS_H
#define _nop_() __asm nop __endasm
static unsigned char _crol_(unsigned char c, unsigned char b) { b &= 7; return (unsigned char)((c << b) | (c >> (8 - b))); }
static unsigned char _cror_(unsigned char c, unsigned char b) { b &= 7; return (unsigned char)((c >> b) | (c << (8 - b))); }
static unsigned int _irol_(unsigned int i, unsigned char b) { b &= 15; return (i << b) | (i >> (16 - b)); }
static unsigned int _iror_(unsigned int i, unsigned char b) { b &= 15; return (i >> b) | (i << (16 - b)); }
static unsigned long _lrol_(unsigned long l, unsigned char b) { b &= 31; return (l << b) | (l >> (32 - b)); }
static unsigned long _lror_(unsigned long l, unsigned char b) { b &= 31; return (l >> b) | (l << (32 - b)); }
#endif
