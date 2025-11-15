# Timing Server Plugin

A native Capacitor 7 plugin that enables HTTP server functionality on Android devices for receiving timing events from sensor phones over Wi-Fi (local network only).

## Overview

This plugin allows one Android phone (the **host**) to run an HTTP server, while up to 4 other Android phones (the **sensors**) send timing events over a local Wi-Fi network. This is designed for sprint timing applications where phones are positioned at START, FINISH, and SPLIT points.

### Network Assumptions

- **Local Wi-Fi Network**: TP-Link TL-WR902AC travel router (or similar) creates a local Wi-Fi without internet
- **AP Isolation**: OFF (devices must be able to communicate directly)
- **Host Phone**: Static IP on Wi-Fi (e.g., `192.168.0.10`)
- **Communication**: Plain HTTP over LAN on port 3000
- **Protocol**: JSON over HTTP POST to `/event`

## Architecture

### TypeScript Plugin Interface

Located in `src/plugins/timing-server/`:

- **definitions.ts**: Type definitions and plugin interface
- **index.ts**: Plugin registration and exports
- **web.ts**: Web platform stub implementation (non-functional placeholder)

### Android Implementation

Located in `android/app/src/main/java/com/motionsignal/app/`:

- **TimingServerPlugin.kt**: Capacitor plugin wrapper
- **TimingHTTPServer**: NanoHTTPD server implementation

### Angular Services

Located in `src/services/`:

- **timing-server.service.ts**: Host-side service for managing the HTTP server
- **timing-client.service.ts**: Sensor-side service for sending events to host

### UI Component

Located in `src/components/timing-server-lobby/`:

- **timing-server-lobby.component.ts**: Main lobby component
- **timing-server-lobby.component.html**: UI template

## Dependencies

### Android (build.gradle)

```gradle
implementation 'org.nanohttpd:nanohttpd:2.3.1'
```

Added to: `android/app/build.gradle`

### TypeScript

```typescript
import { TimingServer } from './plugins/timing-server';
```

## Usage

### Host Phone (Server)

```typescript
import { TimingServerService } from './services/timing-server.service';

// Start the server
const port = await timingServer.startServer(3000);
console.log('Server listening on port', port);

// Listen for events
timingServer.latestEvent.subscribe(event => {
  console.log('Received timing event', event);
});

// Stop the server
await timingServer.stopServer();
```

### Sensor Phone (Client)

```typescript
import { TimingClientService } from './services/timing-client.service';

// Configure host
timingClient.setHostIp('192.168.0.10');
timingClient.setHostPort(3000);

// Send timing event
await timingClient.sendTimingEvent({
  deviceId: 'FINISH',
  eventType: 'TRIGGER',
  eventId: 'run-001',
  localTimestamp: Date.now(),
});
```

## API Reference

### TimingServerPlugin Interface

```typescript
interface TimingServerPlugin {
  startServer(options: StartServerOptions): Promise<StartServerResult>;
  stopServer(): Promise<void>;
  addListener(
    eventName: 'timingEvent',
    listenerFunc: (event: TimingEventPayload) => void,
  ): Promise<{ remove: () => void }>;
  removeAllListeners(): Promise<void>;
}
```

### TimingEventPayload

```typescript
interface TimingEventPayload {
  deviceId: string;        // e.g., 'START', 'FINISH', 'SPLIT_1'
  eventType: string;       // e.g., 'TRIGGER', 'READY', 'CANCEL'
  eventId?: string;        // Optional event grouping ID
  localTimestamp?: number; // Sensor timestamp (ms since epoch)
  receivedAt: number;      // Server timestamp (ms since epoch)
}
```

## HTTP API

### Endpoint

```
POST http://{HOST_IP}:{PORT}/event
```

### Request

```json
{
  "deviceId": "FINISH",
  "eventType": "TRIGGER",
  "eventId": "run-001",
  "localTimestamp": 1699999999999
}
```

### Success Response

```json
{
  "status": "ok"
}
```

### Error Response

```json
{
  "status": "error",
  "message": "Missing required fields: deviceId, eventType"
}
```

## Platform Support

- ✅ **Android**: Fully supported
- ❌ **iOS**: Not supported (no implementation)
- ❌ **Web**: Stub implementation only (non-functional)

## Security Considerations

⚠️ **Important**: This plugin is designed for **LOCAL NETWORK USE ONLY**. It does NOT include:

- TLS/HTTPS encryption
- Authentication/authorization
- Rate limiting
- Input sanitization beyond basic JSON validation

**Do not expose this server to the public internet.**

## Troubleshooting

### Server Won't Start

1. Check if the port is already in use
2. Verify Android permissions (INTERNET permission is required)
3. Check Capacitor sync: `pnpm cap:sync`

### Sensors Can't Connect

1. Verify all devices are on the same Wi-Fi network
2. Check that AP/client isolation is OFF on the router
3. Verify the host IP address is correct (use `ipconfig` or settings)
4. Test connectivity with a ping or browser: `http://{HOST_IP}:{PORT}/event`

### Events Not Received

1. Check the server is running (`isRunning` signal)
2. Verify the listener is registered before sending events
3. Check browser/app console for errors
4. Verify JSON payload is valid

## Development

### Building the Android Plugin

```bash
# Sync Capacitor
pnpm cap:sync

# Open in Android Studio
pnpm open:android

# Build for Android
pnpm build:android
```

### Testing

1. **Host Phone**: Navigate to "Timing Server" → "Host Server" → Start Server
2. **Sensor Phone**: Navigate to "Timing Server" → "Sensor Device"
3. Configure host IP and port on sensor phone
4. Click "Test Connection"
5. Click "Send Trigger Event"
6. Verify event appears on host phone

## Example: Sprint Timing Application

```typescript
// Host phone
const server = inject(TimingServerService);
await server.startServer(3000);

// Subscribe to events
effect(() => {
  const event = server.latestEvent();
  if (event?.eventType === 'TRIGGER') {
    console.log(`${event.deviceId} triggered at ${event.receivedAt}`);
    // Process timing event...
  }
});

// Sensor phones (START, FINISH)
const client = inject(TimingClientService);
client.setHostIp('192.168.0.10');

// On motion detection
await client.sendTimingEvent({
  deviceId: 'FINISH',
  eventType: 'TRIGGER',
  localTimestamp: Date.now(),
});
```

## License

Same as parent project.

## Credits

- Built with [NanoHTTPD](https://github.com/NanoHttpd/nanohttpd)
- Capacitor 7 plugin architecture
- Angular 20 signals-based state management
