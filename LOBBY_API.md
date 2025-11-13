# Lobby API Documentation

## Overview

This documentation provides detailed API references for the lobby system components, including service interfaces, data models, and communication protocols. The lobby system consists of two main services: `BluetoothLobbyService` for BLE communication and `LocalLobbyService` for WebRTC connection management.

## Core Services

### BluetoothLobbyService

The `BluetoothLobbyService` handles Bluetooth Low Energy (BLE) communication between devices, providing device discovery, connection establishment, and message passing for WebRTC signaling.

#### Constructor

```typescript
@Injectable({
  providedIn: 'root',
})
export class BluetoothLobbyService {
  // Implementation details...
}
```

#### Public Methods

##### `startHostLobby(lobbyId: string, hostName: string): Promise<void>`

Starts advertising a lobby as a host device.

**Parameters:**
- `lobbyId` (string): Unique 6-character lobby identifier
- `hostName` (string): Human-readable name for the host device

**Returns:** Promise that resolves when advertising starts successfully

**Example:**
```typescript
await bluetoothService.startHostLobby('A3K9M2', 'Teacher Tablet');
```

**Implementation Details:**
- Initializes BLE peripheral mode
- Starts advertising with lobby ID in device name
- Sets up GATT server with custom service characteristics
- Begins listening for client connections

##### `joinLobby(lobbyId: string, clientName: string): Promise<void>`

Connects to a host device as a client.

**Parameters:**
- `lobbyId` (string): The 6-character lobby ID to join
- `clientName` (string): Human-readable name for the client device

**Returns:** Promise that resolves when connection is established

**Example:**
```typescript
await bluetoothService.joinLobby('A3K9M2', 'Student Phone 1');
```

**Implementation Details:**
- Scans for BLE devices with matching lobby ID prefix
- Establishes GATT connection to host device
- Subscribes to notifications from host
- Sends device information to host

##### `broadcastOffer(deviceId: string, sdp: string): Promise<void>`

Broadcasts a WebRTC offer to a specific client device (host only).

**Parameters:**
- `deviceId` (string): Target device identifier
- `sdp` (string): WebRTC session description protocol string

**Returns:** Promise that resolves when offer is sent

**Example:**
```typescript
await bluetoothService.broadcastOffer('client-abc123', offer.sdp);
```

**Implementation Details:**
- Creates LobbyMessage with offer data
- Chunks message for BLE MTU limitations
- Sends via BLE notifications to all connected clients

##### `sendAnswer(clientId: string, sdp: string): Promise<void>`

Sends a WebRTC answer back to the host device (client only).

**Parameters:**
- `clientId` (string): This client's device identifier
- `sdp` (string): WebRTC answer SDP string

**Returns:** Promise that resolves when answer is sent

**Example:**
```typescript
await bluetoothService.sendAnswer('client-def456', answer.sdp);
```

##### `broadcastModeChange(mode: string): Promise<void>`

Broadcasts a game mode change to all connected clients (host only).

**Parameters:**
- `mode` (string): The selected game mode identifier

**Returns:** Promise that resolves when mode change is broadcast

**Example:**
```typescript
await bluetoothService.broadcastModeChange('sprint-duels');
```

##### `onMessage(callback: (msg: LobbyMessage) => void): void`

Registers a callback for incoming lobby messages.

**Parameters:**
- `callback` (function): Function to handle incoming messages

**Example:**
```typescript
bluetoothService.onMessage((msg) => {
  console.log('Received message:', msg.type, msg.deviceId);
});
```

##### `getConnectedClients(): Array<{ deviceId: string; name: string }>`

Returns list of currently connected client devices.

**Returns:** Array of connected device information

**Example:**
```typescript
const clients = bluetoothService.getConnectedClients();
console.log('Connected devices:', clients.length);
```

##### `cleanup(): void`

Cleans up all BLE connections and resources.

**Example:**
```typescript
bluetoothService.cleanup();
```

**Implementation Details:**
- Stops BLE advertising
- Disconnects all clients
- Clears internal state
- Removes event listeners

### LocalLobbyService

The `LocalLobbyService` manages WebRTC peer connections, device state, and lobby coordination using Angular Signals for reactive state management.

#### Constructor

```typescript
@Injectable({
  providedIn: 'root',
})
export class LocalLobbyService {
  private bluetooth = inject(BluetoothLobbyService);

  // Signals for reactive state...
}
```

#### Public Methods

##### `createLobby(hostName: string): Promise<string>`

Creates a new lobby as the host device.

**Parameters:**
- `hostName` (string): Name for the host device

**Returns:** Promise resolving to the generated lobby ID

**Example:**
```typescript
const lobbyId = await lobbyService.createLobby('Main Display');
console.log('Lobby created:', lobbyId);
```

##### `joinLobby(lobbyId: string, clientName: string): Promise<void>`

Joins an existing lobby as a client device.

**Parameters:**
- `lobbyId` (string): The lobby ID to join
- `clientName` (string): Name for the client device

**Example:**
```typescript
await lobbyService.joinLobby('A3K9M2', 'Camera Device');
```

##### `establishWebRTCConnections(): Promise<void>`

Establishes WebRTC peer connections with all connected clients (host only).

**Example:**
```typescript
await lobbyService.establishWebRTCConnections();
```

**Implementation Details:**
- Creates RTCPeerConnection for each client
- Generates and sends WebRTC offers via BLE
- Handles answer responses and completes connections
- Sets up data channels for communication

##### `completeSetup(): Promise<void>`

Marks the lobby setup as complete (host only).

**Example:**
```typescript
await lobbyService.completeSetup();
console.log('Lobby setup complete!');
```

##### `selectModeForAll(mode: string): Promise<void>`

Selects a game mode for all connected devices (host only).

**Parameters:**
- `mode` (string): The game mode to select

**Example:**
```typescript
await lobbyService.selectModeForAll('sprint-duels');
```

##### `onMessage(callback: (msg: any) => void): void`

Registers a callback for WebRTC messages.

**Parameters:**
- `callback` (function): Function to handle incoming messages

**Example:**
```typescript
lobbyService.onMessage((msg) => {
  console.log('WebRTC message:', msg);
});
```

##### `sendToAll(message: any): void`

Sends a message to all connected devices via WebRTC.

**Parameters:**
- `message` (any): The message to send (will be JSON serialized)

**Example:**
```typescript
lobbyService.sendToAll({
  type: 'game-event',
  data: { score: 100, player: 'Player1' }
});
```

##### `cleanup(): void`

Cleans up all connections and state.

**Example:**
```typescript
lobbyService.cleanup();
```

#### Reactive Signals

The service exposes reactive signals for component integration:

```typescript
// Lobby state
lobbyId = signal<string | null>(null);           // Current lobby ID
role = signal<LobbyRole | null>(null);          // Device role ('host' | 'client')
hostName = signal<string | null>(null);         // Host device name
devices = signal<ConnectedDevice[]>([]);         // Connected devices list
isSetupComplete = signal<boolean>(false);       // Setup completion status
selectedMode = signal<string | null>(null);     // Selected game mode

// Client-specific state
clientId = signal<string | null>(null);         // This client's ID
clientPeerConnection = signal<RTCPeerConnection | null>(null);

// Computed signals
allDevicesReady = computed(() => {
  const devs = this.devices();
  return devs.length > 0 && devs.every((d) => d.connected && d.rtcReady);
});

deviceCount = computed(() => this.devices().length);
```

## Data Models

### Core Interfaces

#### LobbyRole

```typescript
export type LobbyRole = 'host' | 'client';
```

#### LobbyDevice

```typescript
export interface LobbyDevice {
  id: string;          // Unique device identifier
  name: string;        // Human-readable device name
  role: LobbyRole;     // Device role in lobby
  connected: boolean;  // BLE connection status
  rtcReady: boolean;   // WebRTC connection status
}
```

#### LobbyMessage

```typescript
export interface LobbyMessage {
  type: 'device-info' | 'offer' | 'answer' | 'mode-change';
  deviceId: string;    // Source or target device ID
  deviceName?: string; // Device name (for device-info messages)
  sdp?: string;        // WebRTC session description (for offer/answer)
  mode?: string;       // Game mode (for mode-change messages)
}
```

#### ConnectedDevice

```typescript
export interface ConnectedDevice {
  id: string;                    // Unique device identifier
  name: string;                  // Human-readable name
  connected: boolean;            // BLE connection status
  rtcReady: boolean;             // WebRTC connection status
  peerConnection: RTCPeerConnection;  // WebRTC peer connection instance
  dataChannel: RTCDataChannel;   // WebRTC data channel instance
}
```

#### LobbyState

```typescript
export interface LobbyState {
  lobbyId: string | null;
  role: LobbyRole | null;
  hostName: string | null;
  devices: ConnectedDevice[];
  isSetupComplete: boolean;
  selectedMode: string | null;
}
```

### Internal Data Structures

#### ChunkEnvelope

```typescript
type ChunkEnvelope = {
  t: 'lobby-msg';    // Message type identifier
  idx: number;       // Chunk index
  total: number;     // Total number of chunks
  data: string;      // Chunk data payload
};
```

#### Device Buffer Entry

```typescript
type BufferEntry = {
  total: number;     // Expected total chunks
  parts: string[];   // Array to store chunk parts
};
```

## Communication Protocols

### Bluetooth LE Configuration

#### Service and Characteristic UUIDs

```typescript
// Service UUID for lobby communication
private readonly SERVICE_ID = '6E400011-B5A3-F393-E0A9-E50E24DCCA9E';

// RX characteristic (client writes to host)
private readonly RX_ID = '6E400012-B5A3-F393-E0A9-E50E24DCCA9E';

// TX characteristic (host notifies to clients)
private readonly TX_ID = '6E400013-B5A3-F393-E0A9-E50E24DCCA9E';
```

#### Device Naming Convention

```typescript
// Host device name format
const hostDeviceName = `Lobby-${lobbyId}`;

// Example: "Lobby-A3K9M2"
```

#### Message Chunking

Large messages are automatically chunked for BLE MTU limitations:

```typescript
// Chunk size limit
private readonly CHUNK_SIZE = 180;

// Chunk creation
const total = Math.ceil(message.length / CHUNK_SIZE);
for (let i = 0; i < total; i++) {
  const data = message.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
  const env: ChunkEnvelope = {
    t: 'lobby-msg',
    idx: i,
    total,
    data
  };
  // Send chunk...
}
```

### WebRTC Configuration

#### Peer Connection Setup

```typescript
// Create peer connection (local network only)
const pc = new RTCPeerConnection({
  iceServers: [] // No STUN/TURN servers for local network
});

// Create data channel (host side)
const dc = pc.createDataChannel('lobby', {
  ordered: true,
  maxRetransmits: 3
});

// Handle data channel events (client side)
pc.ondatachannel = (e) => {
  const dc = e.channel;
  // Setup event handlers...
};
```

#### Connection Establishment Flow

**Host Side:**
1. Create RTCPeerConnection
2. Create data channel
3. Create offer
4. Set local description
5. Wait for ICE gathering
6. Send offer via BLE
7. Receive answer via BLE
8. Set remote description
9. Mark connection as ready

**Client Side:**
1. Create RTCPeerConnection
2. Receive offer via BLE
3. Set remote description
4. Create answer
5. Set local description
6. Wait for ICE gathering
7. Send answer via BLE
8. Handle data channel open event
9. Mark connection as ready

### Message Types

#### Device Info Message

```typescript
{
  type: 'device-info',
  deviceId: 'device-abc123',
  deviceName: 'Student Phone 1'
}
```

#### Offer Message

```typescript
{
  type: 'offer',
  deviceId: 'device-abc123',
  sdp: 'v=0\r\no=- 123456789 2 IN IP4 192.168.1.100\r\n...' // WebRTC SDP
}
```

#### Answer Message

```typescript
{
  type: 'answer',
  deviceId: 'device-abc123',
  sdp: 'v=0\r\no=- 987654321 2 IN IP4 192.168.1.101\r\n...' // WebRTC SDP
}
```

#### Mode Change Message

```typescript
{
  type: 'mode-change',
  deviceId: 'host',
  mode: 'sprint-duels'
}
```

## Component API

### LobbySetupComponent

The main UI component for lobby creation and management.

#### Properties

```typescript
// View state signals
viewState = signal<'selection' | 'host' | 'client'>('selection');
deviceName = signal<string>('');
lobbyIdInput = signal<string>('');
error = signal<string | null>(null);
isConnecting = signal<boolean>(false);

// Service signals
lobbyId = this.lobbyService.lobbyId;
role = this.lobbyService.role;
devices = this.lobbyService.devices;
allDevicesReady = this.lobbyService.allDevicesReady;
isSetupComplete = this.lobbyService.isSetupComplete;
deviceCount = this.lobbyService.deviceCount;
```

#### Methods

##### Host Actions

```typescript
async createHostLobby(): Promise<void>
async establishConnections(): Promise<void>
async completeSetup(): Promise<void>
```

##### Client Actions

```typescript
async joinClientLobby(): Promise<void>
```

##### Utility Methods

```typescript
back(): void
getConnectionStatusIcon(device: any): string
getConnectionStatusText(device: any): string
private generateDefaultDeviceName(): string
```

## Error Handling

### BLE Error Types

#### Bluetooth Not Available

```typescript
// Thrown when Bluetooth is disabled or unavailable
throw new Error('Bluetooth not available/enabled');
```

#### Advertising Not Available

```typescript
// Thrown when BLE advertising fails
throw new Error('Advertiser not available');
```

#### Connection Failures

```typescript
// Thrown when BLE connection fails
throw new Error('Failed to connect to host device');
```

### WebRTC Error Types

#### Connection Failed

```typescript
// Logged when WebRTC connection establishment fails
console.error('Failed to create WebRTC connection:', err);
```

#### Data Channel Errors

```typescript
// Logged when data channel encounters errors
dc.onerror = (err) => {
  console.error(`Data channel error for device ${device.id}:`, err);
};
```

### Timeout Handling

#### Scan Timeout

```typescript
// Safety timeout for device scanning
setTimeout(async () => {
  if (!resolved) {
    try {
      await BleClient.stopLEScan();
    } catch {}
  }
}, 15000);
```

## Native Plugin API

### BleSignaling Plugin

The custom Capacitor plugin for BLE peripheral mode support.

#### Methods

##### startAdvertising(options)

Starts BLE advertising with GATT server.

```typescript
interface AdvertisingOptions {
  sessionId: string;    // Lobby ID
  name: string;         // Device name
  serviceId: string;    // Service UUID
  rxId: string;         // RX characteristic UUID
  txId: string;         // TX characteristic UUID
}

// Example usage
await BleSignaling.startAdvertising({
  sessionId: 'A3K9M2',
  name: 'Lobby-A3K9M2',
  serviceId: '6E400011-B5A3-F393-E0A9-E50E24DCCA9E',
  rxId: '6E400012-B5A3-F393-E0A9-E50E24DCCA9E',
  txId: '6E400013-B5A3-F393-E0A9-E50E24DCCA9E'
});
```

##### stopAdvertising()

Stops BLE advertising and GATT server.

```typescript
await BleSignaling.stopAdvertising();
```

##### notifyTx(data)

Sends notification data to connected clients.

```typescript
interface NotifyOptions {
  value: number[];  // Byte array to send
}

await BleSignaling.notifyTx({
  value: [72, 101, 108, 108, 111] // "Hello" in bytes
});
```

#### Events

##### rxWritten

Fired when a client writes to the RX characteristic.

```typescript
BleSignaling.addListener('rxWritten', async (event: any) => {
  const bytes = event.value; // Array of byte values
  const decoded = new TextDecoder().decode(new Uint8Array(bytes));
  // Handle received data...
});
```

## Integration Examples

### Basic Host Setup

```typescript
import { LocalLobbyService } from '../services/local-lobby.service';

export class HostComponent {
  private lobbyService = inject(LocalLobbyService);

  async createLobby() {
    try {
      const lobbyId = await this.lobbyService.createLobby('Main Display');
      console.log('Lobby created:', lobbyId);

      // Wait for devices to join...

      // Establish WebRTC connections
      await this.lobbyService.establishWebRTCConnections();

      // Complete setup
      await this.lobbyService.completeSetup();

      // Select mode
      await this.lobbyService.selectModeForAll('sprint-duels');

    } catch (error) {
      console.error('Host setup failed:', error);
    }
  }
}
```

### Basic Client Setup

```typescript
import { LocalLobbyService } from '../services/local-lobby.service';

export class ClientComponent {
  private lobbyService = inject(LocalLobbyService);

  async joinLobby(lobbyId: string) {
    try {
      await this.lobbyService.joinLobby(lobbyId, 'Client Device');
      console.log('Joined lobby:', lobbyId);

      // Listen for mode changes
      this.lobbyService.onMessage((msg) => {
        if (msg.type === 'mode-selected') {
          console.log('Mode changed to:', msg.mode);
          // Handle mode change...
        }
      });

    } catch (error) {
      console.error('Client join failed:', error);
    }
  }
}
```

### Reactive UI Component

```typescript
import { Component, inject, computed } from '@angular/core';
import { LocalLobbyService } from '../services/local-lobby.service';

@Component({
  template: `
    <div>
      <h2>Lobby: {{ lobbyId() }}</h2>
      <p>Devices: {{ deviceCount() }}</p>
      <p>Status: {{ statusText() }}</p>

      @if (isHost() && allDevicesReady()) {
        <button (click)="completeSetup()">Complete Setup</button>
      }
    </div>
  `
})
export class LobbyStatusComponent {
  private lobbyService = inject(LocalLobbyService);

  lobbyId = this.lobbyService.lobbyId;
  deviceCount = this.lobbyService.deviceCount;
  allDevicesReady = this.lobbyService.allDevicesReady;
  isSetupComplete = this.lobbyService.isSetupComplete;

  isHost = computed(() => this.lobbyService.role() === 'host');

  statusText = computed(() => {
    if (this.isSetupComplete()) return 'Setup Complete';
    if (this.allDevicesReady()) return 'Ready for Setup';
    if (this.deviceCount() > 0) return 'Connecting Devices';
    return 'Waiting for Devices';
  });

  async completeSetup() {
    await this.lobbyService.completeSetup();
  }
}
```

## Performance Considerations

### Connection Optimization

- **Chunk Size**: 180 bytes optimized for BLE MTU
- **Timeout Values**: 15 seconds for device scanning
- **Retry Logic**: Built-in retry for failed connections
- **Concurrent Limits**: Support for 8+ simultaneous connections

### Memory Management

- **Buffer Cleanup**: Automatic cleanup of message buffers
- **Connection Limits**: Reasonable limits on device connections
- **State Reset**: Complete cleanup on lobby destruction

### Network Efficiency

- **Local Only**: No internet traffic for lobby operations
- **Efficient Protocols**: Optimized BLE and WebRTC usage
- **Compression**: JSON message compression for large payloads

## Security Considerations

### Data Privacy

- **Local Communication**: All data stays within local network
- **No External Servers**: No internet dependency
- **Session Isolation**: Different lobbies are completely isolated
- **Encrypted Channels**: WebRTC provides built-in encryption

### Access Control

- **Lobby ID Validation**: 6-character validation prevents accidental joins
- **Device Identification**: Unique device IDs for tracking
- **Role-Based Access**: Clear separation between host and client capabilities

This API documentation provides comprehensive information for developers working with the lobby system. For implementation details and architectural patterns, see the [Lobby Development Guide](./LOBBY_DEVELOPMENT.md).