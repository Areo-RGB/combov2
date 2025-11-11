# MotionSignal & Sprint Duels - Comprehensive Project Analysis

## 1. PROJECT TYPE & OVERVIEW

**Type:** Hybrid Cross-Platform Application
- **Web Application**: Modern Angular 20+ (Zoneless, Signals) web app
- **Mobile Application**: Native Android support via Capacitor 7
- **App Name**: MotionSignal
- **Primary Use Case**: Real-time motion detection and competitive sprint/duel management system

**Project Structure:**
```
combov2/
├── src/
│   ├── app.component.ts (Main orchestrator)
│   ├── services/ (Core shared services)
│   ├── components/ (Motion detection UI)
│   ├── sprint-duels/ (Competitive ranking system)
│   └── team-duels/ (Multi-device cooperative duels)
├── android/ (Capacitor Android project)
├── index.tsx (Bootstrap entry)
├── capacitor.config.ts (Mobile config)
├── angular.json (Build config)
└── package.json
```

**Total Codebase Size:** ~987 lines of TypeScript code

---

## 2. FRAMEWORKS & TECHNOLOGIES STACK

### Core Framework
- **Angular 20.3+**: Modern standalone component architecture
  - **Zoneless Change Detection**: Using Angular's new `provideZonelessChangeDetection()`
  - **Signals API**: Reactive state management without RxJS
  - **Output/Input Signals**: Modern component communication

### Web APIs & Libraries
- **Camera & Media**:
  - `@capacitor/camera` (v7.0.2) - Native camera access for Android
  - `getUserMedia` API - Web browser camera access
  - Canvas API - Video frame processing

- **Pose Detection**:
  - `@mediapipe/tasks-vision` (v0.10.22-rc) - Google MediaPipe for pose detection
  - `@tensorflow-models/pose-detection` (v2.1.3) - TensorFlow MoveNet models
  - `@tensorflow/tfjs-*` (v4.22.0) - TensorFlow.js with WebGL backend

- **Real-time Communication**:
  - WebRTC (`RTCPeerConnection`, `RTCDataChannel`)
  - `@capacitor-community/bluetooth-le` (v7.2.0) - BLE for device discovery/signaling
  - Firebase Realtime Database (v12.5.0)

- **UI & Styling**:
  - Tailwind CSS (latest)
  - Responsive design with Tailwind utilities

- **State & Persistence**:
  - `localStorage` - Client-side data persistence
  - Firebase Authentication & Realtime Database
  - RxJS (v7.8.2) - Async handling

- **Build Tools**:
  - Vite (v6.4.1) - Development server
  - TypeScript (5.8.3)
  - Angular Build system

### Mobile Framework
- **Capacitor 7.4.4**: Native bridge for Android
- **Android**: Native Android app via Capacitor
- **Custom Native Plugins**: BLE signaling service (custom native plugin)

---

## 3. MAIN FUNCTIONALITY

### Part 1: Motion Signal System
**Purpose**: Real-time motion detection and wireless signal broadcasting to multiple devices

#### Core Features:
1. **Motion Detection Modes**:
   - **Motion-based**: Frame-by-frame pixel difference detection (fast, battery-efficient)
   - **Pose-based**: Person presence detection using AI
     - MediaPipe (lite/full/heavy models)
     - MoveNet (lightning/thunder/multipose models)

2. **Session-Based Connectivity**:
   - 6-character alphanumeric session IDs
   - One detector broadcasts to multiple displays
   - RTC-based (low-latency) or Firebase-based (cloud-synced)

3. **Display Modes**:
   - **Colors**: Random vibrant color flash on motion
   - **Math Game**: Sequential math problems triggered by motion
   - **Wechsel**: "Links" (Left) or "Rechts" (Right) randomly
   - **Counter**: Increment counter on each detection

4. **Configurable Detection**:
   - Sensitivity adjustment (1-10 scale)
   - Motion cooldown (minimum ms between detections)
   - Signal cadence (emit every Nth detection)
   - Detection zone (vertical band with adjustable width/position)
   - Full-screen or zone-based detection

5. **Camera Options**:
   - Multi-camera support (front/back/any available)
   - Responsive to device orientation

### Part 2: Sprint Duels System
**Purpose**: Complete competitive ranking and match management for sprint/duel competitions

#### Core Features:
1. **Elo Rating System**:
   - Dynamic player rating based on match outcomes
   - Win/loss/draw result recording
   - ELO calculation service with configurable K-factor

2. **Player Management**:
   - 16 pre-configured players (Kayden, Erik, Lion, etc.)
   - Jersey numbers (2-33)
   - Participation toggles
   - Statistics tracking (wins, losses, draws, tournaments)

3. **Match Making**:
   - Random pairings for casual play
   - Elo-based pairings for balanced competition
   - Match history with detailed results

4. **Tournament Mode**:
   - Double-elimination tournaments (winners + losers brackets)
   - Grand finals with best-of-three series
   - Bracket visualization

5. **Audio Cues**:
   - Player announcements (jersey number)
   - Pre-recorded voice options (Default, Crusader)
   - Countdown timers with audio

6. **Data Persistence**:
   - Local storage (localStorage)
   - Firebase cloud synchronization
   - Fallback strategies (local-first with cloud sync)

### Part 3: Team Duels System
**Purpose**: Multi-device cooperative competitive system with centralized display

#### Core Features:
1. **Multi-Device Synchronization**:
   - One display host device
   - Multiple game client devices
   - WebRTC-based real-time communication

2. **Sprint Timing**:
   - Reaction time measurement
   - Visual countdown timers
   - Motion detection integration

---

## 4. EXISTING TEST SETUP

**Current Status**: ❌ **NO TEST INFRASTRUCTURE**

- No `.spec.ts` or `.test.ts` files found
- No testing framework configured (Jest, Jasmine, Karma, Vitest)
- No test configuration in `angular.json`
- No test scripts in `package.json`

**Implication**: Fresh testing infrastructure setup needed for comprehensive test coverage.

---

## 5. KEY COMPONENTS & MODULES REQUIRING TESTS

### Core Services (High Priority)
1. **src/services/firebase.service.ts** (48 lines)
   - Handles Firebase Realtime Database operations
   - Critical for data persistence
   - Network-dependent, async operations

2. **src/services/camera.service.ts** (42 lines)
   - Camera access via Capacitor
   - Platform-dependent (Android/Web)
   - Permission handling

3. **src/services/rtc.service.ts** (84 lines)
   - WebRTC peer-to-peer data channel
   - Connection lifecycle management
   - ICE gathering coordination

4. **src/services/signaling.service.ts** (176 lines)
   - BLE-based device discovery & signaling
   - Message chunking/reassembly (max 180 bytes per chunk)
   - Central/Peripheral role switching
   - Complex async state machine

### Sprint Duels Services (High Priority)
5. **src/sprint-duels/services/match.service.ts** (124 lines)
   - Match recording & history management
   - ELO calculation coordination
   - Firebase/localStorage sync

6. **src/sprint-duels/services/player.service.ts** (113 lines)
   - Player data management
   - Stats persistence
   - Batch updates

7. **src/sprint-duels/services/elo.service.ts**
   - ELO rating calculations
   - Critical for match results

8. **src/sprint-duels/services/sprint-duels-firebase.service.ts** (52 lines)
   - Firebase operations for sprint duels
   - Match history persistence

9. **src/sprint-duels/services/tournament.service.ts**
   - Tournament bracket generation
   - Double-elimination logic

### Team Duels Services (Medium Priority)
10. **src/team-duels/services/webrtc.service.ts** (100+ lines)
    - Multi-peer RTC management
    - Data channel coordination

11. **src/team-duels/services/team-duels-firebase.service.ts**
    - Firebase coordination for team duels

### Components (Medium Priority)
12. **src/components/detector/detector.component.ts** (793 lines)
    - Complex video processing pipeline
    - Pose detection integration
    - Canvas manipulation
    - RequestVideoFrameCallback support

13. **src/components/display/display.component.ts**
    - Firebase listener attachment
    - Display state management

14. **src/app.component.ts** (352 lines)
    - Main orchestrator
    - Session management
    - Display effect handling

### Sprint Duels Components (Medium Priority)
15. **src/sprint-duels/components/match-maker/**
16. **src/sprint-duels/components/ranking-list/**
17. **src/sprint-duels/components/history/**
18. **src/sprint-duels/components/settings/**

---

## 6. ASYNC OPERATIONS & RACE CONDITIONS - DETAILED ANALYSIS

### Critical Race Conditions Identified

#### 1. **DetectorComponent - Pose Model Switching Race Condition** (HIGH RISK)
**File:** `src/components/detector/detector.component.ts:707-761`

**Problem:**
```typescript
async onPoseLibraryChange(event: Event): Promise<void> {
  const library = (event.target as HTMLSelectElement).value as 'mediapipe' | 'movenet';
  this.poseLibrary.set(library);

  // Cleanup happens AFTER setting signal (race!)
  if (this.poseLandmarker) { this.poseLandmarker.close(); }
  if (this.moveNetDetector) { this.moveNetDetector.dispose(); }

  // But processFrame() might still be running!
  await this.initializePoseDetection();
  // ...
}

private processMediaPipePoseDetection(): void {
  if (!this.poseLandmarker) return; // Could be set to null during cleanup!
  const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, now);
  // ^^^ CRASH if poseLandmarker was closed mid-frame
}
```

**Impact**: Detector can crash while processing frame and model switches simultaneously.

#### 2. **AppComponent - Math Game Timeout Management** (MEDIUM RISK)
**File:** `src/app.component.ts:129-186`

**Problem:**
```typescript
private runMathGameStep(intensity?: number) {
  if (this.resultTimeoutId) {
    clearTimeout(this.resultTimeoutId); // Clear old timeout
    this.resultTimeoutId = null;
  }
  // ...
  this.resultTimeoutId = setTimeout(() => {
    // But what if mode changed or game reset during timeout?
    if (this.mathGameStatus() === 'finished' && this.operationsDone() === done) {
      // ^ Only checks ONE condition - other state could have changed!
      this.motionSignal.set({...});
    }
    this.resultTimeoutId = null;
  }, this.lingerDuration() + 500);
}
```

**Issues**:
- No debouncing of rapid motion signals
- `lingerDuration()` changes not handled mid-timeout
- Multiple concurrent timeouts possible if motion events rapid

#### 3. **SignalingService - BLE Message Reassembly Race** (HIGH RISK)
**File:** `src/services/signaling.service.ts:132-150`

**Problem:**
```typescript
private async handleIncomingChunk(key: string, env: ChunkEnvelope, 
  onComplete: (fullText: string) => Promise<void>): Promise<void> {
  
  let entry = this.incomingBuffers.get(key);
  if (!entry || entry.total !== env.total || entry.type !== env.t) {
    entry = { total: env.total, parts: new Array(env.total).fill(''), type: env.t };
    this.incomingBuffers.set(key, entry);  // NEW BUFFER
  }
  entry.parts[env.idx] = env.data;  // Fill slot
  
  if (entry.parts.every(p => p !== '')) {  // All parts received?
    const joined = entry.parts.join('');
    try {
      const parsed = JSON.parse(joined);
      if ((env.t === 'offer' || env.t === 'answer') && typeof parsed.sdp === 'string') {
        await onComplete(parsed.sdp);  // AWAIT HERE
      }
    } finally {
      this.incomingBuffers.delete(key);
    }
  }
}
```

**Races**:
- While awaiting `onComplete()`, new chunks for SAME message could arrive
- `entry` reference could be invalidated if buffer reset happens
- No timeout for incomplete messages (could leak memory)

#### 4. **WebRTCService - ICE Candidate Ordering** (MEDIUM RISK)
**File:** `src/team-duels/services/webrtc.service.ts:32-99`

**Problem:**
```typescript
async createConnectionAndOffer(peerId: string): Promise<void> {
  const pc = this.createPeerConnection(peerId);
  const channel = pc.createDataChannel('game-data');
  this.setupDataChannel(peerId, channel);
  this.dataChannels.set(peerId, channel);
  
  const offer = await pc.createOffer();  // Returns immediately
  await pc.setLocalDescription(offer);   // Async
  // ^^^ During this await, ICE candidates start gathering
  // But onSdpOffer callback happens IMMEDIATELY below
  if (pc.localDescription) {
    this.onSdpOffer(peerId, pc.localDescription);  // Send to remote
    // ^^^ Remote might add ICE candidates BEFORE local desc is set!
  }
}

async handleOfferAndCreateAnswer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  const pc = this.createPeerConnection(peerId);
  // ...
  // ICE candidates from offer might arrive BEFORE setRemoteDescription completes
  await pc.setRemoteDescription(new RTCSessionDescription(offer));
  // Process queued candidates...
}
```

**Race**: Candidates could arrive before remote description is set.

#### 5. **MatchService - Firebase/LocalStorage Sync** (MEDIUM RISK)
**File:** `src/sprint-duels/services/match.service.ts:26-110`

**Problem:**
```typescript
async loadMatchHistory(): Promise<void> {
  this.isLoading.set(true);
  try {
    const firebaseHistory = await this.firebaseService.getMatches();  // Long async
    if (firebaseHistory.length > 0) {
      this.matchHistory.set(firebaseHistory);  // Set signal
      this.storageService.set('matchHistory', firebaseHistory);  // Sync local
      // ^^^ But what if local was written to during this await?
    }
  } catch (error) {
    // Fallback to local
    const localHistory = this.storageService.get<Match[]>('matchHistory') || [];
    this.matchHistory.set(localHistory);
  }
}

private async addMatchToHistory(match: Match): Promise<void> {
  const updatedHistory = [match, ...this.matchHistory()];  // Read current
  this.matchHistory.set(updatedHistory);  // Update signal
  this.storageService.set('matchHistory', updatedHistory);  // Write local
  
  try {
    await this.firebaseService.writeMatch(match);  // Async write
    // ^^^ If this fails, signal shows success but Firebase has no data
  } catch(error) {
    // Only shows toast, doesn't rollback signal
  }
}
```

**Issues**:
- No optimistic locking between operations
- No rollback mechanism if Firebase write fails after signal update
- Could result in inconsistent state between local and Firebase

#### 6. **PlayerService - Multiple Update Calls** (LOW-MEDIUM RISK)
**File:** `src/sprint-duels/services/player.service.ts:46-59`

**Problem:**
```typescript
updateMultiplePlayers(updatedPlayers: Player[]): void {
  const updatedPlayerMap = new Map(updatedPlayers.map(p => [p.id, p]));
  this.players.update(players =>
    players.map(p => updatedPlayerMap.get(p.id) || p)  // Map-based lookup
  );
  this.savePlayers();  // Sync write (non-blocking)
}
```

**Issue**: If `updateMultiplePlayers` called rapidly (e.g., tournament bracket generation), `savePlayers()` calls could batch-collide.

#### 7. **DetectorComponent - Animation Frame Lifecycle** (MEDIUM RISK)
**File:** `src/components/detector/detector.component.ts:276-311`

**Problem:**
```typescript
startDetection(): void {
  this.status.set('detecting');
  this.lastMotionTime = Date.now();
  this.detectionCounter = 0;
  this.zone.runOutsideAngular(() => {
    this.queueNextFrame();  // Schedules RAF/RVFC
  });
}

private queueNextFrame() {
  if (this.status() !== 'detecting') return;  // Guard
  const video = this.videoRef().nativeElement as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: (now: number, meta: any) => void) => number;
  };

  if (this.useRVFC && video.requestVideoFrameCallback) {
    this.vfcHandle = video.requestVideoFrameCallback((now) => this.onFrame(now));
  } else {
    this.animationFrameId = requestAnimationFrame((now) => this.onFrame(now));
  }
}

ngOnDestroy(): void {
  this.stopDetection();
  // ...
}

stopDetection(): void {
  if (this.animationFrameId) {
    cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
  }
  if (this.vfcHandle && video?.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(this.vfcHandle);
    this.vfcHandle = null;
  }
  // ...
}
```

**Race**: Between checking `status()` and actually scheduling frame, mode could change. No memory leak but potentially orphaned frames.

#### 8. **SignalingService - Advertising/Scanning State** (LOW-MEDIUM RISK)
**File:** `src/services/signaling.service.ts:27-38`

**Problem:**
```typescript
async startDisplayHandshake(sessionId: string): Promise<void> {
  if (this.advertisingSession === sessionId) return;  // Guard
  await this.initializePeripheral(sessionId);  // Async
  this.advertisingSession = sessionId;  // Set AFTER completion
}

async startDetectorHandshake(sessionId: string): Promise<void> {
  if (this.scanningSession === sessionId) return;  // Guard
  await this.initializeCentral();
  await this.startScanAndConnect(sessionId);  // Long async (15s timeout)
  this.scanningSession = sessionId;
}
```

**Race**: If `startDisplayHandshake` called twice before first completes, second call returns early (good), but what if called with DIFFERENT sessionId before first completes? Second initialization could interfere.

### Mobile-Specific Concerns

#### 9. **Camera Permission Handling** (MEDIUM RISK)
**File:** `src/components/detector/detector.component.ts:213-274`

**Problem**:
```typescript
async startCamera(): Promise<void> {
  if (this.stream) {
    this.stream.getTracks().forEach(t => t.stop());  // Stop old stream
    this.videoRef().nativeElement.srcObject = null;
    this.stream = null;
  }

  try {
    try {
      const perm = await Camera.checkPermissions();  // Async call
      if (perm.camera !== 'granted') {
        const res = await Camera.requestPermissions({ permissions: ['camera'] as any });
        // ^^^ User might take 30+ seconds to respond!
        // Component might be destroyed during this wait
        if (res.camera !== 'granted') {
          this.status.set('error');
          return;
        }
      }
    } catch {
      // Silently continue for web
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      this.status.set('no_camera');
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();  // Another await
    // ...
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);  // Another await
    const video = this.videoRef().nativeElement;  // Could be null if destroyed!
    video.srcObject = this.stream;
  }
}
```

**Mobile Issues**:
- User might deny camera permission
- Device might lack camera
- Permission dialog could interrupt user flow
- No AbortController for cancellation

#### 10. **Video Frame Processing Under Load** (HIGH RISK - Mobile)
**File:** `src/components/detector/detector.component.ts:298-322`

**Problem**:
```typescript
private onFrame(now: number) {
  if (this.status() !== 'detecting') return;

  // Throttle to target FPS
  const minDelta = 1000 / this.targetFps;  // 12 fps = ~83ms
  if (now - this.lastProcessedTs < minDelta) {
    this.queueNextFrame();  // Reschedule immediately
    return;  // ^^^ Could queue hundreds of frames if system slow!
  }
  this.lastProcessedTs = now;

  this.processFrame();  // Might take 50-100ms on mobile
  // ^^^ With slow GPU/AI model, frame processing could exceed minDelta
  
  this.queueNextFrame();  // Queue next immediately
  // Result: Memory leak if frames queue faster than processing
}

private processMotionDetection(): void {
  const ctx = this.ctx!;
  const video = this.videoRef().nativeElement;
  if (!ctx) return;

  ctx.drawImage(video, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);  // GPU call
  const current = ctx.getImageData(x, y, width, height);  // STALLS on mobile!
  // ^^^ getImageData() is synchronous but forces GPU->CPU readback
  // On mobile, this could take 10-50ms!
}

private async processPoseDetection(): Promise<void> {
  // ...
  const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, now);
  // ^^^ MediaPipe on mobile could take 200-500ms for full model!
  // But this happens in animation frame!
}
```

**Mobile Performance Issues**:
- `getImageData()` forces GPU-to-CPU sync (blocking!)
- AI model inference on GPU could exceed frame budget
- Pose detection could take 200-500ms (15fps deadline missed)
- No frame dropping mechanism

#### 11. **Bluetooth Low Energy Race** (HIGH RISK - Android)
**File:** `src/services/signaling.service.ts:80-115`

**Problem**:
```typescript
private async startScanAndConnect(sessionId: string): Promise<void> {
  let resolved = false;

  await BleClient.requestLEScan(
    { services: [this.SERVICE_ID] },
    async (result) => {  // Callback could fire multiple times!
      const name = (result.localName || (result as any).name || (result as any).device?.name) as string | undefined;
      const deviceId = (result.device?.deviceId || (result as any).deviceId) as string | undefined;
      if (!name || !deviceId) return;
      if (!name.startsWith(`${this.NAME_PREFIX}${sessionId}`)) return;
      if (resolved) return;  // ^^^ Guard prevents multiple connects
      resolved = true;
      
      await BleClient.stopLEScan();
      await BleClient.connect(deviceId);  // Long async
      this.centralConnectedDeviceId = deviceId;  // Set during async
      
      // What if BLE device goes out of range during connect?
      await BleClient.startNotifications(deviceId, this.SERVICE_ID, this.TX_ID, async (value) => {
        // Another callback...
        const decoded = this.parseEnvelope(Array.from(new Uint8Array(value.buffer)));
        if (!decoded) return;
        await this.handleIncomingChunk('central-answer', decoded, async (full) => {
          await this.rtc.setRemoteAnswer(full);
        });
      });
      
      const offer = await this.rtc.createOfferWithDataChannel();
      await this.writeChunks(deviceId, { t: 'offer', sdp: offer });
    }
  );

  // Safety timeout
  setTimeout(async () => {
    if (!resolved) {
      try { await BleClient.stopLEScan(); } catch {}
    }
  }, 15000);  // ^^^ But what if scan already succeeded and moved to connect?
}

private async writeChunks(deviceId: string, payload: { t: 'offer', sdp: string }): Promise<void> {
  const raw = JSON.stringify(payload);
  const chunkSize = 180;
  const total = Math.ceil(raw.length / chunkSize);
  for (let i = 0; i < total; i++) {
    const data = raw.slice(i * chunkSize, (i + 1) * chunkSize);
    const env: ChunkEnvelope = { t: 'offer', idx: i, total, data };
    const view = this.toDataView(this.encodeEnvelope(env));
    await BleClient.write(deviceId, this.SERVICE_ID, this.RX_ID, view);  // Async write
    await new Promise((r) => setTimeout(r, 10));  // 10ms delay between chunks
    // ^^^ What if device disconnects between chunks?
  }
}
```

**Android BLE Issues**:
- Device discovery takes variable time (1-30 seconds)
- Connection could fail mid-setup
- Notification callbacks are asynchronous and could interleave
- No cleanup if BLE device disappears
- 10ms chunk delay is fragile on heavily-loaded devices

---

## 7. ENTRY POINTS & MAIN FEATURES

### Entry Point
**File:** `index.tsx`
```typescript
bootstrapApplication(AppComponent, {
  providers: [provideZonelessChangeDetection()]
})
```

### Main Navigation Flow
```
AppComponent (mode signal)
├── 'selection' → Mode selection menu
├── 'motion-games' → Motion signal with display modes
│   ├── 'detector' → Motion detection device
│   ├── 'display' → Display receiving signals
│   └── 'single' → Single-device (both roles)
├── 'sprint-timing-*' → Sprint timing components
│   ├── 'sprint-timing-manual' → Manual timing entry
│   ├── 'sprint-timing-flying' → Flying start timing
│   ├── 'sprint-multi-setup' → Multi-device setup
│   └── 'sprint-multi-timing' → Multi-device timing
├── 'sprint-duels' → Competitive ranking system
│   ├── Rankings tab
│   ├── Match Maker tab
│   ├── History tab
│   └── Settings tab
└── 'team-duels' → Multi-device team competition
    ├── Lobby (host/join selection)
    ├── Game Client (detector device)
    └── Display Host (central display)
```

### Communication Channels
```
Motion Signal:
├── Firebase Realtime Database (production)
│   └── sessions/{sessionId} → { timestamp, intensity }
└── WebRTC Data Channel (low-latency)
    └── motion messages { t: 'motion', intensity, ts }

BLE Signaling (for WebRTC establishment):
├── Peripheral (Display) → Advertises with Motion-{sessionId}
│   └── GATT Server: Service 6E400001..., RX char 6E400002..., TX char 6E400003...
└── Central (Detector) → Scans and connects
    └── Chunks offer SDP (~2-4 chunks @ 180 bytes each)

Sprint Duels:
├── Local Storage: players, matchHistory
└── Firebase: sprint-duels/matches/{matchId}

Team Duels:
├── Firebase for session coordination
└── WebRTC for game data (multi-peer mesh or star topology)
```

---

## 8. ARCHITECTURE & DEPENDENCIES

### Dependency Graph (High-Level)

```
AppComponent (orchestrator)
├── FirebaseService
│   └── Firebase SDK
├── RtcService (WebRTC P2P)
│   └── Browser RTCPeerConnection API
├── SignalingService (BLE signaling for RTC setup)
│   ├── RtcService
│   ├── BleClient (Capacitor community plugin)
│   └── BleSignaling (custom native plugin)
├── CameraService
│   ├── Capacitor Camera plugin
│   └── Browser getUserMedia API
├── DetectorComponent
│   ├── CameraService
│   ├── MediaPipe / MoveNet AI models
│   └── Canvas 2D API
├── DisplayComponent
│   └── FirebaseService
├── SprintDuelsComponent
│   ├── PlayerService
│   ├── MatchService
│   ├── MatchMakerComponent
│   ├── RankingListComponent
│   ├── HistoryComponent
│   └── SettingsComponent
├── TeamDuelsComponent
│   ├── WebRTCService (scoped)
│   ├── TeamDuelsFirebaseService (scoped)
│   └── DetectorComponent (reused)
└── ... (more components)

Sprint Duels Services:
├── PlayerService (localStorage)
├── MatchService
│   ├── StorageService (localStorage)
│   ├── SprintDuelsFirebaseService
│   ├── PlayerService
│   ├── EloService
│   └── ToastService
├── EloService (stateless calculations)
├── TournamentService (tournament bracket logic)
├── AudioService (pre-recorded audio)
├── StorageService (localStorage wrapper)
└── ToastService (UI notifications)
```

### State Management Architecture

**Zoneless Signals** (no RxJS needed):
```typescript
// In services:
players: WritableSignal<Player[]> = signal([]);
matchHistory: WritableSignal<Match[]> = signal([]);
isLoading = signal(true);

// In components:
activeTab = signal<ActiveTab>('rankings');
isArenaViewActive = computed(() => this.matchMaker()?.isArenaViewActive() ?? false);

// Reactivity via effect():
effect(() => {
  const mode = this.mode();  // Track dependencies
  const sid = this.sessionId();
  // React to changes
});
```

**Key Pattern**: Signals are updated synchronously, but async operations (Firebase, media APIs) use await + .set() pattern.

---

## 9. PERFORMANCE & SCALABILITY CONCERNS

### Mobile Performance Issues
1. **Video Processing**: 160x120 canvas downscale helps, but getImageData() blocking on mobile GPU
2. **AI Model Loading**: MediaPipe/MoveNet CDN load time not tracked
3. **Memory**: No limit on BLE message buffers (could leak if partial messages never complete)
4. **Bluetooth**: 10ms delays between 180-byte chunks conservative but necessary
5. **Storage**: localStorage has 5-10MB limit (match history could grow unbounded)

### Web-Specific Concerns
1. **Canvas Context**: Not released on component destroy (check for memory leaks)
2. **ResizeObserver**: Cleaned up but might trigger during rapid mode changes
3. **Event Listeners**: fullscreenchange listener added but never removed in some cases
4. **Firebase Connection**: No connection pooling or latency management

---

## 10. TESTING PRIORITIES

### Critical (Must Test)
1. **SignalingService.handleIncomingChunk()** - Message reassembly race conditions
2. **MatchService.addMatchToHistory()** - Firebase/localStorage sync consistency
3. **DetectorComponent.processPoseDetection()** - Model switching during frame processing
4. **RtcService lifecycle** - Offer/answer/ICE ordering

### High Priority
5. **AppComponent.runMathGameStep()** - Timeout management and state consistency
6. **WebRTCService ICE handling** - Candidate queuing before remote description
7. **Camera startup** - Permission handling and stream lifecycle
8. **Player ranking updates** - ELO calculations and stat consistency

### Medium Priority
9. **Firebase fallback logic** - Error handling and local storage fallback
10. **Tournament bracket generation** - Complex recursive logic
11. **Toast/notification queue** - Concurrent notifications
12. **Storage service** - localStorage wrapper functionality

### Low Priority
13. **Display components** - UI rendering tests
14. **Audio playback** - Pre-recorded voice handling
15. **Tailwind styling** - CSS class application

---

## SUMMARY: Testing Roadmap

**No existing tests → Fresh infrastructure needed**

Recommend:
- **Testing Framework**: Vitest (fast, modern) + Angular testing utilities
- **Test Structure**: Unit tests for services (high priority), integration tests for multi-component flows, E2E tests for critical user journeys
- **Mock Strategy**: Mock Firebase, BLE, WebRTC APIs; test real signal updates locally
- **Coverage Target**: 80%+ for services, 60%+ for components

