import { compile8051, compilePic18 } from '../server/compilers/toolchains.mjs';
const keil = `#include <REG51.H>
sbit LED = P1^0;
bit flag;
unsigned char code msg[] = "HI";
void delay(unsigned int ms) { unsigned int i, j; for (i = 0; i < ms; i++) for (j = 0; j < 1275; j++); }
void t0(void) interrupt 1 { flag = 1; }
void main(void) {
  while (1) { LED = 0; delay(100); LED = 1; delay(100); }
}
`;
const c18 = `#include <p18f4550.h>
#include <delays.h>
#pragma config FOSC = HS, WDT = OFF, LVP = OFF, PBADEN = OFF
void chk_isr(void);
#pragma code My_HiPrio_Int = 0x08
void My_HiPrio_Int(void)
{
  _asm GOTO chk_isr _endasm
}
#pragma code
#pragma interrupt chk_isr
void chk_isr(void)
{
  if (INTCONbits.TMR0IF) { INTCONbits.TMR0IF = 0; LATBbits.LATB0 = !LATBbits.LATB0; }
}
unsigned int count;
void main(void)
{
  TRISB = 0;
  T0CON = 0x88; INTCONbits.TMR0IE = 1; INTCONbits.GIE = 1;
  while (1) { count++; Delay10KTCYx(50); }
}
`;
const a = await compile8051(keil);
console.log('8051 ok', a.ok, a.diagnostics, '\n' + a.log);
console.log('lines', a.debug?.lines.filter(l=>l.file==='main.c').slice(0,6), 'syms', a.debug?.symbols);
const b = await compilePic18(c18);
console.log('PIC ok', b.ok, b.diagnostics);
console.log(b.log.split('\n').slice(-12).join('\n'));
console.log('lines', b.debug?.lines.filter(l=>l.file==='main.c').map(l=>`${l.line}@${l.addr.toString(16)}`).join(' '));
console.log('syms', b.debug?.symbols.filter(s=>s.space==='data'));
const c = await compilePic18('#include <xc.h>\nvoid main(void){\n TRISB = 0\n}\n');
console.log('err diag', c.ok, c.diagnostics);
