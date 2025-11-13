import { Injectable, signal, computed, inject } from '@angular/core';
import { BluetoothLobbyService, LobbyMessage, LobbyRole } from './bluetooth-lobby.service';

export interface ConnectedDevice {
  id: string;
  name: string;
  connected: boolean;
  rtcReady: boolean;
  peerConnection: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
}

export interface LobbyState {
  lobbyId: string | null;
  role: LobbyRole | null;
  hostName: string | null;
  devices: ConnectedDevice[];
  isSetupComplete: boolean;
  selectedMode: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class LocalLobbyService {
  private bluetooth = inject(BluetoothLobbyService);

  // Signals for reactive state
  lobbyId = signal<string | null>(null);
  role = signal<LobbyRole | null>(null);
  hostName = signal<string | null>(null);
  devices = signal<ConnectedDevice[]>([]);
  isSetupComplete = signal<boolean>(false);
  selectedMode = signal<string | null>(null);
  clientId = signal<string | null>(null);
  clientPeerConnection = signal<RTCPeerConnection | null>(null);

  // Computed signals
  allDevicesReady = computed(() => {
    const devs = this.devices();
    return devs.length > 0 && devs.every((d) => d.connected && d.rtcReady);
  });

  deviceCount = computed(() => this.devices().length);

  private messageCallbacks: ((msg: any) => void)[] = [];

  constructor() {
    // Listen for Bluetooth lobby messages
    this.bluetooth.onMessage((msg: LobbyMessage) => {
      this.handleLobbyMessage(msg);
    });
  }

  // ---- Host Methods ----

  async createLobby(hostName: string): Promise<string> {
    const lobbyId = this.generateLobbyId();
    this.lobbyId.set(lobbyId);
    this.role.set('host');
    this.hostName.set(hostName);
    this.devices.set([]);
    this.isSetupComplete.set(false);

    await this.bluetooth.startHostLobby(lobbyId, hostName);

    return lobbyId;
  }

  async completeSetup(): Promise<void> {
    if (this.role() !== 'host') return;
    this.isSetupComplete.set(true);
  }

  async selectModeForAll(mode: string): Promise<void> {
    if (this.role() !== 'host' || !this.isSetupComplete()) return;

    this.selectedMode.set(mode);

    // Broadcast mode change to all clients
    await this.bluetooth.broadcastModeChange(mode);

    // Notify local callbacks
    this.messageCallbacks.forEach((cb) =>
      cb({ type: 'mode-selected', mode })
    );
  }

  // ---- Client Methods ----

  async joinLobby(lobbyId: string, clientName: string): Promise<void> {
    const clientId = this.generateClientId();
    this.clientId.set(clientId);
    this.lobbyId.set(lobbyId);
    this.role.set('client');
    this.devices.set([]);
    this.isSetupComplete.set(false);

    await this.bluetooth.joinLobby(lobbyId, clientName);
  }

  // ---- WebRTC Connection Management ----

  async establishWebRTCConnections(): Promise<void> {
    if (this.role() !== 'host') return;

    const devices = this.devices();

    for (const device of devices) {
      if (!device.rtcReady) {
        await this.createWebRTCConnection(device);
      }
    }
  }

  private async createWebRTCConnection(device: ConnectedDevice): Promise<void> {
    try {
      // Create peer connection (no ICE servers for local network)
      const pc = new RTCPeerConnection({ iceServers: [] });
      device.peerConnection = pc;

      // Create data channel
      const dc = pc.createDataChannel('lobby', { ordered: true });
      device.dataChannel = dc;

      this.attachDataChannelHandlers(device, dc);

      // Create offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.waitForIceGatheringComplete(pc);

      // Send offer to client via Bluetooth
      const sdp = pc.localDescription?.sdp ?? '';
      await this.bluetooth.broadcastOffer(device.id, sdp);

      console.log('Offer sent for device:', device.id);
    } catch (err) {
      console.error('Failed to create WebRTC connection:', err);
    }
  }

  private async handleAnswer(deviceId: string, answerSdp: string): Promise<void> {
    const devices = this.devices();
    const device = devices.find((d) => d.id === deviceId);

    if (!device || !device.peerConnection) return;

    await device.peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    this.updateDeviceRtcStatus(deviceId, true);
  }

  private async handleOffer(offerSdp: string): Promise<void> {
    // Client receives offer from host
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.clientPeerConnection.set(pc);

    pc.ondatachannel = (e) => {
      const dc = e.channel;
      this.attachDataChannelHandlers({ id: 'host', name: 'Host' } as ConnectedDevice, dc);
    };

    await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await this.waitForIceGatheringComplete(pc);

    // Send answer back to host
    const clientId = this.clientId() || 'unknown';
    const sdp = pc.localDescription?.sdp ?? '';
    await this.bluetooth.sendAnswer(clientId, sdp);

    console.log('Answer sent to host');
  }

  // ---- Message Handling ----

  private handleLobbyMessage(msg: LobbyMessage): void {
    switch (msg.type) {
      case 'device-info':
        if (this.role() === 'host') {
          this.addDevice({
            id: msg.deviceId,
            name: msg.deviceName || 'Unknown',
            connected: true,
            rtcReady: false,
            peerConnection: null,
            dataChannel: null,
          });
        }
        break;

      case 'offer':
        if (this.role() === 'client' && msg.sdp) {
          this.handleOffer(msg.sdp);
        }
        break;

      case 'answer':
        if (this.role() === 'host' && msg.sdp) {
          this.handleAnswer(msg.deviceId, msg.sdp);
        }
        break;

      case 'mode-change':
        if (this.role() === 'client' && msg.mode) {
          this.selectedMode.set(msg.mode);
          this.messageCallbacks.forEach((cb) =>
            cb({ type: 'mode-selected', mode: msg.mode })
          );
        }
        break;
    }
  }

  // ---- Device Management ----

  private addDevice(device: ConnectedDevice): void {
    const current = this.devices();
    const exists = current.find((d) => d.id === device.id);

    if (!exists) {
      this.devices.set([...current, device]);
    }
  }

  private updateDeviceRtcStatus(deviceId: string, ready: boolean): void {
    const current = this.devices();
    const updated = current.map((d) =>
      d.id === deviceId ? { ...d, rtcReady: ready } : d
    );
    this.devices.set(updated);
  }

  // ---- Data Channel Helpers ----

  private attachDataChannelHandlers(device: ConnectedDevice, dc: RTCDataChannel): void {
    dc.onopen = () => {
      console.log(`Data channel opened for device: ${device.id}`);
    };

    dc.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        this.messageCallbacks.forEach((cb) => cb(parsed));
      } catch {
        // Ignore malformed data
      }
    };

    dc.onerror = (err) => {
      console.error(`Data channel error for device ${device.id}:`, err);
    };
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const listener = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', listener);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', listener);
    });
  }

  // ---- Messaging ----

  onMessage(callback: (msg: any) => void): void {
    this.messageCallbacks.push(callback);
  }

  sendToAll(message: any): void {
    const devices = this.devices();
    const jsonMsg = JSON.stringify(message);

    devices.forEach((device) => {
      if (device.dataChannel && device.dataChannel.readyState === 'open') {
        device.dataChannel.send(jsonMsg);
      }
    });
  }

  // ---- Cleanup ----

  cleanup(): void {
    const devices = this.devices();

    devices.forEach((device) => {
      if (device.dataChannel) {
        device.dataChannel.close();
      }
      if (device.peerConnection) {
        device.peerConnection.close();
      }
    });

    this.bluetooth.cleanup();

    this.lobbyId.set(null);
    this.role.set(null);
    this.hostName.set(null);
    this.devices.set([]);
    this.isSetupComplete.set(false);
    this.selectedMode.set(null);
    this.messageCallbacks = [];
  }

  // ---- Utility ----

  private generateLobbyId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  private generateClientId(): string {
    return `client-${Math.random().toString(36).substring(2, 11)}`;
  }
}
