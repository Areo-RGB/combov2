# Lobby Development Guide

## Overview

This guide provides comprehensive documentation for developers working with or extending the lobby system in the Motion Signal & Sprint Duels application. It covers architecture patterns, integration guidelines, testing procedures, and best practices for maintaining and enhancing the lobby functionality.

## Architecture Patterns

### Layered Architecture

The lobby system follows a clean layered architecture with clear separation of concerns:

```
┌─────────────────────────────────────┐
│        UI Components Layer          │
│  (LobbySetupComponent, Status UI)   │
├─────────────────────────────────────┤
│       Service Layer                 │
│  (LocalLobbyService, Bluetooth...)  │
├─────────────────────────────────────┤
│      Protocol Layer                 │
│  (BLE Signaling, WebRTC, Message)   │
├─────────────────────────────────────┤
│     Platform Layer                  │
│  (Capacitor, Native Plugins, BLE)   │
└─────────────────────────────────────┘
```

### Design Principles

#### 1. Reactive State Management

All lobby state uses Angular Signals for reactive updates:

```typescript
// Core state signals
lobbyId = signal<string | null>(null);
role = signal<LobbyRole | null>(null);
devices = signal<ConnectedDevice[]>([]);

// Computed signals for derived state
allDevicesReady = computed(() => {
  const devs = this.devices();
  return devs.length > 0 && devs.every((d) => d.connected && d.rtcReady);
});
```

#### 2. Separation of Concerns

- **BluetoothLobbyService**: Handles BLE communication only
- **LocalLobbyService**: Manages WebRTC and lobby state
- **LobbySetupComponent**: UI for lobby operations
- **Native Plugin**: Platform-specific BLE implementation

#### 3. Error Handling Pattern

Consistent error handling across all layers:

```typescript
try {
  await operation();
  // Handle success...
} catch (error) {
  console.error('Operation failed:', error);
  this.error.set('Human-readable error message');
  // Cleanup state...
}
```

#### 4. Resource Management

Explicit resource cleanup to prevent memory leaks:

```typescript
cleanup(): void {
  // Close all data channels
  devices.forEach(device => {
    if (device.dataChannel) device.dataChannel.close();
    if (device.peerConnection) device.peerConnection.close();
  });

  // Clear state
  this.devices.set([]);
  this.messageCallbacks = [];

  // Cleanup BLE resources
  this.bluetooth.cleanup();
}
```

### Communication Patterns

#### 1. Dual-Phase Connection

1. **Phase 1 - BLE Discovery**: Device discovery and initial connection
2. **Phase 2 - WebRTC**: High-performance peer-to-peer communication

#### 2. Message-Based Architecture

All communication uses structured messages:

```typescript
interface LobbyMessage {
  type: 'device-info' | 'offer' | 'answer' | 'mode-change';
  deviceId: string;
  // Additional fields based on type...
}
```

#### 3. Chunking Protocol

Large messages are automatically chunked for BLE limitations:

```typescript
private async notifyChunks(message: string): Promise<void> {
  const chunkSize = 180;
  const total = Math.ceil(message.length / chunkSize);

  for (let i = 0; i < total; i++) {
    const data = message.slice(i * chunkSize, (i + 1) * chunkSize);
    const env: ChunkEnvelope = { t: 'lobby-msg', idx: i, total, data };
    await this.sendChunk(env);
  }
}
```

## Integration Guidelines

### Adding New Game Modes

When adding new game modes to the lobby system:

#### 1. Mode Registration

Add the new mode to the app component's mode type:

```typescript
// In app.component.ts
type AppMode =
  | 'selection'
  | 'sprint-duels'
  | 'team-duels'
  | 'new-game-mode'  // Add new mode here
  | 'lobby-setup';
```

#### 2. Mode Handler

Implement mode-specific logic in the lobby service:

```typescript
// In LocalLobbyService
onMessage(callback: (msg: any) => void): void {
  this.messageCallbacks.push((msg) => {
    // Handle mode-specific messages
    if (msg.type === 'new-game-mode-event') {
      this.handleNewGameModeEvent(msg);
    }

    // Forward to general callbacks
    callback(msg);
  });
}

private handleNewGameModeEvent(msg: any): void {
  // Mode-specific message handling
}
```

#### 3. Component Integration

Ensure the new mode component can receive lobby state:

```typescript
export class NewGameModeComponent implements OnInit {
  private lobbyService = inject(LocalLobbyService);

  ngOnInit() {
    // Listen for lobby state changes
    effect(() => {
      const role = this.lobbyService.role();
      const devices = this.lobbyService.devices();

      // Initialize mode based on lobby state
      this.initializeForLobby(role, devices);
    });
  }
}
```

### Extending Message Protocol

When adding new message types:

#### 1. Extend Message Interface

```typescript
interface LobbyMessage {
  type: 'device-info' | 'offer' | 'answer' | 'mode-change' | 'new-message-type';
  deviceId: string;
  // Add new fields for new message type
  newData?: any;
}
```

#### 2. Add Handler in Service

```typescript
private handleLobbyMessage(msg: LobbyMessage): void {
  switch (msg.type) {
    // Existing handlers...

    case 'new-message-type':
      this.handleNewMessageType(msg);
      break;
  }
}

private handleNewMessageType(msg: LobbyMessage): void {
  // Implementation for new message type
}
```

#### 3. Add Sender Methods

```typescript
// In LocalLobbyService
async sendNewMessage(data: any): Promise<void> {
  const message = {
    type: 'new-message-type',
    deviceId: 'host', // or appropriate device ID
    newData: data
  };

  this.sendToAll(message);
}
```

### Adding Platform Support

To add support for new platforms (e.g., iOS):

#### 1. Platform Detection

```typescript
// In BluetoothLobbyService
private getPlatformCapabilities(): PlatformCapabilities {
  const platform = Capacitor.getPlatform();

  switch (platform) {
    case 'android':
      return {
        peripheralMode: true,
        centralMode: true,
        advertising: true
      };
    case 'ios':
      return {
        peripheralMode: false, // Initially
        centralMode: true,
        advertising: false
      };
    default:
      return {
        peripheralMode: false,
        centralMode: false,
        advertising: false
      };
  }
}
```

#### 2. Platform-Specific Implementation

Create platform-specific adapters:

```typescript
abstract class PlatformBluetoothAdapter {
  abstract startAdvertising(options: AdvertisingOptions): Promise<void>;
  abstract scanAndConnect(options: ScanOptions): Promise<void>;
  abstract sendMessage(data: any): Promise<void>;
  abstract cleanup(): Promise<void>;
}

class AndroidBluetoothAdapter extends PlatformBluetoothAdapter {
  // Android-specific implementation using native plugin
}

class IosBluetoothAdapter extends PlatformBluetoothAdapter {
  // iOS-specific implementation using different APIs
}
```

#### 3. Dependency Injection

Use factory pattern for platform selection:

```typescript
{
  provide: PlatformBluetoothAdapter,
  useFactory: () => {
    const platform = Capacitor.getPlatform();
    return platform === 'android'
      ? new AndroidBluetoothAdapter()
      : new IosBluetoothAdapter();
  }
}
```

## Testing Strategy

### Unit Testing

#### Service Testing

Test individual service methods in isolation:

```typescript
describe('LocalLobbyService', () => {
  let service: LocalLobbyService;
  let bluetoothSpy: jasmine.SpyObj<BluetoothLobbyService>;

  beforeEach(() => {
    bluetoothSpy = jasmine.createSpyObj('BluetoothLobbyService', [
      'startHostLobby',
      'joinLobby',
      'onMessage'
    ]);

    TestBed.configureTestingModule({
      providers: [
        LocalLobbyService,
        { provide: BluetoothLobbyService, useValue: bluetoothSpy }
      ]
    });

    service = TestBed.inject(LocalLobbyService);
  });

  it('should create lobby with generated ID', async () => {
    const hostName = 'Test Host';
    const result = await service.createLobby(hostName);

    expect(result).toMatch(/^[A-Z0-9]{6}$/);
    expect(service.lobbyId()).toBe(result);
    expect(service.role()).toBe('host');
    expect(bluetoothSpy.startHostLobby).toHaveBeenCalledWith(result, hostName);
  });
});
```

#### Message Protocol Testing

Test message handling and validation:

```typescript
describe('Message Protocol', () => {
  it('should chunk large messages correctly', () => {
    const largeMessage = 'x'.repeat(500); // Larger than MTU
    const chunks = chunkMessage(largeMessage);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 180)).toBe(true);

    // Test reassembly
    const reassembled = reassembleChunks(chunks);
    expect(reassembled).toBe(largeMessage);
  });

  it('should validate message format', () => {
    const validMessage: LobbyMessage = {
      type: 'device-info',
      deviceId: 'test-device',
      deviceName: 'Test Device'
    };

    expect(validateLobbyMessage(validMessage)).toBe(true);

    const invalidMessage = { type: 'invalid' };
    expect(validateLobbyMessage(invalidMessage)).toBe(false);
  });
});
```

#### Signal Testing

Test reactive state management:

```typescript
it('should update device count when devices connect', () => {
  const initialCount = service.deviceCount();
  expect(initialCount).toBe(0);

  // Simulate device connection
  service.addDevice({
    id: 'device-1',
    name: 'Test Device',
    connected: true,
    rtcReady: false,
    peerConnection: null,
    dataChannel: null
  });

  const newCount = service.deviceCount();
  expect(newCount).toBe(1);
});
```

### Integration Testing

#### End-to-End Lobby Flow

Test complete lobby setup and teardown:

```typescript
describe('Lobby Integration', () => {
  let hostService: LocalLobbyService;
  let clientService: LocalLobbyService;

  beforeEach(() => {
    // Create separate service instances for host and client
    hostService = createMockLobbyService('host');
    clientService = createMockLobbyService('client');
  });

  it('should complete full lobby setup flow', async () => {
    // 1. Host creates lobby
    const lobbyId = await hostService.createLobby('Host Device');
    expect(hostService.role()).toBe('host');

    // 2. Client joins lobby
    await clientService.joinLobby(lobbyId, 'Client Device');
    expect(clientService.role()).toBe('client');

    // 3. Simulate WebRTC connection
    await simulateWebRTCSetup(hostService, clientService);

    // 4. Verify all devices ready
    expect(hostService.allDevicesReady()).toBe(true);

    // 5. Complete setup
    await hostService.completeSetup();
    expect(hostService.isSetupComplete()).toBe(true);

    // 6. Test mode change
    await hostService.selectModeForAll('test-mode');
    expect(clientService.selectedMode()).toBe('test-mode');

    // 7. Cleanup
    hostService.cleanup();
    clientService.cleanup();
  });
});
```

#### Bluetooth Communication Testing

Test BLE message passing with mocking:

```typescript
describe('Bluetooth Communication', () => {
  let bluetoothService: BluetoothLobbyService;
  let mockNativePlugin: jasmine.SpyObj<any>;

  beforeEach(() => {
    mockNativePlugin = jasmine.createSpyObj('BleSignaling', [
      'startAdvertising',
      'addListener',
      'notifyTx'
    ]);

    // Mock the native plugin registration
    registerPlugin.and.returnValue(mockNativePlugin);

    bluetoothService = new BluetoothLobbyService();
  });

  it('should handle message chunking and reassembly', async () => {
    const largeMessage = JSON.stringify({
      type: 'offer',
      deviceId: 'test-device',
      sdp: 'v=0\r\no=- 123456789\r\n...' // Large SDP string
    });

    // Mock chunking and sending
    let sentChunks: any[] = [];
    mockNativePlugin.notifyTx.and.callFake((data: any) => {
      sentChunks.push(data.value);
    });

    // Send large message
    await bluetoothService.sendToHost(largeMessage);

    // Verify chunking
    expect(sentChunks.length).toBeGreaterThan(1);
    expect(sentChunks.every(chunk => chunk.length <= 180)).toBe(true);
  });
});
```

### Performance Testing

#### Connection Time Testing

Measure and validate connection establishment times:

```typescript
describe('Performance Tests', () => {
  it('should establish lobby within time limits', async () => {
    const startTime = Date.now();

    // Host creates lobby
    const lobbyId = await hostService.createLobby('Test Host');

    // Client joins
    await clientService.joinLobby(lobbyId, 'Test Client');

    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // Should complete within 30 seconds
    expect(totalTime).toBeLessThan(30000);
  });

  it('should handle multiple concurrent connections', async () => {
    const clients: LocalLobbyService[] = [];
    const lobbyId = await hostService.createLobby('Host');

    // Create 5 clients
    for (let i = 0; i < 5; i++) {
      const client = createMockLobbyService('client');
      await client.joinLobby(lobbyId, `Client ${i}`);
      clients.push(client);
    }

    // All clients should be connected
    expect(hostService.deviceCount()).toBe(5);

    // Cleanup
    clients.forEach(client => client.cleanup());
  });
});
```

### Stress Testing

Test system behavior under adverse conditions:

```typescript
describe('Stress Tests', () => {
  it('should handle message loss gracefully', async () => {
    // Simulate 10% message loss
    const originalSend = mockNativePlugin.notifyTx;
    let messageCount = 0;

    mockNativePlugin.notifyTx.and.callFake((data: any) => {
      messageCount++;
      // Drop 10% of messages
      if (messageCount % 10 !== 0) {
        return originalSend(data);
      }
    });

    // Test communication resilience
    await testCommunicationWithLoss();
  });

  it('should handle device disconnections', async () => {
    // Setup lobby with multiple devices
    await setupMultiDeviceLobby();

    // Simulate device disconnection
    simulateDeviceDisconnection('device-1');

    // Verify lobby remains functional
    expect(hostService.devices().length).toBe(4); // 5 - 1 = 4
    expect(hostService.allDevicesReady()).toBe(false);
  });
});
```

## Performance Optimization

### Bluetooth Optimization

#### Adaptive Chunking

Implement adaptive chunking based on connection quality:

```typescript
class AdaptiveChunking {
  private chunkSize = 180; // Default
  private connectionQuality = 1.0;

  adaptChunking(successRate: number): void {
    // Reduce chunk size if high failure rate
    if (successRate < 0.8) {
      this.chunkSize = Math.max(100, this.chunkSize * 0.8);
    }
    // Increase chunk size if high success rate
    else if (successRate > 0.95) {
      this.chunkSize = Math.min(200, this.chunkSize * 1.1);
    }
  }

  getOptimalChunkSize(): number {
    return Math.floor(this.chunkSize * this.connectionQuality);
  }
}
```

#### Connection Pooling

Reuse connections when possible:

```typescript
class ConnectionPool {
  private activeConnections = new Map<string, RTCPeerConnection>();
  private idleConnections = new Set<string>();

  getConnection(deviceId: string): RTCPeerConnection | null {
    return this.activeConnections.get(deviceId) || null;
  }

  releaseConnection(deviceId: string): void {
    const connection = this.activeConnections.get(deviceId);
    if (connection) {
      this.idleConnections.add(deviceId);
      // Keep connection open for potential reuse
      setTimeout(() => {
        if (this.idleConnections.has(deviceId)) {
          this.closeConnection(deviceId);
        }
      }, 30000); // 30 second idle timeout
    }
  }
}
```

### WebRTC Optimization

#### Connection Quality Monitoring

Monitor and optimize WebRTC performance:

```typescript
class WebRTCQualityMonitor {
  private metrics = {
    latency: 0,
    packetLoss: 0,
    bandwidth: 0
  };

  startMonitoring(connection: RTCPeerConnection): void {
    connection.addEventListener('iceconnectionstatechange', () => {
      this.logConnectionState(connection.iceConnectionState);
    });

    // Monitor data channel metrics
    connection.addEventListener('datachannel', (e) => {
      const channel = e.channel;
      this.monitorDataChannel(channel);
    });
  }

  private monitorDataChannel(channel: RTCDataChannel): void {
    const startTime = Date.now();
    let messageCount = 0;

    channel.addEventListener('message', () => {
      messageCount++;
      const elapsed = Date.now() - startTime;

      if (elapsed > 5000) { // Every 5 seconds
        this.metrics.latency = elapsed / messageCount;
        messageCount = 0;
        startTime = Date.now();
      }
    });
  }
}
```

#### Message Prioritization

Implement priority-based message handling:

```typescript
enum MessagePriority {
  CRITICAL = 0,    // Connection management
  HIGH = 1,        // Game state changes
  NORMAL = 2,      // Regular game data
  LOW = 3          // Non-critical updates
}

class PriorityMessageQueue {
  private queues = new Map<MessagePriority, any[]>();

  constructor() {
    // Initialize queues for each priority level
    Object.values(MessagePriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    });
  }

  enqueue(message: any, priority: MessagePriority): void {
    this.queues.get(priority)?.push(message);
  }

  dequeue(): any {
    // Process messages in priority order
    for (let i = 0; i <= 3; i++) {
      const queue = this.queues.get(i);
      if (queue && queue.length > 0) {
        return queue.shift();
      }
    }
    return null;
  }
}
```

## Memory Management

### Resource Cleanup

Ensure proper cleanup of all resources:

```typescript
class ResourceCleaner {
  private timers: NodeJS.Timeout[] = [];
  private eventListeners: Array<{target: any, event: string, handler: Function}> = [];

  addTimer(timer: NodeJS.Timeout): void {
    this.timers.push(timer);
  }

  addEventListener(target: any, event: string, handler: Function): void {
    target.addEventListener(event, handler);
    this.eventListeners.push({ target, event, handler });
  }

  cleanup(): void {
    // Clear timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers = [];

    // Remove event listeners
    this.eventListeners.forEach(({ target, event, handler }) => {
      target.removeEventListener(event, handler);
    });
    this.eventListeners = [];
  }
}
```

### Memory Leak Detection

Implement memory usage monitoring:

```typescript
class MemoryMonitor {
  private startMemory = 0;

  startMonitoring(): void {
    if ('memory' in performance) {
      this.startMemory = (performance as any).memory.usedJSHeapSize;
    }
  }

  checkMemoryUsage(): void {
    if ('memory' in performance) {
      const currentMemory = (performance as any).memory.usedJSHeapSize;
      const increase = currentMemory - this.startMemory;

      if (increase > 50 * 1024 * 1024) { // 50MB increase
        console.warn('High memory usage detected:', increase);
        this.logMemoryBreakdown();
      }
    }
  }

  private logMemoryBreakdown(): void {
    // Log detailed memory usage for debugging
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      console.log({
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit
      });
    }
  }
}
```

## Error Handling Patterns

### Graceful Degradation

Implement fallback mechanisms for various failure scenarios:

```typescript
class GracefulDegradation {
  async establishConnection(deviceId: string): Promise<boolean> {
    // Try WebRTC first
    try {
      await this.establishWebRTCConnection(deviceId);
      return true;
    } catch (error) {
      console.warn('WebRTC failed, falling back to BLE-only mode:', error);

      // Fall back to BLE-only communication
      return this.establishBLEOnlyMode(deviceId);
    }
  }

  private async establishBLEOnlyMode(deviceId: string): Promise<boolean> {
    // Implement reduced functionality over BLE only
    try {
      await this.setupBLEOnlyChannel(deviceId);
      return true;
    } catch (error) {
      console.error('All connection methods failed:', error);
      return false;
    }
  }
}
```

### Error Recovery

Implement automatic error recovery:

```typescript
class ErrorRecovery {
  private retryAttempts = new Map<string, number>();
  private maxRetries = 3;

  async withRetry<T>(
    operation: () => Promise<T>,
    deviceId: string,
    operationType: string
  ): Promise<T> {
    const attempts = this.retryAttempts.get(deviceId) || 0;

    try {
      const result = await operation();
      this.retryAttempts.delete(deviceId); // Reset on success
      return result;
    } catch (error) {
      if (attempts < this.maxRetries) {
        this.retryAttempts.set(deviceId, attempts + 1);

        console.warn(`Retrying ${operationType} for ${deviceId}, attempt ${attempts + 1}`);

        // Exponential backoff
        const delay = Math.pow(2, attempts) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        return this.withRetry(operation, deviceId, operationType);
      } else {
        console.error(`Max retries exceeded for ${operationType} on ${deviceId}`);
        throw error;
      }
    }
  }
}
```

## Future Enhancement Possibilities

### Planned Features

#### iOS Support

```typescript
// Future implementation for iOS BLE peripheral mode
class IosBluetoothAdapter extends PlatformBluetoothAdapter {
  async startAdvertising(options: AdvertisingOptions): Promise<void> {
    // Use iOS Core Bluetooth framework
    // Implement peripheral mode support
    // Handle iOS-specific limitations
  }
}
```

#### Mesh Networking

```typescript
// Future mesh networking implementation
class MeshNetwork {
  private routingTable = new Map<string, string[]>();

  async routeMessage(destination: string, message: any): Promise<void> {
    const route = this.calculateRoute(destination);
    for (const hop of route) {
      await this.sendToHop(hop, message);
    }
  }

  private calculateRoute(destination: string): string[] {
    // Implement Dijkstra's algorithm for shortest path
    return [];
  }
}
```

#### Device Type Recognition

```typescript
// Future device type classification
enum DeviceType {
  DISPLAY = 'display',
  CAMERA = 'camera',
  CONTROL = 'control',
  SENSOR = 'sensor'
}

class DeviceTypeDetector {
  detectDeviceType(device: ConnectedDevice): DeviceType {
    // Analyze device capabilities and characteristics
    // Return appropriate device type
    return DeviceType.CONTROL;
  }
}
```

### Performance Enhancements

#### Connection Prediction

```typescript
// Predictive connection management
class ConnectionPredictor {
  private connectionHistory = new Map<string, number[]>();

  predictConnectionTime(deviceId: string): number {
    const history = this.connectionHistory.get(deviceId) || [];
    if (history.length === 0) return 5000; // Default 5 seconds

    // Use exponential moving average
    const alpha = 0.3;
    let prediction = history[0];

    for (let i = 1; i < history.length; i++) {
      prediction = alpha * history[i] + (1 - alpha) * prediction;
    }

    return prediction;
  }

  recordConnectionTime(deviceId: string, time: number): void {
    const history = this.connectionHistory.get(deviceId) || [];
    history.push(time);

    // Keep only last 10 measurements
    if (history.length > 10) {
      history.shift();
    }

    this.connectionHistory.set(deviceId, history);
  }
}
```

#### Adaptive Quality Adjustment

```typescript
// Adaptive quality based on network conditions
class AdaptiveQuality {
  private currentQuality = 'high';

  adjustQuality(metrics: ConnectionMetrics): void {
    const { latency, packetLoss, bandwidth } = metrics;

    if (latency > 200 || packetLoss > 0.1) {
      this.currentQuality = 'low';
    } else if (latency > 100 || packetLoss > 0.05) {
      this.currentQuality = 'medium';
    } else {
      this.currentQuality = 'high';
    }

    this.applyQualitySettings();
  }

  private applyQualitySettings(): void {
    switch (this.currentQuality) {
      case 'low':
        this.reduceMessageFrequency();
        this.increaseCompression();
        break;
      case 'medium':
        this.normalMessageFrequency();
        this.moderateCompression();
        break;
      case 'high':
        this.increaseMessageFrequency();
        this.disableCompression();
        break;
    }
  }
}
```

## Best Practices

### Code Organization

1. **Single Responsibility**: Each service has a clear, single purpose
2. **Interface Segregation**: Keep interfaces focused and minimal
3. **Dependency Injection**: Use Angular's DI system for all dependencies
4. **Error Boundaries**: Implement error boundaries at service boundaries

### Testing Practices

1. **Test Coverage**: Aim for >90% test coverage for lobby code
2. **Mock Strategy**: Mock all external dependencies (Bluetooth, WebRTC)
3. **Integration Tests**: Test complete user flows end-to-end
4. **Performance Tests**: Include performance benchmarks in CI/CD

### Security Practices

1. **Input Validation**: Validate all incoming messages
2. **Sanitization**: Sanitize all data before processing
3. **Rate Limiting**: Implement rate limiting for message processing
4. **Error Information**: Don't expose internal details in error messages

### Documentation Practices

1. **API Documentation**: Keep API docs in sync with code changes
2. **Code Comments**: Document complex algorithms and business logic
3. **Architecture Decisions**: Record ADRs for significant architectural changes
4. **Examples**: Include usage examples for all public APIs

## Conclusion

The lobby system is designed with extensibility and maintainability in mind. By following the patterns and guidelines outlined in this development guide, developers can confidently extend and enhance the lobby functionality while maintaining system stability and performance.

The architecture supports future enhancements like iOS support, mesh networking, and advanced device management without requiring major refactoring. The comprehensive testing strategy ensures reliability, and the performance optimization techniques maintain responsiveness even with many connected devices.

For technical implementation details, see the [Lobby Technical Documentation](./LOBBY_TECHNICAL.md). For user-facing setup instructions, refer to the [Lobby Setup Guide](./LOBBY_SETUP_GUIDE.md).