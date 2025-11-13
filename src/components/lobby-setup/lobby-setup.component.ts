import { Component, inject, signal, effect, output, ChangeDetectionStrategy } from '@angular/core';
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

  // Output event to navigate back to main menu
  goBack = output<void>();

  // View state
  viewState = signal<'selection' | 'host' | 'client'>('selection');
  deviceName = signal<string>('');
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
      await this.lobbyService.createLobby(this.deviceName());
      this.viewState.set('host');
    } catch (err: any) {
      console.error('Failed to create lobby:', err);
      const errorMsg = err?.message || err?.toString() || 'Unknown error';
      this.error.set(`Failed to create lobby: ${errorMsg}`);
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
    if (!this.deviceName()) {
      this.error.set('Please enter a device name');
      return;
    }

    this.isConnecting.set(true);
    this.error.set(null);

    try {
      await this.lobbyService.joinLobby(this.deviceName());
      this.viewState.set('client');
    } catch (err: any) {
      console.error('Failed to join lobby:', err);
      const errorMsg = err?.message || err?.toString() || 'Unknown error';
      this.error.set(`Failed to join lobby: ${errorMsg}`);
    } finally {
      this.isConnecting.set(false);
    }
  }

  // ---- Utility ----

  async back(): Promise<void> {
    await this.lobbyService.cleanup();
    this.viewState.set('selection');
    this.error.set(null);
    this.goBack.emit();
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
