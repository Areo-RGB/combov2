import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { ConnectionStatus } from '../models/connection-status.enum';
import { ConnectedClient } from '../models/connected-client.interface';
import { DetectionEvent } from '../models/detection-event.interface';
import { WebSocketMessage } from '../models/websocket-message.interface';

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private ws: WebSocket | null = null;
  private clientId: string = this.generateClientId();
  private assignedSplitNumber: number = 0;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 5;
  private readonly HEARTBEAT_INTERVAL = 5000; // 5 seconds
  private shouldReconnect = false;
  private masterUrl = '';

  // Observables for state management
  private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(
    ConnectionStatus.DISCONNECTED
  );
  public connectionStatus$: Observable<ConnectionStatus> =
    this.connectionStatusSubject.asObservable();

  private connectedClientsSubject = new BehaviorSubject<ConnectedClient[]>([]);
  public connectedClients$: Observable<ConnectedClient[]> =
    this.connectedClientsSubject.asObservable();

  private detectionEventsSubject = new Subject<DetectionEvent>();
  public detectionEvents$: Observable<DetectionEvent> =
    this.detectionEventsSubject.asObservable();

  // Signal for connection status (for template binding)
  public connectionStatus = signal<ConnectionStatus>(ConnectionStatus.DISCONNECTED);

  constructor() {}

  /**
   * Connect to the WebSocket server
   */
  connect(masterIP: string, port: number, splitNumber: number): Observable<boolean> {
    return new Observable<boolean>((observer) => {
      this.assignedSplitNumber = splitNumber;
      this.shouldReconnect = true;
      this.reconnectAttempts = 0;
      this.masterUrl = `ws://${masterIP}:${port}`;

      try {
        this.updateConnectionStatus(ConnectionStatus.CONNECTING);
        this.ws = new WebSocket(this.masterUrl);

        this.ws.onopen = () => {
          console.log('WebSocket connected');
          this.updateConnectionStatus(ConnectionStatus.CONNECTED);
          this.reconnectAttempts = 0;

          // Send registration message
          this.sendMessage({
            type: 'register',
            splitNumber: this.assignedSplitNumber,
            timestamp: Date.now(),
            clientId: this.clientId,
          });

          // Start heartbeat
          this.startHeartbeat();

          observer.next(true);
          observer.complete();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          this.updateConnectionStatus(ConnectionStatus.ERROR);
          observer.error(new Error('Failed to connect to WebSocket server'));
        };

        this.ws.onclose = () => {
          console.log('WebSocket closed');
          this.stopHeartbeat();
          this.updateConnectionStatus(ConnectionStatus.DISCONNECTED);

          // Attempt reconnection if needed
          if (this.shouldReconnect && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
            this.attemptReconnect();
          }
        };
      } catch (error) {
        this.updateConnectionStatus(ConnectionStatus.ERROR);
        observer.error(error);
      }
    });
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.updateConnectionStatus(ConnectionStatus.DISCONNECTED);
  }

  /**
   * Send a detection event to the master
   */
  sendDetectionEvent(event: DetectionEvent): void {
    if (!this.isConnected()) {
      console.warn('Cannot send detection event: not connected');
      return;
    }

    this.sendMessage({
      type: 'detection-event',
      splitNumber: event.splitNumber,
      clientId: event.clientId,
      timestamp: event.timestamp,
      detectionData: event.detectionData,
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get the assigned split number
   */
  getAssignedSplitNumber(): number {
    return this.assignedSplitNumber;
  }

  /**
   * Get the client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Handle incoming messages
   */
  private handleMessage(data: string): void {
    try {
      const message: WebSocketMessage = JSON.parse(data);

      switch (message.type) {
        case 'welcome':
          console.log('Received welcome message:', message.data);
          if (message.data?.assignedSplitNumber) {
            this.assignedSplitNumber = message.data.assignedSplitNumber;
          }
          break;

        case 'clients-update':
          console.log('Clients update:', message.data);
          if (message.data?.clients) {
            this.connectedClientsSubject.next(message.data.clients);
          }
          break;

        case 'detection-broadcast':
          console.log('Detection broadcast from split', message.fromSplit);
          if (message.detectionData) {
            this.detectionEventsSubject.next({
              splitNumber: message.fromSplit || 0,
              clientId: message.clientId || '',
              timestamp: message.timestamp,
              detectionData: message.detectionData,
            });
          }
          break;

        case 'error':
          console.error('Server error:', message.data);
          break;

        default:
          console.log('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }

  /**
   * Send a message to the server
   */
  private sendMessage(message: WebSocketMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Start sending heartbeat messages
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendMessage({
          type: 'heartbeat',
          clientId: this.clientId,
          splitNumber: this.assignedSplitNumber,
          timestamp: Date.now(),
        });
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  /**
   * Stop sending heartbeat messages
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Attempt to reconnect
   */
  private attemptReconnect(): void {
    this.reconnectAttempts++;
    this.updateConnectionStatus(ConnectionStatus.RECONNECTING);

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect(
          this.masterUrl.replace('ws://', '').split(':')[0],
          parseInt(this.masterUrl.split(':')[2]),
          this.assignedSplitNumber
        ).subscribe({
          error: () => {
            // Reconnection failed, will be handled by onclose
          },
        });
      }
    }, delay);
  }

  /**
   * Update connection status
   */
  private updateConnectionStatus(status: ConnectionStatus): void {
    this.connectionStatusSubject.next(status);
    this.connectionStatus.set(status);
  }

  /**
   * Generate a unique client ID
   */
  private generateClientId(): string {
    return `client-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
