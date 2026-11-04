// Code assistance data: SFR descriptions, bit-field members and snippets.
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import type { Arch } from '../sim/core/types.ts';

const PIC_SFR: Record<string, string> = {
  PORTA: 'PORTA — read pin levels of port A (writes go to LATA)', PORTB: 'PORTB — read pin levels of port B', PORTC: 'PORTC — read pin levels of port C', PORTD: 'PORTD — read pin levels of port D', PORTE: 'PORTE — read pin levels of port E',
  LATA: 'LATA — output latch of port A', LATB: 'LATB — output latch of port B', LATC: 'LATC — output latch of port C', LATD: 'LATD — output latch of port D', LATE: 'LATE — output latch of port E',
  TRISA: 'TRISA — direction of port A (1 = input, 0 = output)', TRISB: 'TRISB — direction of port B (1 = input)', TRISC: 'TRISC — direction of port C', TRISD: 'TRISD — direction of port D', TRISE: 'TRISE — direction of port E (bits 0-2)',
  T0CON: 'T0CON — Timer0 control: TMR0ON(7) T08BIT(6) T0CS(5) T0SE(4) PSA(3) T0PS2:0', TMR0L: 'TMR0L — Timer0 low byte (write after TMR0H in 16-bit mode)', TMR0H: 'TMR0H — Timer0 high byte buffer',
  T1CON: 'T1CON — Timer1 control: RD16 T1RUN T1CKPS1:0 T1OSCEN T1SYNC TMR1CS TMR1ON', T2CON: 'T2CON — Timer2 control: T2OUTPS3:0 TMR2ON T2CKPS1:0', PR2: 'PR2 — Timer2 period register (PWM period)', TMR2: 'TMR2 — Timer2 counter',
  T3CON: 'T3CON — Timer3 control', CCP1CON: 'CCP1CON — CCP1 control: P1M1:0 DC1B1:0 CCP1M3:0 (0x0C = PWM)', CCPR1L: 'CCPR1L — CCP1 PWM duty (8 MSBs)', CCP2CON: 'CCP2CON — CCP2 control', CCPR2L: 'CCPR2L — CCP2 PWM duty (8 MSBs)',
  ADCON0: 'ADCON0 — CHS3:0(5:2) GO/DONE(1) ADON(0)', ADCON1: 'ADCON1 — VCFG1:0(5:4) PCFG3:0 (0x0F = all digital)', ADCON2: 'ADCON2 — ADFM(7) ACQT2:0 ADCS2:0', ADRESH: 'ADRESH — ADC result high', ADRESL: 'ADRESL — ADC result low',
  INTCON: 'INTCON — GIE/GIEH PEIE/GIEL TMR0IE INT0IE RBIE TMR0IF INT0IF RBIF', INTCON2: 'INTCON2 — RBPU INTEDG0 INTEDG1 INTEDG2 TMR0IP RBIP', INTCON3: 'INTCON3 — INT2IP INT1IP INT2IE INT1IE INT2IF INT1IF',
  PIR1: 'PIR1 — peripheral interrupt flags: SPPIF ADIF RCIF TXIF SSPIF CCP1IF TMR2IF TMR1IF', PIE1: 'PIE1 — peripheral interrupt enables', IPR1: 'IPR1 — peripheral interrupt priorities', PIR2: 'PIR2 — OSCFIF CMIF USBIF EEIF BCLIF HLVDIF TMR3IF CCP2IF', PIE2: 'PIE2', RCON: 'RCON — IPEN(7) and reset flags',
  TXSTA: 'TXSTA — CSRC TX9 TXEN SYNC SENDB BRGH TRMT TX9D', RCSTA: 'RCSTA — SPEN RX9 SREN CREN ADDEN FERR OERR RX9D', SPBRG: 'SPBRG — baud rate generator', TXREG: 'TXREG — EUSART transmit register', RCREG: 'RCREG — EUSART receive register', BAUDCON: 'BAUDCON — BRG16 and polarity bits',
  OSCCON: 'OSCCON — IDLEN IRCF2:0 OSTS IOFS SCS1:0', WREG: 'WREG — working register', STATUS: 'STATUS — N OV Z DC C', CMCON: 'CMCON — comparator control (0x07 = off)',
};
const PIC_BITS: Record<string, string[]> = {
  INTCON: ['GIE', 'GIEH', 'PEIE', 'GIEL', 'TMR0IE', 'INT0IE', 'RBIE', 'TMR0IF', 'INT0IF', 'RBIF'],
  INTCON2: ['RBPU', 'INTEDG0', 'INTEDG1', 'INTEDG2', 'TMR0IP', 'RBIP'],
  INTCON3: ['INT2IP', 'INT1IP', 'INT2IE', 'INT1IE', 'INT2IF', 'INT1IF'],
  T0CON: ['TMR0ON', 'T08BIT', 'T0CS', 'T0SE', 'PSA', 'T0PS'],
  T1CON: ['RD16', 'T1RUN', 'T1CKPS', 'T1OSCEN', 'T1SYNC', 'TMR1CS', 'TMR1ON'],
  T2CON: ['T2OUTPS', 'TMR2ON', 'T2CKPS'],
  ADCON0: ['CHS', 'GO_nDONE', 'GO', 'ADON'], ADCON1: ['VCFG', 'PCFG'], ADCON2: ['ADFM', 'ACQT', 'ADCS'],
  CCP1CON: ['P1M', 'DC1B', 'CCP1M'], CCP2CON: ['DC2B', 'CCP2M'],
  PIR1: ['ADIF', 'RCIF', 'TXIF', 'SSPIF', 'CCP1IF', 'TMR2IF', 'TMR1IF'], PIE1: ['ADIE', 'RCIE', 'TXIE', 'SSPIE', 'CCP1IE', 'TMR2IE', 'TMR1IE'],
  RCON: ['IPEN', 'RI', 'TO', 'PD', 'POR', 'BOR'],
  TXSTA: ['TX9', 'TXEN', 'SYNC', 'BRGH', 'TRMT'], RCSTA: ['SPEN', 'RX9', 'CREN', 'OERR', 'FERR'],
};
for (const p of 'ABCDE') {
  PIC_BITS[`PORT${p}`] = Array.from({ length: 8 }, (_, i) => `R${p}${i}`);
  PIC_BITS[`LAT${p}`] = Array.from({ length: 8 }, (_, i) => `LAT${p}${i}`);
  PIC_BITS[`TRIS${p}`] = Array.from({ length: 8 }, (_, i) => `TRIS${p}${i}`);
}

const C51_SFR: Record<string, string> = {
  P0: 'Port 0 (open drain, needs external pull-ups)', P1: 'Port 1', P2: 'Port 2', P3: 'Port 3 (alternate functions: RXD TXD INT0 INT1 T0 T1 WR RD)',
  TMOD: 'TMOD — GATE C/T M1 M0 for Timer1 (7:4) and Timer0 (3:0)', TCON: 'TCON — TF1 TR1 TF0 TR0 IE1 IT1 IE0 IT0', TH0: 'Timer 0 high byte', TL0: 'Timer 0 low byte', TH1: 'Timer 1 high byte (reload in mode 2)', TL1: 'Timer 1 low byte',
  SCON: 'SCON — SM0 SM1 SM2 REN TB8 RB8 TI RI', SBUF: 'Serial buffer', IE: 'IE — EA ET2 ES ET1 EX1 ET0 EX0', IP: 'IP — interrupt priorities', PCON: 'PCON — SMOD(7) GF1 GF0 PD IDL',
  PSW: 'PSW — CY AC F0 RS1 RS0 OV P', ACC: 'Accumulator', B: 'B register', SP: 'Stack pointer (reset 0x07)', DPL: 'Data pointer low', DPH: 'Data pointer high',
  TR0: 'Timer 0 run control', TF0: 'Timer 0 overflow flag', TR1: 'Timer 1 run control', TF1: 'Timer 1 overflow flag', EA: 'Global interrupt enable', ET0: 'Timer 0 interrupt enable', TI: 'Transmit interrupt flag', RI: 'Receive interrupt flag',
};

const PIC_SNIPPETS: [string, string, string][] = [
  ['isr', 'void __interrupt() isr(void)\n{\n\tif (INTCONbits.TMR0IF) {\n\t\tINTCONbits.TMR0IF = 0;\n\t\t$0\n\t}\n}', 'XC8 high-priority interrupt service routine'],
  ['config', '#pragma config FOSC = HS, WDT = OFF, LVP = OFF, PBADEN = OFF, MCLRE = ON\n#define _XTAL_FREQ 20000000\n', 'Configuration bits for the 20 MHz board'],
  ['main', '#include <xc.h>\n\n#pragma config FOSC = HS, WDT = OFF, LVP = OFF, PBADEN = OFF\n#define _XTAL_FREQ 20000000\n\nvoid main(void)\n{\n\tADCON1 = 0x0F;\n\t$0\n\twhile (1) {\n\t}\n}', 'Program skeleton'],
  ['delayms', '__delay_ms(${1:500});', 'Busy-wait delay (needs _XTAL_FREQ)'],
];
const C51_SNIPPETS: [string, string, string][] = [
  ['isr', 'void timer0_isr(void) interrupt 1\n{\n\t$0\n}', 'Keil interrupt function (1 = Timer 0)'],
  ['main', '#include <reg51.h>\n\nvoid main(void)\n{\n\t$0\n\twhile (1) {\n\t}\n}', 'Program skeleton'],
  ['sbit', 'sbit ${1:LED} = P1^${2:0};', 'Declare a port bit'],
];

export function completionsFor(arch: Arch, lineBefore: string, range: monaco.IRange): monaco.languages.CompletionItem[] {
  const K = monaco.languages.CompletionItemKind;
  if (arch === 'pic18') {
    const m = lineBefore.match(/(\w+)bits\.\w*$/);
    if (m) return (PIC_BITS[m[1]] ?? []).map((b) => ({ label: b, kind: K.Field, insertText: b, range }));
    return [
      ...Object.entries(PIC_SFR).map(([k, d]) => ({ label: k, kind: K.Variable, detail: d, insertText: k, range })),
      ...Object.keys(PIC_BITS).map((k) => ({ label: `${k}bits`, kind: K.Struct, detail: `${k} bit fields`, insertText: `${k}bits`, range })),
      ...PIC_SNIPPETS.map(([l, t, d]) => ({ label: l, kind: K.Snippet, detail: d, insertText: t, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range })),
    ];
  }
  return [
    ...Object.entries(C51_SFR).map(([k, d]) => ({ label: k, kind: K.Variable, detail: d, insertText: k, range })),
    ...C51_SNIPPETS.map(([l, t, d]) => ({ label: l, kind: K.Snippet, detail: d, insertText: t, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range })),
  ];
}

export function hoverDoc(arch: Arch, word: string): string | null {
  if (arch === 'pic18') {
    const base = word.replace(/bits$/, '');
    if (PIC_SFR[base]) return `**${word}** — ${PIC_SFR[base]}`;
    if (word === '__delay_ms' || word === '__delay_us') return `**${word}(x)** — busy-wait delay. Requires \`#define _XTAL_FREQ\` matching the crystal (20 MHz on this board).`;
    return null;
  }
  return C51_SFR[word] ? `**${word}** — ${C51_SFR[word]}` : null;
}
