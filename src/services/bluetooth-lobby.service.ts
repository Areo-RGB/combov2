import { Injectable } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import { BleClient, numberToUUID } from '@capacitor-community/bluetooth-le';

// Custom native plugin for peripheral mode (advertising + GATT server)
const BleSignaling: any = registerPlugin('BleSignaling');

export type LobbyRole = 'host' | 'client';

export interface LobbyDevice {
  id: string;
  name: string;
  role: LobbyRole;
  connected: boolean;
  rtcReady: boolean;
}

export interface LobbyMessage {
  type: 'device-info' | 'offer' | 'answer' | 'mode-change';
  deviceId: string;
  deviceName?: string;
  sdp?: string;
  mode?: string;
}

type ChunkEnvelope = {
  t: 'lobby-msg';
  idx: number;
  total: number;
  data: string;
};

@Injectable({
  providedIn: 'root',
})
export class BluetoothLobbyService {
  private readonly SERVICE_ID = '6E400011-B5A3-F393-E0A9-E50E24DCCA9E'; // Different from motion signaling
  private readonly RX_ID = '6E400012-B5A3-F393-E0A9-E50E24DCCA9E'; // central -> peripheral
  private readonly TX_ID = '6E400013-B5A3-F393-E0A9-E50E24DCCA9E'; // peripheral -> central
  private readonly NAME_PREFIX = 'Lobby-';

  private role: LobbyRole | null = null;
  private lobbyId: string | null = null;
  private connectedClients = new Map<string, { deviceId: string; name: string }>();
  private hostDeviceId: string | null = null;

  private incomingBuffers = new Map<
    string,
    { total: number; parts: string[] }
  >();

  private messageCallbacks: ((msg: LobbyMessage) => void)[] = [];

  // ---- Public API ----

  async startHostLobby(hostName: string): Promise<void> {
    this.role = 'host';
    this.lobbyId = 'default';
    await this.initializePeripheral();
  }

  async joinLobby(clientName: string): Promise<void> {
    this.role = 'client';
    this.lobbyId = 'default';
    await this.initializeCentral();
    await this.scanAndConnect(clientName);
  }

  async broadcastOffer(deviceId: string, sdp: string): Promise<void> {
    if (this.role !== 'host') return;

    const msg: LobbyMessage = {
      type: 'offer',
      deviceId,
      sdp,
    };

    await this.notifyChunks(JSON.stringify(msg));
  }

  async sendAnswer(clientId: string, sdp: string): Promise<void> {
    if (this.role !== 'client' || !this.hostDeviceId) return;

    const msg: LobbyMessage = {
      type: 'answer',
      deviceId: clientId,
      sdp,
    };

    await this.writeChunks(this.hostDeviceId, JSON.stringify(msg));
  }

  async broadcastModeChange(mode: string): Promise<void> {
    if (this.role !== 'host') return;

    const msg: LobbyMessage = {
      type: 'mode-change',
      deviceId: 'host',
      mode,
    };

    await this.notifyChunks(JSON.stringify(msg));
  }

  onMessage(callback: (msg: LobbyMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  getConnectedClients(): Array<{ deviceId: string; name: string }> {
    return Array.from(this.connectedClients.values());
  }

  async cleanup(): Promise<void> {
    // Stop BLE advertising if host
    if (this.role === 'host') {
      try {
        await BleSignaling.stopAdvertising();
        console.log('BLE advertising stopped');
      } catch (err) {
        console.error('Error stopping advertising:', err);
      }

      // Remove event listeners
      try {
        await BleSignaling.removeAllListeners('rxWritten');
        await BleSignaling.removeAllListeners('connectionStateChange');
        console.log('BLE event listeners removed');
      } catch (err) {
        console.error('Error removing listeners:', err);
      }
    }

    // Disconnect from host if client
    if (this.role === 'client' && this.hostDeviceId) {
      try {
        await BleClient.disconnect(this.hostDeviceId);
        console.log('Disconnected from host');
      } catch (err) {
        console.error('Error disconnecting:', err);
      }
    }

    // Clear state
    this.messageCallbacks = [];
    this.connectedClients.clear();
    this.incomingBuffers.clear();
    this.role = null;
    this.lobbyId = null;
    this.hostDeviceId = null;
  }

  // ---- Peripheral (Host) Mode ----

  private async initializePeripheral(): Promise<void> {
    // Listen for client connections
    BleSignaling.addListener('rxWritten', async (event: any) => {
      const decoded = this.parseEnvelope(event?.value);
      if (!decoded) return;

      await this.handleIncomingChunk('host-buffer', decoded, async (fullText) => {
        try {
          const msg: LobbyMessage = JSON.parse(fullText);

          // Handle device info
          if (msg.type === 'device-info') {
            this.connectedClients.set(msg.deviceId, {
              deviceId: msg.deviceId,
              name: msg.deviceName || 'Unknown',
            });
          }

          // Notify all callbacks
          this.messageCallbacks.forEach((cb) => cb(msg));
        } catch (err) {
          console.error('Failed to parse lobby message:', err);
        }
      });
    });

    await BleSignaling.startAdvertising({
      sessionId: 'default',
      name: 'Lobby',
      serviceId: this.SERVICE_ID,
      rxId: this.RX_ID,
      txId: this.TX_ID,
    });
  }

  private async notifyChunks(message: string): Promise<void> {
    const chunkSize = 180;
    const total = Math.ceil(message.length / chunkSize);

    for (let i = 0; i < total; i++) {
      const data = message.slice(i * chunkSize, (i + 1) * chunkSize);
      const env: ChunkEnvelope = { t: 'lobby-msg', idx: i, total, data };
      await BleSignaling.notifyTx({ value: this.encodeEnvelope(env) });
    }
  }

  // ---- Central (Client) Mode ----

  private async initializeCentral(): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
  }

  private async scanAndConnect(clientName: string): Promise<void> {
    let resolved = false;

    await BleClient.requestLEScan({ services: [this.SERVICE_ID] }, async (result) => {
      const deviceId = (result.device?.deviceId || (result as any).deviceId) as string | undefined;

      if (!deviceId) return;
      if (resolved) return;

      resolved = true;
      await BleClient.stopLEScan();
      await BleClient.connect(deviceId);
      this.hostDeviceId = deviceId;

      // Listen for notifications from host
      await BleClient.startNotifications(deviceId, this.SERVICE_ID, this.TX_ID, async (value) => {
        const bytes = Array.from(new Uint8Array(value.buffer));
        const decoded = this.parseEnvelope(bytes);
        if (!decoded) return;

        await this.handleIncomingChunk('client-buffer', decoded, async (fullText) => {
          try {
            const msg: LobbyMessage = JSON.parse(fullText);
            this.messageCallbacks.forEach((cb) => cb(msg));
          } catch (err) {
            console.error('Failed to parse lobby message:', err);
          }
        });
      });

      // Send device info to host
      const clientId = this.generateDeviceId();
      const msg: LobbyMessage = {
        type: 'device-info',
        deviceId: clientId,
        deviceName: clientName,
      };

      await this.writeChunks(deviceId, JSON.stringify(msg));
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

  private async writeChunks(deviceId: string, message: string): Promise<void> {
    const chunkSize = 180;
    const total = Math.ceil(message.length / chunkSize);

    for (let i = 0; i < total; i++) {
      const data = message.slice(i * chunkSize, (i + 1) * chunkSize);
      const env: ChunkEnvelope = { t: 'lobby-msg', idx: i, total, data };
      const view = this.toDataView(this.encodeEnvelope(env));
      await BleClient.write(deviceId, this.SERVICE_ID, this.RX_ID, view);
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  // ---- Chunk Helpers ----

  private async handleIncomingChunk(
    key: string,
    env: ChunkEnvelope,
    onComplete: (fullText: string) => Promise<void>
  ): Promise<void> {
    let entry = this.incomingBuffers.get(key);

    if (!entry || entry.total !== env.total) {
      entry = { total: env.total, parts: new Array(env.total).fill('') };
      this.incomingBuffers.set(key, entry);
    }

    entry.parts[env.idx] = env.data;

    if (entry.parts.every((p) => p !== '')) {
      const joined = entry.parts.join('');
      await onComplete(joined);
      this.incomingBuffers.delete(key);
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

      if (obj && obj.t === 'lobby-msg' && typeof obj.idx === 'number') {
        return obj as ChunkEnvelope;
      }

      return null;
    } catch {
      return null;
    }
  }

  private generateDeviceId(): string {
    return `device-${Math.random().toString(36).substring(2, 11)}`;
  }
}
