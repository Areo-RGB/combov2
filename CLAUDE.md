# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sprint Duels is an Angular application focused on competitive sprint timing and team challenges. The app provides three main features:

1. **Sprint Duels**: Player rankings with Elo ratings, match-making, match history, and tournament management
2. **Team Duels**: Multi-device team competitions with real-time synchronization via Firebase
3. **Sprint Timing**: Single and multi-device sprint timing with camera-based motion detection

The app uses device cameras for motion detection and Firebase for real-time communication between devices.

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
- **Component Organization**: Feature-based organization

### Application Modes
- `selection`: Main menu (3 lobby cards)
- `sprint-duels`: Competition management lobby
- `team-duels`: Team-based competitions lobby
- `sprint-timing-menu`: Sprint timing options
- `sprint-timing-single-menu`: Single device timing options
- `sprint-timing-manual`: Manual start timing
- `sprint-timing-flying`: Flying start timing
- `sprint-multi-setup`: Multi-device setup
- `sprint-multi-timing`: Multi-device timing

### Services Architecture

#### Core Services (`src/services/`)
- `FirebaseService`: Firebase real-time database operations
- `CameraService`: Camera access and photo capture
- `SprintTimingService`: Sprint timing logic

#### Detection Services (`src/services/`)
- `DiffyDetectionService`: Motion detection using diffyjs (CPU-based)
- `SpeedyDetectionService`: GPU-accelerated motion detection using speedy-vision
- `DetectionSettingsService`: Centralized detection configuration

#### Feature-Specific Services
- **Sprint Duels** (`src/sprint-duels/services/`): Elo ranking, player management, matches, tournaments, storage
- **Team Duels** (`src/team-duels/services/`): Firebase-based team communication

### Technology Stack

#### Frontend
- **Angular 20**: Standalone components, zoneless, signals-based
- **TypeScript**: Strict typing with advanced patterns
- **Tailwind CSS**: Utility-first styling with mobile-first design
- **Vite**: Build tool and development server

#### Motion Detection
- **DiffyJS**: CPU-based motion detection library
- **Speedy-Vision**: GPU-accelerated computer vision (WebGL2)
- **Camera API**: Device camera access via Capacitor

#### Backend & Communication
- **Firebase**: Real-time database for session management and synchronization
- **Capacitor**: Cross-platform mobile development

#### Testing
- **Vitest**: Test runner with UI
- **Testing Library**: Component testing utilities
- **Happy DOM**: Lightweight DOM testing environment

### Key Architectural Patterns

#### Signal-Based State Management
All state uses Angular Signals for reactivity:
```typescript
mode = signal<'selection' | 'sprint-duels' | 'team-duels' | ...>('selection');
sessionId = signal('');
```

#### Firebase-Based Communication
- Real-time data synchronization across devices
- Session management for multi-device features
- Player data persistence for Sprint Duels

#### Motion Detection System
Pluggable detection services with unified interface:
- Centralized settings via `DetectionSettingsService`
- Two detection algorithms: DiffyJS (CPU) and Speedy-Vision (GPU)
- Configurable detection zones and sensitivity
- Used for sprint timing start/stop triggers

### Component Organization

#### Standalone Components
All components are standalone with `ChangeDetectionStrategy.OnPush`.

#### Feature Modules
- **Core Components**: Shared UI components (`header`, `detector`)
- **Sprint Timing**: Single and multi-device timing components
- **Sprint Duels**: Complete competition management system with rankings, match-making, history
- **Team Duels**: Multi-player real-time competitions with lobby system

### Mobile Optimization

#### Touch-Friendly UI
- All buttons use `touch-manipulation` CSS for better touch response
- Responsive grid layouts (mobile-first approach)
- Large touch targets for mobile devices

#### Capacitor Configuration
- Web directory: `dist`
- App ID: `com.motionsignal.app`
- Android platform integration
- Camera plugin for motion detection

#### Performance Considerations
- GPU-accelerated motion detection (Speedy-Vision preferred on mobile)
- Efficient canvas operations with minimal redraws
- Optimized video frame processing (12 FPS target)
- Memory management for real-time video processing

### Development Workflow

#### Code Organization
- Feature-based organization over technical layering
- Standalone components with clear boundaries
- Service layer for business logic and external integrations
- Type-safe communication patterns

#### State Management
- Signals for component state
- Services for shared application state
- Firebase for distributed state across devices

#### Testing Approach
- Comprehensive unit test coverage
- Performance and stress testing
- Mobile-specific testing scenarios
- Integration testing for real-time features
