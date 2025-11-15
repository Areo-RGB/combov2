/**
 * Timing Server Plugin
 *
 * Native Capacitor plugin that runs an HTTP server on Android devices
 * to receive timing events from sensor devices over Wi-Fi (local network only).
 */

export interface TimingEventPayload {
  /**
   * Identifier for the device sending the event (e.g., 'START', 'FINISH', 'SPLIT_1')
   */
  deviceId: string;

  /**
   * Type of event (e.g., 'TRIGGER', 'READY', 'CANCEL')
   */
  eventType: string;

  /**
   * Optional event identifier for grouping related events
   */
  eventId?: string;

  /**
   * Timestamp from the sensor device (ms since epoch)
   */
  localTimestamp?: number;

  /**
   * Server-side timestamp when event was received (ms since epoch)
   */
  receivedAt: number;
}

export interface StartServerOptions {
  /**
   * Port number to bind the server to (e.g., 3000)
   * Use 0 to auto-select an available port
   */
  port: number;
}

export interface StartServerResult {
  /**
   * The actual port the server is listening on
   */
  port: number;
}

export interface TimingServerPlugin {
  /**
   * Start the HTTP server on the specified port
   * @param options - Server configuration options
   * @returns The actual port the server is listening on
   */
  startServer(options: StartServerOptions): Promise<StartServerResult>;

  /**
   * Stop the HTTP server and free the port
   */
  stopServer(): Promise<void>;

  /**
   * Add a listener for timing events received by the server
   * @param eventName - Must be 'timingEvent'
   * @param listenerFunc - Callback function to handle events
   * @returns A handle with a remove() method to unregister the listener
   */
  addListener(
    eventName: 'timingEvent',
    listenerFunc: (event: TimingEventPayload) => void,
  ): Promise<{ remove: () => void }>;

  /**
   * Remove all registered listeners
   */
  removeAllListeners(): Promise<void>;
}
