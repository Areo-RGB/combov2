# Sprint Timer WebSocket Server

WebSocket server for coordinating multiple split timer devices in the Sprint Timer application.

## Features

- Real-time WebSocket communication
- Client registration and tracking
- Detection event broadcasting
- Heartbeat mechanism for connection health
- Automatic client cleanup on disconnect
- Multi-split coordination

## Installation

```bash
cd server
npm install
```

## Running the Server

```bash
npm start
```

The server will start on port 8080 and display the local IP address for connecting split devices.

## Configuration

The server runs on:
- **Host:** 0.0.0.0 (all network interfaces)
- **Port:** 8080
- **Heartbeat Timeout:** 30 seconds

To change these settings, edit the constants at the top of `server.js`.

## Usage

### Starting the Server

1. Navigate to the server directory
2. Run `npm install` (first time only)
3. Run `npm start`
4. Note the connection URL displayed in the console

### Connecting Splits

1. Open the Angular app on each split device
2. Navigate to the Split View
3. Enter the master server IP (displayed in server console)
4. Choose a unique split number
5. Click "Connect to Master"

### Master View

1. Open the Angular app on the master device
2. Navigate to the Master View
3. The view will automatically connect to localhost:8080
4. Monitor connected splits and detection events

## Message Protocol

### Client to Server

#### Register
```json
{
  "type": "register",
  "splitNumber": 3,
  "clientId": "client-123",
  "timestamp": 1698765432000
}
```

#### Detection Event
```json
{
  "type": "detection-event",
  "splitNumber": 3,
  "clientId": "client-123",
  "timestamp": 1698765432000,
  "detectionData": {
    "intensity": 85,
    "type": "motion"
  }
}
```

#### Heartbeat
```json
{
  "type": "heartbeat",
  "clientId": "client-123",
  "splitNumber": 3,
  "timestamp": 1698765432000
}
```

### Server to Client

#### Welcome
```json
{
  "type": "welcome",
  "timestamp": 1698765432000,
  "data": {
    "clientId": "client-123",
    "assignedSplitNumber": 3,
    "serverTime": 1698765432000
  }
}
```

#### Clients Update
```json
{
  "type": "clients-update",
  "timestamp": 1698765432000,
  "data": {
    "totalClients": 3,
    "clients": [
      {
        "id": "client-123",
        "splitNumber": 1,
        "ipAddress": "192.168.1.101",
        "connectedAt": 1698765432000,
        "lastSeen": 1698765442000
      }
    ]
  }
}
```

#### Detection Broadcast
```json
{
  "type": "detection-broadcast",
  "fromSplit": 1,
  "clientId": "client-123",
  "timestamp": 1698765432000,
  "detectionData": {
    "intensity": 85,
    "type": "motion"
  }
}
```

## Troubleshooting

### Server won't start
- Check if port 8080 is already in use
- Try changing the PORT constant in server.js

### Splits can't connect
- Ensure all devices are on the same network
- Check firewall settings
- Verify the IP address is correct
- Make sure the server is running

### Connection drops
- Check network stability
- Verify heartbeat messages are being sent
- Check server logs for errors

## Development

### Running on Termux (Android)

```bash
# Install Node.js
pkg install nodejs

# Navigate to server directory
cd server

# Install dependencies
npm install

# Run server
npm start
```

### Network Configuration

For local WiFi testing:
- Server should run on a device with a static or known IP
- All split devices must be on the same network
- No internet connection required (local network only)

## License

MIT
