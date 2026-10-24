/**
 * Parse a Bluetooth Heart Rate Measurement (characteristic 0x2A37).
 * Bit 0 of the flags byte says whether bpm is 8-bit or 16-bit little-endian.
 */
export function parseHeartRate(bytes: number[]): number | null {
  const wide = (bytes[0] & 1) === 1;
  if (bytes.length < (wide ? 3 : 2)) return null;
  const bpm = wide ? bytes[1] | (bytes[2] << 8) : bytes[1];
  return bpm > 0 ? bpm : null;
}
