/* AT89X51.H compatibility: REG51 plus per-pin names (P1_0 ...). */
#ifndef __VLAB_AT89X51_H
#define __VLAB_AT89X51_H
#include <reg51.h>
#define VLAB_PORT_BITS(n, a) \
  __sbit __at (a+0) P##n##_0; __sbit __at (a+1) P##n##_1; __sbit __at (a+2) P##n##_2; __sbit __at (a+3) P##n##_3; \
  __sbit __at (a+4) P##n##_4; __sbit __at (a+5) P##n##_5; __sbit __at (a+6) P##n##_6; __sbit __at (a+7) P##n##_7;
VLAB_PORT_BITS(0, 0x80)
VLAB_PORT_BITS(1, 0x90)
VLAB_PORT_BITS(2, 0xA0)
VLAB_PORT_BITS(3, 0xB0)
#endif
