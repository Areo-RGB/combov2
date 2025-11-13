# Local Lobby Setup - Implementation Status

## ✅ FULLY IMPLEMENTED

**Good news!** The BLE signaling plugin **IS implemented** and ready to use. All components are in place.

## 🏗️ Architecture Overview

### TypeScript/Angular Layer
Located in `src/`:

1. **`services/bluetooth-lobby.service.ts`** - BLE communication layer
   - Handles device discovery via Bluetooth LE
   - Manages chunked message protocol (180-byte chunks)
   - Supports host (peripheral) and client (central) modes

2. **`services/local-lobby.service.ts`** - Lobby state management
   - Manages WebRTC peer connections
   - Tracks device status and readiness
   - Implements mode broadcasting

3. **`components/lobby-setup/`** - UI components
   - Host view: Create lobby, manage connections
   - Client view: Join lobby, wait for setup
   - Real-time status indicators

### Native Android Layer
Located in `android/app/src/main/java/com/motionsignal/app/`:

1. **`BleSignalingPlugin.java`** - Custom Capacitor plugin
   - **Status**: ✅ Fully implemented
   - **Methods**:
     - `startAdvertising()` - Starts BLE advertising and GATT server
     - `stopAdvertising()` - Stops advertising and closes GATT server
     - `notifyTx()` - Sends notifications to connected clients
   - **Events**:
     - `rxWritten` - Fires when client writes data
   - **Features**:
     - GATT server with custom service UUID
     - RX characteristic for receiving data
     - TX characteristic for sending notifications
     - Annotated with `@CapacitorPlugin`

2. **`MainActivity.java`** - App entry point
   - **CRITICAL**: Plugin is registered **BEFORE** `super.onCreate()`
   - This ensures the plugin is available when the bridge initializes
   - Code:
     ```java
     @Override
     public void onCreate(Bundle savedInstanceState) {
         registerPlugin(BleSignalingPlugin.class);  // MUST be first!
         super.onCreate(savedInstanceState);
     }
     ```

3. **`AndroidManifest.xml`** - Permissions and configuration
   - All required Bluetooth permissions:
     - Android 12+: `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, `BLUETOOTH_ADVERTISE`
     - Android 11 and below: `ACCESS_FINE_LOCATION`, `BLUETOOTH`, `BLUETOOTH_ADMIN`

## 📁 File Locations

```
combov2/
├── src/                                    # TypeScript/Angular
│   ├── services/
│   │   ├── bluetooth-lobby.service.ts      ✅ Implemented
│   │   └── local-lobby.service.ts          ✅ Implemented
│   └── components/
│       └── lobby-setup/                    ✅ Implemented
│           ├── lobby-setup.component.ts
│           └── lobby-setup.component.html
│
├── android/                                # Android native
│   └── app/src/main/
│       ├── java/com/motionsignal/app/
│       │   ├── BleSignalingPlugin.java     ✅ Implemented
│       │   └── MainActivity.java           ✅ Implemented
│       └── AndroidManifest.xml             ✅ Configured
│
├── app/                                    # Android source templates
│   └── src/main/
│       ├── java/com/motionsignal/app/
│       │   └── BleSignalingPlugin.java     (source copy)
│       └── AndroidManifest.xml             (source copy)
│
├── setup-lobby.sh                          🔧 Setup script
├── verify-ble-plugin.sh                    ✅ Verification script
└── LOBBY_SETUP_TEST_GUIDE.md              📖 Testing guide
```

## 🚀 Quick Start

### 1. Verify Setup

```bash
./verify-ble-plugin.sh
```

**Expected output:**
```
✨ All checks passed! Setup looks good.
```

### 2. Build APK

```bash
# Option A: Using Gradle directly
cd android && ./gradlew assembleDebug

# Option B: Using npm script
pnpm build:android

# Option C: Using Android Studio
npx cap open android
# Then: Build > Build Bundle(s) / APK(s) > Build APK(s)
```

**APK Location:**
```
android/app/build/outputs/apk/debug/app-debug.apk
```

### 3. Install on Devices

```bash
# List connected devices
adb devices

# Install on specific device
adb -s <DEVICE_SERIAL> install -r android/app/build/outputs/apk/debug/app-debug.apk

# Install on all devices at once
adb devices | grep device$ | cut -f1 | xargs -I {} adb -s {} install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 4. Grant Permissions

```bash
# For each device (replace <SERIAL> with device ID from 'adb devices')
adb -s <SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb -s <SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
adb -s <SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb -s <SERIAL> shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION
```

### 5. Test the Lobby

See **`LOBBY_SETUP_TEST_GUIDE.md`** for complete testing instructions.

**Quick test:**
1. On Xiaomi (host): Launch app → Tap "Lobby Setup" → "Create Lobby"
2. Note the Lobby ID (e.g., `A1B2C3`)
3. On client devices: Launch app → "Lobby Setup" → Enter Lobby ID → "Join Lobby"
4. On host: "Establish WebRTC Connections" → Wait for 🟢 → "Complete Setup"
5. On host: Return to menu → Select any game mode
6. On clients: Should automatically switch to the same mode! ✨

## 🔍 Troubleshooting

### "Plugin not found" errors

**Cause:** APK was built before plugin was added

**Solution:**
```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew assembleDebug

# Reinstall
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

### BLE discovery not working

**Cause:** Missing permissions or Bluetooth disabled

**Solution:**
```bash
# Check Bluetooth status
adb shell settings get global bluetooth_on  # Should return 1

# Enable Bluetooth
adb shell svc bluetooth enable

# Re-grant permissions
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION
```

### WebRTC won't connect

**Cause:** Network issues or firewall

**Solution:**
1. Ensure devices are on same local network (WiFi hotspot)
2. Check if devices can ping each other
3. Try increasing chunk delay in `bluetooth-lobby.service.ts`:
   ```typescript
   await new Promise((r) => setTimeout(r, 50)); // was 10ms
   ```

### Logs show "BleSignaling plugin not available"

**Cause:** Plugin not registered or Capacitor not synced

**Solution:**
```bash
# Re-sync Capacitor
npx cap sync android

# Verify plugin is in build
cd android
./gradlew app:dependencies | grep -i capacitor

# Rebuild
./gradlew clean assembleDebug
```

## 📊 Component Status

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| BleSignalingPlugin.java | ✅ Complete | `android/.../BleSignalingPlugin.java` | Handles BLE advertising & GATT |
| BluetoothLobbyService | ✅ Complete | `src/services/bluetooth-lobby.service.ts` | BLE communication layer |
| LocalLobbyService | ✅ Complete | `src/services/local-lobby.service.ts` | Lobby state management |
| LobbySetupComponent | ✅ Complete | `src/components/lobby-setup/` | UI for host and clients |
| AndroidManifest.xml | ✅ Configured | `android/.../AndroidManifest.xml` | All BLE permissions added |
| App Integration | ✅ Complete | `src/app.component.ts` | Mode propagation working |
| Testing Guide | ✅ Complete | `LOBBY_SETUP_TEST_GUIDE.md` | Step-by-step instructions |

## 🎯 How It Works

### Discovery Phase (Bluetooth LE)

1. **Host** starts BLE advertising:
   - Service UUID: `6E400011-B5A3-F393-E0A9-E50E24DCCA9E`
   - Device name: `Lobby-{LOBBY_ID}`
   - GATT server with RX/TX characteristics

2. **Clients** scan for services:
   - Filter by service UUID
   - Match device name prefix `Lobby-{LOBBY_ID}`
   - Connect and register for notifications

### Signaling Phase (Bluetooth LE)

3. **Client** sends device info:
   - Writes to RX characteristic (host receives)
   - Message: `{type: 'device-info', deviceId, deviceName}`

4. **Host** creates WebRTC offer:
   - Generates SDP offer
   - Chunks into 180-byte segments
   - Sends via TX notifications to client

5. **Client** creates WebRTC answer:
   - Receives and reassembles SDP offer
   - Generates SDP answer
   - Chunks and writes to RX characteristic

6. **Host** receives answer:
   - Reassembles SDP answer
   - Completes WebRTC handshake

### Data Phase (WebRTC)

7. **WebRTC data channel** established:
   - Direct peer-to-peer connection
   - No internet required (local network only)
   - Used for mode propagation and game data

8. **Mode propagation**:
   - Host selects mode from menu
   - Sends mode name via WebRTC data channel
   - All clients automatically switch to same mode

## 🔐 Security Notes

- All communication is local (no internet required after initial setup)
- WebRTC uses no ICE servers (local network only)
- BLE uses standard GATT security
- No authentication implemented (devices trust lobby ID)
- Consider adding lobby password for production use

## 📱 Android Version Compatibility

| Android Version | API Level | BLE Support | Notes |
|----------------|-----------|-------------|-------|
| Android 13+ | 33+ | ✅ Full | BLUETOOTH_* permissions |
| Android 12 | 31-32 | ✅ Full | BLUETOOTH_* permissions |
| Android 11 | 30 | ✅ Full | Requires location permissions |
| Android 10 | 29 | ✅ Full | Requires location permissions |
| Android 9 | 28 | ✅ Full | Requires location permissions |
| Android 8 | 26-27 | ✅ Full | Requires location permissions |
| Android 7 | 24-25 | ✅ Full | Requires location permissions |

**Minimum supported:** Android 7.0 (API 24)

## 🧪 Testing Checklist

- [ ] Build APK successfully
- [ ] Install on all test devices
- [ ] Grant all Bluetooth permissions
- [ ] Host creates lobby and gets ID
- [ ] Client discovers and connects via BLE
- [ ] Device appears in host's list
- [ ] WebRTC handshake completes (🟢 status)
- [ ] Host completes setup
- [ ] Host selects game mode
- [ ] Clients auto-switch to same mode
- [ ] No crashes or disconnections

## 📚 Additional Resources

- **Testing Guide:** `LOBBY_SETUP_TEST_GUIDE.md` - Complete testing workflow
- **Verification Script:** `./verify-ble-plugin.sh` - Check if setup is correct
- **Setup Script:** `./setup-lobby.sh` - Initialize Android project
- **Capacitor Docs:** https://capacitorjs.com/docs/plugins/creating-plugins
- **Android BLE Guide:** https://developer.android.com/guide/topics/connectivity/bluetooth-le

## 🎉 Summary

**The lobby feature is fully implemented and ready for testing!**

All you need to do is:
1. Build the APK: `cd android && ./gradlew assembleDebug`
2. Install on devices: `adb install -r app/build/outputs/apk/debug/app-debug.apk`
3. Grant permissions and test!

The BleSignaling plugin exists, is properly configured, and has all necessary functionality for local multi-device lobbies without internet.

Happy testing! 🚀
