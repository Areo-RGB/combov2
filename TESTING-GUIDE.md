# Testing Guide - Next.js Motion Detection App

This guide explains how to test the Firebase database and detection components.

## Quick Test (No Build Required)

I've created a standalone HTML test page that you can run immediately without building the full Next.js app.

### Running the Test

```bash
# Start the test server
./test-server.sh

# Or manually:
python3 -m http.server 8080
```

Then open your browser to: **http://localhost:8080/test-nextjs.html**

### What You Can Test

#### 1. **Camera Access** 📹
- Click "Start Camera" to access your webcam
- Verify video feed appears
- Click "Stop Camera" to stop the feed
- **Expected**: Camera permissions requested, video stream displays

#### 2. **Motion Detection** 🎯
- Start the camera first
- Click "Use DiffyJS" to enable motion detection
- Move your hand in front of the camera
- **Expected**: Green circle pulses when motion is detected

#### 3. **Firebase Connectivity** 🔥
- Enter a session ID (e.g., "TEST123")
- Click "Connect to Firebase"
- **Expected**: Status shows "✓ Connected to session: TEST123"

#### 4. **Message Broadcasting** 📡
- After connecting to Firebase, click "Send Motion Event"
- **Expected**: Message appears in the "Received Messages" panel
- **Test Multi-Device**: Open the same URL in another browser/tab with the same session ID
  - Messages sent from one tab should appear in the other

### Testing Checklist

- [ ] Camera starts successfully
- [ ] Motion detection triggers (green circle pulses)
- [ ] Firebase connects successfully
- [ ] Can send messages
- [ ] Messages appear in the received panel
- [ ] Multi-device: Messages sync between tabs/devices

## Full Next.js App Testing

To test the complete Next.js application:

### Setup

```bash
# Run the setup script
./setup-nextjs.sh

# This will:
# - Backup Angular config files
# - Copy Next.js config files
# - Install dependencies
# - Be ready to run
```

### Development

```bash
# Start development server
pnpm dev

# Open http://localhost:3000
```

### Testing the Full App

1. **Lobby Page**
   - Should start directly at lobby
   - Enter or generate a session ID
   - Select a role (Start, Split, or Finish)
   - Click "Join Session"
   - See your device listed

2. **Multi-Device Setup**
   - Open another browser/device
   - Join the same session ID
   - Select a different role
   - Both devices should see each other

3. **Sprint Timing**
   - Click "Start Sprint Timer" when multiple devices are connected
   - Each device shows:
     - Camera view
     - Motion detector
     - Timer display
     - Role-specific UI

4. **Motion Detection**
   - Start line device: Wave hand to START timer
   - Split line device: Wave hand to record split time
   - Finish line device: Wave hand to STOP timer
   - All devices should see synchronized timing

### Build and Export

```bash
# Build static export for Capacitor
pnpm build

# Output will be in /out directory
# Verify build succeeded: ls -la out/
```

### Android Testing

```bash
# Build and sync to Android
pnpm build:android

# Open in Android Studio
pnpm cap:open:android

# In Android Studio:
# 1. Select device/emulator
# 2. Click Run (▶️)
# 3. Grant camera permissions
# 4. Test the app
```

## Component Testing Details

### Detection Components

The app uses two detection methods:

1. **DiffyJS** (Pixel-based)
   - Simple frame differencing
   - Works on all devices
   - Good for basic motion detection

2. **Speedy Vision** (GPU-accelerated)
   - Optical flow tracking
   - Feature point detection
   - Better accuracy and performance
   - Requires WebGL2 support

### Firebase Service

Located in `app/lib/firebase.ts`:

**Functions tested:**
- `joinSession()` - Join a session with device info
- `publishMessage()` - Broadcast messages to all devices
- `listenForMessages()` - Receive messages from other devices
- `listenForPresence()` - Monitor connected devices
- `updateDeviceRole()` - Change device role
- `cleanupSession()` - Leave session and cleanup

**Database structure:**
```
sprint-sessions/
  {sessionId}/
    presence/
      {clientId}/
        role: "START"|"SPLIT"|"FINISH"
        availableCameras: [...]
        lastSeen: timestamp
    messages/
      {messageId}/
        type: "START"|"FINISH"|"RESET"
        timestamp: number
        clientId: string
        data: {...}
```

## Troubleshooting

### Camera Not Working

**Issue**: Camera doesn't start
**Solutions**:
1. Check browser permissions (usually a camera icon in address bar)
2. Ensure HTTPS (required for camera API)
   - `localhost` works without HTTPS
   - For network testing, use HTTPS or local tunnel
3. Close other apps using the camera
4. Try different browsers (Chrome, Edge work best)

### Motion Detection Not Triggering

**Issue**: Motion not detected
**Solutions**:
1. Check lighting - ensure room is well-lit
2. Increase sensitivity (edit `sensitivityLevel` in code)
3. Make larger, faster movements
4. Try switching detection modes (Diffy vs Speedy)
5. Check camera is not frozen

### Firebase Connection Issues

**Issue**: "Not connected" or no messages
**Solutions**:
1. Check internet connection
2. Verify Firebase config in `app/lib/firebase.ts`
3. Check browser console for errors (F12)
4. Ensure session IDs match across devices
5. Try a different session ID

### Build Errors

**Issue**: `pnpm build` fails
**Solutions**:
1. Ensure correct config files:
   ```bash
   ls -la package.json tsconfig.json tailwind.config.ts
   ```
2. Clean and reinstall:
   ```bash
   rm -rf node_modules .next out
   pnpm install
   pnpm build
   ```
3. Check Node.js version: `node --version` (should be 18+)

### Android Issues

**Issue**: App crashes or camera doesn't work
**Solutions**:
1. Check Android permissions in Settings
2. Ensure Capacitor config is correct:
   - `webDir: 'out'` (not `dist`)
   - Camera plugin configured
3. Clean and rebuild:
   ```bash
   rm -rf android
   pnpm cap:add:android
   pnpm build:android
   ```
4. Check Android Studio logcat for errors

## Testing Best Practices

### Local Testing

1. **Single Device Testing**
   - Test all features work independently
   - Verify camera and detection
   - Test Firebase send/receive

2. **Multi-Device Testing**
   - Use multiple browser tabs first
   - Then test on different devices
   - Verify real-time synchronization

3. **Network Testing**
   - Test on same WiFi network
   - Test on different networks
   - Test with cellular data

### Performance Testing

1. **Detection FPS**
   - Speedy Vision should show FPS counter
   - Aim for 15-30 FPS
   - Lower on mobile devices is normal

2. **Firebase Latency**
   - Message delivery should be <500ms
   - Check timestamps in messages
   - Monitor in Firebase console

3. **Battery Usage**
   - Camera and detection are intensive
   - Monitor device temperature
   - Test with/without detection active

## Test Scenarios

### Scenario 1: Basic Sprint

1. Device A: Join as START
2. Device B: Join as FINISH
3. Device A: Wave to start timer
4. Device B: Wave to stop timer
5. **Expected**: Accurate timing synchronized across devices

### Scenario 2: Three-Device Sprint

1. Device A: START
2. Device B: SPLIT
3. Device C: FINISH
4. Run through full sprint
5. **Expected**: Start time, split time, and finish time all recorded

### Scenario 3: Multiple Sessions

1. Create Session "SESSION1"
2. Create Session "SESSION2"
3. Different devices join different sessions
4. **Expected**: No cross-session interference

### Scenario 4: Reconnection

1. Join a session
2. Close/refresh browser
3. Rejoin same session
4. **Expected**: Seamlessly reconnect, see other devices

## Metrics to Monitor

- [ ] Camera initialization time: < 2 seconds
- [ ] Motion detection responsiveness: < 100ms
- [ ] Firebase message delivery: < 500ms
- [ ] Lobby to Sprint transition: < 1 second
- [ ] Detection FPS: 15-30 (desktop), 10-20 (mobile)
- [ ] Memory usage: Stable over time

## Success Criteria

✅ **Camera Works**
- Permissions granted
- Video stream displays
- Can select different cameras

✅ **Detection Works**
- Motion triggers indicator
- Configurable sensitivity
- Both Diffy and Speedy modes functional

✅ **Firebase Works**
- Can connect to sessions
- Messages send/receive
- Multi-device synchronization
- Presence tracking updates

✅ **Sprint Timing Works**
- Start/split/finish detection
- Accurate timing
- Real-time updates
- Reset functionality

✅ **Mobile Works** (if testing Android)
- Builds successfully
- Camera permissions work
- Detection performs adequately
- UI is responsive

## Next Steps

After successful testing:

1. **Customize**: Adjust sensitivity, styling, features
2. **Optimize**: Fine-tune detection parameters
3. **Deploy**: Build for production and deploy
4. **Enhance**: Add features from wish list

## Support

For issues or questions:
- Check NEXTJS-README.md for full documentation
- Review MIGRATION-GUIDE.md for architecture details
- Check browser console (F12) for errors
- Review Firebase console for database activity

## Quick Reference

```bash
# Test standalone HTML
./test-server.sh

# Setup Next.js
./setup-nextjs.sh

# Development
pnpm dev

# Build
pnpm build

# Android
pnpm build:android
pnpm cap:open:android

# Restore Angular
./restore-angular.sh
```

Happy testing! 🚀
