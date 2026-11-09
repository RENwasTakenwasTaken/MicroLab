// Text with inline equations. Anything between $…$ is set in Cambria Math (with math-font
// fallbacks); inside an equation, _{…} / ^{…} (or _x / ^x for one character) become
// subscripts / superscripts, e.g. "$T_{AD} = 64 / F_{osc}$" or "$2^{n}$".

import { Fragment, type ReactNode } from 'react';

function mathNodes(s: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buf = '';
  let key = 0;
  const flush = () => { if (buf) { out.push(buf); buf = ''; } };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === '_' || c === '^') && i + 1 < s.length) {
      let arg: string;
      if (s[i + 1] === '{') {
        const end = s.indexOf('}', i + 2);
        arg = s.slice(i + 2, end < 0 ? s.length : end);
        i = end < 0 ? s.length : end;
      } else {
        arg = s[i + 1];
        i += 1;
      }
      flush();
      out.push(c === '_' ? <sub key={key++}>{arg}</sub> : <sup key={key++}>{arg}</sup>);
    } else buf += c;
  }
  flush();
  return out;
}

/** Keep a number and its unit on one line ("48 MHz", "1.33 µs"). */
const glueUnits = (s: string) => s.replace(/(\d) (?=(?:µs|ms|ns|s|MHz|kHz|Hz|mV|V|°C|pF|kΩ|Ω|mA|µA)(?![\w]))/g, '$1 ');

export function MathText({ text }: { text: string }) {
  const parts = text.split('$');
  return <>{parts.map((p, i) => (i % 2 ? <span key={i} className="eq">{mathNodes(glueUnits(p))}</span> : <Fragment key={i}>{glueUnits(p)}</Fragment>))}</>;
}

/** The same text with the $…$ markers and sub/superscript markup removed (plain-text uses). */
export const plainMath = (text: string) => text.replace(/\$/g, '').replace(/[_^]\{([^}]*)\}/g, '$1');
