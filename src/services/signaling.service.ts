import { Injectable, inject } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';
import { RtcService } from './rtc.service';

// Custom native plugin for peripheral mode (advertising + GATT server)
const BleSignaling: any = registerPlugin('BleSignaling');

type ChunkEnvelope = { t: 'offer' | 'answer'; idx: number; total: number; data: string };

@Injectable({
  providedIn: 'root',
})
export class SignalingService {
  private rtc = inject(RtcService);

  private readonly SERVICE_ID = '6E400001-B5A3-F393-E0A9-E50E24DCCA9E';
  private readonly RX_ID = '6E400002-B5A3-F393-E0A9-E50E24DCCA9E'; // central -> peripheral
  private readonly TX_ID = '6E400003-B5A3-F393-E0A9-E50E24DCCA9E'; // peripheral -> central
  private readonly NAME_PREFIX = 'Motion-';

  private centralConnectedDeviceId: string | null = null;
  private incomingBuffers = new Map<
    string,
    { total: number; parts: string[]; type: 'offer' | 'answer' }
  >();
  private advertisingSession: string | null = null;
  private scanningSession: string | null = null;

  async startDisplayHandshake(sessionId: string): Promise<void> {
    if (this.advertisingSession === sessionId) return;
    await this.initializePeripheral(sessionId);
    this.advertisingSession = sessionId;
  }

  async startDetectorHandshake(sessionId: string): Promise<void> {
    if (this.scanningSession === sessionId) return;
    await this.initializeCentral();
    await this.startScanAndConnect(sessionId);
    this.scanningSession = sessionId;
  }

  // ---- Initialization ----

  private async initializeCentral(): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
  }

  private async initializePeripheral(sessionId: string): Promise<void> {
    // Start native advertising + GATT server and listen for RX writes
    BleSignaling.addListener('rxWritten', async (event: any) => {
      const decoded = this.parseEnvelope(event?.value);
      if (!decoded) return;
      await this.handleIncomingChunk('peripheral-offer', decoded, async (full) => {
        const answer = await this.rtc.acceptOfferAndCreateAnswer(full);
        await this.notifyChunks(answer);
      });
    });
    await BleSignaling.startAdvertising({
      sessionId,
      name: `${this.NAME_PREFIX}${sessionId}`,
      serviceId: this.SERVICE_ID,
      rxId: this.RX_ID,
      txId: this.TX_ID,
    });
  }

  // ---- Peripheral notify path ----

  private async notifyChunks(message: string): Promise<void> {
    const raw = JSON.stringify({ t: 'answer', sdp: message });
    const chunkSize = 180;
    const total = Math.ceil(raw.length / chunkSize);
    for (let i = 0; i < total; i++) {
      const data = raw.slice(i * chunkSize, (i + 1) * chunkSize);
      const env: ChunkEnvelope = { t: 'answer', idx: i, total, data };
      await BleSignaling.notifyTx({ value: this.encodeEnvelope(env) });
    }
  }

  // ---- Central (Detector) using community BLE plugin ----

  private async startScanAndConnect(sessionId: string): Promise<void> {
    let resolved = false;

    await BleClient.requestLEScan({ services: [this.SERVICE_ID] }, async (result) => {
      const name = (result.localName || (result as any).name || (result as any).device?.name) as
        | string
        | undefined;
      const deviceId = (result.device?.deviceId || (result as any).deviceId) as string | undefined;
      if (!name || !deviceId) return;
      if (!name.startsWith(`${this.NAME_PREFIX}${sessionId}`)) return;
      if (resolved) return;
      resolved = true;
      await BleClient.stopLEScan();
      await BleClient.connect(deviceId);
      this.centralConnectedDeviceId = deviceId;
      await BleClient.startNotifications(deviceId, this.SERVICE_ID, this.TX_ID, async (value) => {
        const bytes = Array.from(new Uint8Array(value.buffer));
        const decoded = this.parseEnvelope(bytes);
        if (!decoded) return;
        await this.handleIncomingChunk('central-answer', decoded, async (full) => {
          await this.rtc.setRemoteAnswer(full);
        });
      });
      // Create and send offer
      const offer = await this.rtc.createOfferWithDataChannel();
      await this.writeChunks(deviceId, { t: 'offer', sdp: offer });
    });

    // Safety timeout
    setTimeout(async () => {
      if (!resolved) {
        try {
          await BleClient.stopLEScan();
        } catch {}
      }
    }, 15000);
  }

  private async writeChunks(deviceId: string, payload: { t: 'offer'; sdp: string }): Promise<void> {
    const raw = JSON.stringify(payload);
    const chunkSize = 180;
    const total = Math.ceil(raw.length / chunkSize);
    for (let i = 0; i < total; i++) {
      const data = raw.slice(i * chunkSize, (i + 1) * chunkSize);
      const env: ChunkEnvelope = { t: 'offer', idx: i, total, data };
      const view = this.toDataView(this.encodeEnvelope(env));
      await BleClient.write(deviceId, this.SERVICE_ID, this.RX_ID, view);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ---- Chunk helpers ----

  private async handleIncomingChunk(
    key: string,
    env: ChunkEnvelope,
    onComplete: (fullText: string) => Promise<void>
  ): Promise<void> {
    let entry = this.incomingBuffers.get(key);
    if (!entry || entry.total !== env.total || entry.type !== env.t) {
      entry = { total: env.total, parts: new Array(env.total).fill(''), type: env.t };
      this.incomingBuffers.set(key, entry);
    }
    entry.parts[env.idx] = env.data;
    if (entry.parts.every((p) => p !== '')) {
      const joined = entry.parts.join('');
      try {
        const parsed = JSON.parse(joined);
        if ((env.t === 'offer' || env.t === 'answer') && typeof parsed.sdp === 'string') {
          await onComplete(parsed.sdp);
        }
      } finally {
        this.incomingBuffers.delete(key);
      }
    }
  }

  private encodeEnvelope(env: ChunkEnvelope): number[] {
    const text = JSON.stringify(env);
    const bytes = new TextEncoder().encode(text);
    return Array.from(bytes);
  }

  private toDataView(bytes: number[]): DataView {
    const arr = new Uint8Array(bytes);
    return new DataView(arr.buffer);
  }

  private parseEnvelope(value: any): ChunkEnvelope | null {
    try {
      const bytes: number[] = Array.isArray(value) ? value : [];
      const str = new TextDecoder().decode(new Uint8Array(bytes));
      const obj = JSON.parse(str);
      if (obj && (obj.t === 'offer' || obj.t === 'answer') && typeof obj.idx === 'number') {
        return obj as ChunkEnvelope;
      }
      return null;
    } catch {
      return null;
    }
  }
}
