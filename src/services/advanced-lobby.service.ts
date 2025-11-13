import { Injectable, signal, computed } from '@angular/core';
import { BluetoothLobbyService, LobbyMessage } from './bluetooth-lobby.service';
import { AdvancedWebRTCService, Message } from './advanced-webrtc.service';

export interface AdvancedDevice {
  id: string;
  name: string;
  connected: boolean;
  rtcState: RTCPeerConnectionState;
  dataChannelReady: boolean;
}

export interface LobbyState {
  role: 'host' | 'client' | null;
  lobbyId: string | null;
  hostId: string | null;
  clientId: string | null;
  devices: AdvancedDevice[];
  isSetupComplete: boolean;
}

/**
 * Advanced lobby service using production WebRTCService with trickle ICE,
 * message queuing, and enhanced connection monitoring.
 */
@Injectable({
  providedIn: 'root',
})
export class AdvancedLobbyService {
  // State signals
  role = signal<'host' | 'client' | null>(null);
  lobbyId = signal<string | null>(null);
  hostId = signal<string | null>(null);
  clientId = signal<string | null>(null);
  devices = signal<AdvancedDevice[]>([]);
  isSetupComplete = signal<boolean>(false);

  // Computed signals
  allDevicesReady = computed(() => {
    const devs = this.devices();
    return devs.length > 0 && devs.every((d) => d.rtcState === 'connected' && d.dataChannelReady);
  });

  deviceCount = computed(() => this.devices().length);

  constructor(
    private bluetooth: BluetoothLobbyService,
    private webrtc: AdvancedWebRTCService
  ) {
    this.setupBluetoothMessageHandler();
    this.setupWebRTCCallbacks();
  }

  // ---- Host Actions ----

  async createLobby(hostName: string): Promise<void> {
    this.role.set('host');
    this.lobbyId.set('default');
    const hostId = this.generateDeviceId();
    this.hostId.set(hostId);

    // Start BLE advertising
    await this.bluetooth.startHostLobby(hostName, hostId);

    console.log('Advanced lobby created as host:', hostId);
  }

  // ---- Client Actions ----

  async joinLobby(clientName: string): Promise<void> {
    this.role.set('client');
    this.lobbyId.set('default');
    const clientId = this.generateDeviceId();
    this.clientId.set(clientId);

    // Scan and connect via BLE
    await this.bluetooth.joinLobby(clientName, clientId);

    console.log('Advanced lobby joined as client:', clientId);
  }

  // ---- Setup & Lifecycle ----

  async completeSetup(): Promise<void> {
    this.isSetupComplete.set(true);
    console.log('Advanced lobby setup complete');
  }

  async cleanup(): Promise<void> {
    await this.bluetooth.cleanup();
    this.webrtc.cleanup();

    this.role.set(null);
    this.lobbyId.set(null);
    this.hostId.set(null);
    this.clientId.set(null);
    this.devices.set([]);
    this.isSetupComplete.set(false);

    console.log('Advanced lobby cleaned up');
  }

  onMessage(callback: (msg: any) => void): void {
    // Expose WebRTC messages to components
    this.webrtc.onMessageReceived = (peerId: string, message: Message) => {
      callback({ peerId, ...message });
    };
  }

  broadcastMessage(message: Message): void {
    this.webrtc.broadcastMessage(message);
  }

  // ---- Private: Bluetooth Message Handler ----

  private setupBluetoothMessageHandler(): void {
    this.bluetooth.onMessage((msg: LobbyMessage) => {
      switch (msg.type) {
        case 'device-info':
          this.handleDeviceInfo(msg);
          break;
        case 'offer':
          this.handleOffer(msg);
          break;
        case 'answer':
          this.handleAnswer(msg);
          break;
        case 'ice-candidate':
          this.handleIceCandidate(msg);
          break;
        case 'mode-change':
          this.handleModeChange(msg);
          break;
      }
    });
  }

  private async handleDeviceInfo(msg: LobbyMessage): Promise<void> {
    if (this.role() !== 'host') return;

    const newDevice: AdvancedDevice = {
      id: msg.deviceId,
      name: msg.deviceName || 'Unknown',
      connected: true,
      rtcState: 'new',
      dataChannelReady: false,
    };

    this.addDevice(newDevice);

    console.log('Device joined, creating WebRTC offer:', msg.deviceId);

    // Automatically create WebRTC connection and offer
    try {
      await this.webrtc.createConnectionAndOffer(msg.deviceId);
    } catch (err) {
      console.error('Failed to create offer for device:', msg.deviceId, err);
    }
  }

  private async handleOffer(msg: LobbyMessage): Promise<void> {
    if (this.role() !== 'client' || !msg.sdp || !this.clientId()) return;

    console.log('Received offer, creating answer');

    try {
      await this.webrtc.handleOfferAndCreateAnswer(msg.deviceId, { type: 'offer', sdp: msg.sdp });
    } catch (err) {
      console.error('Failed to handle offer:', err);
    }
  }

  private async handleAnswer(msg: LobbyMessage): Promise<void> {
    if (this.role() !== 'host' || !msg.sdp) return;

    console.log('Received answer from client:', msg.deviceId);

    try {
      await this.webrtc.handleAnswer(msg.deviceId, { type: 'answer', sdp: msg.sdp });
    } catch (err) {
      console.error('Failed to handle answer:', err);
    }
  }

  private async handleIceCandidate(msg: LobbyMessage): Promise<void> {
    if (!msg.candidate) return;

    console.log('Received ICE candidate from:', msg.deviceId);

    try {
      await this.webrtc.addIceCandidate(msg.deviceId, msg.candidate);
    } catch (err) {
      console.error('Failed to add ICE candidate:', err);
    }
  }

  private handleModeChange(msg: LobbyMessage): void {
    console.log('Mode change received:', msg.mode);
    // Mode propagation handled by component
  }

  // ---- Private: WebRTC Callbacks ----

  private setupWebRTCCallbacks(): void {
    // Send SDP offers via BLE
    this.webrtc.onSdpOffer = (peerId: string, sdp: RTCSessionDescription) => {
      console.log('Sending offer to client via BLE:', peerId);
      this.bluetooth.broadcastOffer(peerId, sdp.sdp).catch((err) => {
        console.error('Failed to send offer via BLE:', err);
      });
    };

    // Send SDP answers via BLE
    this.webrtc.onSdpAnswer = (peerId: string, sdp: RTCSessionDescription) => {
      console.log('Sending answer to host via BLE');
      this.bluetooth.sendAnswer(this.clientId() || 'unknown', sdp.sdp).catch((err) => {
        console.error('Failed to send answer via BLE:', err);
      });
    };

    // Send ICE candidates via BLE (trickle ICE)
    this.webrtc.onIceCandidate = (peerId: string, candidate: RTCIceCandidate) => {
      console.log('Sending ICE candidate via BLE to:', peerId);
      this.sendIceCandidateViaBLE(peerId, candidate).catch((err) => {
        console.error('Failed to send ICE candidate via BLE:', err);
      });
    };

    // Update device connection state
    this.webrtc.onConnectionStateChange = (peerId: string, state: RTCPeerConnectionState) => {
      console.log('WebRTC connection state changed:', peerId, state);
      this.updateDeviceRtcState(peerId, state);
    };

    // Mark data channel as ready
    this.webrtc.onDataChannelOpen = (peerId: string) => {
      console.log('Data channel opened with:', peerId);
      this.updateDeviceDataChannelState(peerId, true);
    };
  }

  private async sendIceCandidateViaBLE(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    await this.bluetooth.sendIceCandidate(peerId, candidate.toJSON());
  }

  // ---- Private: Device Management ----

  private addDevice(device: AdvancedDevice): void {
    this.devices.update((devs) => {
      const exists = devs.find((d) => d.id === device.id);
      if (exists) return devs;
      return [...devs, device];
    });
  }

  private updateDeviceRtcState(deviceId: string, state: RTCPeerConnectionState): void {
    this.devices.update((devs) =>
      devs.map((d) => (d.id === deviceId ? { ...d, rtcState: state } : d))
    );
  }

  private updateDeviceDataChannelState(deviceId: string, ready: boolean): void {
    this.devices.update((devs) =>
      devs.map((d) => (d.id === deviceId ? { ...d, dataChannelReady: ready } : d))
    );
  }

  private generateDeviceId(): string {
    return `device-${Math.random().toString(36).substring(2, 11)}`;
  }
}
