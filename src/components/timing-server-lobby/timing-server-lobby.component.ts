import { ChangeDetectionStrategy, Component, inject, signal, effect, output } from '@angular/core';
import { TimingServerService } from '../../services/timing-server.service';
import { TimingClientService } from '../../services/timing-client.service';
import { CommonModule } from '@angular/common';
import { HeaderComponent } from '../header/header.component';
import type { TimingEventPayload } from '../../plugins/timing-server';

/**
 * Timing Server Lobby Component
 *
 * Allows users to:
 * - Host: Start an HTTP server to receive timing events from sensors
 * - Sensor: Connect to a host and send timing events
 */
@Component({
  selector: 'app-timing-server-lobby',
  imports: [CommonModule, HeaderComponent],
  templateUrl: './timing-server-lobby.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TimingServerLobbyComponent {
  goBack = output<void>();

  private serverService = inject(TimingServerService);
  private clientService = inject(TimingClientService);

  // Mode selection
  role = signal<'select' | 'host' | 'sensor'>('select');

  // Host mode state
  serverPort = this.serverService.serverPort;
  serverRunning = this.serverService.isRunning;
  latestEvent = this.serverService.latestEvent;

  // Sensor mode state
  hostIp = signal<string>(this.clientService.getHostIp());
  hostPort = signal<number>(this.clientService.getHostPort());
  deviceId = signal<string>('SENSOR_1');
  connectionStatus = this.clientService.connectionStatus;

  // Error handling
  errorMessage = signal<string | null>(null);

  // Platform availability
  isAvailable = this.serverService.isAvailable();

  constructor() {
    // Update client service when host IP/Port changes
    effect(() => {
      this.clientService.setHostIp(this.hostIp());
      this.clientService.setHostPort(this.hostPort());
    });
  }

  /**
   * Select role (host or sensor)
   */
  selectRole(role: 'host' | 'sensor'): void {
    this.role.set(role);
    this.errorMessage.set(null);
  }

  /**
   * Go back to role selection
   */
  backToSelection(): void {
    this.role.set('select');
    this.errorMessage.set(null);
  }

  /**
   * Start the host server
   */
  async startServer(): Promise<void> {
    try {
      this.errorMessage.set(null);
      const port = await this.serverService.startServer(3000);
      console.log('Server started on port', port);
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to start server');
    }
  }

  /**
   * Stop the host server
   */
  async stopServer(): Promise<void> {
    try {
      this.errorMessage.set(null);
      await this.serverService.stopServer();
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to stop server');
    }
  }

  /**
   * Test connection to host (sensor mode)
   */
  async testConnection(): Promise<void> {
    try {
      this.errorMessage.set(null);
      const success = await this.clientService.testConnection();
      if (success) {
        this.errorMessage.set('Connection successful!');
      } else {
        this.errorMessage.set('Connection failed. Check host IP and port.');
      }
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Connection test failed');
    }
  }

  /**
   * Send a trigger event (sensor mode)
   */
  async sendTrigger(): Promise<void> {
    try {
      this.errorMessage.set(null);
      await this.clientService.sendTimingEvent({
        deviceId: this.deviceId(),
        eventType: 'TRIGGER',
        localTimestamp: Date.now(),
      });
      this.errorMessage.set('Trigger sent!');
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Failed to send trigger');
    }
  }

  /**
   * Clear received events (host mode)
   */
  clearEvents(): void {
    this.serverService.clearEvents();
  }

  /**
   * Get all received events
   */
  getEvents(): TimingEventPayload[] {
    return this.serverService.getEvents();
  }

  /**
   * Handle input changes
   */
  onHostIpChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.hostIp.set(input.value);
  }

  onHostPortChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.hostPort.set(Number(input.value));
  }

  onDeviceIdChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.deviceId.set(input.value);
  }

  /**
   * Handle back button
   */
  handleGoBack(): void {
    // Stop server if running
    if (this.serverRunning()) {
      this.stopServer().catch(console.error);
    }
    this.goBack.emit();
  }
}
