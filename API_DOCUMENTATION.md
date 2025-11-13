# API Documentation - Motion Signal & Sprint Duels

## Table of Contents

1. [Firebase API Integration](#firebase-api-integration)
2. [WebRTC Communication API](#webrtc-communication-api)
3. [Motion Detection APIs](#motion-detection-apis)
4. [Camera and Device APIs](#camera-and-device-apis)
5. [Sprint Duels API](#sprint-duels-api)
6. [Team Duels API](#team-duels-api)
7. [Mobile Platform APIs](#mobile-platform-apis)
8. [Error Handling and Validation](#error-handling-and-validation)

## Firebase API Integration

### Database Schema

#### Session Data Structure

```typescript
interface SessionData {
  // Unique identifier for the session
  sessionId: string;

  // Timestamp of last activity
  timestamp: number;

  // Motion intensity value (0-100)
  intensity: number;

  // Session status
  status: 'active' | 'paused' | 'completed';

  // Participant device IDs
  participants: string[];

  // Session metadata
  metadata?: {
    startTime: number;
    endTime?: number;
    duration?: number;
    deviceType: 'detector' | 'display' | 'single';
  };
}
```

#### Sprint Duels Data Structure

```typescript
interface SprintMatch {
  // Unique match identifier
  id: string;

  // Player information
  player1: {
    id: string;
    name: string;
    elo: number;
  };

  player2: {
    id: string;
    name: string;
    elo: number;
  };

  // Match timing
  startTime: number;
  endTime?: number;

  // Match results
  result?: 'player1' | 'player2' | 'draw';

  // Score tracking
  scores: {
    player1: number;
    player2: number;
    rounds: RoundData[];
  };

  // Tournament information
  tournamentId?: string;
  bracketPosition?: number;
}

interface RoundData {
  roundNumber: number;
  startTime: number;
  endTime: number;
  winner: 'player1' | 'player2';
  player1Time: number;
  player2Time: number;
}
```

#### Player Rankings Structure

```typescript
interface PlayerRanking {
  // Unique player identifier
  playerId: string;

  // Player profile
  profile: {
    name: string;
    avatar?: string;
    createdAt: number;
    lastActive: number;
  };

  // Elo ranking system
  elo: {
    current: number;
    peak: number;
    change: number;
    history: EloHistoryEntry[];
  };

  // Match statistics
  stats: {
    totalMatches: number;
    wins: number;
    losses: number;
    draws: number;
    winRate: number;
    averageTime: number;
    bestTime: number;
  };

  // Achievement tracking
  achievements: Achievement[];
}

interface EloHistoryEntry {
  timestamp: number;
  change: number;
  newRating: number;
  matchId: string;
  opponentId: string;
  result: 'win' | 'loss' | 'draw';
}
```

### Firebase Service API

#### Core Operations

```typescript
@Injectable({ providedIn: 'root' })
export class FirebaseService {

  /**
   * Write motion data to session
   * @param sessionId - Unique session identifier
   * @param intensity - Motion intensity value (0-100)
   * @param metadata - Optional additional data
   */
  async writeMotion(
    sessionId: string,
    intensity: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const sessionRef = ref(this.db, `sessions/${sessionId}`);
    await set(sessionRef, {
      timestamp: Date.now(),
      intensity,
      status: 'active',
      metadata
    });
  }

  /**
   * Listen for motion updates in real-time
   * @param sessionId - Session to monitor
   * @param callback - Function called on updates
   * @returns Unsubscribe function
   */
  listenForMotion(
    sessionId: string,
    callback: (data: SessionData | null) => void
  ): () => void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);

    const unsubscribe = onValue(motionRef, (snapshot) => {
      callback(snapshot.val());
    }, (error) => {
      console.error('Firebase listening error:', error);
      callback(null);
    });

    return unsubscribe;
  }

  /**
   * Create a new sprint match
   * @param matchData - Match configuration
   */
  async createSprintMatch(matchData: Omit<SprintMatch, 'id' | 'startTime'>): Promise<string> {
    const matchId = this.generateId();
    const match: SprintMatch = {
      ...matchData,
      id: matchId,
      startTime: Date.now()
    };

    const matchRef = ref(this.db, `matches/${matchId}`);
    await set(matchRef, match);

    return matchId;
  }

  /**
   * Update match results
   * @param matchId - Match identifier
   * @param results - Match outcome data
   */
  async updateMatchResults(
    matchId: string,
    results: Partial<SprintMatch>
  ): Promise<void> {
    const matchRef = ref(this.db, `matches/${matchId}`);
    await update(matchRef, {
      ...results,
      endTime: Date.now()
    });
  }

  /**
   * Get player rankings with pagination
   * @param limit - Maximum number of results
   * @param offset - Starting position
   */
  async getPlayerRankings(
    limit: number = 50,
    offset: number = 0
  ): Promise<PlayerRanking[]> {
    const rankingsRef = ref(this.db, 'rankings');
    const queryRef = query(
      rankingsRef,
      orderByChild('elo/current'),
      limitToFirst(limit),
      startAt(offset)
    );

    const snapshot = await get(queryRef);
    return snapshot.val() || [];
  }

  /**
   * Update player Elo rating
   * @param playerId - Player identifier
   * @param newElo - New Elo rating
   * @param change - Elo change amount
   * @param matchId - Related match
   */
  async updatePlayerElo(
    playerId: string,
    newElo: number,
    change: number,
    matchId: string
  ): Promise<void> {
    const playerRef = ref(this.db, `players/${playerId}`);
    const historyEntry: EloHistoryEntry = {
      timestamp: Date.now(),
      change,
      newRating: newElo,
      matchId,
      opponentId: '', // Will be filled by caller
      result: 'win'    // Will be filled by caller
    };

    await update(playerRef, {
      'elo/current': newElo,
      'elo/peak': newElo > (await this.getPlayerField(playerId, 'elo/peak')) ? newElo : null,
      'elo/change': change,
      'profile/lastActive': Date.now()
    });

    // Add to history
    const historyRef = push(ref(playerRef, 'elo/history'));
    await set(historyRef, historyEntry);
  }
}
```

### Tournament Management API

```typescript
@Injectable({ providedIn: 'root' })
export class TournamentService {

  /**
   * Create a new tournament
   * @param tournamentData - Tournament configuration
   */
  async createTournament(
    tournamentData: Omit<Tournament, 'id' | 'createdAt' | 'status'>
  ): Promise<string> {
    const tournamentId = this.generateId();
    const tournament: Tournament = {
      ...tournamentData,
      id: tournamentId,
      createdAt: Date.now(),
      status: 'registration'
    };

    const tournamentRef = ref(this.db, `tournaments/${tournamentId}`);
    await set(tournamentRef, tournament);

    return tournamentId;
  }

  /**
   * Register player for tournament
   * @param tournamentId - Tournament identifier
   * @param playerId - Player identifier
   */
  async registerPlayer(tournamentId: string, playerId: string): Promise<void> {
    const registrationRef = ref(
      this.db,
      `tournaments/${tournamentId}/registrations/${playerId}`
    );

    await set(registrationRef, {
      registeredAt: Date.now(),
      status: 'registered'
    });
  }

  /**
   * Generate tournament bracket
   * @param tournamentId - Tournament identifier
   * @param seededPlayers - Optional seeded player list
   */
  async generateBracket(
    tournamentId: string,
    seededPlayers?: string[]
  ): Promise<TournamentBracket> {
    const players = await this.getTournamentRegistrations(tournamentId);
    const bracket = this.createSingleEliminationBracket(players, seededPlayers);

    const bracketRef = ref(this.db, `tournaments/${tournamentId}/bracket`);
    await set(bracketRef, bracket);

    // Update tournament status
    await this.updateTournamentStatus(tournamentId, 'active');

    return bracket;
  }
}
```

## WebRTC Communication API

### Signaling Service API

```typescript
@Injectable({ providedIn: 'root' })
export class SignalingService {

  /**
   * Start WebRTC handshake for display device
   * @param sessionId - Session identifier
   * @returns Promise resolving when handshake is complete
   */
  async startDisplayHandshake(sessionId: string): Promise<void> {
    try {
      // Create WebRTC offer
      const offerSdp = await this.rtcService.createOfferWithDataChannel();

      // Advertise offer via Firebase
      await this.advertiseOffer(sessionId, offerSdp);

      // Listen for answers
      await this.listenForAnswers(sessionId);

    } catch (error) {
      console.error('Display handshake failed:', error);
      throw error;
    }
  }

  /**
   * Start WebRTC handshake for detector device
   * @param sessionId - Session identifier
   * @returns Promise resolving when handshake is complete
   */
  async startDetectorHandshake(sessionId: string): Promise<void> {
    try {
      // Listen for display offers
      await this.listenForOffers(sessionId);

    } catch (error) {
      console.error('Detector handshake failed:', error);
      throw error;
    }
  }

  /**
   * Advertise WebRTC offer via Firebase
   * @param sessionId - Session identifier
   * @param offerSdp - SDP offer string
   */
  private async advertiseOffer(sessionId: string, offerSdp: string): Promise<void> {
    const offerRef = ref(this.db, `signals/${sessionId}/display`);
    await set(offerRef, {
      type: 'offer',
      sdp: offerSdp,
      timestamp: Date.now(),
      expiresAt: Date.now() + 300000 // 5 minutes
    });
  }

  /**
   * Listen for WebRTC answers
   * @param sessionId - Session identifier
   */
  private async listenForAnswers(sessionId: string): Promise<void> {
    const answerRef = ref(this.db, `signals/${sessionId}/detector`);

    onValue(answerRef, async (snapshot) => {
      const data = snapshot.val();

      if (data?.type === 'answer' && data.sdp) {
        // Accept answer and complete connection
        await this.rtcService.setRemoteAnswer(data.sdp);

        // Clean up signaling data
        await remove(answerRef);
      }
    });
  }
}
```

### WebRTC Service API

```typescript
@Injectable({ providedIn: 'root' })
export class RtcService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;

  /**
   * Create WebRTC offer with data channel
   * @returns Promise resolving to SDP offer string
   */
  async createOfferWithDataChannel(): Promise<string> {
    // Create peer connection with ICE servers
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        // Add TURN servers for NAT traversal if needed
        ...this.getTurnServers()
      ]
    });

    // Create data channel for motion communication
    this.dataChannel = this.peerConnection.createDataChannel('motion', {
      ordered: true,
      maxRetransmits: 3
    });

    // Setup data channel handlers
    this.attachDataChannelHandlers();

    // Create and set local offer
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false
    });

    await this.peerConnection.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGatheringComplete();

    return this.peerConnection.localDescription?.sdp || '';
  }

  /**
   * Accept WebRTC offer and create answer
   * @param offerSdp - SDP offer string
   * @returns Promise resolving to SDP answer string
   */
  async acceptOfferAndCreateAnswer(offerSdp: string): Promise<string> {
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.getIceServers()
    });

    // Listen for incoming data channel
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.attachDataChannelHandlers();
    };

    // Set remote offer
    await this.peerConnection.setRemoteDescription({
      type: 'offer',
      sdp: offerSdp
    });

    // Create and set local answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.waitForIceGatheringComplete();

    return this.peerConnection.localDescription?.sdp || '';
  }

  /**
   * Send motion data through data channel
   * @param intensity - Motion intensity value
   * @param metadata - Optional additional data
   */
  sendMotion(intensity: number, metadata?: Record<string, any>): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('Data channel not ready');
      return;
    }

    const message = {
      t: 'motion',
      intensity,
      ts: Date.now(),
      metadata: metadata || {}
    };

    try {
      this.dataChannel.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send motion data:', error);
    }
  }

  /**
   * Register callback for incoming messages
   * @param callback - Function called on incoming messages
   */
  onMessage(callback: (message: any) => void): void {
    this.onMessageCallback = callback;

    // Attach handlers immediately if channel already exists
    if (this.dataChannel) {
      this.attachDataChannelHandlers();
    }
  }

  /**
   * Get connection statistics
   * @returns Promise resolving to connection stats
   */
  async getConnectionStats(): Promise<RTCStatsReport> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not established');
    }

    return this.peerConnection.getStats();
  }
}
```

## Motion Detection APIs

### Diffy Detection Service API

```typescript
@Injectable({ providedIn: 'root' })
export class DiffyDetectionService {

  /**
   * Initialize diffyjs motion detection
   * @param videoElement - Video element to monitor
   * @param config - Detection configuration
   */
  initialize(
    videoElement: HTMLVideoElement,
    config: DiffyDetectionConfig
  ): void {
    this.cleanup(); // Clean up existing instance
    this.config = config;

    // Map sensitivity to diffyjs parameters
    const { sensitivity, threshold } = this.mapSensitivityToParams(
      config.sensitivityLevel
    );

    const options: DiffyOptions = {
      resolution: {
        x: this.MATRIX_WIDTH,
        y: this.MATRIX_HEIGHT
      },
      sensitivity,
      threshold,
      debug: config.debug || false,
      onFrame: (matrix) => this.processFrame(matrix)
    };

    // Create diffyjs instance outside Angular zone
    this.zone.runOutsideAngular(() => {
      this.diffyInstance = create(options);
      this.diffyInstance.start(videoElement);
    });
  }

  /**
   * Get current detection progress
   * @returns Progress object or null if not initialized
   */
  getDetectionProgress(): { current: number; total: number } | null {
    if (!this.config) return null;

    return {
      current: this.detectionCounter(),
      total: this.config.cadence
    };
  }

  /**
   * Update configuration dynamically
   * @param updates - Partial configuration updates
   */
  updateConfig(updates: Partial<DiffyDetectionConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...updates };

      // Reset counter if cooldown or cadence changed
      if (updates.cooldown !== undefined || updates.cadence !== undefined) {
        this.detectionCounter.set(0);
      }
    }
  }

  /**
   * Get motion statistics
   * @returns Current motion statistics
   */
  getMotionStats(): MotionStats {
    return {
      detected: this.motionDetected(),
      lastMotionTime: this.lastMotionTime(),
      detectionRate: this.calculateDetectionRate(),
      averageIntensity: this.calculateAverageIntensity()
    };
  }
}
```

### Speedy Detection Service API

```typescript
@Injectable({ providedIn: 'root' })
export class SpeedyDetectionService {

  /**
   * Initialize speedy-vision motion detection
   * @param videoElement - Video element to monitor
   * @param config - Detection configuration
   */
  async initialize(
    videoElement: HTMLVideoElement,
    config: SpeedyDetectionConfig
  ): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Speedy-vision requires WebGL2 support');
    }

    await this.cleanup();
    this.config = config;

    try {
      // Load video media
      this.media = await Speedy.load(videoElement);

      // Build detection pipeline
      this.pipeline = this.buildDetectionPipeline(config);
      await this.pipeline.init();

      // Start processing loop
      this.isRunning = true;
      this.zone.runOutsideAngular(() => {
        this.processLoop();
      });

    } catch (error) {
      console.error('Speedy initialization failed:', error);
      throw error;
    }
  }

  /**
   * Build computer vision pipeline
   * @param config - Detection configuration
   * @returns Configured Speedy pipeline
   */
  private buildDetectionPipeline(config: SpeedyDetectionConfig): any {
    const pipeline = Speedy.Pipeline();

    // Create pipeline nodes
    const source = Speedy.Image.Source();
    source.media = this.media;

    const greyscale = Speedy.Filter.Greyscale();
    const blur = Speedy.Filter.GaussianBlur();
    const nightvision = Speedy.Filter.Nightvision();

    // Feature detection
    const harris = Speedy.Keypoint.Detector.Harris();
    harris.quality = 0.1;
    harris.capacity = this.calculateFeatureCapacity(config.sensitivityLevel);

    // Optical flow tracking
    const lk = Speedy.Keypoint.Tracker.LK();
    lk.windowSize = Speedy.Size(21, 21);
    lk.levels = 5;

    // Output sink
    const sink = Speedy.Keypoint.Sink();

    // Connect pipeline
    source.output().connectTo(greyscale.input());
    greyscale.output().connectTo(blur.input());
    blur.output().connectTo(nightvision.input());
    nightvision.output().connectTo(harris.input());
    harris.output().connectTo(lk.input());
    lk.output().connectTo(sink.input());

    return pipeline.init(source, greyscale, blur, nightvision, harris, lk, sink);
  }

  /**
   * Get performance metrics
   * @returns Current performance statistics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return {
      fps: this.currentFPS(),
      webGLSupported: this.webGLSupported(),
      isRunning: this.isRunning,
      processingTime: this.averageProcessingTime,
      memoryUsage: this.getMemoryUsage()
    };
  }

  /**
   * Check if speedy-vision is supported
   * @returns True if supported
   */
  isSupported(): boolean {
    return Speedy.isSupported() && this.webGLSupported();
  }
}
```

### Detection Settings Service API

```typescript
@Injectable({ providedIn: 'root' })
export class DetectionSettingsService {
  private settingsSubject = new BehaviorSubject<DetectionSettings>(
    this.getDefaultSettings()
  );

  /**
   * Get current settings as observable
   */
  getSettings(): Observable<DetectionSettings> {
    return this.settingsSubject.asObservable();
  }

  /**
   * Get current settings value
   */
  getCurrentSettings(): DetectionSettings {
    return this.settingsSubject.value;
  }

  /**
   * Update detection settings
   * @param updates - Partial settings updates
   */
  updateSettings(updates: Partial<DetectionSettings>): void {
    const currentSettings = this.getCurrentSettings();
    const newSettings = { ...currentSettings, ...updates };

    // Validate settings
    if (this.validateSettings(newSettings)) {
      this.settingsSubject.next(newSettings);
      this.saveSettings(newSettings);
    }
  }

  /**
   * Reset settings to defaults
   */
  resetToDefaults(): void {
    this.settingsSubject.next(this.getDefaultSettings());
    this.clearSavedSettings();
  }

  /**
   * Get preset configurations
   */
  getPresets(): DetectionPreset[] {
    return [
      {
        id: 'high-sensitivity',
        name: 'High Sensitivity',
        description: 'Detects even small movements',
        config: {
          sensitivityLevel: 2,
          cooldown: 500,
          cadence: 1,
          detectionZone: null
        }
      },
      {
        id: 'balanced',
        name: 'Balanced',
        description: 'Good balance of sensitivity and performance',
        config: {
          sensitivityLevel: 5,
          cooldown: 1000,
          cadence: 1,
          detectionZone: null
        }
      },
      {
        id: 'low-sensitivity',
        name: 'Low Sensitivity',
        description: 'Only detects significant movements',
        config: {
          sensitivityLevel: 8,
          cooldown: 2000,
          cadence: 1,
          detectionZone: null
        }
      }
    ];
  }
}
```

## Camera and Device APIs

### Camera Service API

```typescript
@Injectable({ providedIn: 'root' })
export class CameraService {
  private currentStream: MediaStream | null = null;
  private videoElement: HTMLVideoElement | null = null;

  /**
   * Start camera with specified constraints
   * @param videoElement - Video element to attach stream to
   * @param constraints - Optional media constraints
   * @returns Promise resolving to MediaStream
   */
  async startCamera(
    videoElement: HTMLVideoElement,
    constraints?: MediaStreamConstraints
  ): Promise<MediaStream> {
    const defaultConstraints: MediaStreamConstraints = {
      video: {
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        facingMode: 'environment',
        frameRate: { ideal: 30, min: 15 }
      },
      audio: false
    };

    const finalConstraints = constraints || defaultConstraints;

    try {
      // Request camera permissions
      this.currentStream = await navigator.mediaDevices.getUserMedia(
        finalConstraints
      );

      // Attach to video element
      videoElement.srcObject = this.currentStream;
      this.videoElement = videoElement;

      // Wait for video to be ready
      await new Promise((resolve) => {
        videoElement.onloadedmetadata = resolve;
      });

      return this.currentStream;
    } catch (error) {
      console.error('Camera start failed:', error);
      throw new Error(`Camera access denied: ${error.message}`);
    }
  }

  /**
   * Stop camera stream
   */
  stopCamera(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach(track => track.stop());
      this.currentStream = null;
    }

    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
  }

  /**
   * Take photo from video stream
   * @param quality - Image quality (0-1)
   * @param format - Image format
   * @returns Promise resolving to photo data
   */
  async takePhoto(
    quality: number = 0.8,
    format: 'jpeg' | 'png' = 'jpeg'
  ): Promise<{ dataUrl: string; blob: Blob }> {
    if (!this.videoElement || !this.currentStream) {
      throw new Error('Camera not started');
    }

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Cannot get canvas context');
    }

    // Set canvas dimensions to match video
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;

    // Draw video frame to canvas
    context.drawImage(this.videoElement, 0, 0);

    // Convert to data URL
    const dataUrl = canvas.toDataURL(`image/${format}`, quality);

    // Convert to blob
    const blob = await this.dataUrlToBlob(dataUrl);

    return { dataUrl, blob };
  }

  /**
   * Get available camera devices
   * @returns Promise resolving to device list
   */
  async getCameraDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput');
  }

  /**
   * Switch to different camera device
   * @param deviceId - Device ID to switch to
   */
  async switchCamera(deviceId: string): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Camera not started');
    }

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    // Stop current stream
    this.stopCamera();

    // Start with new device
    await this.startCamera(this.videoElement, constraints);
  }

  /**
   * Get camera capabilities
   * @returns Promise resolving to camera capabilities
   */
  async getCameraCapabilities(): Promise<CameraCapabilities> {
    if (!this.currentStream) {
      throw new Error('Camera not started');
    }

    const videoTrack = this.currentStream.getVideoTracks()[0];
    const capabilities = (videoTrack.getCapabilities() as any) || {};

    return {
      width: {
        min: capabilities.width?.min || 320,
        max: capabilities.width?.max || 1920,
        step: capabilities.width?.step || 1
      },
      height: {
        min: capabilities.height?.min || 240,
        max: capabilities.height?.max || 1080,
        step: capabilities.height?.step || 1
      },
      frameRate: {
        min: capabilities.frameRate?.min || 15,
        max: capabilities.frameRate?.max || 60,
        step: capabilities.frameRate?.step || 1
      },
      facingMode: capabilities.facingMode || ['user', 'environment'],
      torch: capabilities.torch || false
    };
  }
}
```

## Sprint Duels API

### Match Service API

```typescript
@Injectable({ providedIn: 'root' })
export class MatchService {

  /**
   * Create a new match
   * @param matchData - Match configuration
   * @returns Promise resolving to match ID
   */
  async createMatch(matchData: CreateMatchRequest): Promise<string> {
    const matchId = this.generateMatchId();
    const match: SprintMatch = {
      id: matchId,
      player1: matchData.player1,
      player2: matchData.player2,
      startTime: Date.now(),
      scores: {
        player1: 0,
        player2: 0,
        rounds: []
      },
      status: 'waiting',
      bestOf: matchData.bestOf || 3,
      timeLimit: matchData.timeLimit || 30000 // 30 seconds default
    };

    await this.firebaseService.write(`matches/${matchId}`, match);
    return matchId;
  }

  /**
   * Join existing match as player
   * @param matchId - Match identifier
   * @param playerId - Player ID
   * @returns Promise resolving to success status
   */
  async joinMatch(matchId: string, playerId: string): Promise<boolean> {
    const match = await this.getMatch(matchId);

    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status !== 'waiting') {
      throw new Error('Match already started');
    }

    // Check if player is already in match
    if (match.player1.id === playerId || match.player2.id === playerId) {
      return true; // Already joined
    }

    // Add player to empty slot
    if (!match.player1.id) {
      await this.firebaseService.update(`matches/${matchId}`, {
        'player1.id': playerId,
        'status': 'ready'
      });
      return true;
    } else if (!match.player2.id) {
      await this.firebaseService.update(`matches/${matchId}`, {
        'player2.id': playerId,
        'status': 'ready'
      });
      return true;
    }

    throw new Error('Match is full');
  }

  /**
   * Start match
   * @param matchId - Match identifier
   * @param startData - Match start configuration
   */
  async startMatch(
    matchId: string,
    startData: StartMatchData
  ): Promise<void> {
    const match = await this.getMatch(matchId);

    if (!match) {
      throw new Error('Match not found');
    }

    if (match.status !== 'ready') {
      throw new Error('Match not ready to start');
    }

    await this.firebaseService.update(`matches/${matchId}`, {
      status: 'active',
      startTime: Date.now(),
      startData
    });
  }

  /**
   * Record sprint time for player
   * @param matchId - Match identifier
   * @param playerId - Player ID
   * @param time - Sprint time in milliseconds
   */
  async recordSprintTime(
    matchId: string,
    playerId: string,
    time: number
  ): Promise<void> {
    const match = await this.getMatch(matchId);

    if (!match || match.status !== 'active') {
      throw new Error('Match not active');
    }

    const roundNumber = match.scores.rounds.length + 1;

    // Determine if time is within limit
    const validTime = time <= match.timeLimit;

    // Update player's score
    const playerKey = match.player1.id === playerId ? 'player1' : 'player2';
    const opponentKey = playerKey === 'player1' ? 'player2' : 'player1';

    let roundWinner: 'player1' | 'player2';
    let player1Time: number;
    let player2Time: number;

    if (playerKey === 'player1') {
      player1Time = time;
      // Player 2 time will be set when they complete
      player2Time = match.scores.rounds[roundNumber - 1]?.player2Time || 0;
    } else {
      player2Time = time;
      player1Time = match.scores.rounds[roundNumber - 1]?.player1Time || 0;
    }

    // Determine round winner if both have completed
    if (player1Time > 0 && player2Time > 0) {
      roundWinner = player1Time < player2Time ? 'player1' : 'player2';
    } else {
      roundWinner = 'pending';
    }

    // Create or update round data
    const roundData: RoundData = {
      roundNumber,
      startTime: Date.now(),
      endTime: Date.now(),
      winner: roundWinner,
      player1Time,
      player2Time
    };

    const rounds = [...match.scores.rounds];
    if (rounds.length >= roundNumber) {
      rounds[roundNumber - 1] = roundData;
    } else {
      rounds.push(roundData);
    }

    // Update match
    await this.firebaseService.update(`matches/${matchId}`, {
      [`scores/${playerKey}`]: validTime ? match.scores[playerKey] + 1 : match.scores[playerKey],
      'scores/rounds': rounds
    });

    // Check if match is complete
    await this.checkMatchCompletion(matchId);
  }

  /**
   * Get match details
   * @param matchId - Match identifier
   * @returns Promise resolving to match data
   */
  async getMatch(matchId: string): Promise<SprintMatch | null> {
    return this.firebaseService.read(`matches/${matchId}`);
  }

  /**
   * Listen for match updates
   * @param matchId - Match identifier
   * @param callback - Function called on updates
   * @returns Unsubscribe function
   */
  listenForMatchUpdates(
    matchId: string,
    callback: (match: SprintMatch | null) => void
  ): () => void {
    return this.firebaseService.listen(`matches/${matchId}`, callback);
  }
}
```

### Elo Service API

```typescript
@Injectable({ providedIn: 'root' })
export class EloService {
  private readonly K_FACTOR = 32;
  private readonly INITIAL_ELO = 1500;

  /**
   * Calculate Elo rating changes
   * @param player1Rating - Player 1 current rating
   * @param player2Rating - Player 2 current rating
   * @param result - Match result
   * @returns Rating changes for both players
   */
  calculateRatingChanges(
    player1Rating: number,
    player2Rating: number,
    result: 'player1' | 'player2' | 'draw'
  ): { player1Change: number; player2Change: number } {
    // Calculate expected scores
    const player1Expected = this.calculateExpectedScore(player1Rating, player2Rating);
    const player2Expected = 1 - player1Expected;

    // Determine actual scores
    let player1Actual: number;
    let player2Actual: number;

    switch (result) {
      case 'player1':
        player1Actual = 1;
        player2Actual = 0;
        break;
      case 'player2':
        player1Actual = 0;
        player2Actual = 1;
        break;
      case 'draw':
        player1Actual = 0.5;
        player2Actual = 0.5;
        break;
    }

    // Calculate rating changes
    const player1Change = Math.round(this.K_FACTOR * (player1Actual - player1Expected));
    const player2Change = Math.round(this.K_FACTOR * (player2Actual - player2Expected));

    return { player1Change, player2Change };
  }

  /**
   * Calculate expected score
   * @param rating1 - Player 1 rating
   * @param rating2 - Player 2 rating
   * @returns Expected score for player 1
   */
  private calculateExpectedScore(rating1: number, rating2: number): number {
    const ratingDifference = rating2 - rating1;
    return 1 / (1 + Math.pow(10, ratingDifference / 400));
  }

  /**
   * Get initial Elo rating for new player
   * @returns Initial Elo rating
   */
  getInitialRating(): number {
    return this.INITIAL_ELO;
  }

  /**
   * Get rating classification
   * @param rating - Player rating
   * @returns Rating classification
   */
  getRatingClassification(rating: number): RatingClassification {
    if (rating >= 2400) return { rank: 'Grandmaster', tier: 'S+', color: '#FFD700' };
    if (rating >= 2200) return { rank: 'Master', tier: 'S', color: '#C0C0C0' };
    if (rating >= 2000) return { rank: 'Diamond', tier: 'A+', color: '#B9F2FF' };
    if (rating >= 1800) return { rank: 'Diamond', tier: 'A', color: '#87CEEB' };
    if (rating >= 1600) return { rank: 'Platinum', tier: 'B+', color: '#E5E4E2' };
    if (rating >= 1400) return { rank: 'Platinum', tier: 'B', color: '#FFA500' };
    if (rating >= 1200) return { rank: 'Gold', tier: 'C+', color: '#FFD700' };
    if (rating >= 1000) return { rank: 'Gold', tier: 'C', color: '#B8860B' };
    if (rating >= 800) return { rank: 'Silver', tier: 'D+', color: '#C0C0C0' };
    return { rank: 'Bronze', tier: 'D', color: '#CD7F32' };
  }
}
```

## Error Handling and Validation

### Error Types

```typescript
export enum ErrorCode {
  // Firebase errors
  FIREBASE_CONNECTION_FAILED = 'FIREBASE_CONNECTION_FAILED',
  FIREBASE_PERMISSION_DENIED = 'FIREBASE_PERMISSION_DENIED',

  // WebRTC errors
  WEBRTC_CONNECTION_FAILED = 'WEBRTC_CONNECTION_FAILED',
  WEBRTC_ICE_FAILED = 'WEBRTC_ICE_FAILED',
  WEBRTC_DATA_CHANNEL_FAILED = 'WEBRTC_DATA_CHANNEL_FAILED',

  // Camera errors
  CAMERA_ACCESS_DENIED = 'CAMERA_ACCESS_DENIED',
  CAMERA_NOT_FOUND = 'CAMERA_NOT_FOUND',
  CAMERA_ALREADY_IN_USE = 'CAMERA_ALREADY_IN_USE',

  // Detection errors
  DETECTION_INITIALIZATION_FAILED = 'DETECTION_INITIALIZATION_FAILED',
  DETECTION_WEBGL_NOT_SUPPORTED = 'DETECTION_WEBGL_NOT_SUPPORTED',
  DETECTION_HARDWARE_ACCELERATION_UNAVAILABLE = 'DETECTION_HARDWARE_ACCELERATION_UNAVAILABLE',

  // Match errors
  MATCH_NOT_FOUND = 'MATCH_NOT_FOUND',
  MATCH_ALREADY_FULL = 'MATCH_ALREADY_FULL',
  MATCH_ALREADY_STARTED = 'MATCH_ALREADY_STARTED',

  // Validation errors
  INVALID_SESSION_ID = 'INVALID_SESSION_ID',
  INVALID_PLAYER_DATA = 'INVALID_PLAYER_DATA',
  INVALID_MATCH_CONFIG = 'INVALID_MATCH_CONFIG'
}

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'AppError';
  }
}
```

### Validation Schemas

```typescript
export const ValidationSchemas = {
  sessionId: {
    type: 'string',
    pattern: /^[A-Z0-9]{6}$/,
    minLength: 6,
    maxLength: 6,
    message: 'Session ID must be 6 uppercase alphanumeric characters'
  },

  playerName: {
    type: 'string',
    minLength: 1,
    maxLength: 30,
    pattern: /^[a-zA-Z0-9\s\-_]+$/,
    message: 'Player name must be 1-30 characters (letters, numbers, spaces, hyphens, underscores)'
  },

  motionIntensity: {
    type: 'number',
    minimum: 0,
    maximum: 100,
    message: 'Motion intensity must be between 0 and 100'
  },

  sprintTime: {
    type: 'number',
    minimum: 0,
    maximum: 60000, // 60 seconds max
    message: 'Sprint time must be between 0 and 60000 milliseconds'
  },

  detectionConfig: {
    type: 'object',
    required: ['sensitivityLevel', 'cooldown', 'cadence'],
    properties: {
      sensitivityLevel: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        message: 'Sensitivity level must be between 1 and 10'
      },
      cooldown: {
        type: 'number',
        minimum: 100,
        maximum: 10000,
        message: 'Cooldown must be between 100 and 10000 milliseconds'
      },
      cadence: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        message: 'Cadence must be between 1 and 10'
      }
    }
  }
};

export class Validator {
  static validate<T>(data: T, schema: any): ValidationResult {
    const errors: string[] = [];

    // Type checking
    if (schema.type && typeof data !== schema.type) {
      errors.push(`Expected ${schema.type}, got ${typeof data}`);
      return { isValid: false, errors };
    }

    // Required fields
    if (schema.required && Array.isArray(schema.required)) {
      for (const field of schema.required) {
        if (!(field in data)) {
          errors.push(`Required field '${field}' is missing`);
        }
      }
    }

    // String validations
    if (typeof data === 'string') {
      if (schema.minLength && data.length < schema.minLength) {
        errors.push(`Minimum length is ${schema.minLength}`);
      }
      if (schema.maxLength && data.length > schema.maxLength) {
        errors.push(`Maximum length is ${schema.maxLength}`);
      }
      if (schema.pattern && !schema.pattern.test(data)) {
        errors.push(schema.message || 'Invalid format');
      }
    }

    // Number validations
    if (typeof data === 'number') {
      if (schema.minimum !== undefined && data < schema.minimum) {
        errors.push(`Minimum value is ${schema.minimum}`);
      }
      if (schema.maximum !== undefined && data > schema.maximum) {
        errors.push(`Maximum value is ${schema.maximum}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}
```

### Error Handler Service

```typescript
@Injectable({ providedIn: 'root' })
export class ErrorHandlerService {
  private errorSubject = new BehaviorSubject<AppError | null>(null);

  /**
   * Handle application errors
   * @param error - Error to handle
   */
  handleError(error: AppError | Error | any): void {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError(
        ErrorCode.UNKNOWN_ERROR,
        error.message,
        error.stack
      );
    } else {
      appError = new AppError(
        ErrorCode.UNKNOWN_ERROR,
        'An unknown error occurred',
        error
      );
    }

    // Log error
    console.error('Application error:', appError);

    // Report to analytics if in production
    if (environment.production) {
      this.reportError(appError);
    }

    // Notify subscribers
    this.errorSubject.next(appError);

    // Attempt recovery for specific error types
    this.attemptRecovery(appError);
  }

  /**
   * Get observable stream of errors
   */
  getErrors(): Observable<AppError | null> {
    return this.errorSubject.asObservable();
  }

  /**
   * Clear current error
   */
  clearError(): void {
    this.errorSubject.next(null);
  }

  /**
   * Attempt automatic recovery from error
   * @param error - Error to recover from
   */
  private attemptRecovery(error: AppError): void {
    switch (error.code) {
      case ErrorCode.FIREBASE_CONNECTION_FAILED:
        // Retry Firebase connection
        setTimeout(() => {
          this.firebaseService.reconnect();
        }, 5000);
        break;

      case ErrorCode.WEBRTC_CONNECTION_FAILED:
        // Fallback to Firebase-only communication
        this.rtcService.useFallback();
        break;

      case ErrorCode.CAMERA_ACCESS_DENIED:
        // Show permission request dialog
        this.showCameraPermissionDialog();
        break;

      case ErrorCode.DETECTION_WEBGL_NOT_SUPPORTED:
        // Switch to CPU-based detection
        this.detectionService.switchToCpuMode();
        break;
    }
  }
}
```

This comprehensive API documentation provides detailed information about all the major APIs and integration points in the Motion Signal & Sprint Duels application, including method signatures, parameter descriptions, error handling, and usage examples.