import { Platform } from 'react-native';
import type { Peripheral } from 'react-native-ble-manager';
import { create } from 'zustand';

import { parseHeartRate } from '@/lib/heart-rate';

// Standard Bluetooth Heart Rate service and measurement characteristic.
const HR_SERVICE = '180D';
const HR_MEASUREMENT = '2A37';
/** Readings older than this are treated as gone (strap off, out of range). */
const FRESH_MS = 15_000;

interface HeartRateState {
  status: 'off' | 'searching' | 'connected' | 'error';
  bpm: number | null;
  at: number;
  device?: string;
  error?: string;
}

export const useHeartRate = create<HeartRateState>(() => ({ status: 'off', bpm: null, at: 0 }));

/** Current bpm if a reading arrived recently. */
export function liveHeartRate(now = Date.now()): number | undefined {
  const { bpm, at } = useHeartRate.getState();
  return bpm != null && now - at < FRESH_MS ? bpm : undefined;
}

type Ble = typeof import('react-native-ble-manager').default;
let subs: { remove(): void }[] = [];
let connectedId: string | null = null;

// Imported lazily: the library creates its native manager on import, which throws on web and in tests.
async function ble(): Promise<Ble> {
  return (await import('react-native-ble-manager')).default;
}

function cleanup() {
  subs.forEach((s) => s.remove());
  subs = [];
  connectedId = null;
}

async function waitForBluetooth(b: Ble) {
  for (let i = 0; i < 10; i++) {
    const state = await b.checkState();
    if (state === 'on') return;
    if (state === 'off' || state === 'unauthorized' || state === 'unsupported') break;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Bluetooth is off or GymHub isn’t allowed to use it (Settings → GymHub → Bluetooth).');
}

function scanOnce(b: Ble, seconds = 10): Promise<Peripheral | undefined> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (p?: Peripheral) => {
      if (done) return;
      done = true;
      found.remove();
      stopped.remove();
      b.stopScan().catch(() => {});
      resolve(p);
    };
    const found = b.onDiscoverPeripheral((p) => finish(p));
    const stopped = b.onStopScan(() => finish());
    b.scan({ serviceUUIDs: [HR_SERVICE], seconds }).catch(() => finish());
  });
}

/** Find a heart-rate strap (already connected to the phone, or advertising) and stream bpm. */
export async function connectHeartRate(): Promise<void> {
  if (Platform.OS === 'web') {
    useHeartRate.setState({ status: 'error', error: 'Heart rate needs the iPhone app.' });
    return;
  }
  if (useHeartRate.getState().status === 'searching' || connectedId) return;
  useHeartRate.setState({ status: 'searching', error: undefined });
  try {
    const b = await ble();
    await b.start({ showAlert: false });
    await waitForBluetooth(b);
    // A strap another app (e.g. noop) is connected to stops advertising, so check connected ones first.
    const [already] = await b.getConnectedPeripherals([HR_SERVICE]);
    const p = already ?? (await scanOnce(b));
    if (!p) throw new Error('No heart-rate strap found. Check it’s on and close by.');
    await b.connect(p.id);
    await b.retrieveServices(p.id, [HR_SERVICE]);
    subs.push(
      b.onDidUpdateValueForCharacteristic((e) => {
        if (e.peripheral !== p.id || !e.characteristic.toUpperCase().includes(HR_MEASUREMENT)) return;
        const bpm = parseHeartRate(e.value);
        if (bpm) useHeartRate.setState({ bpm, at: Date.now() });
      }),
      b.onDisconnectPeripheral((e) => {
        if (e.peripheral !== p.id) return;
        cleanup();
        useHeartRate.setState({ status: 'off', bpm: null });
      }),
    );
    await b.startNotification(p.id, HR_SERVICE, HR_MEASUREMENT);
    connectedId = p.id;
    useHeartRate.setState({ status: 'connected', device: p.name ?? p.advertising?.localName ?? 'Heart-rate strap' });
  } catch (err) {
    cleanup();
    useHeartRate.setState({ status: 'error', bpm: null, error: String((err as Error)?.message ?? err) });
  }
}

export async function disconnectHeartRate(): Promise<void> {
  const id = connectedId;
  cleanup();
  useHeartRate.setState({ status: 'off', bpm: null, error: undefined });
  if (!id || Platform.OS === 'web') return;
  const b = await ble();
  // Drops only GymHub's link; other apps connected to the strap keep theirs.
  await b.stopNotification(id, HR_SERVICE, HR_MEASUREMENT).catch(() => {});
  await b.disconnect(id).catch(() => {});
}
