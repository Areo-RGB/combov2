# Lobby System Overview

## Introduction

The Lobby System is a sophisticated multi-device connectivity solution that enables internet-free local multiplayer experiences for the Motion Signal & Sprint Duels application. It combines Bluetooth Low Energy (BLE) for device discovery with WebRTC for high-performance peer-to-peer communication, allowing devices to connect and communicate without requiring internet connectivity.

## Architecture Overview

The lobby system consists of three main layers working in concert:

### 1. Bluetooth Layer (Device Discovery)
- **Technology**: Bluetooth Low Energy (BLE)
- **Purpose**: Initial device discovery and connection establishment
- **Implementation**: Custom Capacitor plugin (`BleSignaling`) for cross-platform support
- **Features**: Host advertising, client scanning, and reliable data transmission

### 2. Signaling Layer (Connection Negotiation)
- **Technology**: Custom BLE-based signaling protocol
- **Purpose**: WebRTC connection establishment and negotiation
- **Implementation**: `BluetoothLobbyService` with message chunking for large data
- **Features**: Offer/answer exchange, device management, mode synchronization

### 3. Communication Layer (Real-time Data)
- **Technology**: WebRTC peer-to-peer data channels
- **Purpose**: High-performance real-time communication between connected devices
- **Implementation**: `LocalLobbyService` with WebRTC peer connections
- **Features**: Low-latency messaging, automatic reconnection, connection monitoring

## Key Benefits

### Internet-Free Operation
- **Offline Multiplayer**: Full functionality without internet connectivity
- **Local Network**: Operates entirely within Bluetooth range (typically 10-100 meters)
- **Privacy**: No data transmitted to external servers
- **Reliability**: Not dependent on network infrastructure

### Cross-Platform Support
- **Android**: Native BLE implementation with peripheral mode support
- **Web**: Progressive Web App (PWA) support for desktop browsers
- **iOS**: Planned support through Capacitor framework

### Seamless Integration
- **Universal Connectivity**: Works across all game modes in the application
- **Dynamic Role Assignment**: Devices can act as host or client based on setup
- **Mode Synchronization**: Host can select game modes that all devices join automatically

## Technical Stack

### Core Technologies
- **Angular 20**: Component-based UI with Signals for reactive state management
- **Capacitor**: Cross-platform mobile app framework
- **Bluetooth LE**: Low-energy wireless communication protocol
- **WebRTC**: Real-time peer-to-peer communication technology

### Dependencies
```json
{
  "@capacitor-community/bluetooth-le": "^7.2.0",
  "@capacitor/core": "^7.4.4",
  "BleSignaling": "Custom native plugin"
}
```

### Key Components
- `BluetoothLobbyService`: BLE communication and device discovery
- `LocalLobbyService`: WebRTC connection management and state coordination
- `LobbySetupComponent`: User interface for lobby creation and joining
- `BleSignalingPlugin`: Native Android implementation for BLE advertising

## System Flow

### 1. Lobby Creation (Host)
1. User selects "Create Lobby" from the lobby setup screen
2. Host device generates a unique 6-character lobby ID
3. Bluetooth LE advertising starts with lobby ID in device name
4. GATT server initializes with custom service characteristics
5. Host waits for client devices to discover and connect

### 2. Lobby Discovery (Client)
1. User enters lobby ID and selects "Join Lobby"
2. Client device scans for BLE devices with matching lobby ID prefix
3. Upon discovery, client establishes BLE connection to host
4. Client sends device information via BLE characteristics
5. Client waits for WebRTC connection establishment

### 3. Connection Establishment
1. Host creates WebRTC peer connections for each connected client
2. Host generates WebRTC offers and sends via BLE signaling
3. Clients generate WebRTC answers and send via BLE signaling
4. WebRTC data channels establish for high-performance communication
5. All devices switch from BLE to WebRTC for ongoing communication

### 4. Mode Selection and Gameplay
1. Host selects desired game mode from available options
2. Mode change broadcast to all connected devices via WebRTC
3. All devices automatically transition to selected game mode
4. Game-specific communication continues over WebRTC channels

## Data Models

### LobbyDevice Interface
```typescript
interface LobbyDevice {
  id: string;           // Unique device identifier
  name: string;         // Human-readable device name
  role: LobbyRole;      // 'host' | 'client'
  connected: boolean;   // BLE connection status
  rtcReady: boolean;    // WebRTC connection status
}
```

### LobbyMessage Protocol
```typescript
interface LobbyMessage {
  type: 'device-info' | 'offer' | 'answer' | 'mode-change';
  deviceId: string;     // Source/destination device identifier
  deviceName?: string;  // Device name (for device-info messages)
  sdp?: string;         // WebRTC session description (for offer/answer)
  mode?: string;        // Game mode (for mode-change messages)
}
```

### ConnectedDevice State
```typescript
interface ConnectedDevice {
  id: string;                    // Device identifier
  name: string;                  // Human-readable name
  connected: boolean;            // BLE connection status
  rtcReady: boolean;             // WebRTC connection status
  peerConnection: RTCPeerConnection;  // WebRTC peer connection
  dataChannel: RTCDataChannel;   // WebRTC data channel
}
```

## Communication Protocols

### BLE Characteristic Configuration
- **Service UUID**: `6E400011-B5A3-F393-E0A9-E50E24DCCA9E`
- **RX Characteristic**: `6E400012-B5A3-F393-E0A9-E50E24DCCA9E` (client → host)
- **TX Characteristic**: `6E400013-B5A3-F393-E0A9-E50E24DCCA9E` (host → client)
- **Device Name Format**: `Lobby-{LOBBY_ID}`

### Message Chunking System
Large messages are automatically chunked for BLE MTU limitations:
- **Chunk Size**: 180 bytes per chunk
- **Chunk Format**: `{ t: 'lobby-msg', idx: number, total: number, data: string }`
- **Reassembly**: Automatic reconstruction on receiver side
- **Error Handling**: Timeout and retry mechanisms for lost chunks

### WebRTC Configuration
- **ICE Servers**: None (local network only)
- **Data Channel**: Reliable, ordered delivery
- **Connection Type**: Peer-to-peer mesh topology
- **Reconnection**: Automatic handling of connection failures

## Integration with Application

### Mode Integration
The lobby system seamlessly integrates with all existing game modes:
- **Motion Games**: `motion-games`
- **Detector Mode**: `detector`
- **Display Mode**: `display`
- **Single Device**: `single`
- **Sprint Timing**: Various `sprint-*` modes
- **Sprint Duels**: `sprint-duels`
- **Team Duels**: `team-duels`
- **Body Pose**: `bodypose`

### State Management
All lobby state is managed using Angular Signals for reactive updates:
- `lobbyId`: Current lobby identifier
- `role`: Device role ('host' | 'client')
- `devices`: Array of connected devices
- `isSetupComplete`: Lobby setup completion status
- `selectedMode`: Currently selected game mode

### Component Integration
- **LobbySetupComponent**: Dedicated UI for lobby operations
- **AppComponent**: Mode management and navigation
- **Game Components**: Automatic mode synchronization
- **HeaderComponent**: Connection status indicators

## Use Cases and Scenarios

### 1. Classroom Environment
- **Scenario**: Teacher creates lobby for student devices
- **Benefit**: No school network dependency
- **Usage**: Coordinated motion detection activities

### 2. Sports Training
- **Scenario**: Coach sets up multiple timing stations
- **Benefit**: Reliable outdoor connectivity
- **Usage**: Sprint timing with multiple device stations

### 3. Competitive Events
- **Scenario**: Tournament organizers coordinate multiple devices
- **Benefit**: Offline operation for venue reliability
- **Usage**: Sprint duels and team competitions

### 4. Remote Areas
- **Scenario**: Activities in locations without internet
- **Benefit**: Complete offline functionality
- **Usage**: Any game mode requiring multi-device connectivity

## Performance Considerations

### Connection Establishment
- **Discovery Time**: Typically 2-10 seconds for BLE discovery
- **Connection Time**: 5-15 seconds for complete WebRTC setup
- **Device Limit**: Supports 8+ concurrent client connections
- **Range**: 10-100 meters depending on environment

### Communication Performance
- **WebRTC Latency**: <10ms local network latency
- **Throughput**: >1 Mbps sustained data transfer
- **Reliability**: Automatic reconnection on connection loss
- **Power Efficiency**: BLE low-energy operation for discovery phase

### Resource Usage
- **Memory**: Minimal memory footprint for lobby operations
- **Battery**: BLE optimization for minimal battery drain
- **CPU**: Efficient WebRTC implementation for smooth performance
- **Storage**: No persistent storage requirements

## Security Considerations

### Data Privacy
- **Local-Only**: All communication stays within the local lobby
- **No External Servers**: No data transmitted to internet servers
- **Encrypted**: WebRTC provides built-in encryption for data channels
- **Temporary**: Connections exist only for session duration

### Access Control
- **Lobby ID**: 6-character identifier for access control
- **Session Isolation**: Different lobbies are completely isolated
- **Role-Based**: Clear separation between host and client capabilities
- **Device Validation**: Basic device identification and validation

## Future Enhancements

### Planned Features
- **iOS Support**: Native iOS BLE peripheral mode implementation
- **Enhanced Security**: Device authentication and encryption
- **Persistent Lobbies**: Lobby templates and saved configurations
- **Device Types**: Role-based device types (display, camera, control)
- **Performance Monitoring**: Connection quality metrics and optimization

### Scalability Improvements
- **Mesh Networks**: Multi-hop communication for extended range
- **Hybrid Connectivity**: Fallback to WiFi when available
- **Load Balancing**: Optimized routing for large device counts
- **Connection Pooling**: Efficient resource management

## Conclusion

The Lobby System provides a robust, internet-free solution for multi-device connectivity in the Motion Signal & Sprint Duels application. By combining BLE for discovery and WebRTC for communication, it delivers high-performance local multiplayer experiences across all game modes. The system is designed for reliability, ease of use, and seamless integration with existing application functionality.

For detailed implementation guidance, see the [Lobby Development Guide](./LOBBY_DEVELOPMENT.md) and [Lobby API Documentation](./LOBBY_API.md).