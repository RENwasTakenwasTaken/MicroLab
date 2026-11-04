/* Keil C51 compatible REG52.H for SDCC (Virtual MCU Lab). */
#ifndef __VLAB_REG52_H
#define __VLAB_REG52_H
#include <reg51.h>
__sfr __at (0xC8) T2CON;
__sfr __at (0xC9) T2MOD;
__sfr __at (0xCA) RCAP2L;
__sfr __at (0xCB) RCAP2H;
__sfr __at (0xCC) TL2;
__sfr __at (0xCD) TH2;
__sbit __at (0xAD) ET2; __sbit __at (0xBD) PT2;
__sbit __at (0xCF) TF2; __sbit __at (0xCE) EXF2; __sbit __at (0xCD) RCLK; __sbit __at (0xCC) TCLK;
__sbit __at (0xCB) EXEN2; __sbit __at (0xCA) TR2; __sbit __at (0xC9) C_T2; __sbit __at (0xC8) CP_RL2;
__sbit __at (0x90) T2;  __sbit __at (0x91) T2EX;
#endif
