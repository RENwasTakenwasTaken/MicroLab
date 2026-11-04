# μLab: Virtual Microcontroller Laboratory

A browser-based replica of the Embedded Processors practical lab (PICT, SPPU). Students write embedded C and build it with the **real compilers**. They then program it into a virtual device and watch their own firmware drive a 3D model of the lab's **Smart Logic Technologies EXCEL PIC V1.0** trainer.

Nothing is scripted. Every LED, LCD character, relay click and motor revolution comes from executing the compiled HEX file instruction by instruction.

## Quick start

Requirements:

- Node.js 22.6 or newer
- **MPLAB XC8** (v2.x; tested with v2.46)
- **SDCC** (tested with 4.5.0)

The server finds both compilers on `PATH` or in their default install folders. Override with `XC8_CC=…` / `SDCC=…`.

```bash
npm install
npm run dev          # build server on :5174 + Vite on :5173  →  http://localhost:5173
```

For lab deployment:

```bash
npm run build
npm start            # serves dist/ and the build API on http://localhost:8080
```

Tests (each one uses the real compilers):

```bash
npm test             # runs the 6 reference experiments end-to-end + debugger checks
npm run test:ui      # headless browser smoke test (needs `npm run dev` running; uses system Edge/Chrome)
node tests/ui-lab.mjs exp3      # full bench workflow through to scope/DMM readings
node tests/ui-lab-mouse.mjs     # real mouse clicks: monitor, USB plug, RESET/BOOT holds, cable pulled mid-upload
```

## What a student does

### PIC18F4550: the 3D lab bench

The PIC experiments open a 3D laboratory: a desk with the trainer, the lab computer (Dell monitor and tower), a Tektronix TDS1002 oscilloscope, a MECO 801 Auto multimeter and an Aplab MSG1M signal generator. The workflow is the lab's own:

1. **Code.** Click the monitor. The camera zooms in and a real editor (Monaco) appears on the screen, loaded with the experiment's C18-style program. Edits are kept when you close it with **X**.
2. **UPLOAD.** The program is compiled with XC8 (C18 conventions, code at 0x1000). Errors stop the upload. If the board isn't ready, the upload waits and says why.
3. **USB cable.** Click the Type-B plug on the desk, then click the board's USB socket. Connectors highlight and snap while you carry a plug. The cable shows its state: connected, uploading, complete or error.
4. **Bootloader.** Hold RESET, hold BOOT, release RESET, release BOOT. Right-click (or Shift-click) a board button to hold it. LP3/LP4 blink while the bootloader is active, and the upload then erases, programs and verifies.
5. **Run.** Press RESET without BOOT, or click *Reset Device*. The program runs.
6. **Measure.** Pick up the scope probes or DMM leads and click a header pin (use the *Pins* view). The scope shows triggered waveforms with automatic measurements. The DMM shows DC/AC volts or Hz.

All of these share one state: the oscilloscope shows nothing until the program has actually been compiled, uploaded and started. Pulling the USB cable mid-upload gives a communication error and leaves the application area erased. FRC ribbon plugs can be moved between the PORT headers and the peripheral connectors, and the electrical wiring follows immediately. A port-to-port or peripheral-to-peripheral connection is refused.

### Both families

| Step | PIC18F4550 | 8051 (Keil µVision workflow) |
|---|---|---|
| Edit | On the lab computer (C18 conventions), SFR completions and hovers | Editor pane, Keil C51 dialect (`sbit`, `bit`, `code`, `interrupt n`) |
| Build | UPLOAD (or toolbar Build, `Ctrl+B`) runs **xc8-cc -mcpu=18F4550 -mcodeoffset=0x1000** | `F7` runs **SDCC** through a Keil compatibility layer; µVision-style log |
| Load | USB HID bootloader (RESET + BOOT sequence) | **Start/Stop Debug Session** (`Ctrl+F5`) |
| Debug | Halt/Resume, Step Into `F11`, Step Over `F10`, Step Out `Ctrl+F11`, breakpoints in the gutter | same |
| Observe | 3D bench and instruments, SFRs, Watch, Pins, Peripherals, Memory, Disassembly, Logic Analyzer, UART | Port dialogs, virtual LED bar, registers (R0–R7, A, B, PSW, states, sec) |

C18 syntax is translated for XC8:
- `#pragma interrupt` and `#pragma code` vector remaps (the address is honoured)
- `_asm goto … _endasm` vector stubs
- `<p18f4550.h>`, `<delays.h>` and `rom`

XC8-style code is also accepted.

## Architecture

```
server/                       Build server (Node, no framework)
  compilers/toolchains.mjs    XC8 / SDCC drivers, diagnostics, tool-style logs
  compilers/compat.mjs        Keil C51 → SDCC and C18 → XC8 translation (line preserving)
  compilers/dwarf.mjs         ELF/DWARF .debug_line reader (PIC source-level debugging)
  include/                    reg51.h, reg52.h, intrins.h, p18f4550.h, delays.h shims
src/sim/                      Simulation engine (runs in a Web Worker, no DOM)
  pic18/pic18.ts              PIC18F4550 core + Timer0/1/2/3, CCP, ADC, EUSART, EEPROM, WDT, interrupts
  mcs51/mcs51.ts              8051/8052 core + timers 0/1/2, UART, external interrupts
  board/picboard.ts           Trainer netlist: LED bank, SW0/SW1, keypad, relay, buzzer, L293D + motor, LM35, pot
  board/hd44780.ts            HD44780 LCD controller (8/4-bit, busy timing, CGRAM, shift)
  board/pinmon.ts             Pin duty / frequency statistics + logic-analyzer capture
  engine.ts / worker.ts       Real-time pacing, breakpoints, stepping, frame snapshots
src/three/                    3D board (react-three-fiber)
  layout.ts                   ← parametric board description (every part, mm, from the photo)
  parts.tsx / interactive.tsx Component meshes; pressable keys, DIP levers, LEDs, LCD, trimpots…
src/ide/ src/debug/ src/lab/  Editor, toolbar, output panels, debug views, experiment sheet, hardware panel
src/experiments/              Experiment catalogue + reference programs (code/*.c)
```

Data flow: editor → `/api/compile` → HEX + line map + symbols → worker loads the HEX → CPU core ↔ `PinBus` ↔ board models → frames (~30 Hz) → 3D scene and panels.

## The board model and its assumptions

The 3D trainer was reconstructed from **one photograph**. The scale was calibrated at about 10 px/mm on the reference image, using the JHD162A module (80 × 36 mm) and the 40-pin DIP (52 mm). Every part position is a plain data entry in [`src/three/layout.ts`](src/three/layout.ts), so the model can be refined without touching rendering code.

Electrical connections that could not be read from the photo are **assumptions**. They are tagged *unverified* in the UI and can be edited live in **Hardware → Electrical assumptions**:

| Signal | Assumed connection | Basis |
|---|---|---|
| Programming | Microchip USB HID bootloader in 0x0000–0x0FFF, application at 0x1000 | BOOT/RESET buttons, USB-B, C18 `#pragma code … = 0x1000` lab convention |
| Clock | 20 MHz crystal, HSPLL → 48 MHz (Fcy 12 MHz); config bits owned by the bootloader | USB requires 48 MHz; `#pragma config` in user code is ignored on upload |
| Bootloader indication | LP3/LP4 blink alternately | typical for HID bootloader firmware |
| USB to PC | Type-B socket at the base board's left edge | silkscreen "USB" next to the PIC module |
| SW0 / SW1 | RB0 / RB1, active low, pull-up | "RB0/RB1" jumpers on the module, typical lab code |
| Relay / buzzer | RA4 / RA5, active high via transistors | typical SPPU lab code |
| L293D | IN1 ← RC2 (CCP1), IN2 ← RC1, EN1 → VCC (DCM_SW) | CCP pins; DIP labelled DCM_SW |
| LED bank | FRC line *n* → L*n*, active high | silkscreen L0–L7 |
| LCD | DATA FRC = D0–D7; CNTRL FRC lines 0/1/2 = RS/RW/EN | RE0/RE1/RE2 convention |
| Keypad | KEY FRC lines 0–3 rows, 4–7 columns, pull-ups | MS0–MS15 grid |
| POT / LM35 | AN0, selected by the ANALOG INP DIP | "PIC AN0" silkscreen |

**To verify in the lab:** the crystal marking, which port pins the relay/buzzer DIP and DCM_SW connect, and the LCD CNTRL line order. Then update the defaults in [`src/sim/board/picboard.ts`](src/sim/board/picboard.ts) and the `verified` flags in [`src/experiments/experiments.ts`](src/experiments/experiments.ts).

## Fidelity notes

- Both cores are instruction-accurate with cycle counts from the datasheets, so `__delay_ms`, Timer0 reloads, PWM periods and baud rates come out as on silicon. The Experiment 3 reference measures 998.8 Hz for a 1 kHz target, which is ISR latency, as on real hardware.
- Real-chip behaviour is kept, not hidden:
  - pins stay analog until `ADCON1` is set
  - read-modify-write on PORT vs LAT behaves as on the chip
  - the WDT resets the device if `WDT = OFF` is missing
  - an uninitialised HD44780 shows black boxes
  - LCD writes during the busy time produce a warning
- 8051 timing: SDCC's code generation differs from Keil C51, so **software delay loops** (`for(j=0;j<1275;j++)`) run at different speeds than in Keil. Timer-based delays are exact.
- Simulated only visually for now: I2C EEPROM/RTC, SPI sockets, CAN, USB, GLCD, ICSP/BOOT.

## Extending

- **New experiment:** add a reference program in `src/experiments/code/` and an entry in `EXPERIMENTS`. The entry holds the board cables/DIPs, connections, expected output and live measurements.
- **New board peripheral:** handle its pins in `PicBoard.readInputs` / `outputsChanged`, add its state to `PicBoardSnapshot`, then add a part to `layout.ts` and a component in `interactive.tsx`.
- **New MCU family:** implement `McuCore` (`src/sim/core/types.ts`) and a `SimBoard`, then add a compiler driver in `server/compilers/toolchains.mjs`.
  - ESP32 (Expt 7) and STM32 (Expt 8) are listed as *planned*. They need photos of the boards used, plus decisions on toolchain and how deep the emulation goes; Wi-Fi would be a simulated network.
