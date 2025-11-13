# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Motion Signal & Sprint Duels is an Angular application combining real-time motion detection with a sprint competition management system. The app uses device cameras for motion detection and Firebase/WebRTC for real-time communication between devices.

## Development Commands

### Basic Development
```bash
# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview
```

### Testing
```bash
# Run tests
pnpm test

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage

# Run specific test categories
pnpm test:race    # Race condition tests
pnpm test:perf    # Performance tests
pnpm test:ci      # CI tests with coverage
```

### Mobile Development (Capacitor)
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

## Architecture Overview

### Core Application Structure
- **Main App Component**: Central state management using Angular Signals (`src/app.component.ts`)
- **Mode-based Navigation**: Single app with multiple modes controlled by `mode` signal
- **Component Organization**: Feature-based organization under `/src/components/`

### Key Modes
- `selection`: Main menu
- `motion-games`: Motion detection games
- `detector`: Camera motion detection mode
- `display`: Signal visualization mode
- `single`: Combined detector + display
- `sprint-*`: Sprint timing variants
- `sprint-duels`: Competition management
- `team-duels`: Team-based competitions
- `bodypose`: Body pose analysis

### Services Architecture

#### Core Services (`src/services/`)
- `FirebaseService`: Firebase real-time database operations
- `CameraService`: Camera access and photo capture
- `RtcService`: WebRTC peer-to-peer communication
- `SignalingService`: WebRTC signaling via Firebase
- `SprintTimingService`: Sprint timing logic

#### Detection Services (`src/services/`)
- `DiffyDetectionService`: Motion detection using diffyjs
- `SpeedyDetectionService`: High-performance motion detection
- `DetectionSettingsService`: Centralized detection configuration

#### Feature-Specific Services
- **Sprint Duels** (`src/sprint-duels/services/`): Elo ranking, matches, tournaments
- **Team Duels** (`src/team-duels/services/`): WebRTC team communication

### Technology Stack

#### Frontend
- **Angular 20**: Standalone components, zoneless, signals-based
- **TypeScript**: Strict typing with advanced patterns
- **Tailwind CSS**: Utility-first styling
- **Vite**: Build tool and development server

#### ML/Vision
- **MediaPipe Pose**: Body pose detection
- **TensorFlow.js**: ML models and backend
- **Speedy-Vision**: High-performance computer vision

#### Mobile
- **Capacitor**: Cross-platform mobile development
- **Bluetooth LE**: Low-energy Bluetooth communication

#### Testing
- **Vitest**: Test runner with UI
- **Testing Library**: Component testing utilities
- **Happy DOM**: Lightweight DOM testing environment

### Key Architectural Patterns

#### Signal-Based State Management
All state uses Angular Signals for reactivity:
```typescript
mode = signal<'selection' | 'detector' | 'display' | ...>('selection');
sessionId = signal('');
motionSignal = signal<DisplaySignal>(null);
```

#### Effect-Based Lifecycle
Effects handle mode-dependent setup/cleanup:
```typescript
effect((onCleanup) => {
  const mode = this.mode();
  // Setup logic based on mode

  onCleanup(() => {
    // Cleanup logic
  });
});
```

#### Dual Communication Channels
- **Firebase**: Fallback for real-time data sync
- **WebRTC**: Direct peer-to-peer communication when available

#### Modular Detection System
Pluggable detection services with unified interface:
- Centralized settings via `DetectionSettingsService`
- Multiple detection algorithms (diffyjs, speedy-vision)
- Body pose analysis with MediaPipe

### Component Organization

#### Standalone Components
All components are standalone with `ChangeDetectionStrategy.OnPush`.

#### Feature Modules
- **Core Components**: Shared UI components (`header`, `display`, `detector`)
- **Sprint Duels**: Complete competition management system
- **Team Duels**: Multi-player real-time competitions
- **Motion Detection**: Camera-based motion detection components

### Testing Strategy

#### Test Structure
- Unit tests: `.spec.ts` files alongside components
- Integration tests: Service interaction testing
- Performance tests: Mobile and timing benchmarks
- Stress tests: Race condition and concurrent operation testing

#### Test Categories
- Standard unit tests: `pnpm test`
- Performance benchmarks: `pnpm test:perf`
- Race condition tests: `pnpm test:race`

### Mobile Development Notes

#### Capacitor Configuration
- Web directory: `dist`
- App ID: `com.motionsignal.app`
- Android platform integration

#### Performance Considerations
- Vision processing optimized for mobile devices
- WebGPU/WebGL backends for TensorFlow.js
- Memory management for real-time video processing

### Development Workflow

#### Code Organization
- Feature-based organization over technical layering
- Standalone components with clear boundaries
- Service layer for business logic and external integrations
- Type-safe communication patterns

#### State Management
- Signals for component state
- Effects for reactive side effects
- Services for shared application state
- Firebase/WebRTC for distributed state

#### Testing Approach
- Comprehensive unit test coverage
- Performance and stress testing
- Mobile-specific testing scenarios
- Integration testing for real-time features