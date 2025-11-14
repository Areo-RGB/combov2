# Motion Signal Sprint - Next.js + React + Capacitor

A modern sprint timing application built with Next.js, React, and Capacitor, featuring real-time motion detection and multi-device synchronization.

## 🚀 Features

- **Next.js 15** with App Router and React 19
- **Real-time motion detection** using Speedy Vision (GPU-accelerated) and DiffyJS
- **Multi-device synchronization** via Firebase Realtime Database
- **Capacitor** for native mobile capabilities (Android)
- **Tailwind CSS** and **shadcn/ui** for modern, responsive UI
- **TypeScript** for type safety

## 📋 Prerequisites

- Node.js 18+ and pnpm
- For Android development: Android Studio and Android SDK

## 🛠️ Installation

1. Install dependencies:
```bash
# Use the new Next.js package.json
cp next-package.json package.json
pnpm install
```

2. Copy/link TypeScript configuration:
```bash
# Use the Next.js TypeScript config
cp tsconfig.next.json tsconfig.json
```

3. Copy/link Tailwind and PostCSS configs:
```bash
cp tailwind.next.config.ts tailwind.config.ts
cp postcss.next.config.mjs postcss.config.mjs
```

## 🖥️ Development

### Web Development

```bash
# Start development server
pnpm dev

# Open http://localhost:3000
```

### Build for Production

```bash
# Build and export static site
pnpm build

# The static export will be in the /out directory
```

## 📱 Mobile Development (Android)

### Initial Setup

```bash
# Build the web app first
pnpm build

# Initialize Capacitor (if not already done)
pnpm cap:init

# Add Android platform
pnpm cap:add:android
```

### Development Workflow

```bash
# Sync web assets to Android
pnpm cap:sync

# Open in Android Studio
pnpm cap:open:android
```

### Build and Deploy

```bash
# Build and sync in one command
pnpm build:android
```

Then in Android Studio:
1. Select your device/emulator
2. Click Run (▶️)

## 🏗️ Project Structure

```
combov2/
├── app/                          # Next.js App Router
│   ├── components/              # React components
│   │   ├── ui/                 # shadcn/ui components
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── input.tsx
│   │   │   └── label.tsx
│   │   ├── Detector.tsx        # Motion detection component
│   │   ├── Lobby.tsx           # Session management
│   │   └── SprintTiming.tsx    # Sprint timer
│   ├── hooks/                   # React hooks
│   │   ├── useDiffyDetection.ts
│   │   └── useSpeedyDetection.ts
│   ├── lib/                     # Utilities and services
│   │   ├── firebase.ts         # Firebase service
│   │   └── utils.ts            # Helper functions
│   ├── globals.css             # Global styles
│   ├── layout.tsx              # Root layout
│   └── page.tsx                # Home page
├── public/                      # Static assets
├── next.config.mjs             # Next.js configuration
├── capacitor.config.ts         # Capacitor configuration
├── tailwind.config.ts          # Tailwind configuration
└── tsconfig.json               # TypeScript configuration
```

## 🎯 How It Works

### 1. Lobby (Session Management)

- **Create/Join Session**: Generate or enter a session ID
- **Select Role**: Choose Start, Split, or Finish line device
- **View Devices**: See all connected devices in real-time
- **Start Sprint**: Begin timing when ready

### 2. Sprint Timing

- **Start Line (🏁)**: Detects motion to start the timer
- **Split Time (⏱️)**: Records intermediate time
- **Finish Line (🎯)**: Detects motion to stop the timer

### 3. Motion Detection

Two detection modes available:

- **Speedy Vision**: GPU-accelerated optical flow (recommended)
  - Uses WebGL2 for high performance
  - Tracks feature points and motion vectors
  - Better accuracy and performance

- **DiffyJS**: Pixel difference detection
  - Works on all devices
  - Simpler algorithm
  - Good fallback option

## 🔧 Key Technologies

### Frontend
- **Next.js 15**: React framework with static export
- **React 19**: UI library with hooks
- **TypeScript**: Type safety
- **Tailwind CSS**: Utility-first styling
- **shadcn/ui**: High-quality UI components

### Motion Detection
- **Speedy Vision**: GPU-accelerated computer vision
- **DiffyJS**: Pixel-based motion detection

### Backend/Sync
- **Firebase Realtime Database**: Multi-device synchronization
- **Capacitor**: Native mobile integration

### Mobile
- **Capacitor 7**: Cross-platform native runtime
- **Capacitor Camera Plugin**: Native camera access

## 🎨 Customization

### Detection Sensitivity

Adjust in `Detector.tsx`:
```tsx
<Detector
  sessionId={sessionId}
  onMotionDetected={handleMotionDetected}
  detectionMode="speedy"  // or "diffy"
  sensitivityLevel={5}     // 1-10, higher = more sensitive
/>
```

### Styling

The app uses Tailwind CSS with shadcn/ui. Customize colors in `tailwind.config.ts`:
```ts
colors: {
  primary: 'hsl(var(--primary))',
  // ... other colors
}
```

## 📊 Firebase Configuration

Firebase config is located in `app/lib/firebase.ts`. The app uses Firebase Realtime Database for:
- Device presence tracking
- Session state synchronization
- Message broadcasting between devices

## 🐛 Troubleshooting

### Camera Not Working
1. Check browser permissions for camera access
2. Ensure HTTPS (required for camera API)
3. Check if camera is not in use by another app

### Motion Detection Not Triggering
1. Adjust sensitivity level (try higher values)
2. Check lighting conditions
3. Ensure camera has clear view of movement area
4. Try switching detection modes

### Capacitor/Android Issues
1. Ensure Android SDK is properly installed
2. Check Capacitor config points to correct `webDir: 'out'`
3. Run `pnpm cap:sync` after web changes
4. Clean and rebuild in Android Studio if needed

## 🚀 Deployment

### Web Deployment
The app exports as static HTML and can be deployed to any static hosting:
- Vercel
- Netlify
- GitHub Pages
- AWS S3 + CloudFront

### Mobile Deployment
Build the APK in Android Studio:
1. Build → Generate Signed Bundle/APK
2. Follow Android Studio's signing flow
3. Distribute via Google Play Store or direct APK

## 📝 Migration from Angular

This is a complete rewrite from the Angular version. Key changes:

- **Angular → React**: Component model and state management
- **RxJS Signals → React Hooks**: Reactive state management
- **Angular Services → React Hooks/Context**: Service layer
- **Angular CLI → Next.js**: Build system and development server

The core functionality (motion detection, Firebase sync, sprint timing) remains the same.

## 🤝 Contributing

This is a personal project, but suggestions and improvements are welcome!

## 📄 License

See the main project README for license information.
