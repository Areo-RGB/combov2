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
  type: 'device-info' | 'offer' | 'answer' | 'ice-candidate' | 'mode-change';
  deviceId: string;
  deviceName?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  mode?: string;
}

type ChunkEnvelope = {
  t: 'lobby-msg';
  id: string;        // Unique message ID
  from: string;      // Sender device ID
  to?: string;       // Optional recipient (for targeted messages)
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
  private readonly CHUNK_SIZE = 20; // Safe default for BLE (MTU 23 - 3 bytes overhead)

  private role: LobbyRole | null = null;
  private lobbyId: string | null = null;
  private myDeviceId: string | null = null;
  private connectedClients = new Map<string, { deviceId: string; name: string }>();
  private hostDeviceId: string | null = null;

  private incomingBuffers = new Map<
    string,
    { total: number; parts: string[] }
  >();

  private messageCallbacks: ((msg: LobbyMessage) => void)[] = [];
  private listenerHandles: any[] = [];

  // ---- Public API ----

  async startHostLobby(hostName: string, hostId: string): Promise<void> {
    this.role = 'host';
    this.lobbyId = 'default';
    this.myDeviceId = hostId;
    await this.initializePeripheral();
  }

  async joinLobby(clientName: string, clientId: string): Promise<void> {
    this.role = 'client';
    this.lobbyId = 'default';
    this.myDeviceId = clientId;
    await this.initializeCentral();
    await this.scanAndConnect(clientName, clientId);
  }

  async broadcastOffer(deviceId: string, sdp: string): Promise<void> {
    if (this.role !== 'host' || !this.myDeviceId) return;

    const msg: LobbyMessage = {
      type: 'offer',
      deviceId,
      sdp,
    };

    // Send targeted offer to specific client
    await this.notifyChunks(JSON.stringify(msg), deviceId);
  }

  async sendAnswer(clientId: string, sdp: string): Promise<void> {
    if (this.role !== 'client' || !this.hostDeviceId || !this.myDeviceId) return;

    const msg: LobbyMessage = {
      type: 'answer',
      deviceId: clientId,
      sdp,
    };

    // Send answer to host (no specific 'to' needed, host is only recipient)
    await this.writeChunks(this.hostDeviceId, JSON.stringify(msg), undefined);
  }

  async sendIceCandidate(targetId: string, candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.myDeviceId) return;

    const msg: LobbyMessage = {
      type: 'ice-candidate',
      deviceId: this.myDeviceId,
      candidate,
    };

    if (this.role === 'host') {
      // Host sends to specific client
      await this.notifyChunks(JSON.stringify(msg), targetId);
    } else if (this.role === 'client' && this.hostDeviceId) {
      // Client sends to host
      await this.writeChunks(this.hostDeviceId, JSON.stringify(msg), undefined);
    }
  }

  async broadcastModeChange(mode: string): Promise<void> {
    if (this.role !== 'host' || !this.myDeviceId) return;

    const msg: LobbyMessage = {
      type: 'mode-change',
      deviceId: 'host',
      mode,
    };

    // Broadcast to all clients (no 'to' specified)
    await this.notifyChunks(JSON.stringify(msg), undefined);
  }

  onMessage(callback: (msg: LobbyMessage) => void): void {
    this.messageCallbacks.push(callback);
  }

  getConnectedClients(): Array<{ deviceId: string; name: string }> {
    return Array.from(this.connectedClients.values());
  }

  async cleanup(): Promise<void> {
    // Remove all listener handles
    for (const handle of this.listenerHandles) {
      try {
        if (handle && typeof handle.remove === 'function') {
          await handle.remove();
        }
      } catch (err) {
        console.error('Error removing listener:', err);
      }
    }
    this.listenerHandles = [];

    // Stop BLE advertising if host
    if (this.role === 'host') {
      try {
        await BleSignaling.stopAdvertising();
        console.log('BLE advertising stopped');
      } catch (err) {
        console.error('Error stopping advertising:', err);
      }
    }

    // Stop notifications and disconnect if client
    if (this.role === 'client' && this.hostDeviceId) {
      try {
        await BleClient.stopNotifications(this.hostDeviceId, this.SERVICE_ID, this.TX_ID);
        console.log('Stopped notifications');
      } catch (err) {
        console.error('Error stopping notifications:', err);
      }

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
    this.myDeviceId = null;
    this.hostDeviceId = null;
  }

  // ---- Peripheral (Host) Mode ----

  private async initializePeripheral(): Promise<void> {
    // Listen for client connections and store handle
    const rxHandle = await BleSignaling.addListener('rxWritten', async (event: any) => {
      const decoded = this.parseEnvelope(event?.value);
      if (!decoded) return;

      // Use sender ID + message ID as buffer key to prevent interleaving
      const bufferKey = `${decoded.from}:${decoded.id}`;
      await this.handleIncomingChunk(bufferKey, decoded, async (fullText) => {
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
    this.listenerHandles.push(rxHandle);

    await BleSignaling.startAdvertising({
      sessionId: 'default',
      name: 'Lobby',
      serviceId: this.SERVICE_ID,
      rxId: this.RX_ID,
      txId: this.TX_ID,
    });
  }

  private async notifyChunks(message: string, to?: string): Promise<void> {
    if (!this.myDeviceId) return;

    const msgId = this.generateMessageId();
    const total = Math.ceil(message.length / this.CHUNK_SIZE);

    for (let i = 0; i < total; i++) {
      const data = message.slice(i * this.CHUNK_SIZE, (i + 1) * this.CHUNK_SIZE);
      const env: ChunkEnvelope = {
        t: 'lobby-msg',
        id: msgId,
        from: this.myDeviceId,
        to,
        idx: i,
        total,
        data,
      };
      await BleSignaling.notifyTx({ value: this.encodeEnvelope(env) });
    }
  }

  // ---- Central (Client) Mode ----

  private async initializeCentral(): Promise<void> {
    await BleClient.initialize({ androidNeverForLocation: true });
  }

  private async scanAndConnect(clientName: string, clientId: string): Promise<void> {
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
        const decoded = this.parseEnvelope(value);
        if (!decoded) return;

        // Filter messages: only process if addressed to us or broadcast
        if (decoded.to && decoded.to !== clientId) {
          return; // Not for us
        }

        // Use sender ID + message ID as buffer key to prevent interleaving
        const bufferKey = `${decoded.from}:${decoded.id}`;
        await this.handleIncomingChunk(bufferKey, decoded, async (fullText) => {
          try {
            const msg: LobbyMessage = JSON.parse(fullText);
            this.messageCallbacks.forEach((cb) => cb(msg));
          } catch (err) {
            console.error('Failed to parse lobby message:', err);
          }
        });
      });

      // Send device info to host (use provided clientId)
      const msg: LobbyMessage = {
        type: 'device-info',
        deviceId: clientId,
        deviceName: clientName,
      };

      await this.writeChunks(deviceId, JSON.stringify(msg), undefined);
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

  private async writeChunks(deviceId: string, message: string, to?: string): Promise<void> {
    if (!this.myDeviceId) return;

    const msgId = this.generateMessageId();
    const total = Math.ceil(message.length / this.CHUNK_SIZE);

    for (let i = 0; i < total; i++) {
      const data = message.slice(i * this.CHUNK_SIZE, (i + 1) * this.CHUNK_SIZE);
      const env: ChunkEnvelope = {
        t: 'lobby-msg',
        id: msgId,
        from: this.myDeviceId,
        to,
        idx: i,
        total,
        data,
      };
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
      let bytes: Uint8Array;

      // Handle different input types across platforms
      if (value instanceof DataView) {
        bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (value && value.buffer instanceof ArrayBuffer) {
        bytes = new Uint8Array(value.buffer);
      } else if (Array.isArray(value)) {
        bytes = new Uint8Array(value);
      } else if (typeof value === 'string') {
        // Base64 string (some platforms)
        const binaryString = atob(value);
        bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
      } else {
        return null;
      }

      const str = new TextDecoder().decode(bytes);
      const obj = JSON.parse(str);

      if (
        obj &&
        obj.t === 'lobby-msg' &&
        typeof obj.id === 'string' &&
        typeof obj.from === 'string' &&
        typeof obj.idx === 'number'
      ) {
        return obj as ChunkEnvelope;
      }

      return null;
    } catch {
      return null;
    }
  }

  private generateMessageId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateDeviceId(): string {
    return `device-${Math.random().toString(36).substring(2, 11)}`;
  }
}
