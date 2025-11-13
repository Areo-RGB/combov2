# Motion Signal & Sprint Duels - Complete Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Development Setup](#development-setup)
4. [Application Structure](#application-structure)
5. [Core Features](#core-features)
6. [API & Integration Points](#api--integration-points)
7. [Performance & Optimization](#performance--optimization)
8. [Testing Strategy](#testing-strategy)
9. [Deployment & Production](#deployment--production)
10. [Mobile Development](#mobile-development)
11. [Contributing Guidelines](#contributing-guidelines)

## Project Overview

Motion Signal & Sprint Duels is a sophisticated Angular application that combines real-time motion detection with a sprint competition management system. The application uses device cameras for motion detection and implements both Firebase and WebRTC technologies for real-time communication between devices.

### Key Features

- **Real-time Motion Detection**: Advanced motion detection using multiple algorithms (diffyjs, speedy-vision)
- **Multi-device Communication**: Firebase and WebRTC for peer-to-peer communication
- **Sprint Competition Management**: Complete tournament system with Elo rankings
- **Body Pose Analysis**: MediaPipe integration for advanced pose detection
- **Mobile Support**: Capacitor-based cross-platform mobile deployment
- **Performance Optimized**: GPU acceleration with WebGL/WebGPU backends

### Technology Stack

#### Frontend
- **Angular 20**: Standalone components, zoneless, signals-based architecture
- **TypeScript**: Strict typing with advanced patterns
- **Tailwind CSS**: Utility-first styling approach
- **Vite**: High-performance build tool and development server

#### ML/Vision Processing
- **MediaPipe Pose**: Advanced body pose detection
- **TensorFlow.js**: Machine learning models and backends
- **Speedy-Vision**: High-performance computer vision with optical flow
- **DiffyJS**: Motion detection library

#### Real-time Communication
- **Firebase**: Real-time database for data synchronization
- **WebRTC**: Peer-to-peer communication for low-latency connections
- **Signaling Service**: WebRTC signaling via Firebase

#### Mobile Development
- **Capacitor**: Cross-platform mobile development framework
- **Bluetooth LE**: Low-energy Bluetooth communication
- **Camera API**: Native camera integration

#### Testing & Quality
- **Vitest**: Modern test runner with UI interface
- **Testing Library**: Component testing utilities
- **Happy DOM**: Lightweight DOM testing environment
- **ESLint & Prettier**: Code quality and formatting tools

## Architecture

### System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Angular Application                      │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   App Component │  │   Mode Manager  │  │   Services   │ │
│  │   (State Mgmt)  │  │   (Navigation) │  │   (Layer)    │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Components    │  │   Feature Mods  │  │  Detection   │ │
│  │  (Standalone)   │  │  (Sprint Duels) │  │   Services   │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
│  │   Firebase      │  │     WebRTC      │  │   Device     │ │
│  │   (Real-time)   │  │  (P2P Comm)     │  │     APIs     │ │
│  └─────────────────┘  └─────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Core Application Structure

The application follows a signal-based architecture with mode-driven navigation:

```typescript
// Main app state management
mode = signal<'selection' | 'detector' | 'display' | 'single' | 'sprint-*' | 'bodypose'>('selection');
sessionId = signal('');
motionSignal = signal<DisplaySignal>(null);
```

### Component Organization

#### Standalone Components Pattern
All components are standalone with `ChangeDetectionStrategy.OnPush` for optimal performance:

```typescript
@Component({
  selector: 'app-detector',
  templateUrl: './detector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [/* dependencies */]
})
export class DetectorComponent {
  // Component logic
}
```

#### Feature Modules
- **Core Components**: Shared UI components (header, display, detector)
- **Sprint Duels**: Complete competition management system
- **Team Duels**: Multi-player real-time competitions
- **Motion Detection**: Camera-based motion detection components

### Service Architecture

#### Core Services (`src/services/`)
- `FirebaseService`: Firebase real-time database operations
- `RtcService`: WebRTC peer-to-peer communication
- `SignalingService`: WebRTC signaling via Firebase
- `CameraService`: Camera access and photo capture
- `SprintTimingService`: Sprint timing logic

#### Detection Services
- `DiffyDetectionService`: Motion detection using diffyjs
- `SpeedyDetectionService`: High-performance GPU-accelerated detection
- `DetectionSettingsService`: Centralized detection configuration

#### Feature-Specific Services
- **Sprint Duels Services**: Elo ranking, matches, tournaments
- **Team Duels Services**: WebRTC team communication

## Development Setup

### Prerequisites

- Node.js 18+ and npm/pnpm
- Git
- Angular CLI (global)
- Android Studio (for mobile development)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd combov2

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Development Commands

#### Basic Development
```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

#### Code Quality
```bash
# Format code
pnpm format

# Check formatting
pnpm format:check

# Lint code
pnpm lint

# Fix linting issues
pnpm lint:fix

# Run both linting and formatting
pnpm lint:format

# Check all code quality
pnpm check
```

#### Testing
```bash
# Run all tests
pnpm test

# Run tests with UI interface
pnpm test:ui

# Run tests with coverage report
pnpm test:coverage

# Run specific test categories
pnpm test:race    # Race condition tests
pnpm test:perf    # Performance tests
pnpm test:ci      # CI tests with coverage
```

#### Mobile Development
```bash
# Initialize Capacitor project
pnpm cap:init

# Add Android platform
pnpm cap:add:android

# Sync Android platform
pnpm cap:sync

# Open Android Studio
pnpm open:android

# Build and sync for Android
pnpm build:android
```

### Development Workflow

1. **Feature Development**: Create components and services
2. **Testing**: Write comprehensive unit and integration tests
3. **Code Review**: Use linting and formatting tools
4. **Mobile Testing**: Test on actual devices with Capacitor

## Application Structure

### Mode-Based Navigation

The application uses a sophisticated mode-based navigation system controlled by signals:

```typescript
type AppMode =
  | 'selection'           // Main menu
  | 'motion-games'        // Motion detection games
  | 'detector'           // Camera motion detection
  | 'display'            // Signal visualization
  | 'single'             // Combined detector + display
  | 'sprint-timing-*'    // Sprint timing variants
  | 'sprint-duels'       // Competition management
  | 'team-duels'         // Team-based competitions
  | 'bodypose'           // Body pose analysis;

mode = signal<AppMode>('selection');
```

### State Management with Signals

#### Central State
```typescript
// Core application state
mode = signal<AppMode>('selection');
sessionId = signal('');
motionSignal = signal<DisplaySignal>(null);
lastPhotoDataUrl = signal<string | null>(null);

// Game state
mathGameStatus = signal<'idle' | 'running' | 'finished'>('idle');
currentSum = signal(0);
operationsDone = signal(0);
detectionCount = signal(0);
```

#### Effects for Lifecycle Management
```typescript
effect((onCleanup) => {
  const mode = this.mode();
  const sessionId = this.sessionId();

  // Setup logic based on mode and session

  onCleanup(() => {
    // Cleanup logic when mode or session changes
  });
});
```

### Component Architecture

#### Standalone Components
All components follow the standalone pattern for better tree-shaking and performance:

```typescript
@Component({
  selector: 'app-example',
  templateUrl: './example.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [CommonModule, OtherComponents]
})
export class ExampleComponent {
  // Component implementation
}
```

#### Component Communication
- **Signals**: For reactive state management
- **Custom Events**: For component-to-component communication
- **Services**: For shared business logic
- **Effects**: For lifecycle management

## Core Features Documentation

### Motion Detection Systems

#### DiffyJS Detection Service

The `DiffyDetectionService` provides CPU-based motion detection using the diffyjs library:

```typescript
// Configuration
interface DiffyDetectionConfig {
  sensitivityLevel: number;    // 1-10 (1 = most sensitive)
  detectionZone: DetectionZone | null;
  cooldown: number;           // Minimum delay between detections
  cadence: number;            // Emit on every Nth detection
  debug?: boolean;
}

// Usage
const diffyService = new DiffyDetectionService();
diffyService.initialize(videoElement, {
  sensitivityLevel: 5,
  detectionZone: { x: 0, y: 0, width: 160, height: 120 },
  cooldown: 1000,
  cadence: 1
});
```

#### Speedy-Vision Detection Service

The `SpeedyDetectionService` provides GPU-accelerated motion detection with optical flow:

```typescript
// Configuration
interface SpeedyDetectionConfig {
  sensitivityLevel: number;
  detectionZone: DetectionZone | null;
  cooldown: number;
  cadence: number;
  debug?: boolean;
}

// Advanced motion analysis
interface SpeedyMotionResult {
  detected: boolean;
  intensity: number;
  velocity: number;
  direction: { x: number; y: number };
  confidence: number;
  timestamp: number;
}
```

### Real-time Communication

#### Firebase Integration

```typescript
// Firebase service for real-time data sync
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  writeMotion(sessionId: string, intensity: number): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    set(motionRef, {
      timestamp: Date.now(),
      intensity: intensity,
    });
  }

  listenForMotion(sessionId: string, callback: Function): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    onValue(motionRef, (snapshot) => {
      callback(snapshot.val());
    });
  }
}
```

#### WebRTC Communication

```typescript
// WebRTC service for peer-to-peer communication
@Injectable({ providedIn: 'root' })
export class RtcService {
  async createOfferWithDataChannel(): Promise<string> {
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.dataChannel = this.peerConnection.createDataChannel('motion');
    // ... setup handlers
    return offer.sdp;
  }

  sendMotion(intensity: number): void {
    if (this.dataChannel?.readyState === 'open') {
      const message = { t: 'motion', intensity, ts: Date.now() };
      this.dataChannel.send(JSON.stringify(message));
    }
  }
}
```

### Sprint Timing and Competition Management

#### Sprint Timing Service

```typescript
@Injectable({ providedIn: 'root' })
export class SprintTimingService {
  startTiming(sessionId: string): void {
    this.startTime = performance.now();
    this.isRunning = true;
  }

  stopTiming(): SprintResult {
    const endTime = performance.now();
    const duration = endTime - this.startTime;
    return {
      duration,
      timestamp: Date.now(),
      sessionId: this.sessionId()
    };
  }
}
```

#### Sprint Duels Features

The Sprint Duels module provides a comprehensive competition management system:

- **Elo Ranking System**: Dynamic player rankings based on match results
- **Tournament Management**: Create and manage tournaments
- **Match Making**: Automatic opponent matching based on skill level
- **Real-time Updates**: Live score updates and match notifications

### Body Pose Analysis

#### MediaPipe Integration

```typescript
// Body pose detection using MediaPipe
export class BodyposeComponent implements OnInit {
  async initializePoseDetection(): Promise<void> {
    const pose = new Pose({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(this.onPoseResults.bind(this));
  }
}
```

## API & Integration Points

### Firebase Integration Patterns

#### Real-time Database Structure

```typescript
// Sessions collection structure
interface SessionData {
  timestamp: number;
  intensity: number;
  sessionId: string;
  participants: string[];
  status: 'active' | 'completed';
}

// Sprint Duels data structure
interface SprintMatch {
  id: string;
  player1: string;
  player2: string;
  startTime: number;
  endTime?: number;
  result?: 'player1' | 'player2' | 'draw';
  scores: {
    player1: number;
    player2: number;
  };
}
```

#### Firebase Service Architecture

```typescript
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  private app: FirebaseApp;
  private db: Database;

  constructor() {
    this.app = initializeApp(firebaseConfig);
    this.db = getDatabase(this.app);
  }

  // Generic read/write methods
  write<T>(path: string, data: T): Promise<void>;
  read<T>(path: string): Promise<T | null>;
  listen<T>(path: string, callback: (data: T | null) => void): () => void;
}
```

### WebRTC Communication Architecture

#### Signaling Service

```typescript
@Injectable({ providedIn: 'root' })
export class SignalingService {
  async startDisplayHandshake(sessionId: string): Promise<void> {
    // Create and advertise offer
    const offer = await this.rtc.createOfferWithDataChannel();
    await this.firebase.write(`signals/${sessionId}/display`, {
      type: 'offer',
      sdp: offer,
      timestamp: Date.now()
    });

    // Listen for answers
    this.listenForAnswers(sessionId);
  }

  async startDetectorHandshake(sessionId: string): Promise<void> {
    // Listen for display offers and create answers
    this.listenForOffers(sessionId);
  }
}
```

#### Connection Management

```typescript
export class ConnectionManager {
  private connections = new Map<string, RTCPeerConnection>();

  async establishConnection(sessionId: string, role: 'offerer' | 'answerer'): Promise<void> {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    // Setup data channel, event handlers, and signaling
    this.setupDataChannel(pc);
    this.setupIceCandidates(pc, sessionId);

    this.connections.set(sessionId, pc);
  }
}
```

### Camera and Device APIs

#### Camera Service

```typescript
@Injectable({ providedIn: 'root' })
export class CameraService {
  async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: 'environment'
      },
      audio: false
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoElement.srcObject = stream;
    return stream;
  }

  async takePhotoToDataUrl(quality: number = 0.8): Promise<{ dataUrl: string; blob: Blob }> {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Draw video frame to canvas
    canvas.width = this.videoElement.videoWidth;
    canvas.height = this.videoElement.videoHeight;
    context.drawImage(this.videoElement, 0, 0);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const blob = await this.dataUrlToBlob(dataUrl);

    return { dataUrl, blob };
  }
}
```

### ML/Vision Processing

#### TensorFlow.js Backend Management

```typescript
export class BackendManager {
  async initializeBackend(): Promise<void> {
    // Try WebGPU first (best performance)
    try {
      await tf.setBackend('webgpu');
      await tf.ready();
      console.log('WebGPU backend initialized');
      return;
    } catch (e) {
      console.warn('WebGPU not available, trying WebGL');
    }

    // Fallback to WebGL
    try {
      await tf.setBackend('webgl');
      await tf.ready();
      console.log('WebGL backend initialized');
      return;
    } catch (e) {
      console.warn('WebGL not available, using CPU');
    }

    // Final fallback to CPU
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('CPU backend initialized');
  }
}
```

## Performance & Optimization

### Mobile Performance Considerations

#### WebGL/WebGPU Optimization

```typescript
// Optimized rendering for mobile devices
export class MobileRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext | WebGL2RenderingContext;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    this.setupOptimizations();
  }

  private setupOptimizations(): void {
    // Enable performance optimizations
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.enable(this.gl.CULL_FACE);

    // Set optimal pixel storage parameters
    this.gl.pixelStorei(this.gl.UNPACK_ALIGNMENT, 1);

    // Use high-performance hints
    this.gl.hint(this.gl.GENERATE_MIPMAP_HINT, this.gl.NICEST);
  }
}
```

#### Memory Management

```typescript
export class MemoryManager {
  private textures = new Set<WebGLTexture>();
  private buffers = new Set<WebGLBuffer>();

  // Cleanup resources when not needed
  cleanup(): void {
    this.textures.forEach(texture => {
      this.gl.deleteTexture(texture);
    });
    this.buffers.forEach(buffer => {
      this.gl.deleteBuffer(buffer);
    });
    this.textures.clear();
    this.buffers.clear();
  }

  // Monitor memory usage
  getMemoryUsage(): MemoryInfo {
    return (performance as any).memory || {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0
    };
  }
}
```

### Real-time Processing Optimizations

#### Frame Rate Management

```typescript
export class FrameRateManager {
  private targetFPS = 30;
  private frameInterval = 1000 / this.targetFPS;
  private lastFrameTime = 0;

  shouldProcessFrame(): boolean {
    const now = performance.now();
    const delta = now - this.lastFrameTime;

    if (delta >= this.frameInterval) {
      this.lastFrameTime = now - (delta % this.frameInterval);
      return true;
    }
    return false;
  }

  adjustTargetFPS(performanceScore: number): void {
    // Dynamically adjust FPS based on performance
    if (performanceScore < 0.5) {
      this.targetFPS = Math.max(15, this.targetFPS - 5);
    } else if (performanceScore > 0.8) {
      this.targetFPS = Math.min(60, this.targetFPS + 5);
    }
    this.frameInterval = 1000 / this.targetFPS;
  }
}
```

#### Batch Processing

```typescript
export class BatchProcessor {
  private batchQueue: Array<() => void> = [];
  private batchTimeout: number | null = null;

  scheduleBatch(operation: () => void): void {
    this.batchQueue.push(operation);

    if (!this.batchTimeout) {
      this.batchTimeout = requestAnimationFrame(() => {
        this.processBatch();
      });
    }
  }

  private processBatch(): void {
    // Process all queued operations together
    const operations = this.batchQueue.splice(0);

    // Run operations outside Angular zone for performance
    this.ngZone.runOutsideAngular(() => {
      operations.forEach(op => op());
    });

    this.batchTimeout = null;
  }
}
```

### Lazy Loading Strategies

#### Component Lazy Loading

```typescript
// Lazy load heavy components
export const HeavyComponent = loadComponent(() =>
  import('./heavy.component').then(m => m.HeavyComponent)
);

// Usage in template
@if (showHeavyComponent) {
  <app-heavy-component />
}
```

#### Service Lazy Loading

```typescript
// Lazy load detection services based on user preferences
export class DetectionServiceLoader {
  async loadDetectionService(type: 'diffy' | 'speedy'): Promise<DetectionService> {
    switch (type) {
      case 'diffy':
        const { DiffyDetectionService } = await import('./diffy-detection.service');
        return new DiffyDetectionService();
      case 'speedy':
        const { SpeedyDetectionService } = await import('./speedy-detection.service');
        return new SpeedyDetectionService();
    }
  }
}
```

## Testing Strategy

### Unit Testing Patterns

#### Component Testing

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';

describe('DetectorComponent', () => {
  let component: DetectorComponent;
  let fixture: ComponentFixture<DetectorComponent>;

  beforeEach(async () => {
    await render(DetectorComponent, {
      componentProperties: {
        sessionId: 'TEST123'
      }
    });
  });

  it('should initialize with correct session ID', () => {
    expect(screen.getByTestId('session-display')).toHaveTextContent('TEST123');
  });

  it('should handle motion detection events', async () => {
    const motionEvent = new CustomEvent('motionDetected', {
      detail: { intensity: 75, timestamp: Date.now() }
    });

    window.dispatchEvent(motionEvent);

    expect(screen.getByTestId('motion-indicator')).toBeVisible();
  });
});
```

#### Service Testing

```typescript
import { TestBed } from '@angular/core/testing';
import { FirebaseService } from './firebase.service';

describe('FirebaseService', () => {
  let service: FirebaseService;
  let mockFirebase: jasmine.SpyObj<FirebaseApp>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('FirebaseApp', ['database']);

    TestBed.configureTestingModule({
      providers: [
        FirebaseService,
        { provide: FirebaseApp, useValue: spy }
      ]
    });

    service = TestBed.inject(FirebaseService);
    mockFirebase = TestBed.inject(FirebaseApp) as jasmine.SpyObj<FirebaseApp>;
  });

  it('should write motion data to Firebase', async () => {
    const mockSet = jasmine.createSpy('set');
    mockFirebase.database.and.returnValue({
      ref: () => ({ set: mockSet })
    });

    service.writeMotion('TEST123', 50);

    expect(mockSet).toHaveBeenCalledWith({
      timestamp: jasmine.any(Number),
      intensity: 50
    });
  });
});
```

### Integration Testing

#### Multi-component Integration

```typescript
describe('Detector-Display Integration', () => {
  it('should communicate motion between detector and display components', async () => {
    const sessionId = 'INTEGRATION_TEST';

    // Setup detector component
    const detector = await render(DetectorComponent, {
      componentProperties: { sessionId }
    });

    // Setup display component
    const display = await render(DisplayComponent, {
      componentProperties: { sessionId }
    });

    // Simulate motion detection
    const mockMotion = {
      timestamp: Date.now(),
      intensity: 80
    };

    // Trigger motion in detector
    detector.detectChanges();
    await detector.fixture.componentInstance.handleMotion(80);

    // Verify display received the motion
    await waitFor(() => {
      expect(screen.getByTestId('motion-signal')).toHaveAttribute('data-intensity', '80');
    });
  });
});
```

### Performance Testing

#### Motion Detection Performance

```typescript
describe('Motion Detection Performance', () => {
  it('should maintain 30+ FPS during motion detection', async () => {
    const speedyService = new SpeedyDetectionService();
    const mockVideo = createMockVideoElement();

    await speedyService.initialize(mockVideo, {
      sensitivityLevel: 5,
      cooldown: 100,
      cadence: 1
    });

    const frameCount = 100;
    const startTime = performance.now();

    for (let i = 0; i < frameCount; i++) {
      await processTestFrame(mockVideo);
      await new Promise(resolve => setTimeout(resolve, 16)); // ~60fps
    }

    const endTime = performance.now();
    const fps = (frameCount / (endTime - startTime)) * 1000;

    expect(fps).toBeGreaterThan(30); // Should maintain at least 30 FPS
    speedyService.cleanup();
  });
});
```

#### Memory Usage Testing

```typescript
describe('Memory Management', () => {
  it('should not leak memory during extended use', async () => {
    const initialMemory = (performance as any).memory?.usedJSHeapSize || 0;

    // Run extended detection session
    for (let i = 0; i < 1000; i++) {
      const service = new SpeedyDetectionService();
      await service.initialize(mockVideo, defaultConfig);
      await service.cleanup();
    }

    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const finalMemory = (performance as any).memory?.usedJSHeapSize || 0;
    const memoryIncrease = finalMemory - initialMemory;

    // Memory increase should be minimal (< 10MB)
    expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
  });
});
```

### Race Condition Testing

```typescript
describe('Race Conditions', () => {
  it('should handle concurrent motion detection events', async () => {
    const service = new DiffyDetectionService();
    const events: string[] = [];

    // Listen for events
    window.addEventListener('diffyMotionDetected', (e) => {
      events.push(e.detail.timestamp.toString());
    });

    // Simulate concurrent motion events
    const promises = Array.from({ length: 10 }, (_, i) =>
      new Promise(resolve => {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('diffyMotionDetected', {
            detail: { intensity: 50, timestamp: Date.now() + i }
          }));
          resolve();
        }, Math.random() * 100);
      })
    );

    await Promise.all(promises);

    // All events should be processed in order
    expect(events).toHaveLength(10);
    expect(events).toEqual(events.sort()); // Should be sorted by timestamp
  });
});
```

## Deployment & Production

### Build Process

#### Production Build Configuration

```typescript
// angular.json production configuration
{
  "configurations": {
    "production": {
      "outputHashing": "all",
      "optimization": true,
      "sourceMap": false,
      "extractCss": true,
      "namedChunks": false,
      "extractLicenses": true,
      "vendorChunk": false,
      "buildOptimizer": true,
      "fileReplacements": [
        {
          "replace": "src/environments/environment.ts",
          "with": "src/environments/environment.prod.ts"
        }
      ]
    }
  }
}
```

#### Environment Configuration

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  firebaseConfig: {
    // Production Firebase configuration
  },
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn-server.com', username: 'user', credential: 'pass' }
    ]
  },
  performance: {
    enableWebGPU: true,
    maxFPS: 60,
    qualityLevel: 'high'
  }
};
```

### Mobile Deployment

#### Android Build Process

```bash
# Build for production
pnpm build

# Sync with Capacitor
pnpm cap:sync

# Open Android Studio for advanced build configuration
pnpm open:android

# Or build directly from command line
pnpm build:android
```

#### Capacitor Configuration

```typescript
// capacitor.config.ts
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.motionsignal.app',
  appName: 'Motion Signal & Sprint Duels',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Camera: {
      permissions: ['camera', 'microphone']
    },
    BluetoothLE: {
      permissions: ['bluetooth', 'bluetooth-admin']
    }
  }
};

export default config;
```

### Production Optimization

#### Bundle Analysis

```bash
# Analyze bundle size
pnpm build --stats-json
npx webpack-bundle-analyzer dist/stats.json
```

#### Service Worker Configuration

```typescript
// ngsw-config.json
{
  "index": "/index.html",
  "assetGroups": [
    {
      "name": "app",
      "installMode": "prefetch",
      "resources": {
        "files": [
          "/favicon.ico",
          "/index.html",
          "/*.css",
          "/*.js"
        ]
      }
    },
    {
      "name": "assets",
      "installMode": "lazy",
      "updateMode": "prefetch",
      "resources": {
        "files": [
          "/assets/**",
          "/*.(svg|cur|jpg|jpeg|png|apng|webp|avif|gif|otf|ttf|woff|woff2)"
        ]
      }
    }
  ]
}
```

## Mobile Development

### Capacitor Setup and Configuration

#### Project Initialization

```bash
# Initialize Capacitor project
npx cap init MotionSignal com.motionsignal.app --web-dir=dist

# Add platforms
npx cap add android
npx cap add ios  # if iOS support is needed

# Sync platforms with web build
npx cap sync
```

#### Native Plugin Integration

```typescript
// Camera integration
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

export class NativeCameraService {
  async takePicture(): Promise<string> {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera
    });

    return image.dataUrl || '';
  }
}
```

### Bluetooth LE Integration

```typescript
import { BluetoothLe } from '@capacitor-community/bluetooth-le';

export class BluetoothService {
  async scanForDevices(): Promise<Device[]> {
    await BluetoothLe.requestPermissions();

    return new Promise((resolve, reject) => {
      BluetoothLe.startScan({
        services: ['heart_rate'] // Example service UUID
      }).then(() => {
        // Handle scan results
      });
    });
  }
}
```

### Performance Optimization for Mobile

#### Memory Management

```typescript
export class MobileOptimizer {
  private isLowMemoryDevice = false;

  constructor() {
    this.detectDeviceCapabilities();
  }

  private detectDeviceCapabilities(): void {
    const memory = (navigator as any).deviceMemory;
    const cores = navigator.hardwareConcurrency;

    this.isLowMemoryDevice = (memory && memory < 4) || (cores && cores < 4);
  }

  getOptimalConfig(): DetectionConfig {
    if (this.isLowMemoryDevice) {
      return {
        matrixWidth: 20,  // Reduced resolution
        matrixHeight: 15,
        maxFPS: 30,       // Lower frame rate
        qualityLevel: 'low'
      };
    }

    return {
      matrixWidth: 40,
      matrixHeight: 30,
      maxFPS: 60,
      qualityLevel: 'high'
    };
  }
}
```

#### Battery Optimization

```typescript
export class BatteryManager {
  private batteryLevel = 1.0;
  private isCharging = false;

  constructor() {
    this.monitorBattery();
  }

  private async monitorBattery(): Promise<void> {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();

      battery.addEventListener('levelchange', () => {
        this.batteryLevel = battery.level;
        this.adjustPerformance();
      });

      battery.addEventListener('chargingchange', () => {
        this.isCharging = battery.charging;
        this.adjustPerformance();
      });
    }
  }

  private adjustPerformance(): void {
    if (this.batteryLevel < 0.2 && !this.isCharging) {
      // Reduce performance to save battery
      this.reducePerformance();
    } else {
      this.restorePerformance();
    }
  }
}
```

### Platform-Specific Features

#### Android Integration

```typescript
// Android-specific features
export class AndroidFeatures {
  async handleBackButton(): Promise<void> {
    document.addEventListener('backbutton', (e) => {
      e.preventDefault();
      // Handle back button logic
      this.navigationService.goBack();
    });
  }

  async requestPermissions(): Promise<void> {
    const permissions = [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.BLUETOOTH',
      'android.permission.BLUETOOTH_ADMIN'
    ];

    for (const permission of permissions) {
      const result = await Permissions.request(permission);
      if (result.state !== 'granted') {
        console.warn(`Permission ${permission} not granted`);
      }
    }
  }
}
```

## Contributing Guidelines

### Code Style and Standards

#### TypeScript Standards

```typescript
// Use strict typing
interface StrictInterface {
  requiredProperty: string;
  optionalProperty?: number;
  readonlyProperty: readonly string[];
}

// Prefer const assertions
const COLORS = [
  '#ef4444',
  '#22c55e',
  '#3b82f6'
] as const;

type Color = typeof COLORS[number];
```

#### Component Standards

```typescript
@Component({
  selector: 'app-component',
  templateUrl: './component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class ComponentComponent {
  // Use signals for state management
  private state = signal<State>({ value: 'initial' });

  // Use computed signals for derived state
  computedValue = computed(() => this.state().value.toUpperCase());

  // Use effects for side effects
  constructor() {
    effect(() => {
      console.log('State changed:', this.state());
    });
  }
}
```

### Testing Requirements

#### Coverage Requirements

```typescript
// vitest.config.ts coverage thresholds
export default defineConfig({
  test: {
    coverage: {
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
});
```

#### Test Categories

```bash
# Run all tests
pnpm test

# Performance tests
pnpm test:perf

# Race condition tests
pnpm test:race

# CI tests with coverage
pnpm test:ci
```

### Pull Request Process

1. **Fork and Create Branch**: Create feature branch from main
2. **Write Tests**: Ensure comprehensive test coverage
3. **Run Quality Checks**: `pnpm check` to verify code quality
4. **Update Documentation**: Update relevant documentation
5. **Submit PR**: Include clear description and test results

### Development Best Practices

#### Performance Considerations

- Use signals for reactive state management
- Implement proper cleanup in effects
- Optimize for mobile devices
- Monitor memory usage
- Use lazy loading for heavy components

#### Security Considerations

- Validate all user inputs
- Use HTTPS for all communications
- Implement proper authentication
- Sanitize data before processing
- Follow OWASP security guidelines

---

## Additional Resources

### Documentation Files

- `CLAUDE.md`: Project-specific development instructions
- `DETECTION_LIBRARY_EVALUATION.md`: Analysis of detection libraries
- `PROJECT_ANALYSIS.md`: Detailed project analysis
- `TEST_SUITE_*.md`: Testing documentation

### External Resources

- [Angular Documentation](https://angular.io/docs)
- [Capacitor Documentation](https://capacitorjs.com/docs)
- [Firebase Documentation](https://firebase.google.com/docs)
- [TensorFlow.js Documentation](https://www.tensorflow.org/js)

### Support and Contact

For questions about the project:
- Review existing documentation
- Check the issue tracker
- Contact the development team

---

*This documentation is maintained by the Motion Signal & Sprint Duels development team and is updated regularly to reflect changes in the codebase.*