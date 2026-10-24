import { parseHeartRate } from '../heart-rate';

describe('parseHeartRate', () => {
  it('reads 8-bit bpm', () => expect(parseHeartRate([0x00, 72])).toBe(72));
  it('reads 16-bit little-endian bpm', () => expect(parseHeartRate([0x01, 0x2c, 0x01])).toBe(300));
  it('ignores extra fields after bpm', () => expect(parseHeartRate([0x16, 148, 0x10, 0x03])).toBe(148));
  it('rejects short or zero readings', () => {
    expect(parseHeartRate([])).toBeNull();
    expect(parseHeartRate([0x01, 0x50])).toBeNull();
    expect(parseHeartRate([0x00, 0])).toBeNull();
  });
});
