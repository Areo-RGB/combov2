# Lobby Technical Implementation Details

## Overview

This document provides deep technical details about the lobby system implementation, including BLE protocol specifications, WebRTC connection management, message chunking algorithms, error handling patterns, and security considerations. This is intended for developers who need to understand the low-level implementation details or work on extending the system.

## Bluetooth LE Protocol Implementation

### BLE Service Configuration

The lobby system uses a custom BLE service with specific characteristics optimized for lobby communication:

#### Service UUID Structure

```
Service UUID: 6E400011-B5A3-F393-E0A9-E50E24DCCA9E
- Base UUID: 6E400001-B5A3-F393-E0A9-E50E24DCCA9E (Nordic UART base)
- Modified: 6E400011 (different from standard UART service)
- Purpose: Unique identification of lobby service
```

#### Characteristic Configuration

```typescript
// RX Characteristic (Client → Host)
const RX_CHARACTERISTIC = {
  uuid: '6E400012-B5A3-F393-E0A9-E50E24DCCA9E',
  properties: [
    BluetoothCharacteristic.PROPERTY_WRITE,
    BluetoothCharacteristic.PROPERTY_WRITE_NO_RESPONSE
  ],
  permissions: [
    BluetoothCharacteristic.PERMISSION_WRITE
  ]
};

// TX Characteristic (Host → Client)
const TX_CHARACTERISTIC = {
  uuid: '6E400013-B5A3-F393-E0A9-E50E24DCCA9E',
  properties: [
    BluetoothCharacteristic.PROPERTY_READ,
    BluetoothCharacteristic.PROPERTY_NOTIFY
  ],
  permissions: [
    BluetoothCharacteristic.PERMISSION_READ
  ],
  descriptors: [
    {
      uuid: '00002902-0000-1000-8000-00805f9b34fb', // Client Characteristic Configuration
      permissions: [
        BluetoothDescriptor.PERMISSION_READ,
        BluetoothDescriptor.PERMISSION_WRITE
      ]
    }
  ]
};
```

### Advertising Packet Structure

#### Host Advertising Format

```
Advertising Packet Structure:
┌─────────────────────────────────────────────────────────┐
│ Device Name (Variable) │ Service UUID (16 bytes) │ Flags│
└─────────────────────────────────────────────────────────┘

Device Name Format:
- Complete Local Name: "Lobby-{LOBBY_ID}"
- Example: "Lobby-A3K9M2"
- Max Length: 20 bytes (including "Lobby-" prefix)

Service UUID:
- 16-bit representation: 0x6E40 (first 2 bytes)
- Full 128-bit: 6E400011-B5A3-F393-E0A9-E50E24DCCA9E

Flags:
- Bit 0: LE Limited Discoverable Mode
- Bit 1: LE General Discoverable Mode
- Bit 2: BR/EDR Not Supported
```

#### Scan Response Packet

```typescript
// Additional data for device identification
const scanResponseData = {
  manufacturerData: new Uint8Array([
    // Company ID (0xFFFF for development)
    0xFF, 0xFF,
    // Protocol version
    0x01,
    // Capabilities flags
    0b00000001, // Bit 0: Peripheral mode supported
    // Device type identifier
    DEVICE_TYPE_HOST
  ]),
  serviceData: new Map([
    ['6E400011-B5A3-F393-E0A9-E50E24DCCA9E', new Uint8Array([
      // Application version
      VERSION_MAJOR,
      VERSION_MINOR,
      VERSION_PATCH
    ])]
  ])
};
```

### Native BLE Implementation

#### Android Peripheral Mode Implementation

```java
// BleSignalingPlugin.java - Core Advertising Setup
private void startAdvertisingCore(String sessionId, String name) {
    // Get Bluetooth manager and adapter
    BluetoothManager manager = (BluetoothManager) getContext()
        .getSystemService(Context.BLUETOOTH_SERVICE);
    BluetoothAdapter adapter = manager.getAdapter();

    // Configure advertising settings for maximum discovery
    AdvertiseSettings settings = new AdvertiseSettings.Builder()
        .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
        .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
        .setConnectable(true)
        .setTimeout(0) // Continuous advertising
        .build();

    // Configure advertising data
    AdvertiseData data = new AdvertiseData.Builder()
        .setIncludeDeviceName(true)
        .setIncludeTxPowerLevel(true)
        .addServiceUuid(new ParcelUuid(serviceUuid))
        .addManufacturerData(0xFFFF, getManufacturerData())
        .build();

    // Start advertising
    advertiser = adapter.getBluetoothLeAdvertiser();
    advertiser.startAdvertising(settings, data, advertiseCallback);
}

private byte[] getManufacturerData() {
    ByteBuffer buffer = ByteBuffer.allocate(8);
    buffer.order(ByteOrder.LITTLE_ENDIAN);

    // Protocol version (1 byte)
    buffer.put((byte) 1);

    // Device capabilities (1 byte)
    buffer.put((byte) 0x01); // Peripheral mode supported

    // App version (3 bytes)
    buffer.put((byte) 2); // Major
    buffer.put((byte) 0); // Minor
    buffer.put((byte) 1); // Patch

    // Reserved bytes
    buffer.put(new byte[3]);

    return buffer.array();
}
```

#### GATT Server Implementation

```java
// GATT server callback for handling client interactions
private BluetoothGattServerCallback gattServerCallback = new BluetoothGattServerCallback() {
    @Override
    public void onConnectionStateChange(BluetoothDevice device, int status,
                                       int newState) {
        if (newState == BluetoothGatt.STATE_CONNECTED) {
            connectedDevice = device;
            notifyConnectionEstablished(device.getAddress());
        } else if (newState == BluetoothGatt.STATE_DISCONNECTED) {
            connectedDevice = null;
            notifyConnectionLost(device.getAddress());
        }
    }

    @Override
    public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId,
                                          BluetoothGattCharacteristic characteristic,
                                          boolean preparedWrite, boolean responseNeeded,
                                          int offset, byte[] value) {

        // Handle RX characteristic writes
        if (characteristic.getUuid().equals(rxUuid)) {
            // Convert byte array to integer array for JavaScript compatibility
            List<Integer> intArray = new ArrayList<>();
            for (byte b : value) {
                intArray.add((int) (b & 0xFF));
            }

            // Notify JavaScript layer
            JSObject payload = new JSObject();
            payload.put("value", new JSArray(intArray));
            payload.put("deviceId", device.getAddress());
            notifyListeners("rxWritten", payload);
        }

        // Send response if required
        if (responseNeeded && gattServer != null) {
            gattServer.sendResponse(device, requestId,
                                   BluetoothGatt.GATT_SUCCESS, offset, null);
        }
    }

    @Override
    public void onDescriptorWriteRequest(BluetoothDevice device, int requestId,
                                       BluetoothGattDescriptor descriptor,
                                       boolean preparedWrite, boolean responseNeeded,
                                       int offset, byte[] value) {

        // Handle CCCD writes for notifications
        if (descriptor.getUuid().equals(
            UUID.fromString("00002902-0000-1000-8000-00805f9b34fb"))) {

            // Enable/disable notifications based on value
            boolean notificationsEnabled = (value[0] & 0x01) != 0;

            if (notificationsEnabled) {
                notifyDeviceSubscribed(device.getAddress());
            } else {
                notifyDeviceUnsubscribed(device.getAddress());
            }
        }

        if (responseNeeded && gattServer != null) {
            gattServer.sendResponse(device, requestId,
                                   BluetoothGatt.GATT_SUCCESS, offset, null);
        }
    }
};
```

### Message Chunking Protocol

#### Chunk Envelope Structure

```typescript
interface ChunkEnvelope {
  t: 'lobby-msg';        // Message type identifier (4 bytes)
  idx: number;          // Chunk index (variable, up to 9999)
  total: number;        // Total chunks (variable, up to 9999)
  data: string;         // Chunk data (variable length)
}

// Serialized format (JSON string):
// {"t":"lobby-msg","idx":0,"total":5,"data":"part1"}

// Maximum chunk size analysis:
// - JSON overhead: ~25 bytes for {"t":"lobby-msg","idx":0,"total":5,"data":""}
// - idx/total: Each up to 4 digits = 8 bytes
// - Safety margin: 10 bytes
// - Available data space: 180 - 25 - 8 - 10 = 137 bytes
// - Conservative chunk size: 120 bytes of actual data
```

#### Chunking Algorithm Implementation

```typescript
class MessageChunker {
  private static readonly MAX_CHUNK_SIZE = 180;
  private static readonly OVERHEAD_SIZE = 25; // JSON overhead
  private static readonly SAFE_DATA_SIZE = 120;

  static chunkMessage(message: string): ChunkEnvelope[] {
    const chunks: ChunkEnvelope[] = [];

    // Encode message to base64 to handle special characters
    const encodedMessage = btoa(message);

    // Calculate optimal chunk size based on message length
    const totalChunks = Math.ceil(encodedMessage.length / this.SAFE_DATA_SIZE);

    for (let i = 0; i < totalChunks; i++) {
      const startIndex = i * this.SAFE_DATA_SIZE;
      const endIndex = Math.min(startIndex + this.SAFE_DATA_SIZE, encodedMessage.length);
      const chunkData = encodedMessage.substring(startIndex, endIndex);

      const envelope: ChunkEnvelope = {
        t: 'lobby-msg',
        idx: i,
        total: totalChunks,
        data: chunkData
      };

      chunks.push(envelope);
    }

    return chunks;
  }

  static reconstructMessage(chunks: ChunkEnvelope[]): string {
    // Sort chunks by index
    chunks.sort((a, b) => a.idx - b.idx);

    // Validate chunk sequence
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].idx !== i) {
        throw new Error(`Missing chunk at index ${i}`);
      }
      if (chunks[i].total !== chunks.length) {
        throw new Error('Chunk count mismatch');
      }
    }

    // Reconstruct encoded message
    const encodedMessage = chunks.map(chunk => chunk.data).join('');

    // Decode from base64
    try {
      return atob(encodedMessage);
    } catch (error) {
      throw new Error('Failed to decode message from base64');
    }
  }

  static validateChunk(chunk: any): chunk is ChunkEnvelope {
    return (
      chunk &&
      chunk.t === 'lobby-msg' &&
      typeof chunk.idx === 'number' &&
      typeof chunk.total === 'number' &&
      typeof chunk.data === 'string' &&
      chunk.idx >= 0 &&
      chunk.total > 0 &&
      chunk.idx < chunk.total
    );
  }
}
```

#### Chunk Buffer Management

```typescript
class ChunkBuffer {
  private buffers = new Map<string, {
    chunks: Map<number, ChunkEnvelope>;
    totalExpected: number;
    timestamp: number;
    timeoutId: NodeJS.Timeout;
  }>();

  private readonly BUFFER_TIMEOUT = 10000; // 10 seconds

  addChunk(key: string, chunk: ChunkEnvelope): string | null {
    // Get or create buffer for this key
    let buffer = this.buffers.get(key);

    if (!buffer) {
      buffer = {
        chunks: new Map(),
        totalExpected: chunk.total,
        timestamp: Date.now(),
        timeoutId: setTimeout(() => {
          this.expireBuffer(key);
        }, this.BUFFER_TIMEOUT)
      };
      this.buffers.set(key, buffer);
    }

    // Validate chunk
    if (chunk.total !== buffer.totalExpected) {
      throw new Error(`Chunk count mismatch for key ${key}`);
    }

    // Add chunk to buffer
    buffer.chunks.set(chunk.idx, chunk);

    // Check if all chunks received
    if (buffer.chunks.size === buffer.totalExpected) {
      const message = this.completeBuffer(key);
      return message;
    }

    return null;
  }

  private completeBuffer(key: string): string {
    const buffer = this.buffers.get(key);
    if (!buffer) return null;

    // Clear timeout
    clearTimeout(buffer.timeoutId);

    // Extract chunks in order
    const chunks: ChunkEnvelope[] = [];
    for (let i = 0; i < buffer.totalExpected; i++) {
      const chunk = buffer.chunks.get(i);
      if (!chunk) {
        throw new Error(`Missing chunk ${i} for key ${key}`);
      }
      chunks.push(chunk);
    }

    // Remove buffer
    this.buffers.delete(key);

    // Reconstruct message
    return MessageChunker.reconstructMessage(chunks);
  }

  private expireBuffer(key: string): void {
    this.buffers.delete(key);
    console.warn(`Chunk buffer expired for key: ${key}`);
  }

  cleanup(): void {
    // Clear all timeouts
    this.buffers.forEach((buffer) => {
      clearTimeout(buffer.timeoutId);
    });

    // Clear buffers
    this.buffers.clear();
  }
}
```

## WebRTC Implementation Details

### Connection Establishment Flow

#### Host Side Connection Setup

```typescript
class WebRTCHostManager {
  private connections = new Map<string, RTCPeerConnection>();

  async createConnection(deviceId: string): Promise<void> {
    try {
      // Create peer connection with no STUN servers (local network only)
      const pc = new RTCPeerConnection({
        iceServers: [], // No external ICE servers
        iceCandidatePoolSize: 10
      });

      // Configure connection for local network
      pc.setConfiguration({
        iceServers: [],
        iceTransportPolicy: 'relay' // Force relay for local network
      });

      // Create data channel for communication
      const dataChannel = pc.createDataChannel('lobby', {
        ordered: true,
        maxRetransmits: 3,
        id: 0
      });

      // Setup data channel handlers
      this.setupDataChannelHandlers(deviceId, dataChannel);

      // Setup ICE candidates
      this.setupIceCandidateHandlers(deviceId, pc);

      // Store connection
      this.connections.set(deviceId, pc);

      // Create and send offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      });

      await pc.setLocalDescription(offer);

      // Wait for ICE gathering to complete
      await this.waitForIceGathering(pc);

      // Send offer via BLE signaling
      const sdp = pc.localDescription?.sdp || '';
      await this.bluetoothService.broadcastOffer(deviceId, sdp);

    } catch (error) {
      console.error(`Failed to create WebRTC connection for ${deviceId}:`, error);
      this.connections.delete(deviceId);
      throw error;
    }
  }

  private async waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };

      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') {
          resolve();
        }
      });

      // Start checking
      checkState();
    });
  }

  private setupIceCandidateHandlers(deviceId: string, pc: RTCPeerConnection): void {
    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        // In local network, ICE candidates should be minimal
        console.log(`ICE candidate for ${deviceId}:`, event.candidate.candidate);
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log(`ICE connection state for ${deviceId}:`, pc.iceConnectionState);

      if (pc.iceConnectionState === 'failed') {
        this.handleConnectionFailure(deviceId);
      }
    });
  }

  private setupDataChannelHandlers(deviceId: string, dataChannel: RTCDataChannel): void {
    dataChannel.addEventListener('open', () => {
      console.log(`Data channel opened for ${deviceId}`);
      this.markDeviceReady(deviceId, true);
    });

    dataChannel.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleDataChannelMessage(deviceId, message);
      } catch (error) {
        console.error(`Failed to parse message from ${deviceId}:`, error);
      }
    });

    dataChannel.addEventListener('error', (error) => {
      console.error(`Data channel error for ${deviceId}:`, error);
      this.markDeviceReady(deviceId, false);
    });

    dataChannel.addEventListener('close', () => {
      console.log(`Data channel closed for ${deviceId}`);
      this.markDeviceReady(deviceId, false);
    });
  }
}
```

#### Client Side Connection Setup

```typescript
class WebRTCClientManager {
  private peerConnection: RTCPeerConnection | null = null;

  async handleOffer(offerSdp: string, clientId: string): Promise<void> {
    try {
      // Create peer connection
      this.peerConnection = new RTCPeerConnection({
        iceServers: [], // Local network only
        iceCandidatePoolSize: 10
      });

      // Setup data channel handler (receiver)
      this.peerConnection.addEventListener('datachannel', (event) => {
        const dataChannel = event.channel;
        this.setupDataChannelHandlers(dataChannel);
      });

      // Setup ICE handlers
      this.setupIceCandidateHandlers();

      // Set remote description (offer)
      await this.peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: offerSdp
      });

      // Create answer
      const answer = await this.peerConnection.createAnswer();

      // Set local description
      await this.peerConnection.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Send answer via BLE
      const sdp = this.peerConnection.localDescription?.sdp || '';
      await this.bluetoothService.sendAnswer(clientId, sdp);

    } catch (error) {
      console.error('Failed to handle WebRTC offer:', error);
      this.cleanup();
      throw error;
    }
  }

  private setupDataChannelHandlers(dataChannel: RTCDataChannel): void {
    dataChannel.addEventListener('open', () => {
      console.log('Data channel opened to host');
      this.notifyConnectionReady(true);
    });

    dataChannel.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      } catch (error) {
        console.error('Failed to parse message:', error);
      }
    });

    dataChannel.addEventListener('close', () => {
      console.log('Data channel closed');
      this.notifyConnectionReady(false);
    });
  }

  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.peerConnection) {
        resolve();
        return;
      }

      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          resolve();
        } else {
          setTimeout(checkState, 100);
        }
      };

      this.peerConnection.addEventListener('icegatheringstatechange', () => {
        if (this.peerConnection?.iceGatheringState === 'complete') {
          resolve();
        }
      });

      checkState();
    });
  }
}
```

### Data Channel Optimization

#### Message Serialization

```typescript
class DataChannelSerializer {
  // Optimized JSON serialization with compression
  static serialize(data: any): string {
    // Remove null/undefined values to reduce size
    const cleaned = this.removeNullValues(data);

    // Use JSON.stringify with space optimization
    return JSON.stringify(cleaned);
  }

  static deserialize(data: string): any {
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Failed to deserialize data:', error);
      return null;
    }
  }

  private static removeNullValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.removeNullValues(item))
                .filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleaned = this.removeNullValues(value);
        if (cleaned !== undefined) {
          result[key] = cleaned;
        }
      }
      return result;
    }

    return obj;
  }
}
```

#### Message Prioritization and Queuing

```typescript
class MessageQueue {
  private queues = new Map<MessagePriority, Array<{
    message: any;
    timestamp: number;
    retryCount: number;
  }>>();

  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_RETRY_COUNT = 3;

  constructor() {
    // Initialize queues for each priority level
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    });
  }

  enqueue(message: any, priority: MessagePriority): boolean {
    const queue = this.queues.get(priority);
    if (!queue) return false;

    // Check queue size limit
    if (queue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest message
      queue.shift();
    }

    queue.push({
      message,
      timestamp: Date.now(),
      retryCount: 0
    });

    return true;
  }

  dequeue(): { message: any; priority: MessagePriority } | null {
    // Process queues in priority order (0 = highest)
    for (let priority = 0; priority <= 3; priority++) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        const item = queue.shift();
        return {
          message: item.message,
          priority: priority as MessagePriority
        };
      }
    }

    return null;
  }

  requeueFailed(message: any, priority: MessagePriority): boolean {
    const queue = this.queues.get(priority);
    if (!queue) return false;

    // Find the message and increment retry count
    const item = queue.find(item => item.message === message);
    if (item) {
      item.retryCount++;
      if (item.retryCount > this.MAX_RETRY_COUNT) {
        // Remove message if max retries exceeded
        const index = queue.indexOf(item);
        queue.splice(index, 1);
        return false;
      }
      return true;
    }

    return false;
  }

  getStats(): {
    totalQueued: number;
    priorityBreakdown: Record<MessagePriority, number>;
  } {
    const stats = {
      totalQueued: 0,
      priorityBreakdown: {} as Record<MessagePriority, number>
    };

    this.queues.forEach((queue, priority) => {
      stats.priorityBreakdown[priority as MessagePriority] = queue.length;
      stats.totalQueued += queue.length;
    });

    return stats;
  }
}
```

## Error Handling and Resilience

### Connection Recovery Strategies

#### Automatic Reconnection Logic

```typescript
class ConnectionRecovery {
  private reconnectAttempts = new Map<string, number>();
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAYS = [1000, 2000, 5000]; // Exponential backoff

  async handleConnectionLoss(deviceId: string, reason: string): Promise<void> {
    console.warn(`Connection lost to ${deviceId}: ${reason}`);

    const attempts = this.reconnectAttempts.get(deviceId) || 0;

    if (attempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.error(`Max reconnect attempts exceeded for ${deviceId}`);
      this.permanentDisconnect(deviceId);
      return;
    }

    // Schedule reconnection attempt
    const delay = this.RECONNECT_DELAYS[Math.min(attempts, this.RECONNECT_DELAYS.length - 1)];

    setTimeout(async () => {
      try {
        this.reconnectAttempts.set(deviceId, attempts + 1);
        await this.attemptReconnection(deviceId);
        this.reconnectAttempts.delete(deviceId); // Reset on success
      } catch (error) {
        console.error(`Reconnection attempt ${attempts + 1} failed for ${deviceId}:`, error);
        await this.handleConnectionLoss(deviceId, `Reconnection failed: ${error}`);
      }
    }, delay);
  }

  private async attemptReconnection(deviceId: string): Promise<void> {
    // First, try to re-establish BLE connection
    await this.bluetoothService.reconnectDevice(deviceId);

    // Then, re-establish WebRTC connection
    if (this.isHost) {
      await this.webRTCHostManager.recreateConnection(deviceId);
    } else {
      // Client logic would be different
      throw new Error('Client reconnection not implemented');
    }
  }

  private permanentDisconnect(deviceId: string): void {
    // Remove device from connected list
    this.removeDevice(deviceId);

    // Notify other devices about the disconnection
    this.broadcastDeviceDisconnection(deviceId);

    // Clean up resources
    this.cleanupDeviceResources(deviceId);
  }
}
```

### Error Classification and Handling

```typescript
enum ErrorType {
  BLE_CONNECTION = 'ble_connection',
  WEBRTC_CONNECTION = 'webrtc_connection',
  MESSAGE_PARSING = 'message_parsing',
  TIMEOUT = 'timeout',
  RESOURCE_EXHAUSTED = 'resource_exhausted',
  PROTOCOL_VIOLATION = 'protocol_violation'
}

class ErrorHandler {
  private errorStats = new Map<ErrorType, number>();

  handleError(error: Error, context: string): void {
    const errorType = this.classifyError(error);

    // Update statistics
    const currentCount = this.errorStats.get(errorType) || 0;
    this.errorStats.set(errorType, currentCount + 1);

    // Log error with context
    console.error(`[${context}] ${errorType}:`, error);

    // Handle based on error type
    switch (errorType) {
      case ErrorType.BLE_CONNECTION:
        this.handleBLEConnectionError(error, context);
        break;
      case ErrorType.WEBRTC_CONNECTION:
        this.handleWebRTCConnectionError(error, context);
        break;
      case ErrorType.TIMEOUT:
        this.handleTimeoutError(error, context);
        break;
      default:
        this.handleGenericError(error, context);
    }
  }

  private classifyError(error: Error): ErrorType {
    const message = error.message.toLowerCase();

    if (message.includes('bluetooth') || message.includes('ble')) {
      return ErrorType.BLE_CONNECTION;
    }

    if (message.includes('webrtc') || message.includes('peerconnection')) {
      return ErrorType.WEBRTC_CONNECTION;
    }

    if (message.includes('timeout') || message.includes('timed out')) {
      return ErrorType.TIMEOUT;
    }

    if (message.includes('parse') || message.includes('json')) {
      return ErrorType.MESSAGE_PARSING;
    }

    if (message.includes('memory') || message.includes('resource')) {
      return ErrorType.RESOURCE_EXHAUSTED;
    }

    if (message.includes('protocol') || message.includes('format')) {
      return ErrorType.PROTOCOL_VIOLATION;
    }

    return ErrorType.WEBRTC_CONNECTION; // Default
  }

  private handleBLEConnectionError(error: Error, context: string): void {
    // Attempt BLE recovery
    if (context.includes('advertising')) {
      this.restartAdvertising();
    } else if (context.includes('scanning')) {
      this.restartScanning();
    }
  }

  private handleWebRTCConnectionError(error: Error, context: string): void {
    // Attempt WebRTC recovery
    if (context.includes('offer')) {
      this.regenerateOffer();
    } else if (context.includes('answer')) {
      this.regenerateAnswer();
    }
  }

  getErrorReport(): Record<ErrorType, number> {
    const report: Partial<Record<ErrorType, number>> = {};
    this.errorStats.forEach((count, type) => {
      report[type] = count;
    });
    return report as Record<ErrorType, number>;
  }
}
```

## Security Considerations

### Data Validation and Sanitization

#### Message Validation Framework

```typescript
class MessageValidator {
  private static readonly MAX_MESSAGE_SIZE = 1024 * 1024; // 1MB
  private static readonly MAX_CHUNK_COUNT = 1000;
  private static readonly VALID_MESSAGE_TYPES = [
    'device-info', 'offer', 'answer', 'mode-change'
  ];

  static validateIncomingMessage(message: any): ValidationResult {
    const result: ValidationResult = { valid: true, errors: [] };

    // Basic structure validation
    if (!message || typeof message !== 'object') {
      result.valid = false;
      result.errors.push('Invalid message structure');
      return result;
    }

    // Type validation
    if (!message.type || !this.VALID_MESSAGE_TYPES.includes(message.type)) {
      result.valid = false;
      result.errors.push(`Invalid message type: ${message.type}`);
    }

    // Device ID validation
    if (!message.deviceId || typeof message.deviceId !== 'string') {
      result.valid = false;
      result.errors.push('Invalid or missing device ID');
    } else if (message.deviceId.length > 100) {
      result.valid = false;
      result.errors.push('Device ID too long');
    }

    // Type-specific validation
    switch (message.type) {
      case 'device-info':
        this.validateDeviceInfo(message, result);
        break;
      case 'offer':
      case 'answer':
        this.validateSDP(message, result);
        break;
      case 'mode-change':
        this.validateModeChange(message, result);
        break;
    }

    return result;
  }

  private static validateDeviceInfo(message: any, result: ValidationResult): void {
    if (message.deviceName && typeof message.deviceName === 'string') {
      if (message.deviceName.length > 50) {
        result.valid = false;
        result.errors.push('Device name too long');
      }

      // Check for potentially dangerous characters
      const dangerousChars = /[<>"'&]/;
      if (dangerousChars.test(message.deviceName)) {
        result.valid = false;
        result.errors.push('Device name contains invalid characters');
      }
    }
  }

  private static validateSDP(message: any, result: ValidationResult): void {
    if (!message.sdp || typeof message.sdp !== 'string') {
      result.valid = false;
      result.errors.push('Missing or invalid SDP');
    } else if (message.sdp.length > this.MAX_MESSAGE_SIZE) {
      result.valid = false;
      result.errors.push('SDP too large');
    }

    // Basic SDP format validation
    const sdpPattern = /^v=0\r\n/;
    if (!sdpPattern.test(message.sdp)) {
      result.valid = false;
      result.errors.push('Invalid SDP format');
    }
  }

  private static validateModeChange(message: any, result: ValidationResult): void {
    if (!message.mode || typeof message.mode !== 'string') {
      result.valid = false;
      result.errors.push('Missing or invalid mode');
    }

    // Validate against known modes
    const validModes = [
      'sprint-duels', 'team-duels', 'motion-games',
      'detector', 'display', 'single'
    ];

    if (!validModes.includes(message.mode)) {
      result.valid = false;
      result.errors.push(`Invalid mode: ${message.mode}`);
    }
  }
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### Access Control and Authentication

#### Device Authentication

```typescript
class DeviceAuthenticator {
  private trustedDevices = new Map<string, DeviceInfo>();
  private sessionTokens = new Map<string, string>();

  authenticateDevice(deviceId: string, deviceInfo: DeviceInfo): boolean {
    // Check if device is already trusted
    if (this.trustedDevices.has(deviceId)) {
      return this.verifyExistingDevice(deviceId, deviceInfo);
    }

    // New device authentication
    return this.authenticateNewDevice(deviceId, deviceInfo);
  }

  private verifyExistingDevice(deviceId: string, deviceInfo: DeviceInfo): boolean {
    const trustedInfo = this.trustedDevices.get(deviceId);
    if (!trustedInfo) return false;

    // Verify device characteristics match
    return (
      trustedInfo.name === deviceInfo.name &&
      trustedInfo.capabilities === deviceInfo.capabilities
    );
  }

  private authenticateNewDevice(deviceId: string, deviceInfo: DeviceInfo): boolean {
    // Basic validation of device info
    if (!deviceInfo.name || !deviceInfo.capabilities) {
      return false;
    }

    // Generate session token
    const token = this.generateSessionToken();
    this.sessionTokens.set(deviceId, token);

    // Add to trusted devices
    this.trustedDevices.set(deviceId, deviceInfo);

    return true;
  }

  private generateSessionToken(): string {
    // Generate cryptographically secure token
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  validateSessionToken(deviceId: string, token: string): boolean {
    const storedToken = this.sessionTokens.get(deviceId);
    return storedToken === token;
  }

  revokeDevice(deviceId: string): void {
    this.trustedDevices.delete(deviceId);
    this.sessionTokens.delete(deviceId);
  }
}

interface DeviceInfo {
  name: string;
  capabilities: string[];
  platform: string;
  version: string;
}
```

### Rate Limiting and DoS Protection

#### Message Rate Limiting

```typescript
class RateLimiter {
  private messageCounts = new Map<string, number[]>();
  private readonly WINDOW_SIZE = 60000; // 1 minute
  private readonly MAX_MESSAGES_PER_WINDOW = 100;

  isAllowed(deviceId: string): boolean {
    const now = Date.now();
    const deviceMessages = this.messageCounts.get(deviceId) || [];

    // Remove old messages outside the window
    const validMessages = deviceMessages.filter(timestamp =>
      now - timestamp < this.WINDOW_SIZE
    );

    // Check if limit exceeded
    if (validMessages.length >= this.MAX_MESSAGES_PER_WINDOW) {
      return false;
    }

    // Add current message
    validMessages.push(now);
    this.messageCounts.set(deviceId, validMessages);

    return true;
  }

  getRemainingMessages(deviceId: string): number {
    const now = Date.now();
    const deviceMessages = this.messageCounts.get(deviceId) || [];

    const validMessages = deviceMessages.filter(timestamp =>
      now - timestamp < this.WINDOW_SIZE
    );

    return Math.max(0, this.MAX_MESSAGES_PER_WINDOW - validMessages.length);
  }

  cleanup(): void {
    const now = Date.now();

    // Clean up old entries
    this.messageCounts.forEach((messages, deviceId) => {
      const validMessages = messages.filter(timestamp =>
        now - timestamp < this.WINDOW_SIZE
      );

      if (validMessages.length === 0) {
        this.messageCounts.delete(deviceId);
      } else {
        this.messageCounts.set(deviceId, validMessages);
      }
    });
  }
}
```

## Performance Optimization

### Memory Management

#### Object Pooling for Frequently Used Objects

```typescript
class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 50
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  acquire(): T {
    if (this.pool.length > 0) {
      return this.pool.pop()!;
    }
    return this.createFn();
  }

  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
  }

  clear(): void {
    this.pool.length = 0;
  }

  size(): number {
    return this.pool.length;
  }
}

// Usage example for message objects
class MessagePool {
  private static pool = new ObjectPool<LobbyMessage>(
    () => ({
      type: 'device-info',
      deviceId: '',
      deviceName: '',
      sdp: '',
      mode: ''
    }),
    (msg) => {
      msg.type = 'device-info';
      msg.deviceId = '';
      msg.deviceName = '';
      msg.sdp = '';
      msg.mode = '';
    },
    100
  );

  static acquire(): LobbyMessage {
    return this.pool.acquire();
  }

  static release(message: LobbyMessage): void {
    this.pool.release(message);
  }
}
```

### Connection Quality Monitoring

#### Real-time Metrics Collection

```typescript
class ConnectionMetrics {
  private metrics = new Map<string, DeviceMetrics>();
  private samplingInterval = 1000; // 1 second
  private timer: NodeJS.Timeout | null = null;

  startMonitoring(): void {
    this.timer = setInterval(() => {
      this.collectMetrics();
    }, this.samplingInterval);
  }

  stopMonitoring(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private collectMetrics(): void {
    this.metrics.forEach((metrics, deviceId) => {
      // Collect WebRTC statistics if available
      if (metrics.peerConnection) {
        this.collectWebRTCStats(deviceId, metrics.peerConnection);
      }

      // Collect BLE statistics
      this.collectBLEStats(deviceId);

      // Update aggregates
      this.updateAggregates(deviceId);
    });
  }

  private collectWebRTCStats(deviceId: string, pc: RTCPeerConnection): void {
    pc.getStats().then(stats => {
      stats.forEach(report => {
        switch (report.type) {
          case 'data-channel':
            this.handleDataChannelStats(deviceId, report);
            break;
          case 'transport':
            this.handleTransportStats(deviceId, report);
            break;
          case 'candidate-pair':
            this.handleCandidatePairStats(deviceId, report);
            break;
        }
      });
    });
  }

  private handleDataChannelStats(deviceId: string, report: any): void {
    const metrics = this.metrics.get(deviceId);
    if (!metrics) return;

    metrics.dataChannelStats = {
      messagesSent: report.messagesSent,
      messagesReceived: report.messagesReceived,
      bytesSent: report.bytesSent,
      bytesReceived: report.bytesReceived
    };

    // Calculate message rates
    const now = Date.now();
    const timeDelta = now - metrics.lastUpdate;

    if (timeDelta > 0) {
      metrics.messageRate = metrics.dataChannelStats.messagesReceived / (timeDelta / 1000);
      metrics.dataRate = (metrics.dataChannelStats.bytesReceived * 8) / (timeDelta / 1000); // bits per second
    }

    metrics.lastUpdate = now;
  }

  getMetrics(deviceId: string): DeviceMetrics | null {
    return this.metrics.get(deviceId) || null;
  }

  getAllMetrics(): Map<string, DeviceMetrics> {
    return new Map(this.metrics);
  }
}

interface DeviceMetrics {
  peerConnection: RTCPeerConnection | null;
  dataChannelStats: {
    messagesSent: number;
    messagesReceived: number;
    bytesSent: number;
    bytesReceived: number;
  };
  messageRate: number;
  dataRate: number;
  lastUpdate: number;
  latencyHistory: number[];
  packetLossHistory: number[];
}
```

This technical documentation provides comprehensive details about the low-level implementation of the lobby system. It covers the intricate details of BLE protocol implementation, WebRTC connection management, message handling, error recovery, security measures, and performance optimization techniques.

For higher-level architectural information, see the [Lobby System Overview](./LOBBY_SYSTEM.md). For API reference documentation, refer to the [Lobby API Documentation](./LOBBY_API.md).