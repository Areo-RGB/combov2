# Debugging BLE Lobby Issues with Logcat

## 🔍 Critical Fixes Applied

The BleSignaling plugin had **silent failure issues** that have now been fixed:

### What Was Wrong:
1. ❌ Empty `AdvertiseCallback` - no success/failure handling
2. ❌ Missing `onDescriptorWriteRequest` - clients couldn't enable notifications
3. ❌ No runtime permission checks (Android 12+)
4. ❌ No logging - impossible to debug
5. ❌ `call.resolve()` before advertising started

### What's Fixed:
1. ✅ Proper callback with `onStartSuccess` and `onStartFailure`
2. ✅ Complete GATT server callbacks including descriptor writes
3. ✅ Runtime permission validation
4. ✅ Comprehensive logging at every step
5. ✅ Only resolves after advertising actually starts

---

## 📱 How to View Logs

### Real-Time Logs (Recommended)

```bash
# View BleSignaling logs in real-time
adb -s <XIAOMI_SERIAL> logcat -s BleSignalingPlugin:*

# Or with more context
adb -s <XIAOMI_SERIAL> logcat | grep -E "BleSignaling|Bluetooth"
```

### Save Logs to File

```bash
# Save all logs for later analysis
adb -s <XIAOMI_SERIAL> logcat > xiaomi-host-logs.txt

# In another terminal, filter for BLE
tail -f xiaomi-host-logs.txt | grep BleSignaling
```

### Clear Old Logs First

```bash
# Clear buffer before testing
adb -s <XIAOMI_SERIAL> logcat -c

# Then start fresh logging
adb -s <XIAOMI_SERIAL> logcat -s BleSignalingPlugin:*
```

---

## ✅ What to Look For - Success Case

When the host creates a lobby successfully, you should see:

```
D/BleSignalingPlugin: startAdvertising called
D/BleSignalingPlugin: Device name set to: Lobby-A1B2C3
D/BleSignalingPlugin: Creating GATT server...
D/BleSignalingPlugin: Creating GATT service with UUID: 6e400011-b5a3-f393-e0a9-e50e24dcca9e
D/BleSignalingPlugin: Created RX characteristic: 6e400012-b5a3-f393-e0a9-e50e24dcca9e
D/BleSignalingPlugin: Created TX characteristic with CCCD: 6e400013-b5a3-f393-e0a9-e50e24dcca9e
D/BleSignalingPlugin: Service added to GATT server
D/BleSignalingPlugin: Starting BLE advertising...
D/BleSignalingPlugin: ✅ BLE Advertising started successfully!
D/BleSignalingPlugin:    Device name: Lobby-A1B2C3
D/BleSignalingPlugin:    Service UUID: 6e400011-b5a3-f393-e0a9-e50e24dcca9e
D/BleSignalingPlugin:    Mode: 0
D/BleSignalingPlugin:    TX Power: 3
```

**Key success indicator:**
```
✅ BLE Advertising started successfully!
```

**Note about packet sizes (updated in latest version):**
- The plugin now shows packet size calculations in logs
- BLE advertising has a 31-byte limit per packet
- We use **2 packets** to avoid "Data too large" errors:
  - **Advertising packet**: Service UUID only (~19 bytes)
  - **Scan response**: Device name (~14 bytes)
- This keeps both under the 31-byte limit
- Clients still see both the UUID and name when scanning
- Look for these lines in logs:
  ```
  D/BleSignalingPlugin:    Advertising packet size: Service UUID (16 bytes) + overhead (~3 bytes) = ~19 bytes
  D/BleSignalingPlugin:    Scan response size: Device name (X bytes) + overhead (~2 bytes)
  ```

---

## ❌ What to Look For - Failure Cases

### 1. Missing Permissions (Android 12+)

```
E/BleSignalingPlugin: Missing BLUETOOTH_ADVERTISE permission
```

**Fix:**
```bash
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
```

### 2. Bluetooth Not Enabled

```
E/BleSignalingPlugin: Bluetooth not available or not enabled
```

**Fix:**
```bash
# Enable Bluetooth
adb shell svc bluetooth enable

# Verify
adb shell settings get global bluetooth_on  # Should return 1
```

### 3. Advertiser Not Available

```
E/BleSignalingPlugin: BLE Advertiser not available on this device
```

**Cause:** Device doesn't support BLE peripheral mode (rare on modern phones)

### 4. Advertising Failed

```
E/BleSignalingPlugin: ❌ BLE Advertising failed: [reason] (code: X)
```

**Possible reasons:**
- `Data too large` (code 1) - **FIXED** in latest version (now uses scan response)
- `Too many advertisers` (code 2) - Another app is advertising
- `Already started` (code 3) - Plugin already advertising
- `Internal error` (code 4) - System Bluetooth error
- `Feature unsupported` (code 5) - BLE advertising not supported

**Fix for "Data too large" (if you see this on old version):**
- This should NOT occur in the latest version (commit 94a2ba4+)
- The plugin now splits data between advertising packet and scan response
- If you still see this, rebuild the APK with the latest code

**Fix for "Too many advertisers":**
```bash
# Restart Bluetooth
adb shell svc bluetooth disable
sleep 2
adb shell svc bluetooth enable
```

### 5. Plugin Not Registered

```
E/Capacitor: Plugin BleSignaling not found
```

**Fix:** Rebuild the APK - the plugin registration timing was fixed.

---

## 🎯 Connection Events

### When Client Connects

```
D/BleSignalingPlugin: GATT Client connected: AA:BB:CC:DD:EE:FF
```

### When Client Writes Data

```
D/BleSignalingPlugin: onCharacteristicWriteRequest: 6e400012-b5a3-f393-e0a9-e50e24dcca9e, length: 180
D/BleSignalingPlugin: Notified rxWritten with 180 bytes
D/BleSignalingPlugin: Sent GATT response
```

### When Client Enables Notifications

```
D/BleSignalingPlugin: onDescriptorWriteRequest: 00002902-0000-1000-8000-00805f9b34fb, value: [1, 0]
D/BleSignalingPlugin: Sent descriptor write response
```

### When Host Sends Notification

```
D/BleSignalingPlugin: Notification sent: 180 bytes to AA:BB:CC:DD:EE:FF
```

---

## 🔬 Complete Test Workflow

### 1. Clean Logs and Start Fresh

```bash
# Clear logs
adb -s <XIAOMI_SERIAL> logcat -c

# Start monitoring
adb -s <XIAOMI_SERIAL> logcat -s BleSignalingPlugin:*
```

### 2. Launch App and Create Lobby

On Xiaomi:
1. Open app
2. Tap "Lobby Setup"
3. Tap "Create Lobby"

**Watch logs for:**
- ✅ Success: "BLE Advertising started successfully"
- ❌ Failure: Error message with reason

### 3. Client Connects

On client device:
1. Open app
2. Tap "Lobby Setup"
3. Enter lobby ID
4. Tap "Join Lobby"

**Watch host logs for:**
```
D/BleSignalingPlugin: GATT Client connected: [MAC_ADDRESS]
```

### 4. Client Writes Data

After connection, client sends device info.

**Watch host logs for:**
```
D/BleSignalingPlugin: onCharacteristicWriteRequest: ... length: X
D/BleSignalingPlugin: Notified rxWritten with X bytes
```

---

## 🐛 Common Issues and Solutions

### Issue: No logs appearing at all

**Cause:** Plugin not loaded or app crashed

**Debug:**
```bash
# Check if app is running
adb shell ps | grep com.motionsignal

# Check for crash
adb logcat | grep -E "FATAL|AndroidRuntime"

# Check plugin registration
adb logcat | grep "registerPlugin"
```

### Issue: "Missing permissions" error

**Cause:** Permissions not granted

**Fix:**
```bash
# Grant all required permissions
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_SCAN
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_ADVERTISE
adb shell pm grant com.motionsignal.app android.permission.BLUETOOTH_CONNECT
adb shell pm grant com.motionsignal.app android.permission.ACCESS_FINE_LOCATION

# Verify permissions
adb shell dumpsys package com.motionsignal.app | grep -A 20 "granted=true"
```

### Issue: Advertising starts but clients can't find host

**Cause:** Service UUID mismatch or scanning issue

**Debug:**
```bash
# Host logs - check advertised UUID
adb logcat -s BleSignalingPlugin:* | grep "Service UUID"

# Client logs - check what it's scanning for
adb -s <CLIENT_SERIAL> logcat | grep -E "BleClient|requestLEScan"
```

### Issue: Client connects but no data received

**Cause:** Descriptor not written (notifications not enabled)

**Look for on host:**
```
D/BleSignalingPlugin: onDescriptorWriteRequest: 00002902...
```

If missing, client didn't enable notifications properly.

---

## 📊 Log Levels Explained

The plugin uses these log levels:

- **`Log.d(TAG, ...)`** - Debug info (normal operation)
- **`Log.w(TAG, ...)`** - Warnings (non-critical issues)
- **`Log.e(TAG, ...)`** - Errors (critical failures)

To see all levels:
```bash
adb logcat BleSignalingPlugin:D *:S
```

To see only errors:
```bash
adb logcat BleSignalingPlugin:E *:S
```

---

## 🚀 Quick Debug Command

Use this one-liner to see everything important:

```bash
adb -s <XIAOMI_SERIAL> logcat -c && adb -s <XIAOMI_SERIAL> logcat | grep -E "BleSignaling|✅|❌|GATT|Advertising"
```

This shows:
- All BleSignaling logs
- Success markers (✅)
- Failure markers (❌)
- GATT events
- Advertising events

---

## 📝 Reporting Issues

If you still have issues, collect these logs:

```bash
# 1. Clear and capture fresh logs
adb logcat -c
adb logcat > full-debug-log.txt

# 2. In another terminal, reproduce the issue
# (create lobby, join, etc.)

# 3. Stop logging (Ctrl+C) and share:
# - full-debug-log.txt
# - Steps to reproduce
# - Device model and Android version
```

Filter for just BLE activity:
```bash
grep -E "BleSignaling|Bluetooth|GATT" full-debug-log.txt > ble-only.txt
```

---

## ✨ Success Checklist

After rebuilding and testing, you should see:

- [ ] `startAdvertising called`
- [ ] `Device name set to: Lobby-[ID]`
- [ ] `GATT Service added successfully`
- [ ] `✅ BLE Advertising started successfully!`
- [ ] `GATT Client connected: [MAC]` (when client joins)
- [ ] `onCharacteristicWriteRequest` (when client sends data)
- [ ] `Notification sent: X bytes` (when host replies)

If you see all of these, the BLE system is working perfectly! 🎉
