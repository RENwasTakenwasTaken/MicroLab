// Intel HEX parser. Returns a sparse list of (address, bytes) segments using
// absolute byte addresses (extended linear / segment records applied).

export interface HexSegment {
  address: number;
  data: Uint8Array;
}

export function parseIntelHex(text: string): HexSegment[] {
  const segments: HexSegment[] = [];
  let base = 0;
  let lineNo = 0;
  for (const raw of text.split(/\r?\n/)) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (line[0] !== ':') throw new Error(`HEX line ${lineNo}: missing ':'`);
    const bytes = new Uint8Array((line.length - 1) / 2);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(line.substr(1 + i * 2, 2), 16);
    const len = bytes[0];
    const addr = (bytes[1] << 8) | bytes[2];
    const type = bytes[3];
    let sum = 0;
    for (let i = 0; i < len + 5; i++) sum = (sum + bytes[i]) & 0xff;
    if (sum !== 0) throw new Error(`HEX line ${lineNo}: checksum error`);
    switch (type) {
      case 0x00:
        segments.push({ address: base + addr, data: bytes.slice(4, 4 + len) });
        break;
      case 0x01:
        return segments;
      case 0x02:
        base = ((bytes[4] << 8) | bytes[5]) << 4;
        break;
      case 0x04:
        base = ((bytes[4] << 8) | bytes[5]) << 16;
        break;
      default:
        break; // 03/05 start address records are irrelevant here
    }
  }
  return segments;
}

/** Copies all bytes that fall inside [start, start+target.length) into target. */
export function loadSegments(segments: HexSegment[], target: Uint8Array, start = 0): number {
  let count = 0;
  for (const s of segments) {
    for (let i = 0; i < s.data.length; i++) {
      const a = s.address + i - start;
      if (a >= 0 && a < target.length) {
        target[a] = s.data[i];
        count++;
      }
    }
  }
  return count;
}
