import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../services/websocket.service';
import { DetectorComponent } from '../detector/detector.component';
import { ConnectionStatus } from '../../models/connection-status.enum';

@Component({
  selector: 'app-split-view',
  templateUrl: './split-view.component.html',
  styleUrls: ['./split-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class SplitViewComponent {
  goBack = output<void>();

  // Connection settings
  masterIP = signal<string>('192.168.1.100');
  splitNumber = signal<number>(1);
  sessionId = signal<string>('SPLIT');

  // Connection state
  connectionError = signal<string>('');
  isConnecting = signal<boolean>(false);

  // Expose ConnectionStatus enum for template
  ConnectionStatus = ConnectionStatus;

  constructor(public ws: WebSocketService) {}

  connect(): void {
    const ip = this.masterIP().trim();
    const split = this.splitNumber();

    if (!ip) {
      this.connectionError.set('Please enter a valid IP address');
      return;
    }

    if (split < 1 || split > 10) {
      this.connectionError.set('Split number must be between 1 and 10');
      return;
    }

    this.connectionError.set('');
    this.isConnecting.set(true);

    this.ws.connect(ip, 8080, split).subscribe({
      next: (connected) => {
        if (connected) {
          console.log('Connected as Split', split);
          this.isConnecting.set(false);
        }
      },
      error: (err) => {
        console.error('Connection failed:', err);
        this.connectionError.set(`Connection failed: ${err.message}`);
        this.isConnecting.set(false);
      },
    });
  }

  disconnect(): void {
    this.ws.disconnect();
  }

  onDetectionEvent(intensity: number): void {
    // Forward detection event to master via WebSocket
    this.ws.sendDetectionEvent({
      splitNumber: this.splitNumber(),
      timestamp: Date.now(),
      detectionData: {
        intensity: intensity,
        type: 'motion',
      },
      clientId: this.ws.getClientId(),
    });

    console.log(`Detection event sent from Split ${this.splitNumber()}, intensity: ${intensity}`);
  }

  onGoBack(): void {
    this.disconnect();
    this.goBack.emit();
  }

  getConnectionStatusClass(): string {
    const status = this.ws.connectionStatus();
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return 'status-connected';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return 'status-connecting';
      case ConnectionStatus.ERROR:
        return 'status-error';
      default:
        return 'status-disconnected';
    }
  }

  getConnectionStatusText(): string {
    const status = this.ws.connectionStatus();
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return 'Connected';
      case ConnectionStatus.CONNECTING:
        return 'Connecting...';
      case ConnectionStatus.RECONNECTING:
        return 'Reconnecting...';
      case ConnectionStatus.ERROR:
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  }

  getConnectionStatusIcon(): string {
    const status = this.ws.connectionStatus();
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return '🟢';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return '🟡';
      case ConnectionStatus.ERROR:
        return '🔴';
      default:
        return '⚪';
    }
  }
}
