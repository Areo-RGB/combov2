import { WebPlugin } from '@capacitor/core';
import type { TimingServerPlugin, StartServerOptions, StartServerResult } from './definitions';

/**
 * Web implementation of TimingServer plugin
 * This is a stub implementation for web platform (not functional)
 */
export class TimingServerWeb extends WebPlugin implements TimingServerPlugin {
  async startServer(options: StartServerOptions): Promise<StartServerResult> {
    console.warn('TimingServer is not available on web platform');
    return { port: options.port };
  }

  async stopServer(): Promise<void> {
    console.warn('TimingServer is not available on web platform');
  }
}
