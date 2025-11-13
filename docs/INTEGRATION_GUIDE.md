# WebSocket Sprint Timing - Integration Guide

## Architecture Overview

The WebSocket Sprint Timing system integrates seamlessly with the existing Angular detection component without modifying its core logic.

```
┌─────────────────────────────────────────────────────────────┐
│                    Angular Application                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Master View  │  │  Split View  │  │   Detector   │      │
│  │  Component   │  │  Component   │  │  Component   │      │
│  │              │  │  (Wrapper)   │  │  (Existing)  │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                  │               │
│         └─────────────────┼──────────────────┘               │
│                           │                                  │
│                  ┌────────▼────────┐                        │
│                  │ WebSocket       │                        │
│                  │ Service         │                        │
│                  └────────┬────────┘                        │
│                           │                                  │
└───────────────────────────┼──────────────────────────────────┘
                            │
                            │ WebSocket Protocol
                            │
                   ┌────────▼────────┐
                   │  Node.js        │
                   │  WebSocket      │
                   │  Server         │
                   └─────────────────┘
```

## Key Integration Points

### 1. Existing Detector Component

**File:** `src/components/detector/detector.component.ts`

**Key Feature:** Already has `motionDetected` output

```typescript
@Output() motionDetected = output<number>();
```

**No Changes Required:** The detector component works as-is. The split view wrapper simply listens to this output.

### 2. Split View Wrapper

**File:** `src/components/split-view/split-view.component.ts`

**Purpose:** Wraps the existing detector and adds WebSocket connectivity

**Integration:**
```typescript
// In template
<app-detector
  [sessionId]="sessionId()"
  [showBackButton]="false"
  (motionDetected)="onDetectionEvent($event)"
></app-detector>

// In component
onDetectionEvent(intensity: number): void {
  this.ws.sendDetectionEvent({
    splitNumber: this.splitNumber(),
    timestamp: Date.now(),
    detectionData: {
      intensity: intensity,
      type: 'motion',
    },
    clientId: this.ws.getClientId(),
  });
}
```

### 3. WebSocket Service

**File:** `src/services/websocket.service.ts`

**Purpose:** Manage WebSocket connections and message handling

**Key Methods:**
- `connect()` - Establish connection
- `disconnect()` - Close connection
- `sendDetectionEvent()` - Send detection to server
- `connectionStatus$` - Observable for connection state
- `detectionEvents$` - Observable for incoming events
- `connectedClients$` - Observable for client list

### 4. App Component Integration

**File:** `src/app.component.ts`

**Changes Made:**
1. Added imports for new components
2. Added new modes to mode signal type
3. Updated imports array

**Template Changes:**
- Added WebSocket section to selection screen
- Added cases for `websocket-master` and `websocket-split` modes

## Data Flow

### Detection Event Flow

```
┌──────────────┐
│   Detector   │ Motion detected (intensity: 85)
│  Component   │
└──────┬───────┘
       │ motionDetected output
       ▼
┌──────────────┐
│  Split View  │ onDetectionEvent(85)
│  Component   │
└──────┬───────┘
       │ ws.sendDetectionEvent()
       ▼
┌──────────────┐
│  WebSocket   │ Send JSON message
│   Service    │
└──────┬───────┘
       │ WebSocket.send()
       ▼
┌──────────────┐
│   Server     │ Broadcast to all clients
│              │
└──────┬───────┘
       │ detection-broadcast
       ▼
┌──────────────┐
│ Master View  │ Display in event log
│  Component   │
└──────────────┘
```

### Connection State Flow

```
Split View                WebSocket Service           Server
    │                           │                        │
    │ connect(ip, port, #) ─────>                       │
    │                           │                        │
    │                           │──── new WebSocket ────>│
    │                           │                        │
    │                           │<──── onopen ───────────│
    │                           │                        │
    │                           │──── register ─────────>│
    │                           │                        │
    │                           │<──── welcome ──────────│
    │<── Observable(true) ──────│                        │
    │                           │                        │
```

## TypeScript Interfaces

### DetectionEvent

```typescript
export interface DetectionEvent {
  splitNumber: number;      // 1-10
  clientId: string;         // Unique client ID
  timestamp: number;        // Unix timestamp (ms)
  detectionData: any;       // From detector component
}
```

### ConnectedClient

```typescript
export interface ConnectedClient {
  id: string;              // Client ID
  splitNumber: number;     // Split assignment
  ipAddress: string;       // Client IP
  connectedAt: number;     // Connection timestamp
  lastSeen: number;        // Last heartbeat
  latency?: number;        // Optional latency (ms)
}
```

### WebSocketMessage

```typescript
export interface WebSocketMessage {
  type: 'register' | 'detection-event' | 'heartbeat' |
        'welcome' | 'clients-update' | 'detection-broadcast' | 'error';
  data?: any;
  timestamp: number;
  clientId?: string;
  splitNumber?: number;
  detectionData?: any;
  fromSplit?: number;
}
```

### ConnectionStatus

```typescript
export enum ConnectionStatus {
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  ERROR = 'ERROR',
}
```

## Component Communication

### Master View ← Server

```typescript
// In master-view.component.ts
ngOnInit(): void {
  // Subscribe to connected clients
  this.connectedClients$.subscribe((clients) => {
    this.connectedClientsCount.set(clients.length);
  });

  // Subscribe to detection events
  this.detectionEvents$.subscribe((event) => {
    this.handleDetectionEvent(event);
  });
}
```

### Split View → Server

```typescript
// In split-view.component.ts
onDetectionEvent(intensity: number): void {
  this.ws.sendDetectionEvent({
    splitNumber: this.splitNumber(),
    timestamp: Date.now(),
    detectionData: {
      intensity: intensity,
      type: 'motion',
    },
    clientId: this.ws.getClientId(),
  });
}
```

## Server Implementation

### Client Management

```javascript
// In server.js
const clients = new Map();

wss.on('connection', (ws, req) => {
  const clientIP = req.socket.remoteAddress;

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString());

    switch(message.type) {
      case 'register':
        clients.set(clientId, {
          id: clientId,
          splitNumber: message.splitNumber,
          ws: ws,
          ipAddress: clientIP,
          connectedAt: Date.now(),
          lastHeartbeat: Date.now(),
        });
        break;

      case 'detection-event':
        broadcastToAll({
          type: 'detection-broadcast',
          fromSplit: message.splitNumber,
          timestamp: message.timestamp,
          detectionData: message.detectionData,
        });
        break;
    }
  });
});
```

## State Management

### WebSocket Service State

Uses RxJS `BehaviorSubject` for reactive state:

```typescript
private connectionStatusSubject = new BehaviorSubject<ConnectionStatus>(
  ConnectionStatus.DISCONNECTED
);

private connectedClientsSubject = new BehaviorSubject<ConnectedClient[]>([]);

private detectionEventsSubject = new Subject<DetectionEvent>();
```

### Component State

Uses Angular Signals for reactive UI:

```typescript
// Master View
eventLog = signal<EventLogEntry[]>([]);
totalDetections = signal<number>(0);
connectedClientsCount = signal<number>(0);

// Split View
masterIP = signal<string>('192.168.1.100');
splitNumber = signal<number>(1);
connectionError = signal<string>('');
```

## Error Handling

### Connection Errors

```typescript
connect(ip: string, port: number, split: number): Observable<boolean> {
  return new Observable<boolean>((observer) => {
    try {
      this.ws = new WebSocket(`ws://${ip}:${port}`);

      this.ws.onerror = (error) => {
        this.updateConnectionStatus(ConnectionStatus.ERROR);
        observer.error(new Error('Failed to connect'));
      };

      this.ws.onclose = () => {
        if (this.shouldReconnect) {
          this.attemptReconnect();
        }
      };
    } catch (error) {
      observer.error(error);
    }
  });
}
```

### Reconnection Logic

```typescript
private attemptReconnect(): void {
  this.reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

  this.reconnectTimeout = setTimeout(() => {
    if (this.shouldReconnect) {
      this.connect(/* ... */).subscribe(/* ... */);
    }
  }, delay);
}
```

## Testing Strategy

### Unit Tests

**WebSocket Service:**
```typescript
describe('WebSocketService', () => {
  it('should connect to server', (done) => {
    service.connect('localhost', 8080, 1).subscribe({
      next: (connected) => {
        expect(connected).toBe(true);
        done();
      }
    });
  });

  it('should send detection events', () => {
    const spy = spyOn(ws, 'send');
    service.sendDetectionEvent(mockEvent);
    expect(spy).toHaveBeenCalled();
  });
});
```

**Components:**
```typescript
describe('SplitViewComponent', () => {
  it('should forward detection events', () => {
    const spy = spyOn(service, 'sendDetectionEvent');
    component.onDetectionEvent(85);
    expect(spy).toHaveBeenCalledWith(
      jasmine.objectContaining({ intensity: 85 })
    );
  });
});
```

### Integration Tests

**End-to-End Flow:**
1. Start server
2. Connect master view
3. Connect split view
4. Trigger detection
5. Verify event appears in master view

### Manual Testing

**Checklist:**
- [ ] Server starts successfully
- [ ] Master view connects automatically
- [ ] Split view can connect with IP
- [ ] Multiple splits can connect
- [ ] Detection events flow correctly
- [ ] Disconnection is handled gracefully
- [ ] Reconnection works after network drop

## Performance Considerations

### Message Size

Keep detection data minimal:
```typescript
// Good
{
  intensity: 85,
  type: 'motion'
}

// Avoid
{
  intensity: 85,
  type: 'motion',
  fullImageData: '...', // Too large!
  rawPixels: [...],     // Too large!
}
```

### Event Frequency

Detection events are throttled by:
1. Motion cooldown setting (default: 1000ms)
2. Signal cadence setting (default: 1)
3. Network latency

### Connection Pool

Server maintains a `Map` for O(1) client lookups:
```javascript
const clients = new Map();
clients.get(clientId);    // Fast
clients.set(clientId, {}); // Fast
```

## Security Notes

### Current Implementation

- ⚠️ **No authentication** - Anyone can connect
- ⚠️ **No encryption** - Plain WebSocket (ws://)
- ⚠️ **No validation** - Trusts all messages
- ✅ **Local network only** - Not exposed to internet

### Production Recommendations

1. **Use WSS (WebSocket Secure)**
   ```javascript
   const server = https.createServer(sslOptions);
   const wss = new WebSocket.Server({ server });
   ```

2. **Add Authentication**
   ```typescript
   connect(ip: string, port: number, token: string)
   ```

3. **Validate Messages**
   ```javascript
   if (!isValidSplitNumber(message.splitNumber)) {
     return sendError('Invalid split number');
   }
   ```

4. **Rate Limiting**
   ```javascript
   if (messageCount > MAX_MESSAGES_PER_SECOND) {
     return throttle();
   }
   ```

## Extending the System

### Adding New Message Types

1. **Define Interface:**
   ```typescript
   export interface CustomMessage extends WebSocketMessage {
     type: 'custom-event';
     customData: any;
   }
   ```

2. **Update Service:**
   ```typescript
   sendCustomEvent(data: any): void {
     this.sendMessage({
       type: 'custom-event',
       customData: data,
       timestamp: Date.now(),
     });
   }
   ```

3. **Handle in Server:**
   ```javascript
   case 'custom-event':
     handleCustomEvent(message);
     break;
   ```

### Adding New Views

1. Create component in `src/components/`
2. Import in `app.component.ts`
3. Add mode to signal type
4. Add case in template switch

### Enhancing Detection

The system works with any detector that emits events:

```typescript
// Pose detection
<app-detector
  [detectionMethod]="'pose'"
  (motionDetected)="onDetectionEvent($event)"
>
</app-detector>

// Speed detection
<app-detector
  [useSpeedyVision]="true"
  (motionDetected)="onDetectionEvent($event)"
>
</app-detector>
```

## Migration from Firebase/RTC

If migrating from the existing Firebase/RTC system:

### Before (Firebase)
```typescript
this.firebaseService.writeMotion(sessionId, intensity);
```

### After (WebSocket)
```typescript
this.ws.sendDetectionEvent({
  splitNumber: this.splitNumber(),
  timestamp: Date.now(),
  detectionData: { intensity },
  clientId: this.ws.getClientId(),
});
```

### Advantages of WebSocket

- ✅ **No external dependencies** (Firebase)
- ✅ **Works offline** (local network)
- ✅ **Lower latency**
- ✅ **No data limits**
- ✅ **Full control over server**

## Troubleshooting Integration Issues

### Detector Events Not Emitting

**Check:**
1. Detector component has `motionDetected` output
2. Split view is listening: `(motionDetected)="onDetectionEvent($event)"`
3. Detection is started
4. Motion cooldown hasn't blocked event

### Events Not Reaching Master

**Check:**
1. Split is connected (check master's client list)
2. WebSocket service `isConnected()` returns true
3. Server logs show message receipt
4. No firewall blocking messages

### State Not Updating

**Check:**
1. Observables are subscribed in `ngOnInit()`
2. Signals are used in template
3. Change detection is triggered
4. No errors in console

## Best Practices

### Component Design

- ✅ Use Signals for reactive state
- ✅ Use Observables for async streams
- ✅ Unsubscribe in `ngOnDestroy()`
- ✅ Handle loading/error states

### WebSocket Usage

- ✅ Check `isConnected()` before sending
- ✅ Handle reconnection automatically
- ✅ Send heartbeats regularly
- ✅ Validate messages before sending

### Server Design

- ✅ Log all important events
- ✅ Clean up disconnected clients
- ✅ Broadcast changes to all clients
- ✅ Handle errors gracefully

## Resources

- **WebSocket API:** https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
- **RxJS Observables:** https://rxjs.dev/guide/observable
- **Angular Signals:** https://angular.dev/guide/signals
- **Node.js ws Library:** https://github.com/websockets/ws
