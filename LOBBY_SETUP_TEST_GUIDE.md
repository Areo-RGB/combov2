# Local Lobby Setup Testing Guide

Complete guide for testing the local lobby setup feature with physical Android devices via ADB.

## 📋 Prerequisites

### Hardware
- **Host Device**: Xiaomi phone (will create the lobby)
- **Client Device(s)**: 1-3 additional Android smartphones
- USB cables for each device
- All devices should have:
  - Bluetooth capability
  - Android 7.0+ (API level 24+)
  - Developer mode enabled
  - USB debugging enabled

### Software
- Android Studio installed (for ADB)
- Node.js and pnpm installed
- USB drivers for your devices installed

### Permissions Required
The app needs these permissions (should be in AndroidManifest.xml):
- `BLUETOOTH`
- `BLUETOOTH_ADMIN`
- `BLUETOOTH_SCAN`
- `BLUETOOTH_ADVERTISE`
- `BLUETOOTH_CONNECT`
- `ACCESS_FINE_LOCATION` (required for BLE scanning on Android)
- `INTERNET` (for initial setup, not required for lobby operation)

---

## 🔧 Part 1: Build and Install

### Step 1: Build the Android APK

```bash
cd /home/user/combov2

# Sync Capacitor configuration
pnpm cap:sync

# Build the project
pnpm build:android

# This opens Android Studio - you can also build via command line:
# cd android && ./gradlew assembleDebug
```

**Alternative: Build via Android Studio**
1. Open Android Studio
2. Open the `android` folder from your project
3. Wait for Gradle sync to complete
4. Go to **Build > Build Bundle(s) / APK(s) > Build APK(s)**
5. APK will be in: `android/app/build/outputs/apk/debug/app-debug.apk`

### Step 2: Prepare Devices

**On each device:**

1. **Enable Developer Options**:
   - Go to Settings > About Phone
   - Tap "Build Number" 7 times
   - Enter your PIN/password

2. **Enable USB Debugging**:
   - Go to Settings > Developer Options
   - Enable "USB debugging"
   - Enable "Install via USB" (if available)

3. **Connect via USB**:
   - Connect device to computer
   - Accept the "Allow USB debugging" prompt on the device
   - Trust the computer if prompted

### Step 3: Verify ADB Connection

```bash
# List all connected devices
adb devices

# Expected output:
# List of devices attached
# ABC123DEF456    device  (Xiaomi - Host)
# XYZ789GHI012    device  (Client 1)
# ... more devices
```

**If multiple devices show:**
```bash
# You'll need to specify device for each command using -s flag
adb -s ABC123DEF456 <command>
```

### Step 4: Install APK on All Devices

**Method 1: Install from build output**
```bash
# If you have the APK path from Android Studio build
adb -s <DEVICE_SERIAL> install android/app/build/outputs/apk/debug/app-debug.apk

# Example for Xiaomi (host):
adb -s ABC123DEF456 install android/app/build/outputs/apk/debug/app-debug.apk

# For each client:
adb -s XYZ789GHI012 install android/app/build/outputs/apk/debug/app-debug.apk
```

**Method 2: Push and install**
```bash
# Copy APK to device
adb -s <DEVICE_SERIAL> push android/app/build/outputs/apk/debug/app-debug.apk /sdcard/Download/

# Install from device
adb -s <DEVICE_SERIAL> shell pm install -r /sdcard/Download/app-debug.apk
```

**Method 3: Install on all devices at once**
```bash
# Install on all connected devices
adb devices | grep device$ | cut -f1 | xargs -I {} adb -s {} install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 🌐 Part 2: Network Setup (Optional but Recommended)

While the lobby uses Bluetooth for discovery and WebRTC for data (no internet required), having a local network can help with stability.

### Step 1: Create WiFi Hotspot on Host (Xiaomi)

1. **On Xiaomi (Host Device)**:
   - Go to Settings > Connection & sharing
   - Tap "Portable hotspot"
   - Configure:
     - **Network name**: `CombovLobby`
     - **Password**: Set a password (e.g., `combov123`)
     - **Security**: WPA2-PSK
   - Turn on the hotspot

### Step 2: Connect Client Devices to Hotspot

1. **On each client device**:
   - Go to Settings > WiFi
   - Find and connect to `CombovLobby`
   - Enter the password

2. **Verify connection**:
```bash
# Check IP address of each device
adb -s <HOST_SERIAL> shell ip addr show wlan0 | grep inet
adb -s <CLIENT_SERIAL> shell ip addr show wlan0 | grep inet

# Example output:
# Host:   inet 192.168.43.1/24
# Client: inet 192.168.43.123/24
```

---

## 📱 Part 3: Bluetooth Setup

### Step 1: Enable Bluetooth on All Devices

```bash
# Enable Bluetooth via ADB (if needed)
adb -s <DEVICE_SERIAL> shell settings put global bluetooth_on 1

# Or do it manually on each device:
# Settings > Bluetooth > Turn ON
```

### Step 2: Make Devices Discoverable (Optional)

While the app handles BLE advertising, you can make devices more visible:

```bash
# Set device to discoverable mode (120 seconds)
adb -s <DEVICE_SERIAL> shell am start -a android.bluetooth.adapter.action.REQUEST_DISCOVERABLE

# Check Bluetooth status
adb -s <DEVICE_SERIAL> shell dumpsys bluetooth_manager | grep "enabled"
```

### Step 3: Grant Location Permissions

BLE scanning requires location permissions on Android:

```bash
# Grant location permissions to the app
adb -s <DEVICE_SERIAL> shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION
adb -s <DEVICE_SERIAL> shell pm grant com.motionsignal.app android.permission.ACCESS_COARSE_LOCATION

# Grant Bluetooth permissions (Android 12+)
adb -s <DEVICE_SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb -s <DEVICE_SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb -s <DEVICE_SERIAL> shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
```

---

## 🧪 Part 4: Testing the Lobby Setup

### Test Scenario 1: Host Creates Lobby

**On Xiaomi (Host Device)**:

1. **Launch the app**:
```bash
adb -s <HOST_SERIAL> shell am start -n com.motionsignal.app/.MainActivity
```

2. **Navigate to Lobby Setup**:
   - Tap the "Lobby Setup" card (pink icon with WiFi symbol)
   - You should see the selection screen

3. **Create Lobby**:
   - Device name field should show `Android-XXX` (auto-generated)
   - Edit if desired (e.g., "Xiaomi-Host")
   - Tap "Create Lobby" button
   - **Expected**: Transitions to Host View

4. **Verify Host View**:
   - Check lobby ID is displayed (e.g., `A1B2C3`)
   - "Connected Devices" section shows "0"
   - "Waiting for devices to connect..." message
   - Write down the **Lobby ID** - you'll need it for clients!

5. **Monitor ADB logs** (optional):
```bash
adb -s <HOST_SERIAL> logcat | grep -E "Lobby|Bluetooth|BLE"
```

**Expected logs**:
```
BluetoothLobbyService: Starting host lobby: A1B2C3
BluetoothLobbyService: Advertising with name: Lobby-A1B2C3
```

---

### Test Scenario 2: Client Joins Lobby

**On Client Device #1**:

1. **Launch the app**:
```bash
adb -s <CLIENT_SERIAL> shell am start -n com.motionsignal.app/.MainActivity
```

2. **Navigate to Lobby Setup**:
   - Tap the "Lobby Setup" card

3. **Join Lobby**:
   - Device name: Edit to something identifiable (e.g., "Samsung-Client1")
   - Lobby ID: Enter the ID from host (e.g., `A1B2C3`)
   - Tap "Join Lobby" button
   - **Expected**: "Connecting..." message, then transitions to Client View

4. **Verify Client View**:
   - "Connected to Host" message
   - Shows lobby ID: `A1B2C3`
   - "Waiting for host to complete setup..." message
   - Standby mode indicator

5. **Monitor client logs**:
```bash
adb -s <CLIENT_SERIAL> logcat | grep -E "Lobby|Bluetooth|BLE"
```

**Expected logs**:
```
BluetoothLobbyService: Scanning for lobby: A1B2C3
BluetoothLobbyService: Found host: Lobby-A1B2C3
BluetoothLobbyService: Connected to host
LocalLobbyService: Sending device info to host
```

---

### Test Scenario 3: Host Sees Connected Client

**Back on Xiaomi (Host Device)**:

1. **Check Host View**:
   - Device count should update to "1"
   - New device card appears with:
     - Name: "Samsung-Client1"
     - Status: 🔴 "Disconnected" or 🟡 "Connecting..."
   - **This is normal** - Bluetooth connection is established but WebRTC isn't

2. **Host logs should show**:
```bash
adb -s <HOST_SERIAL> logcat | grep -E "Lobby"
```

**Expected logs**:
```
BluetoothLobbyService: Received device info from client
LocalLobbyService: Added device: Samsung-Client1
```

---

### Test Scenario 4: Establish WebRTC Connections

**On Xiaomi (Host Device)**:

1. **Establish Connections**:
   - Tap "Establish WebRTC Connections" button
   - **Expected**:
     - Button shows "Establishing Connections..."
     - Device status changes to 🟡 "Setting up..."

2. **Wait for WebRTC handshake**:
   - This involves:
     - Host creates WebRTC offer
     - Sends via Bluetooth to client (chunked)
     - Client receives offer, creates answer
     - Client sends answer back via Bluetooth
     - Both sides establish peer connection

3. **Verify connection**:
   - Device status should change to 🟢 "Connected"
   - "WebRTC Ready" badge appears
   - Green checkmark ✓ appears if all devices ready

4. **Monitor WebRTC setup**:
```bash
# Host logs
adb -s <HOST_SERIAL> logcat | grep -E "RTC|WebRTC|Offer|Answer"

# Client logs
adb -s <CLIENT_SERIAL> logcat | grep -E "RTC|WebRTC|Offer|Answer"
```

**Expected logs (Host)**:
```
LocalLobbyService: Creating WebRTC connection for device-abc123
LocalLobbyService: Offer sent for device: device-abc123
BluetoothLobbyService: Broadcasting offer (X chunks)
LocalLobbyService: Received answer from device-abc123
LocalLobbyService: Device device-abc123 RTC ready
```

**Expected logs (Client)**:
```
BluetoothLobbyService: Received offer from host
LocalLobbyService: Handling offer, creating answer
LocalLobbyService: Answer sent to host
RTCPeerConnection: ICE connection state: connected
```

---

### Test Scenario 5: Complete Setup

**On Xiaomi (Host Device)**:

1. **Complete Setup**:
   - Once all devices show 🟢 "Connected" and "WebRTC Ready"
   - Green "✓ Complete Setup" button appears
   - Tap it

2. **Verify Setup Complete**:
   - Success message appears:
     - ✓ "Setup Complete!"
     - "Return to the main menu to select a game mode"
   - "Back to Menu" button available

3. **Return to Main Menu**:
   - Tap "Back to Menu"
   - You're back at the landing page
   - **Host is now ready to select a mode**

**On Client Devices**:
- Should still show "Waiting for host..." message
- This is correct - clients wait for mode selection

---

### Test Scenario 6: Mode Propagation

**On Xiaomi (Host Device)**:

1. **Select a Mode**:
   - From landing page, tap any mode card:
     - "Sprint Duels" (cyan)
     - "Motion Games" (purple)
     - "Team Duels" (green)
     - "Sprint Timing" (orange)
   - Example: Tap "Sprint Duels"

2. **Host enters mode**:
   - Sprint Duels interface loads on host
   - **Expected**: Mode is broadcast to all clients

**On Client Devices**:

1. **Automatic mode switch**:
   - Client should automatically navigate from lobby waiting screen
   - **Directly to Sprint Duels interface**
   - No user interaction required!

2. **Verify on multiple clients**:
```bash
# Check activity on all devices
adb -s <HOST_SERIAL> shell dumpsys activity activities | grep mResumedActivity
adb -s <CLIENT1_SERIAL> shell dumpsys activity activities | grep mResumedActivity
adb -s <CLIENT2_SERIAL> shell dumpsys activity activities | grep mResumedActivity
```

3. **Check logs**:
```bash
# Host logs
adb -s <HOST_SERIAL> logcat | grep "mode-selected"

# Client logs
adb -s <CLIENT_SERIAL> logcat | grep "mode-selected"
```

**Expected logs (Host)**:
```
LocalLobbyService: Broadcasting mode change: sprint-duels
BluetoothLobbyService: Notifying mode change to all clients
```

**Expected logs (Client)**:
```
LocalLobbyService: Received mode selection: sprint-duels
AppComponent: Switching to mode: sprint-duels
```

---

### Test Scenario 7: Mode Changes

**Test that subsequent mode changes also propagate**:

1. **On Host**: Tap back button to return to main menu
2. **On Host**: Select a different mode (e.g., "Team Duels")
3. **On Clients**: Should automatically switch to Team Duels

**Verify**:
- All devices show the same mode
- Transitions are smooth and automatic
- No lag or disconnections

---

## 🔍 Part 5: Troubleshooting

### Issue 1: Client Can't Find Host

**Symptoms**: Client stays on "Connecting..." indefinitely

**Debug Steps**:

1. **Verify Bluetooth is enabled**:
```bash
adb shell settings get global bluetooth_on
# Should return: 1
```

2. **Check if host is advertising**:
```bash
adb -s <HOST_SERIAL> logcat | grep "startAdvertising"
```

3. **Check if client is scanning**:
```bash
adb -s <CLIENT_SERIAL> logcat | grep "requestLEScan"
```

4. **Verify permissions**:
```bash
adb shell dumpsys package com.motionsignal.app | grep permission
```

5. **Try these fixes**:
   - Move devices closer together (within 10 meters)
   - Turn Bluetooth off/on on both devices
   - Restart the app on both devices
   - Clear app data: `adb shell pm clear com.motionsignal.app`

---

### Issue 2: Bluetooth Connected but WebRTC Fails

**Symptoms**: Device shows 🟡 yellow status, never turns green

**Debug Steps**:

1. **Check WebRTC logs**:
```bash
adb logcat | grep -E "RTCPeerConnection|ICE|SDP"
```

2. **Look for errors**:
```bash
adb logcat *:E | grep -E "RTC|WebRTC"
```

3. **Common causes**:
   - SDP offer/answer not fully transmitted (chunking issue)
   - ICE gathering timeout
   - Network firewall (if using WiFi hotspot)

4. **Try these fixes**:
   - Ensure devices are on same local network
   - Increase chunk delay in BluetoothLobbyService (line 130: `setTimeout(r, 10)` → `setTimeout(r, 50)`)
   - Check for BLE connection drops

---

### Issue 3: Mode Not Propagating to Clients

**Symptoms**: Host switches mode, clients stay in lobby

**Debug Steps**:

1. **Verify setup is complete**:
```bash
# Should show "true"
adb logcat | grep "isSetupComplete"
```

2. **Check data channel**:
```bash
adb logcat | grep "dataChannel.*open"
```

3. **Verify message sending**:
```bash
# Host
adb -s <HOST_SERIAL> logcat | grep "broadcastModeChange"

# Client
adb -s <CLIENT_SERIAL> logcat | grep "mode-selected"
```

4. **Try these fixes**:
   - Wait a few seconds after completing setup
   - Ensure WebRTC data channel is open (check green status)
   - Try selecting mode again

---

### Issue 4: App Crashes on Launch

**Debug Steps**:

1. **Get crash logs**:
```bash
adb logcat | grep -E "AndroidRuntime|FATAL"
```

2. **Check for missing permissions**:
```bash
adb logcat | grep "SecurityException"
```

3. **Common fixes**:
```bash
# Reinstall app
adb uninstall com.motionsignal.app
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Clear cache
adb shell pm clear com.motionsignal.app

# Grant all permissions
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
adb shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION
```

---

## 📊 Part 6: Verification Checklist

Use this checklist to verify all functionality:

### Basic Connectivity
- [ ] Host creates lobby successfully
- [ ] Lobby ID is generated and displayed
- [ ] Client can scan and find host via Bluetooth
- [ ] Client device appears in host's device list
- [ ] Device name is correctly displayed

### WebRTC Setup
- [ ] "Establish WebRTC Connections" button appears
- [ ] Device status changes from 🔴 → 🟡 → 🟢
- [ ] "WebRTC Ready" badge appears for all devices
- [ ] "Complete Setup" button appears when all ready
- [ ] Setup completion message shows

### Mode Propagation
- [ ] Host can return to main menu after setup
- [ ] Host can select any game mode
- [ ] All clients automatically switch to selected mode
- [ ] Mode changes propagate without user interaction
- [ ] No disconnections during mode switches

### Multi-Client Testing (if 3+ devices)
- [ ] Multiple clients can join same lobby
- [ ] All clients appear in host's device list
- [ ] WebRTC works for all clients simultaneously
- [ ] Mode propagates to all clients at once
- [ ] System handles 3+ devices without lag

### Edge Cases
- [ ] Client can go back and rejoin
- [ ] Host can restart lobby after completion
- [ ] App handles Bluetooth interruptions gracefully
- [ ] App handles background/foreground transitions
- [ ] No memory leaks after multiple sessions

---

## 🎯 Part 7: Advanced Testing

### Test Multiple Clients Simultaneously

```bash
# Terminal 1: Monitor host
adb -s <HOST_SERIAL> logcat -c && adb -s <HOST_SERIAL> logcat | grep Lobby

# Terminal 2: Monitor client 1
adb -s <CLIENT1_SERIAL> logcat -c && adb -s <CLIENT1_SERIAL> logcat | grep Lobby

# Terminal 3: Monitor client 2
adb -s <CLIENT2_SERIAL> logcat -c && adb -s <CLIENT2_SERIAL> logcat | grep Lobby
```

### Performance Testing

```bash
# Monitor memory usage
adb shell dumpsys meminfo com.motionsignal.app

# Monitor CPU usage
adb shell top -n 1 | grep com.motionsignal.app

# Monitor Bluetooth activity
adb shell dumpsys bluetooth_manager
```

### Stress Testing

1. **Rapid mode switches**:
   - Host rapidly switches between modes
   - Verify clients keep up without errors

2. **Connection/disconnection**:
   - Client leaves and rejoins lobby
   - Verify host handles disconnection gracefully

3. **Background/foreground**:
   - Put app in background during setup
   - Verify state is preserved

---

## 📝 Part 8: Test Results Template

Copy and fill this out after testing:

```
## Test Results - [Date]

### Environment
- Host Device: Xiaomi [Model]
- Client Devices: [List models]
- Android Versions: [List]
- App Version: [Commit hash]

### Test Results

#### Basic Connectivity: PASS / FAIL
- Notes:

#### WebRTC Setup: PASS / FAIL
- Time to establish: [X] seconds
- Notes:

#### Mode Propagation: PASS / FAIL
- Latency: [X] ms
- Notes:

#### Multi-Client: PASS / FAIL
- Number of clients tested: [X]
- Notes:

### Issues Found
1. [Issue description]
   - Steps to reproduce:
   - Logs:
   - Workaround:

2. [Issue description]
   - Steps to reproduce:
   - Logs:
   - Workaround:

### Performance
- Memory usage: [X] MB
- CPU usage: [X]%
- Battery drain: [High/Medium/Low]

### Recommendations
- [Any suggestions for improvement]
```

---

## 🚀 Quick Reference Commands

```bash
# === Installation ===
# Install on specific device
adb -s SERIAL install -r app-debug.apk

# Install on all devices
adb devices | grep device$ | cut -f1 | xargs -I {} adb -s {} install -r app-debug.apk

# === Permissions ===
# Grant all Bluetooth permissions (Android 12+)
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
adb shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION

# === Launch App ===
adb shell am start -n com.motionsignal.app/.MainActivity

# === Debugging ===
# Live logs for lobby
adb logcat | grep -E "Lobby|Bluetooth|WebRTC|RTC"

# Clear logs and start fresh
adb logcat -c

# Save logs to file
adb logcat > logs/device-$(date +%Y%m%d-%H%M%S).log

# === Cleanup ===
# Clear app data
adb shell pm clear com.motionsignal.app

# Uninstall app
adb uninstall com.motionsignal.app

# === Device Info ===
# Get device model
adb shell getprop ro.product.model

# Get Android version
adb shell getprop ro.build.version.release

# Get Bluetooth status
adb shell dumpsys bluetooth_manager | grep "enabled"
```

---

## 🎓 Expected Behavior Summary

**Successful Lobby Setup Flow:**

1. ✅ Host creates lobby → Generates lobby ID
2. ✅ Host starts advertising via BLE → Other devices can discover
3. ✅ Client scans and finds host → Connects via Bluetooth
4. ✅ Client sends device info → Appears in host's device list
5. ✅ Host establishes WebRTC → Creates offer, sends via BLE
6. ✅ Client receives offer → Creates answer, sends via BLE
7. ✅ Host receives answer → WebRTC connection established
8. ✅ Both sides confirm → Status turns green
9. ✅ Host completes setup → Ready for mode selection
10. ✅ Host selects mode → Broadcasts via WebRTC data channel
11. ✅ Clients receive mode → Automatically switch to same mode
12. ✅ All devices in sync → Ready to play together!

**Communication Flow:**
```
[Host BLE Advertising] ←→ [Client BLE Scanning]
         ↓
[Bluetooth Connection Established]
         ↓
[Host creates WebRTC Offer] → [BLE chunks] → [Client receives offer]
         ↓
[Client creates WebRTC Answer] → [BLE chunks] → [Host receives answer]
         ↓
[WebRTC Data Channel Open - Direct P2P]
         ↓
[Host selects mode] → [WebRTC Data] → [Clients auto-switch]
```

---

Good luck with testing! 🎉
