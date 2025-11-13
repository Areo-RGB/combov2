import { ChangeDetectionStrategy, Component, OnInit, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../services/websocket.service';
import { ConnectedClient } from '../../models/connected-client.interface';
import { DetectionEvent } from '../../models/detection-event.interface';
import { ConnectionStatus } from '../../models/connection-status.enum';
import { Observable } from 'rxjs';

interface EventLogEntry {
  timestamp: number;
  splitNumber: number;
  message: string;
  detectionData?: any;
}

@Component({
  selector: 'app-master-view',
  templateUrl: './master-view.component.html',
  styleUrls: ['./master-view.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class MasterViewComponent implements OnInit {
  goBack = output<void>();

  connectedClients$: Observable<ConnectedClient[]>;
  detectionEvents$: Observable<DetectionEvent>;
  connectionStatus$: Observable<ConnectionStatus>;

  serverUrl = signal<string>('');
  localIP = signal<string>('Loading...');
  eventLog = signal<EventLogEntry[]>([]);
  totalDetections = signal<number>(0);
  lastEventTime = signal<number | null>(null);
  connectedClientsCount = signal<number>(0);

  constructor(public ws: WebSocketService) {
    this.connectedClients$ = this.ws.connectedClients$;
    this.detectionEvents$ = this.ws.detectionEvents$;
    this.connectionStatus$ = this.ws.connectionStatus$;
  }

  ngOnInit(): void {
    // Auto-connect to localhost WebSocket server (assumes server is running on same device)
    this.connectToLocalServer();

    // Subscribe to connected clients
    this.connectedClients$.subscribe((clients) => {
      this.connectedClientsCount.set(clients.length);
    });

    // Subscribe to detection events
    this.detectionEvents$.subscribe((event) => {
      this.handleDetectionEvent(event);
    });
  }

  private connectToLocalServer(): void {
    // Determine local IP (for display purposes)
    this.getLocalIP();

    // Connect as master (split number 0 indicates master)
    const serverIP = 'localhost'; // Master runs the server locally
    const port = 8080;

    this.serverUrl.set(`ws://${serverIP}:${port}`);

    this.ws.connect(serverIP, port, 0).subscribe({
      next: (connected) => {
        if (connected) {
          console.log('Master connected to WebSocket server');
        }
      },
      error: (err) => {
        console.error('Failed to connect to WebSocket server:', err);
        this.addEventLog(0, 'Failed to connect to WebSocket server. Make sure the server is running.');
      },
    });
  }

  private getLocalIP(): void {
    // Try to get local IP address
    // Note: In browser, we can't directly get local IP, but we can make an educated guess
    // For mobile/Capacitor, this should be enhanced with native plugins
    this.localIP.set('localhost'); // Default to localhost

    // If running in a real network environment, the server should provide this
    // For now, we'll show localhost as a placeholder
  }

  private handleDetectionEvent(event: DetectionEvent): void {
    this.totalDetections.update((count) => count + 1);
    this.lastEventTime.set(Date.now());

    this.addEventLog(
      event.splitNumber,
      `Object detected (intensity: ${event.detectionData?.intensity || 'N/A'})`,
      event.detectionData
    );
  }

  private addEventLog(splitNumber: number, message: string, detectionData?: any): void {
    const entry: EventLogEntry = {
      timestamp: Date.now(),
      splitNumber,
      message,
      detectionData,
    };

    this.eventLog.update((log) => {
      const newLog = [entry, ...log];
      // Keep only last 100 entries
      return newLog.slice(0, 100);
    });
  }

  formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  }

  getTimeSinceLastEvent(): string {
    const last = this.lastEventTime();
    if (!last) return 'Never';

    const seconds = Math.floor((Date.now() - last) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }

  copyUrl(): void {
    const url = this.serverUrl();
    navigator.clipboard.writeText(url).then(
      () => {
        this.addEventLog(0, 'Server URL copied to clipboard');
      },
      (err) => {
        console.error('Failed to copy URL:', err);
      }
    );
  }

  exportEventLog(): void {
    const log = this.eventLog();
    const json = JSON.stringify(log, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `sprint-events-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.addEventLog(0, 'Event log exported');
  }

  clearEventLog(): void {
    this.eventLog.set([]);
    this.totalDetections.set(0);
    this.lastEventTime.set(null);
  }

  onGoBack(): void {
    this.ws.disconnect();
    this.goBack.emit();
  }

  trackByClientId(index: number, client: ConnectedClient): string {
    return client.id;
  }

  trackByTimestamp(index: number, entry: EventLogEntry): number {
    return entry.timestamp;
  }
}
