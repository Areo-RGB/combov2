import { vi } from 'vitest';

/**
 * Mock Bluetooth Low Energy for Capacitor BLE plugin
 */
export class MockBluetoothLE {
  private devices: Map<string, MockBLEDevice> = new Map();
  private scanCallback: Function | null = null;
  private isScanning = false;
  public scanDelay = 50; // Time to discover devices
  public connectionDelay = 100; // Time to connect to device
  public messageDelay = 10; // Delay per BLE chunk

  async initialize(): Promise<void> {
    await this.simulateDelay(10);
  }

  async requestLEScan(options: any, callback: Function): Promise<void> {
    this.isScanning = true;
    this.scanCallback = callback;

    // Simulate device discovery
    setTimeout(() => {
      this.devices.forEach((device, deviceId) => {
        callback({
          device: {
            deviceId,
            name: device.name,
            uuids: device.uuids,
          }
        });
      });
    }, this.scanDelay);
  }

  async stopLEScan(): Promise<void> {
    this.isScanning = false;
    this.scanCallback = null;
  }

  async connect(options: { deviceId: string }): Promise<void> {
    await this.simulateDelay(this.connectionDelay);
    const device = this.devices.get(options.deviceId);
    if (!device) {
      throw new Error(`Device ${options.deviceId} not found`);
    }
    device.connected = true;
  }

  async disconnect(options: { deviceId: string }): Promise<void> {
    await this.simulateDelay(10);
    const device = this.devices.get(options.deviceId);
    if (device) {
      device.connected = false;
    }
  }

  async write(options: {
    deviceId: string;
    service: string;
    characteristic: string;
    value: string;
  }): Promise<void> {
    await this.simulateDelay(this.messageDelay);
    const device = this.devices.get(options.deviceId);
    if (!device || !device.connected) {
      throw new Error('Device not connected');
    }
    device.writeData.push(options.value);
  }

  async read(options: {
    deviceId: string;
    service: string;
    characteristic: string;
  }): Promise<{ value: string }> {
    await this.simulateDelay(this.messageDelay);
    const device = this.devices.get(options.deviceId);
    if (!device || !device.connected) {
      throw new Error('Device not connected');
    }
    return { value: device.readData.shift() || '' };
  }

  async startNotifications(options: {
    deviceId: string;
    service: string;
    characteristic: string;
  }, callback: Function): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (!device || !device.connected) {
      throw new Error('Device not connected');
    }
    device.notificationCallback = callback;
  }

  async stopNotifications(options: {
    deviceId: string;
    service: string;
    characteristic: string;
  }): Promise<void> {
    const device = this.devices.get(options.deviceId);
    if (device) {
      device.notificationCallback = null;
    }
  }

  // Test helpers
  addMockDevice(deviceId: string, name: string, uuids: string[]): MockBLEDevice {
    const device = new MockBLEDevice(deviceId, name, uuids);
    this.devices.set(deviceId, device);
    return device;
  }

  removeMockDevice(deviceId: string): void {
    this.devices.delete(deviceId);
  }

  simulateDisconnection(deviceId: string): void {
    const device = this.devices.get(deviceId);
    if (device) {
      device.connected = false;
      device.notificationCallback?.({
        value: '',
        error: 'Connection lost'
      });
    }
  }

  // Simulate receiving chunks with delays (for testing race conditions)
  async simulateChunkedMessage(
    deviceId: string,
    message: string,
    chunkSize: number = 20
  ): Promise<void> {
    const device = this.devices.get(deviceId);
    if (!device || !device.notificationCallback) return;

    const chunks = this.splitIntoChunks(message, chunkSize);
    for (const chunk of chunks) {
      await this.simulateDelay(this.messageDelay);
      device.notificationCallback({ value: this.stringToBase64(chunk) });
    }
  }

  private splitIntoChunks(str: string, size: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
      chunks.push(str.slice(i, i + size));
    }
    return chunks;
  }

  private stringToBase64(str: string): string {
    return Buffer.from(str).toString('base64');
  }

  private async simulateDelay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }
}

export class MockBLEDevice {
  connected = false;
  writeData: string[] = [];
  readData: string[] = [];
  notificationCallback: Function | null = null;

  constructor(
    public deviceId: string,
    public name: string,
    public uuids: string[]
  ) {}

  queueReadData(data: string): void {
    this.readData.push(data);
  }

  getWrittenData(): string[] {
    return [...this.writeData];
  }
}

/**
 * Create mock Capacitor BLE plugin
 */
export function createMockBLEPlugin() {
  return new MockBluetoothLE();
}
