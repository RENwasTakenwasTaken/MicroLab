/*
 * vector_relocate.h - PICT EP lab project file for the USB HID bootloader.
 *
 * The bootloader occupies 0x0000-0x0FFF, so the application's reset vector and
 * interrupt vectors must be relocated to:
 *     reset          0x1000
 *     high priority  0x1008
 *     low priority   0x1018
 * Without this file the program is linked at 0x0000 and programming it would
 * overwrite (erase) the bootloader: the PC would no longer detect the PIC over USB.
 *
 * In MPLAB C18 this file holds the "#pragma code ... = 0x1000" remap stubs. The
 * Virtual Lab builds with XC8, where the same relocation is the -mcodeoffset=0x1000
 * link option applied to every build; including this header is what tells the
 * lab's UPLOAD step that the vectors are relocated.
 */
#ifndef VECTOR_RELOCATE_H
#define VECTOR_RELOCATE_H

#define REMAPPED_RESET_VECTOR_ADDRESS           0x1000
#define REMAPPED_HIGH_INTERRUPT_VECTOR_ADDRESS  0x1008
#define REMAPPED_LOW_INTERRUPT_VECTOR_ADDRESS   0x1018

#endif
