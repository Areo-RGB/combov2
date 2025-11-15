import { Injectable, signal } from '@angular/core';
import { TimingServer, type TimingEventPayload } from '../plugins/timing-server';
import { Capacitor } from '@capacitor/core';

/**
 * Timing Server Service
 *
 * Angular service that manages the native HTTP timing server for the host device.
 * The server receives timing events from sensor phones over Wi-Fi.
 */
@Injectable({
  providedIn: 'root',
})
export class TimingServerService {
  /**
   * Server running status
   */
  isRunning = signal<boolean>(false);

  /**
   * Current server port (0 if not running)
   */
  serverPort = signal<number>(0);

  /**
   * Latest timing event received
   */
  latestEvent = signal<TimingEventPayload | null>(null);

  /**
   * All timing events received (limited to last 100)
   */
  private events = signal<TimingEventPayload[]>([]);

  /**
   * Error message (if any)
   */
  errorMessage = signal<string | null>(null);

  /**
   * Event listener handle
   */
  private listenerHandle: { remove: () => void } | null = null;

  /**
   * Check if the plugin is available (Android only)
   */
  isAvailable(): boolean {
    return Capacitor.getPlatform() === 'android';
  }

  /**
   * Start the timing server
   *
   * @param port - Port number to listen on (default: 3000)
   * @returns Promise that resolves to the actual port number
   *
   * @example
   * ```typescript
   * const port = await timingServer.startServer(3000);
   * console.log('Server started on port', port);
   * ```
   */
  async startServer(port: number = 3000): Promise<number> {
    if (!this.isAvailable()) {
      const error = 'TimingServer is only available on Android';
      this.errorMessage.set(error);
      throw new Error(error);
    }

    try {
      this.errorMessage.set(null);

      // Start the server
      const result = await TimingServer.startServer({ port });
      this.serverPort.set(result.port);
      this.isRunning.set(true);

      // Set up event listener
      this.listenerHandle = await TimingServer.addListener('timingEvent', event => {
        this.handleTimingEvent(event);
      });

      return result.port;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start server';
      this.errorMessage.set(errorMsg);
      throw err;
    }
  }

  /**
   * Stop the timing server
   */
  async stopServer(): Promise<void> {
    if (!this.isAvailable()) {
      return;
    }

    try {
      this.errorMessage.set(null);

      // Remove event listener
      if (this.listenerHandle) {
        this.listenerHandle.remove();
        this.listenerHandle = null;
      }

      // Stop the server
      await TimingServer.stopServer();

      this.isRunning.set(false);
      this.serverPort.set(0);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to stop server';
      this.errorMessage.set(errorMsg);
      throw err;
    }
  }

  /**
   * Get all received timing events
   */
  getEvents(): TimingEventPayload[] {
    return this.events();
  }

  /**
   * Clear all received timing events
   */
  clearEvents(): void {
    this.events.set([]);
    this.latestEvent.set(null);
  }

  /**
   * Handle incoming timing event
   */
  private handleTimingEvent(event: TimingEventPayload): void {
    console.log('Timing event received:', event);

    this.latestEvent.set(event);

    // Add to events list (keep last 100)
    this.events.update(events => {
      const newEvents = [...events, event];
      return newEvents.slice(-100);
    });
  }
}
