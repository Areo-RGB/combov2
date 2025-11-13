# WebSocket Sprint Timing System - Setup Guide

## Overview

The WebSocket Sprint Timing System enables multi-device coordination for sprint timing using real-time WebSocket communication. This system consists of:

1. **Node.js WebSocket Server** - Central communication hub
2. **Master View** - Dashboard for monitoring all connected splits
3. **Split Views** - Individual motion detection devices

## System Requirements

### Server Requirements
- Node.js (v14 or higher)
- npm or pnpm
- Network access (WiFi)

### Client Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Camera access for motion detection
- Same WiFi network as the server

## Installation

### 1. Server Setup

Navigate to the server directory and install dependencies:

```bash
cd server
npm install
```

### 2. Angular App

No additional dependencies are required. The WebSocket infrastructure is included in the existing Angular app.

## Starting the System

### Step 1: Start the WebSocket Server

```bash
cd server
npm start
```

The server will display:
- Local IP address
- Connection URL (e.g., `ws://192.168.1.100:8080`)
- Port number (default: 8080)

**Important:** Note the IP address displayed - you'll need this to connect split devices.

### Step 2: Start the Angular App

In a separate terminal:

```bash
cd ..  # Back to project root
pnpm dev
```

The app will be available at `http://localhost:4200`

### Step 3: Set Up Master View

1. Open the Angular app in a browser
2. Click "Master View" from the main menu
3. The master will automatically connect to `localhost:8080`
4. You should see the server URL and connection status

### Step 4: Set Up Split Devices

On each split device:

1. Open the Angular app (use the server's IP: `http://192.168.1.100:4200`)
2. Click "Split Timer" from the main menu
3. Enter the master server's IP address (e.g., `192.168.1.100`)
4. Choose a unique split number (1-10)
5. Click "Connect to Master"

## Network Configuration

### Same Device (Development/Testing)

For testing on a single device:
- **Master IP:** `localhost`
- **Split IP:** `localhost`
- All components run on the same machine

### Multiple Devices (Production)

For production use with multiple devices:

1. **Find the server's local IP:**
   - The server displays this on startup
   - Alternatively:
     - Windows: `ipconfig`
     - macOS/Linux: `ifconfig` or `ip addr`
     - Look for IPv4 address (e.g., `192.168.1.100`)

2. **Ensure all devices are on the same WiFi network**

3. **Configure split devices:**
   - Master IP: Server's local IP (e.g., `192.168.1.100`)
   - Port: 8080 (default)

### Firewall Configuration

If splits cannot connect:

1. **Check firewall settings**
   - Allow incoming connections on port 8080
   - Add exception for Node.js

2. **Windows Firewall:**
   ```powershell
   netsh advfirewall firewall add rule name="WebSocket Server" dir=in action=allow protocol=TCP localport=8080
   ```

3. **macOS Firewall:**
   - System Preferences → Security & Privacy → Firewall
   - Add Node.js to allowed apps

4. **Linux (ufw):**
   ```bash
   sudo ufw allow 8080/tcp
   ```

## Usage

### Master View Features

- **Server Status Panel:** Shows connection URL and split count
- **Connected Splits List:** Real-time list of connected devices
- **Detection Events Stream:** Live feed of motion detection events
- **Statistics:** Total detections, active splits, event count

### Master View Actions

- **Copy URL:** Copy server URL to clipboard
- **Export Events:** Download event log as JSON
- **Clear Log:** Clear event history

### Split View Features

- **Connection Panel:** Connect to master server
- **Detection Status:** Shows connection state
- **Motion Detection:** Integrated detector component
- **Auto-Send Events:** Detection events automatically sent to master

### Split View Workflow

1. **Enter Connection Details:**
   - Master IP address
   - Split number (1-10)

2. **Connect:**
   - Click "Connect to Master"
   - Wait for connection confirmation

3. **Start Detection:**
   - Click "Start Detection" on the detector
   - Motion events are automatically sent to master

4. **Monitor:**
   - Connection status shown in header
   - Master view displays all events

## Troubleshooting

### Server Won't Start

**Problem:** Port 8080 already in use

**Solution:**
```bash
# Check what's using port 8080
# Linux/macOS:
lsof -i :8080

# Windows:
netstat -ano | findstr :8080

# Kill the process or change the port in server/server.js
```

### Splits Can't Connect

**Problem:** Connection timeout or error

**Checklist:**
1. ✅ Server is running
2. ✅ All devices on same network
3. ✅ Correct IP address entered
4. ✅ Firewall allows port 8080
5. ✅ No VPN/proxy interfering

**Test connectivity:**
```bash
# From split device, ping the server
ping 192.168.1.100

# Try accessing server from browser
http://192.168.1.100:8080
```

### Connection Drops

**Problem:** Splits disconnect unexpectedly

**Causes:**
- Poor WiFi signal
- Network congestion
- Server crashed

**Solutions:**
- Move devices closer to router
- Restart server
- Check server logs for errors
- Verify heartbeat mechanism working

### Detection Events Not Appearing

**Problem:** Detection works but events don't show on master

**Checklist:**
1. ✅ Split is connected (check master's connected list)
2. ✅ Detection is started
3. ✅ Motion is being detected (check split's detector)
4. ✅ WebSocket connection active

**Debug:**
- Open browser console (F12)
- Look for WebSocket errors
- Check server logs for message receipt

## Mobile Deployment

### Android (Capacitor)

1. **Build the app:**
   ```bash
   pnpm build:android
   ```

2. **Configure network:**
   - Use server's network IP (not localhost)
   - Ensure phone is on same WiFi

3. **Camera permissions:**
   - Granted automatically via Capacitor

### iOS (Future)

Similar to Android, but requires:
- macOS with Xcode
- iOS device or simulator
- Apple Developer account (for device testing)

## Performance Tips

### Server

- Run on a stable device (not a phone)
- Use wired connection if possible
- Keep server terminal visible for monitoring

### Splits

- Good lighting for motion detection
- Stable positioning of cameras
- Minimize background movement
- Test detection before connecting

### Network

- Use 5GHz WiFi if available
- Minimize distance from router
- Reduce network congestion (pause downloads, etc.)

## Advanced Configuration

### Custom Port

Edit `server/server.js`:
```javascript
const PORT = 8080; // Change to your desired port
```

### Heartbeat Interval

Adjust connection health check frequency:
```javascript
const HEARTBEAT_TIMEOUT = 30000; // milliseconds
```

### Detection Settings

Configure motion detection sensitivity in the Angular app:
1. Go to "Detection Settings" from main menu
2. Adjust sensitivity, cooldown, etc.
3. Settings apply to all detection modes

## API Reference

See `docs/MESSAGE_PROTOCOL.md` for detailed WebSocket message formats.

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs
3. Check browser console for errors
4. Refer to `server/README.md` for server-specific details
