# WebSocket Message Protocol

## Overview

This document describes the message format and protocol used for WebSocket communication between the server and clients (master and splits).

## Message Structure

All messages are JSON objects with the following base structure:

```typescript
interface WebSocketMessage {
  type: string;           // Message type identifier
  timestamp: number;      // Unix timestamp (milliseconds)
  clientId?: string;      // Unique client identifier
  splitNumber?: number;   // Split number (if applicable)
  data?: any;            // Message payload
  detectionData?: any;   // Detection event data
  fromSplit?: number;    // Source split number (for broadcasts)
}
```

## Message Types

### Client → Server Messages

#### 1. Register

Sent when a client first connects to register itself.

```json
{
  "type": "register",
  "splitNumber": 3,
  "clientId": "client-1234567890-abc123",
  "timestamp": 1698765432000
}
```

**Fields:**
- `splitNumber`: Integer 0-10 (0 = master, 1-10 = splits)
- `clientId`: Unique client identifier
- `timestamp`: Connection timestamp

**Server Response:** `welcome` message

---

#### 2. Detection Event

Sent when motion is detected on a split device.

```json
{
  "type": "detection-event",
  "splitNumber": 3,
  "clientId": "client-1234567890-abc123",
  "timestamp": 1698765432000,
  "detectionData": {
    "intensity": 85,
    "type": "motion"
  }
}
```

**Fields:**
- `splitNumber`: Split that detected motion
- `clientId`: Client identifier
- `timestamp`: Detection timestamp
- `detectionData`: Detection details
  - `intensity`: Motion intensity (0-100)
  - `type`: Detection type ("motion", "pose", etc.)

**Server Action:** Broadcast to all clients as `detection-broadcast`

---

#### 3. Heartbeat

Sent periodically to maintain connection health.

```json
{
  "type": "heartbeat",
  "clientId": "client-1234567890-abc123",
  "splitNumber": 3,
  "timestamp": 1698765442000
}
```

**Fields:**
- `clientId`: Client identifier
- `splitNumber`: Split number
- `timestamp`: Heartbeat timestamp

**Server Action:** Update `lastSeen` timestamp for client

---

### Server → Client Messages

#### 1. Welcome

Sent immediately after a successful registration.

```json
{
  "type": "welcome",
  "timestamp": 1698765432000,
  "data": {
    "clientId": "client-1234567890-abc123",
    "assignedSplitNumber": 3,
    "serverTime": 1698765432000
  }
}
```

**Fields:**
- `data.clientId`: Assigned/confirmed client ID
- `data.assignedSplitNumber`: Confirmed split number
- `data.serverTime`: Server's current timestamp

---

#### 2. Clients Update

Broadcast when the client list changes (connect/disconnect).

```json
{
  "type": "clients-update",
  "timestamp": 1698765432000,
  "data": {
    "totalClients": 3,
    "clients": [
      {
        "id": "client-1234567890-abc123",
        "splitNumber": 1,
        "ipAddress": "192.168.1.101",
        "connectedAt": 1698765400000,
        "lastSeen": 1698765432000
      },
      {
        "id": "client-1234567891-def456",
        "splitNumber": 2,
        "ipAddress": "192.168.1.102",
        "connectedAt": 1698765410000,
        "lastSeen": 1698765432000
      }
    ]
  }
}
```

**Fields:**
- `data.totalClients`: Number of connected clients
- `data.clients`: Array of client objects
  - `id`: Client identifier
  - `splitNumber`: Split number
  - `ipAddress`: Client's IP address
  - `connectedAt`: Connection timestamp
  - `lastSeen`: Last heartbeat timestamp

---

#### 3. Detection Broadcast

Broadcast when any split detects motion.

```json
{
  "type": "detection-broadcast",
  "fromSplit": 1,
  "clientId": "client-1234567890-abc123",
  "timestamp": 1698765432000,
  "detectionData": {
    "intensity": 85,
    "type": "motion"
  }
}
```

**Fields:**
- `fromSplit`: Split number that detected motion
- `clientId`: Source client identifier
- `timestamp`: Detection timestamp
- `detectionData`: Original detection data

---

#### 4. Error

Sent when the server encounters an error processing a message.

```json
{
  "type": "error",
  "timestamp": 1698765432000,
  "data": {
    "message": "Failed to process message",
    "error": "Invalid JSON format"
  }
}
```

**Fields:**
- `data.message`: Error description
- `data.error`: Error details

---

## Connection Lifecycle

### 1. Connection Establishment

```
Client                          Server
  |                               |
  |--- WebSocket Connect -------->|
  |<--- WebSocket Open -----------|
  |                               |
  |--- register ----------------->|
  |<--- welcome ------------------|
  |<--- clients-update -----------|
```

### 2. Active Communication

```
Split                           Server                          Master
  |                               |                               |
  |--- detection-event ---------->|                               |
  |                               |--- detection-broadcast ------>|
  |                               |                               |
  |--- heartbeat ---------------->|                               |
  |                               |--- heartbeat ---------------->|
```

### 3. Disconnection

```
Client                          Server
  |                               |
  |--- WebSocket Close ---------->|
  |                               |
  |                               |--- clients-update ----> (all)
```

## Heartbeat Mechanism

### Client-Side

- Send heartbeat every 5 seconds
- Include `clientId` and `splitNumber`
- Maintain connection health

### Server-Side

- Track `lastSeen` timestamp for each client
- Check heartbeats every 10 seconds
- Timeout if no heartbeat for 30 seconds
- Automatically disconnect dead clients

## Error Handling

### Connection Errors

**Client:**
- Retry with exponential backoff
- Max 5 reconnection attempts
- Delay: 2s, 4s, 8s, 16s, 30s

**Server:**
- Log error details
- Send error message to client
- Close connection if fatal

### Message Errors

**Invalid JSON:**
```json
{
  "type": "error",
  "timestamp": 1698765432000,
  "data": {
    "message": "Failed to parse message",
    "error": "Unexpected token in JSON"
  }
}
```

**Unknown Message Type:**
```json
{
  "type": "error",
  "timestamp": 1698765432000,
  "data": {
    "message": "Unknown message type",
    "error": "Type 'invalid-type' not recognized"
  }
}
```

## Best Practices

### Timestamps

- Always use `Date.now()` for current timestamps
- Include timestamp in all messages
- Use for ordering events chronologically

### Client IDs

- Generate once per client session
- Format: `client-{timestamp}-{random}`
- Send in all messages after registration

### Split Numbers

- Master: 0
- Splits: 1-10
- Validate range before sending

### Detection Data

- Keep payload small (<1KB)
- Include only essential information
- Use consistent data structure

### Heartbeats

- Don't skip heartbeats
- Use reliable interval timer
- Handle missed heartbeats gracefully

## Security Considerations

### Current Implementation

- **No authentication:** Any client can connect
- **No encryption:** Messages sent in plain text
- **Local network only:** Not designed for internet use

### Recommended for Production

1. **Authentication:**
   - Add session tokens
   - Validate client identity
   - Limit connections per split number

2. **Encryption:**
   - Use WSS (WebSocket Secure)
   - Implement TLS/SSL certificates
   - Encrypt sensitive data

3. **Rate Limiting:**
   - Limit messages per second
   - Prevent DoS attacks
   - Throttle detection events

4. **Validation:**
   - Validate all message fields
   - Sanitize inputs
   - Check message size limits

## Example Implementations

### Client Registration

```typescript
function register(splitNumber: number, clientId: string) {
  const message = {
    type: 'register',
    splitNumber: splitNumber,
    clientId: clientId,
    timestamp: Date.now()
  };

  ws.send(JSON.stringify(message));
}
```

### Sending Detection Event

```typescript
function sendDetection(intensity: number) {
  const message = {
    type: 'detection-event',
    splitNumber: this.splitNumber,
    clientId: this.clientId,
    timestamp: Date.now(),
    detectionData: {
      intensity: intensity,
      type: 'motion'
    }
  };

  ws.send(JSON.stringify(message));
}
```

### Heartbeat Loop

```typescript
setInterval(() => {
  if (ws.readyState === WebSocket.OPEN) {
    const message = {
      type: 'heartbeat',
      clientId: this.clientId,
      splitNumber: this.splitNumber,
      timestamp: Date.now()
    };

    ws.send(JSON.stringify(message));
  }
}, 5000);
```

## Testing

### Manual Testing

Use a WebSocket client (e.g., `wscat`):

```bash
npm install -g wscat
wscat -c ws://localhost:8080
```

Send test messages:
```json
{"type":"register","splitNumber":1,"clientId":"test-123","timestamp":1698765432000}
{"type":"detection-event","splitNumber":1,"clientId":"test-123","timestamp":1698765433000,"detectionData":{"intensity":50,"type":"motion"}}
```

### Automated Testing

See test files in `server/tests/` (if available) or write integration tests using:
- Jest
- WebSocket testing libraries
- Mock servers

## Changelog

### Version 1.0.0 (Initial)

- Basic registration and detection events
- Heartbeat mechanism
- Client list broadcasting
- Error handling

### Future Enhancements

- Authentication tokens
- Encrypted messages
- Compression for large payloads
- Binary message support
- Event acknowledgments
