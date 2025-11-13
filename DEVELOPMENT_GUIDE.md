# Development Guide - Motion Signal & Sprint Duels

Welcome to the Motion Signal & Sprint Duels development guide! This comprehensive guide will help you understand the codebase, development workflow, and best practices for contributing to this sophisticated Angular application.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Project Structure](#project-structure)
3. [Development Workflow](#development-workflow)
4. [Code Standards](#code-standards)
5. [Testing Guidelines](#testing-guidelines)
6. [Common Patterns](#common-patterns)
7. [Debugging Tips](#debugging-tips)
8. [Performance Considerations](#performance-considerations)
9. [Mobile Development](#mobile-development)
10. [Contributing](#contributing)

## Getting Started

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** package manager (`npm install -g pnpm`)
- **Angular CLI** (`npm install -g @angular/cli`)
- **Git** ([Download](https://git-scm.com/))
- **VS Code** or your preferred code editor
- **Android Studio** (for mobile development)

### Initial Setup

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd combov2
   ```

2. **Install Dependencies**
   ```bash
   pnpm install
   ```

3. **Start Development Server**
   ```bash
   pnpm dev
   ```

4. **Verify Setup**
   - Open `http://localhost:3000` in your browser
   - You should see the Motion Signal & Sprint Duels application

### Recommended VS Code Extensions

For the best development experience, install these VS Code extensions:

```json
{
  "recommendations": [
    "angular.ng-template",
    "ms-vscode.vscode-typescript-next",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-eslint",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-json",
    "formulahendry.auto-rename-tag",
    "christian-kohler.path-intellisense"
  ]
}
```

## Project Structure

### Directory Overview

```
combov2/
├── src/
│   ├── app.component.ts              # Main application component
│   ├── components/                   # Core UI components
│   │   ├── detector/                # Motion detection component
│   │   ├── display/                 # Display visualization component
│   │   ├── header/                  # Header navigation
│   │   ├── bodypose/                # Body pose analysis
│   │   ├── sprint-timing/           # Sprint timing components
│   │   └── single-device/           # Single device mode
│   ├── services/                    # Core application services
│   │   ├── firebase.service.ts      # Firebase integration
│   │   ├── rtc.service.ts           # WebRTC communication
│   │   ├── signaling.service.ts     # WebRTC signaling
│   │   ├── camera.service.ts        # Camera management
│   │   ├── diffy-detection.service.ts    # CPU-based detection
│   │   ├── speedy-detection.service.ts   # GPU-based detection
│   │   ├── detection-settings.service.ts # Detection configuration
│   │   └── sprint-timing.service.ts # Sprint timing logic
│   ├── sprint-duels/                # Sprint Duels feature module
│   │   ├── components/              # Sprint Duels UI components
│   │   ├── services/                # Sprint Duels business logic
│   │   ├── sprint-duels.component.ts # Main Sprint Duels component
│   │   └── sprint-duels.types.ts    # Type definitions
│   ├── team-duels/                  # Team Duels feature module
│   ├── test/                        # Test setup and utilities
│   └── assets/                      # Static assets
├── android/                         # Android platform files (Capacitor)
├── docs/                            # Additional documentation
├── DOCUMENTATION.md                 # Complete project documentation
├── API_DOCUMENTATION.md             # API reference documentation
├── README.md                        # Project overview
├── CLAUDE.md                        # AI assistant instructions
└── vitest.config.ts                 # Test configuration
```

### Key Files to Understand

#### `src/app.component.ts`
The main application component with:
- Signal-based state management
- Mode-based navigation
- Effect-based lifecycle management
- Core application logic

#### `src/services/`
Contains all business logic and external integrations:
- **Firebase Service**: Real-time database operations
- **RTC Service**: WebRTC peer-to-peer communication
- **Detection Services**: Motion detection algorithms
- **Camera Service**: Device camera management

## Development Workflow

### Daily Workflow

1. **Start Fresh**
   ```bash
   # Pull latest changes
   git pull origin main

   # Install any new dependencies
   pnpm install

   # Start development server
   pnpm dev
   ```

2. **Create Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **Make Changes**
   - Write code following the patterns outlined below
   - Add tests for new functionality
   - Update documentation as needed

4. **Quality Checks**
   ```bash
   # Format code
   pnpm format

   # Lint code
   pnpm lint

   # Run tests
   pnpm test

   # Run all checks
   pnpm check
   ```

5. **Commit Changes**
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   ```

6. **Push and Create PR**
   ```bash
   git push origin feature/your-feature-name
   # Create pull request on GitHub
   ```

### Branch Naming Conventions

- `feature/feature-name`: New features
- `fix/bug-description`: Bug fixes
- `docs/documentation-update`: Documentation changes
- `refactor/code-improvement`: Code refactoring
- `test/add-test-coverage`: Test additions

### Commit Message Convention

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/modifications
- `chore`: Maintenance tasks

Examples:
```
feat(detection): add speedy-vision GPU acceleration
fix(camera): resolve camera permission issues
docs(api): update API documentation for RTC service
```

## Code Standards

### TypeScript Standards

#### Strict Typing

Always use explicit types and enable strict mode:

```typescript
// ✅ Good
interface User {
  id: string;
  name: string;
  email: string;
}

const getUser = (id: string): Promise<User | null> => {
  return firebaseService.getUser(id);
};

// ❌ Bad
const getUser = (id) => {
  return firebaseService.getUser(id);
};
```

#### Signal Usage

Use Angular Signals for reactive state management:

```typescript
// ✅ Good
export class DetectionService {
  private motionDetected = signal(false);
  private detectionCount = signal(0);

  // Computed signal for derived state
  private isActive = computed(() => this.motionDetected() && this.detectionCount() > 0);

  // Effect for side effects
  constructor() {
    effect(() => {
      if (this.motionDetected()) {
        console.log('Motion detected!');
      }
    });
  }
}

// ❌ Bad - Using traditional properties
export class DetectionService {
  private motionDetected = false;
  private detectionCount = 0;
}
```

#### Interface Definitions

Create clear, documented interfaces:

```typescript
// ✅ Good
/**
 * Configuration for motion detection algorithms
 */
export interface DetectionConfig {
  /**
   * Sensitivity level (1-10)
   * Higher values = more sensitive to motion
   */
  sensitivityLevel: number;

  /**
   * Detection zone in pixels
   * null = full screen detection
   */
  detectionZone: DetectionZone | null;

  /**
   * Minimum delay between detections (ms)
   */
  cooldown: number;

  /**
   * Emit detection on every Nth detection
   */
  cadence: number;

  /**
   * Enable debug mode for visual feedback
   */
  debug?: boolean;
}

/**
 * Detection zone coordinates
 */
export interface DetectionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### Component Standards

#### Standalone Components

All components should be standalone:

```typescript
// ✅ Good
@Component({
  selector: 'app-detector',
  templateUrl: './detector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    // Other required imports
  ]
})
export class DetectorComponent implements OnInit, OnDestroy {
  // Component implementation
}
```

#### Dependency Injection

Use constructor injection for services:

```typescript
// ✅ Good
export class DetectorComponent {
  constructor(
    private firebaseService: FirebaseService,
    private detectionService: DiffyDetectionService,
    private router: Router
  ) {}
}

// ❌ Bad - Manual service instantiation
export class DetectorComponent {
  private firebaseService = new FirebaseService();
}
```

### Service Standards

#### Error Handling

Implement proper error handling:

```typescript
// ✅ Good
@Injectable({ providedIn: 'root' })
export class CameraService {
  async startCamera(videoElement: HTMLVideoElement): Promise<MediaStream> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });

      videoElement.srcObject = stream;
      return stream;

    } catch (error) {
      console.error('Camera access failed:', error);
      throw new CameraError('Failed to access camera', error);
    }
  }
}
```

#### Resource Cleanup

Always implement proper cleanup:

```typescript
// ✅ Good
export class DetectionService implements OnDestroy {
  private animationFrameId: number | null = null;
  private stream: MediaStream | null = null;

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
  }
}
```

## Testing Guidelines

### Test Structure

Follow the standard test structure:

```typescript
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { render, screen } from '@testing-library/angular';
import { DetectorComponent } from './detector.component';

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
    const motionEvent = new CustomEvent('diffyMotionDetected', {
      detail: { intensity: 75, timestamp: Date.now() }
    });

    window.dispatchEvent(motionEvent);

    expect(screen.getByTestId('motion-indicator')).toBeVisible();
  });
});
```

### Test Categories

1. **Unit Tests**: Test individual functions and methods
2. **Component Tests**: Test component behavior and rendering
3. **Integration Tests**: Test service interactions
4. **Performance Tests**: Test performance benchmarks
5. **Race Condition Tests**: Test concurrent operations

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests with UI interface
pnpm test:ui

# Run performance tests
pnpm test:perf

# Run race condition tests
pnpm test:race
```

## Common Patterns

### Signal-based State Management

```typescript
export class AppComponent {
  // Core signals
  mode = signal<AppMode>('selection');
  sessionId = signal('');
  motionSignal = signal<DisplaySignal>(null);

  // Computed signals
  isSessionActive = computed(() => !!this.sessionId());
  currentModeConfig = computed(() => this.getModeConfig(this.mode()));

  // Effects for lifecycle management
  constructor() {
    effect((onCleanup) => {
      const mode = this.mode();

      // Setup based on mode
      this.setupForMode(mode);

      onCleanup(() => {
        this.cleanupForMode(mode);
      });
    });
  }
}
```

### Service Communication Pattern

```typescript
// Custom events for service communication
export class DetectionService {
  notifyMotionDetected(intensity: number): void {
    const event = new CustomEvent('motionDetected', {
      detail: { intensity, timestamp: Date.now() }
    });
    window.dispatchEvent(event);
  }
}

// Component listening to events
export class DetectorComponent implements OnInit, OnDestroy {
  ngOnInit(): void {
    window.addEventListener('motionDetected', this.handleMotion.bind(this));
  }

  ngOnDestroy(): void {
    window.removeEventListener('motionDetected', this.handleMotion.bind(this));
  }

  private handleMotion(event: CustomEvent): void {
    // Handle motion event
  }
}
```

### Async Service Pattern

```typescript
@Injectable({ providedIn: 'root' })
export class AsyncService {
  private asyncOperation<T>(
    operation: () => Promise<T>,
    timeout: number = 5000
  ): Promise<T> {
    return Promise.race([
      operation(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timeout')), timeout);
      })
    ]);
  }

  async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          await this.delay(1000 * attempt); // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
```

## Debugging Tips

### Browser DevTools

#### Console Logging

Use structured logging for better debugging:

```typescript
// ✅ Good
console.group('DetectionService: initialize');
console.log('Video element:', videoElement);
console.log('Configuration:', config);
console.log('WebGL supported:', this.isWebGLSupported());
console.groupEnd();

// ❌ Bad
console.log('init', videoElement, config);
```

#### Performance Monitoring

Monitor performance with browser tools:

```typescript
// Performance marks
performance.mark('detection-start');
await this.runDetection();
performance.mark('detection-end');
performance.measure('detection-duration', 'detection-start', 'detection-end');

// Memory monitoring
const memoryUsage = (performance as any).memory;
console.log('Memory usage:', {
  used: memoryUsage?.usedJSHeapSize,
  total: memoryUsage?.totalJSHeapSize,
  limit: memoryUsage?.jsHeapSizeLimit
});
```

### Debugging Motion Detection

#### Visual Debug Mode

Enable visual debugging for motion detection:

```typescript
export class DiffyDetectionService {
  private renderDebugCanvas(matrix: number[][]): void {
    if (!this.config?.debug) return;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    canvas.width = matrix[0].length;
    canvas.height = matrix.length;

    // Render motion matrix as pixels
    for (let y = 0; y < matrix.length; y++) {
      for (let x = 0; x < matrix[y].length; x++) {
        const intensity = matrix[y][x];
        ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    document.body.appendChild(canvas);
  }
}
```

#### WebRTC Debugging

Debug WebRTC connections:

```typescript
export class RtcService {
  private setupConnectionDebugging(): void {
    if (!this.peerConnection) return;

    this.peerConnection.addEventListener('connectionstatechange', () => {
      console.log('WebRTC connection state:', this.peerConnection?.connectionState);
    });

    this.peerConnection.addEventListener('iceconnectionstatechange', () => {
      console.log('ICE connection state:', this.peerConnection?.iceConnectionState);
    });

    // Log connection stats
    setInterval(async () => {
      const stats = await this.getConnectionStats();
      console.log('WebRTC stats:', stats);
    }, 5000);
  }
}
```

## Performance Considerations

### Memory Management

#### Resource Cleanup

Always clean up resources:

```typescript
export class VideoProcessor implements OnDestroy {
  private videoElement: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;

  ngOnDestroy(): void {
    this.cleanup();
  }

  private cleanup(): void {
    // Stop video stream
    if (this.videoElement?.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
    }

    // Cancel animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Clear canvas
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }
}
```

#### Memory Monitoring

Monitor memory usage:

```typescript
export class MemoryMonitor {
  private checkInterval: number | null = null;

  startMonitoring(): void {
    this.checkInterval = window.setInterval(() => {
      const memory = (performance as any).memory;

      if (memory) {
        const usedMB = memory.usedJSHeapSize / 1024 / 1024;
        const totalMB = memory.totalJSHeapSize / 1024 / 1024;

        if (usedMB > 100) { // 100MB threshold
          console.warn(`High memory usage: ${usedMB.toFixed(2)}MB / ${totalMB.toFixed(2)}MB`);
        }
      }
    }, 5000);
  }

  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }
}
```

### Frame Rate Optimization

#### Adaptive Frame Rate

Implement adaptive frame rate:

```typescript
export class FrameRateManager {
  private targetFPS = 60;
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

  adjustFPS(performanceScore: number): void {
    if (performanceScore < 0.7) {
      this.targetFPS = Math.max(30, this.targetFPS - 5);
    } else if (performanceScore > 0.9) {
      this.targetFPS = Math.min(60, this.targetFPS + 5);
    }
    this.frameInterval = 1000 / this.targetFPS;
  }
}
```

## Mobile Development

### Capacitor Setup

#### Platform Initialization

```bash
# Initialize Capacitor
pnpm cap:init MotionSignal com.motionsignal.app --web-dir=dist

# Add Android platform
pnpm cap:add:android

# Sync platforms
pnpm cap:sync
```

#### Native Features

Implement native device features:

```typescript
export class NativeFeatures {
  async requestCameraPermission(): Promise<boolean> {
    try {
      const permission = await Permissions.query({ name: 'camera' });
      if (permission.state !== 'granted') {
        const result = await Permissions.request({ name: 'camera' });
        return result.state === 'granted';
      }
      return true;
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  }

  async takeNativePhoto(): Promise<string | null> {
    try {
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl
      });
      return photo.dataUrl || null;
    } catch (error) {
      console.error('Photo capture failed:', error);
      return null;
    }
  }
}
```

### Performance Optimization for Mobile

#### Battery Optimization

```typescript
export class BatteryOptimizer {
  private isLowPowerMode = false;

  constructor() {
    this.monitorBatteryLevel();
  }

  private async monitorBatteryLevel(): Promise<void> {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();

      battery.addEventListener('levelchange', () => {
        this.isLowPowerMode = battery.level < 0.2;
        this.adjustPerformance();
      });

      battery.addEventListener('chargingchange', () => {
        this.isLowPowerMode = !battery.charging && battery.level < 0.3;
        this.adjustPerformance();
      });
    }
  }

  private adjustPerformance(): void {
    if (this.isLowPowerMode) {
      // Reduce performance to save battery
      this.reduceFrameRate();
      this.disableBackgroundProcesses();
    } else {
      // Restore normal performance
      this.restoreFrameRate();
      this.enableBackgroundProcesses();
    }
  }
}
```

## Contributing

### Pull Request Process

1. **Create Branch**: Follow branch naming conventions
2. **Write Code**: Follow all code standards
3. **Add Tests**: Ensure adequate test coverage
4. **Update Documentation**: Update relevant documentation
5. **Quality Checks**: Pass all quality checks
6. **Submit PR**: Create detailed pull request

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed
- [ ] Performance testing completed

## Checklist
- [ ] Code follows project standards
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] Tests added/updated
- [ ] Quality checks passed
```

### Code Review Guidelines

When reviewing code, check for:
- **Functionality**: Does the code work as intended?
- **Performance**: Is it optimized for performance?
- **Security**: Are there any security vulnerabilities?
- **Maintainability**: Is the code easy to understand and maintain?
- **Testing**: Is there adequate test coverage?
- **Documentation**: Is the code well-documented?

## Additional Resources

### Documentation
- [Complete Documentation](DOCUMENTATION.md)
- [API Reference](API_DOCUMENTATION.md)
- [Project Instructions](CLAUDE.md)

### External Resources
- [Angular Documentation](https://angular.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [WebRTC Guide](https://webrtc.org/getting-started/overview)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Capacitor Documentation](https://capacitorjs.com/docs)

### Community
- [Angular Discord](https://discord.gg/angular)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/angular)
- [GitHub Discussions](https://github.com/username/motion-signal/discussions)

---

Happy coding! 🚀

If you have any questions or need help, don't hesitate to reach out to the development team or create an issue on GitHub.