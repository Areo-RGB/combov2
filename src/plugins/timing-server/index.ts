import { registerPlugin } from '@capacitor/core';
import type { TimingServerPlugin } from './definitions';

/**
 * Export all type definitions
 */
export * from './definitions';

/**
 * TimingServer Plugin Instance
 *
 * Use this to start/stop the HTTP server and listen for timing events.
 *
 * @example
 * ```typescript
 * import { TimingServer } from './plugins/timing-server';
 *
 * // Start the server
 * const { port } = await TimingServer.startServer({ port: 3000 });
 * console.log('Server listening on port', port);
 *
 * // Listen for timing events
 * await TimingServer.addListener('timingEvent', event => {
 *   console.log('Received timing event', event);
 * });
 *
 * // Stop the server when done
 * await TimingServer.stopServer();
 * ```
 */
export const TimingServer = registerPlugin<TimingServerPlugin>('TimingServer', {
  web: () => import('./web').then(m => new m.TimingServerWeb()),
});
