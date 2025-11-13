import { Component, inject, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LocalLobbyService } from '../../services/local-lobby.service';

@Component({
  selector: 'app-lobby-setup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lobby-setup.component.html',
})
export class LobbySetupComponent {
  private lobbyService = inject(LocalLobbyService);

  // View state
  viewState = signal<'selection' | 'host' | 'client'>('selection');
  deviceName = signal<string>('');
  lobbyIdInput = signal<string>('');
  error = signal<string | null>(null);
  isConnecting = signal<boolean>(false);

  // Lobby state from service
  lobbyId = this.lobbyService.lobbyId;
  role = this.lobbyService.role;
  devices = this.lobbyService.devices;
  allDevicesReady = this.lobbyService.allDevicesReady;
  isSetupComplete = this.lobbyService.isSetupComplete;
  deviceCount = this.lobbyService.deviceCount;

  constructor() {
    // Generate default device name based on device type
    this.deviceName.set(this.generateDefaultDeviceName());

    // Listen for lobby messages
    effect(() => {
      this.lobbyService.onMessage((msg) => {
        if (msg.type === 'mode-selected') {
          console.log('Mode selected:', msg.mode);
        }
      });
    });
  }

  // ---- Host Actions ----

  async createHostLobby(): Promise<void> {
    if (!this.deviceName()) {
      this.error.set('Please enter a device name');
      return;
    }

    this.isConnecting.set(true);
    this.error.set(null);

    try {
      const lobbyId = await this.lobbyService.createLobby(this.deviceName());
      this.viewState.set('host');
    } catch (err) {
      console.error('Failed to create lobby:', err);
      this.error.set('Failed to create lobby. Please try again.');
    } finally {
      this.isConnecting.set(false);
    }
  }

  async establishConnections(): Promise<void> {
    this.isConnecting.set(true);
    this.error.set(null);

    try {
      await this.lobbyService.establishWebRTCConnections();
    } catch (err) {
      console.error('Failed to establish connections:', err);
      this.error.set('Failed to establish WebRTC connections');
    } finally {
      this.isConnecting.set(false);
    }
  }

  async completeSetup(): Promise<void> {
    await this.lobbyService.completeSetup();
  }

  // ---- Client Actions ----

  async joinClientLobby(): Promise<void> {
    if (!this.deviceName() || !this.lobbyIdInput()) {
      this.error.set('Please enter both device name and lobby ID');
      return;
    }

    this.isConnecting.set(true);
    this.error.set(null);

    try {
      await this.lobbyService.joinLobby(this.lobbyIdInput(), this.deviceName());
      this.viewState.set('client');
    } catch (err) {
      console.error('Failed to join lobby:', err);
      this.error.set('Failed to join lobby. Please check the lobby ID and try again.');
    } finally {
      this.isConnecting.set(false);
    }
  }

  // ---- Utility ----

  back(): void {
    this.lobbyService.cleanup();
    this.viewState.set('selection');
    this.error.set(null);
  }

  private generateDefaultDeviceName(): string {
    const userAgent = navigator.userAgent.toLowerCase();
    let deviceType = 'Device';

    if (userAgent.includes('android')) {
      deviceType = 'Android';
    } else if (userAgent.includes('iphone') || userAgent.includes('ipad')) {
      deviceType = 'iOS';
    }

    const randomNum = Math.floor(Math.random() * 1000);
    return `${deviceType}-${randomNum}`;
  }

  getConnectionStatusIcon(device: any): string {
    if (!device.connected) return '🔴';
    if (!device.rtcReady) return '🟡';
    return '🟢';
  }

  getConnectionStatusText(device: any): string {
    if (!device.connected) return 'Disconnected';
    if (!device.rtcReady) return 'Connecting...';
    return 'Connected';
  }
}
