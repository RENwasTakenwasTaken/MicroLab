// "What's new" on the home page: newest first. Add an entry at the top for each update students should notice.

export interface WhatsNewEntry {
  /** ISO date of the update */
  date: string;
  items: string[];
}

export const WHATS_NEW: WhatsNewEntry[] = [
  {
    date: '2026-11-15',
    items: [
      'LCD shows Warnings for too quick commands. Must add higher delay.',
      'LCD Contrast POT shows Warnings for too low/high contrast. Must adjust LCD POT.',
      'Multimeter warns if Volts is set as AC. Tells us to switch to DC Volts.',
      '3D 8051 Kit!',
      'Tektronics DSO alerts about AC Coupling and guides to set Coupling to DC. Very useful for square-wave issues on DSO.',
      'Kit warns if ADC Pin is set as OUTPUT instead of INPUT.'
    ],
  },
];
