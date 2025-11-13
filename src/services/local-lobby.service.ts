import { Injectable, signal, computed, inject } from '@angular/core';
import { BluetoothLobbyService, LobbyMessage, LobbyRole } from './bluetooth-lobby.service';
import { RtcConnection } from './rtc-connection';

export interface ConnectedDevice {
  id: string;
  name: string;
  connected: boolean;
  rtcReady: boolean;
  rtcConnection: RtcConnection | null;
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
  clientRtcConnection: RtcConnection | null = null;

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

  async createLobby(hostName: string): Promise<void> {
    this.lobbyId.set('default');
    this.role.set('host');
    this.hostName.set(hostName);
    this.devices.set([]);
    this.isSetupComplete.set(false);

    await this.bluetooth.startHostLobby(hostName);
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

  async joinLobby(clientName: string): Promise<void> {
    const clientId = this.generateClientId();
    this.clientId.set(clientId);
    this.lobbyId.set('default');
    this.role.set('client');
    this.devices.set([]);
    this.isSetupComplete.set(false);

    await this.bluetooth.joinLobby(clientName);
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
      // Create RTC connection
      const rtc = new RtcConnection();
      device.rtcConnection = rtc;

      // Set up callbacks
      rtc.onOpen(() => {
        console.log(`RTC connection ready for device: ${device.id}`);
        this.updateDeviceRtcStatus(device.id, true);
      });

      rtc.onClose(() => {
        console.log(`RTC connection closed for device: ${device.id}`);
        this.updateDeviceRtcStatus(device.id, false);
      });

      rtc.onMessage((msg) => {
        this.messageCallbacks.forEach((cb) => cb(msg));
      });

      // Create offer
      const sdp = await rtc.createOfferWithDataChannel('lobby');

      // Send offer to client via Bluetooth
      await this.bluetooth.broadcastOffer(device.id, sdp);

      console.log('Offer sent for device:', device.id);
    } catch (err) {
      console.error('Failed to create WebRTC connection:', err);
    }
  }

  private async handleAnswer(deviceId: string, answerSdp: string): Promise<void> {
    const devices = this.devices();
    const device = devices.find((d) => d.id === deviceId);

    if (!device || !device.rtcConnection) return;

    await device.rtcConnection.setRemoteAnswer(answerSdp);
    console.log('Answer processed for device:', deviceId);
  }

  private async handleOffer(offerSdp: string): Promise<void> {
    // Client receives offer from host
    const rtc = new RtcConnection();
    this.clientRtcConnection = rtc;

    // Set up callbacks
    rtc.onOpen(() => {
      console.log('Client RTC connection ready');
    });

    rtc.onClose(() => {
      console.log('Client RTC connection closed');
    });

    rtc.onMessage((msg) => {
      this.messageCallbacks.forEach((cb) => cb(msg));
    });

    // Accept offer and create answer
    const sdp = await rtc.acceptOfferAndCreateAnswer(offerSdp);

    // Send answer back to host
    const clientId = this.clientId() || 'unknown';
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
            rtcConnection: null,
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

  // ---- Messaging ----

  onMessage(callback: (msg: any) => void): void {
    this.messageCallbacks.push(callback);
  }

  sendToAll(message: any): void {
    const devices = this.devices();

    devices.forEach((device) => {
      if (device.rtcConnection && device.rtcConnection.isReady()) {
        device.rtcConnection.send(message);
      }
    });
  }

  // ---- Cleanup ----

  async cleanup(): Promise<void> {
    const devices = this.devices();

    // Close all device connections
    devices.forEach((device) => {
      if (device.rtcConnection) {
        device.rtcConnection.close();
      }
    });

    // Close client connection
    if (this.clientRtcConnection) {
      this.clientRtcConnection.close();
      this.clientRtcConnection = null;
    }

    await this.bluetooth.cleanup();

    this.lobbyId.set(null);
    this.role.set(null);
    this.hostName.set(null);
    this.devices.set([]);
    this.isSetupComplete.set(false);
    this.selectedMode.set(null);
    this.messageCallbacks = [];
  }

  // ---- Utility ----

  private generateClientId(): string {
    return `client-${Math.random().toString(36).substring(2, 11)}`;
  }
}
