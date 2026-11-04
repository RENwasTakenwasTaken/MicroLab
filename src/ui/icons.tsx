// Minimal inline stroke icon set (no network fonts / icon CDNs).
const PATHS: Record<string, string> = {
  build: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z',
  hammer: 'M14 4l6 6-3 3-6-6zM11 7L3 15l3 3 8-8',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  chip: 'M7 7h10v10H7zM10 1v4M14 1v4M10 19v4M14 19v4M1 10h4M1 14h4M19 10h4M19 14h4',
  download: 'M12 3v12M7 10l5 5 5-5M4 19h16',
  play: 'M7 4l13 8-13 8z',
  pause: 'M7 4h3v16H7zM14 4h3v16h-3z',
  stop: 'M6 6h12v12H6z',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v5h5',
  stepInto: 'M12 3v12M7 10l5 5 5-5M8 21h8',
  stepOver: 'M4 14a8 8 0 0 1 15-4M19 4v6h-6M10 20h4',
  stepOut: 'M12 21V9M7 14l5-5 5 5M8 3h8',
  stepInstr: 'M5 5h4v14H5zM13 12h7M17 9l3 3-3 3',
  bug: 'M8 8a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0zM4 10h4M16 10h4M4 16h4M16 16h4M12 8v10M9 4l1.5 2M15 4l-1.5 2',
  tag: 'M3 12V3h9l9 9-9 9zM7.5 7.5h.01',
  cable: 'M4 4v6a4 4 0 0 0 4 4h8a4 4 0 0 1 4 4v2M2 4h4M18 20h4',
  sound: 'M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  mute: 'M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3',
  board: 'M3 5h18v14H3zM7 9h4v6H7zM14 9h3M14 12h3M14 15h3',
  check: 'M4 12l5 5L20 6',
  x: 'M6 6l12 12M18 6L6 18',
  warn: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7h.01',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  wave: 'M2 16h4V8h4v8h4V8h4v8h4',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  copy: 'M8 8h12v12H8zM4 16V4h12',
  chevronLeft: 'M15 6l-6 6 6 6',
  chevronRight: 'M9 6l6 6-6 6',
  power: 'M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  cpu: 'M9 9h6v6H9zM5 5h14v14H5zM9 1v4M15 1v4M9 19v4M15 19v4M1 9h4M1 15h4M19 9h4M19 15h4',
  gauge: 'M12 14l4-4M4 18a9 9 0 1 1 16 0',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
};

export function Icon({ name, size }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}
