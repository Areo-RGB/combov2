import { Injectable, signal } from '@angular/core';

/**
 * Timing Client Service
 *
 * Helper service for sensor phones to send timing events to the host server.
 * Sensors communicate with the host phone over Wi-Fi using HTTP POST requests.
 */
@Injectable({
  providedIn: 'root',
})
export class TimingClientService {
  /**
   * Default host IP address (can be configured)
   * In production, this should be discovered via mDNS/Bonjour or entered manually
   */
  private hostIp = signal<string>('192.168.0.10');

  /**
   * Default host port
   */
  private hostPort = signal<number>(3000);

  /**
   * Connection status
   */
  connectionStatus = signal<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');

  /**
   * Last error message
   */
  lastError = signal<string | null>(null);

  /**
   * Set the host IP address
   */
  setHostIp(ip: string): void {
    this.hostIp.set(ip);
  }

  /**
   * Set the host port
   */
  setHostPort(port: number): void {
    this.hostPort.set(port);
  }

  /**
   * Get the current host IP
   */
  getHostIp(): string {
    return this.hostIp();
  }

  /**
   * Get the current host port
   */
  getHostPort(): number {
    return this.hostPort();
  }

  /**
   * Send a timing event to the host server
   *
   * @param payload - Event data to send
   * @returns Promise that resolves when the event is sent successfully
   *
   * @example
   * ```typescript
   * await timingClient.sendTimingEvent({
   *   deviceId: 'FINISH',
   *   eventType: 'TRIGGER',
   *   eventId: 'run-001',
   *   localTimestamp: Date.now(),
   * });
   * ```
   */
  async sendTimingEvent(payload: {
    deviceId: string;
    eventType: string;
    eventId?: string;
    localTimestamp?: number;
  }): Promise<void> {
    const url = `http://${this.hostIp()}:${this.hostPort()}/event`;

    try {
      this.connectionStatus.set('connecting');
      this.lastError.set(null);

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.warn('Server returned non-OK status:', res.status, errorText);
        this.connectionStatus.set('error');
        this.lastError.set(`Server error: ${res.status}`);
        throw new Error(`Server returned status ${res.status}`);
      }

      this.connectionStatus.set('connected');
    } catch (err) {
      console.error('Failed to send timing event:', err);
      this.connectionStatus.set('error');
      this.lastError.set(err instanceof Error ? err.message : 'Unknown error');
      throw err;
    }
  }

  /**
   * Test connection to the host server
   *
   * @returns Promise that resolves to true if connection is successful
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.sendTimingEvent({
        deviceId: 'TEST',
        eventType: 'PING',
        localTimestamp: Date.now(),
      });
      return true;
    } catch {
      return false;
    }
  }
}
