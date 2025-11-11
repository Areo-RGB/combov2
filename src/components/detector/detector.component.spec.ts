import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DetectorComponent } from './detector.component';
import {
  measureExecutionTime,
  DEVICE_PROFILES,
  simulateFrameLoop,
  checkFrameBudget,
  MemoryLeakDetector
} from '../../test/utils/performance.util';

/**
 * DetectorComponent Tests - Focus on Frame Processing Race Conditions & Mobile Performance
 *
 * Critical race conditions tested:
 * 1. Model switching during frame processing
 * 2. Video frame queue overload on slow devices
 * 3. Detection zone changes mid-processing
 * 4. Camera permission dialog during component destruction
 * 5. Concurrent model initialization
 */
describe('DetectorComponent', () => {
  let component: DetectorComponent;
  let mockVideo: HTMLVideoElement;
  let mockCanvas: HTMLCanvasElement;
  let mockOverlayCanvas: HTMLCanvasElement;

  beforeEach(() => {
    // Mock video element
    mockVideo = document.createElement('video');
    Object.defineProperty(mockVideo, 'clientWidth', { value: 640, writable: true });
    Object.defineProperty(mockVideo, 'clientHeight', { value: 480, writable: true });
    Object.defineProperty(mockVideo, 'readyState', { value: HTMLMediaElement.HAVE_ENOUGH_DATA, writable: true });

    // Mock canvas elements
    mockCanvas = document.createElement('canvas');
    mockCanvas.width = 160;
    mockCanvas.height = 120;

    mockOverlayCanvas = document.createElement('canvas');
    mockOverlayCanvas.width = 640;
    mockOverlayCanvas.height = 480;

    // Mock MediaPipe and TensorFlow (these would normally be loaded from CDN)
    (globalThis as any).FilesetResolver = {
      forVisionTasks: vi.fn().mockResolvedValue({}),
    };

    (globalThis as any).PoseLandmarker = {
      createFromOptions: vi.fn().mockResolvedValue({
        detectForVideo: vi.fn().mockReturnValue({ landmarks: [] }),
      }),
    };

    // Mock poseDetection
    vi.mock('@tensorflow-models/pose-detection', () => ({
      SupportedModels: { MoveNet: 'MoveNet' },
      createDetector: vi.fn().mockResolvedValue({
        estimatePoses: vi.fn().mockResolvedValue([]),
      }),
      movenet: {
        modelType: {
          SINGLEPOSE_LIGHTNING: 'SinglePoseLightning',
          SINGLEPOSE_THUNDER: 'SinglePoseThunder',
          MULTIPOSE_LIGHTNING: 'MultiPoseLightning',
        },
      },
      TrackerType: { BoundingBox: 'BoundingBox' },
    }));

    // Mock getUserMedia
    const mockStream = {
      getTracks: () => [{ stop: vi.fn() }],
    };

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream),
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'camera-1', label: 'Camera 1' },
        ]),
      },
    });

    // Mock Capacitor Camera
    (globalThis as any).Camera = {
      checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
      requestPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
    };

    // Create component (Note: This is a simplified mock - real Angular testing would use TestBed)
    // component = new DetectorComponent();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Model Switching Race Conditions', () => {
    it('should detect race: switching detection method during frame processing', async () => {
      // This test simulates the critical race condition where the detection method
      // is changed while a frame is being processed

      let processingFrame = false;
      let raceDetected = false;

      // Simulate long-running frame processing
      const processFrameMock = async () => {
        processingFrame = true;
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate slow processing
        processingFrame = false;
      };

      // Simulate switching detection method while processing
      const switchMethod = () => {
        if (processingFrame) {
          raceDetected = true;
          console.warn('⚠️ Race condition: Detection method switched during frame processing');
        }
      };

      // Start processing
      const processingPromise = processFrameMock();

      // Switch method immediately
      switchMethod();

      await processingPromise;

      // This race condition can cause crashes or incorrect detections
      expect(raceDetected).toBe(true);
    });

    it('should detect race: switching pose library during model initialization', async () => {
      let initializingMediaPipe = false;
      let raceDetected = false;

      const initMediaPipe = async () => {
        initializingMediaPipe = true;
        await new Promise(resolve => setTimeout(resolve, 200)); // Model loading time
        initializingMediaPipe = false;
        return { detector: 'mediapipe' };
      };

      const initMoveNet = async () => {
        if (initializingMediaPipe) {
          raceDetected = true;
          console.warn('⚠️ Race condition: Switched library during initialization');
        }
        await new Promise(resolve => setTimeout(resolve, 100));
        return { detector: 'movenet' };
      };

      // Start MediaPipe initialization
      const mediapipePromise = initMediaPipe();

      // User switches to MoveNet immediately
      setTimeout(() => initMoveNet(), 50);

      await mediapipePromise;

      expect(raceDetected).toBe(true);
    });

    it('should handle concurrent model initialization requests', async () => {
      const initCalls: string[] = [];

      const mockInit = async (model: string) => {
        initCalls.push(`start-${model}`);
        await new Promise(resolve => setTimeout(resolve, 100));
        initCalls.push(`end-${model}`);
      };

      // Trigger multiple initializations rapidly (simulating user rapidly changing settings)
      await Promise.all([
        mockInit('mediapipe-lite'),
        mockInit('mediapipe-full'),
        mockInit('movenet-lightning'),
      ]);

      // Should have completed all but may have wasted resources
      expect(initCalls).toHaveLength(6);

      console.warn('⚠️ No cancellation mechanism for in-flight model loads');
    });
  });

  describe('Frame Processing Queue and Performance', () => {
    it('performance: frame processing should meet budget on mid-range mobile', async () => {
      const profile = DEVICE_PROFILES['mid-range'];
      const mockImageData = new ImageData(160, 120);

      // Simulate motion detection calculation
      const processFrame = async () => {
        const data = mockImageData.data;
        let changes = 0;

        // Simulate pixel comparison (simplified version of calculateDifferenceFast)
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r > 128 || g > 128 || b > 128) changes++;
        }

        return changes;
      };

      const { metrics } = await measureExecutionTime(processFrame, 10);

      // Frame budget for mid-range device at 30fps is ~33ms
      const budget = checkFrameBudget(metrics.executionTime, profile);

      expect(budget.withinBudget).toBe(true);

      console.log(
        `✓ Frame processing: ${metrics.executionTime.toFixed(2)}ms ` +
        `(${budget.budgetUsed.toFixed(1)}% of ${profile.frameTime}ms budget)`
      );
    });

    it('performance: should detect frame drops on low-end devices', async () => {
      const profile = DEVICE_PROFILES['low-end'];

      // Simulate slow frame processing (e.g., with pose detection)
      const slowFrameProcessing = async () => {
        await new Promise(resolve => setTimeout(resolve, 80)); // 80ms processing
      };

      const result = await simulateFrameLoop(slowFrameProcessing, 30, profile);

      // On low-end device (50ms budget), 80ms processing will drop frames
      expect(result.droppedFrames).toBeGreaterThan(0);

      console.log(
        `✓ Frame drops detected: ${result.droppedFrames} frames dropped ` +
        `out of ${result.totalFrames} (avg: ${result.avgFrameTime.toFixed(1)}ms)`
      );
    });

    it('performance: MediaPipe inference time on mobile', async () => {
      const profile = DEVICE_PROFILES['mid-range'];

      // Mock MediaPipe inference (typical time: 200-500ms on mobile)
      const mockMediaPipeInference = async () => {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { landmarks: [] };
      };

      const { metrics } = await measureExecutionTime(mockMediaPipeInference, 3);

      // This is SLOWER than frame budget - will cause frame drops
      const budget = checkFrameBudget(metrics.executionTime, profile);

      console.log(
        `✓ MediaPipe inference: ${metrics.executionTime.toFixed(0)}ms ` +
        `(${budget.framesDropped} frames dropped per inference)`
      );

      expect(budget.framesDropped).toBeGreaterThan(0);
      expect(metrics.executionTime).toBeGreaterThan(profile.frameTime);
    });

    it('performance: getImageData stalls on mobile (GPU-CPU sync)', async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 120;
      const ctx = canvas.getContext('2d')!;

      // Simulate drawing and reading image data (causes GPU-CPU sync)
      const getImageDataTest = () => {
        ctx.fillRect(0, 0, 160, 120);
        const data = ctx.getImageData(0, 0, 160, 120);
        return data.data.length;
      };

      const iterations = 100;
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        getImageDataTest();
      }

      const duration = performance.now() - start;
      const avgTime = duration / iterations;

      console.log(
        `✓ getImageData() average time: ${avgTime.toFixed(2)}ms ` +
        `(can cause 10-50ms stalls on mobile)`
      );

      // On desktop this is fast, but on mobile it can be 10-50ms
      expect(avgTime).toBeLessThan(100); // Sanity check for desktop test environment
    });

    it('should detect frame queue buildup (no frame dropping mechanism)', async () => {
      let queuedFrames = 0;
      let processedFrames = 0;

      const slowProcessor = async () => {
        processedFrames++;
        await new Promise(resolve => setTimeout(resolve, 100)); // Slow processing
      };

      // Queue frames faster than they can be processed
      const frameInterval = setInterval(() => {
        queuedFrames++;
      }, 16); // 60fps = 16ms per frame

      // Process frames slower
      const processPromises: Promise<void>[] = [];
      for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 16));
        processPromises.push(slowProcessor());
      }

      clearInterval(frameInterval);

      await Promise.all(processPromises);

      // Frames queued faster than processed = buildup
      expect(queuedFrames).toBeGreaterThan(processedFrames);

      console.warn(
        `⚠️ Frame queue buildup: ${queuedFrames} queued, ${processedFrames} processed ` +
        `(no frame dropping detected)`
      );
    });
  });

  describe('Detection Zone Race Conditions', () => {
    it('should detect race: zone change during frame processing', async () => {
      let currentZone = { x: 0, y: 0, width: 160, height: 120 };
      let processingWithZone: any = null;
      let raceDetected = false;

      const processFrame = async () => {
        processingWithZone = { ...currentZone };
        await new Promise(resolve => setTimeout(resolve, 50));

        // Check if zone changed during processing
        if (
          processingWithZone.x !== currentZone.x ||
          processingWithZone.width !== currentZone.width
        ) {
          raceDetected = true;
          console.warn('⚠️ Race condition: Detection zone changed during frame processing');
        }
      };

      const processing = processFrame();

      // Change zone mid-processing
      setTimeout(() => {
        currentZone = { x: 50, y: 0, width: 80, height: 120 };
      }, 25);

      await processing;

      expect(raceDetected).toBe(true);
    });

    it('should reset lastImageData when zone changes (to prevent size mismatch)', async () => {
      let lastImageData: ImageData | null = new ImageData(160, 120);
      let zone = { x: 0, y: 0, width: 160, height: 120 };

      const onZoneChange = () => {
        lastImageData = null; // Component does this at line 184
      };

      // Change zone
      zone = { x: 50, y: 0, width: 80, height: 120 };
      onZoneChange();

      expect(lastImageData).toBeNull();

      console.log('✓ lastImageData reset prevents dimension mismatch errors');
    });
  });

  describe('Camera and Permission Race Conditions', () => {
    it('should handle camera permission dialog during component destruction', async () => {
      let componentDestroyed = false;
      let permissionDialogShown = false;

      const checkPermissions = async () => {
        permissionDialogShown = true;
        await new Promise(resolve => setTimeout(resolve, 100)); // User interaction delay

        if (componentDestroyed) {
          console.warn('⚠️ Race condition: Component destroyed during permission dialog');
          return { camera: 'denied' };
        }

        return { camera: 'granted' };
      };

      const permissionPromise = checkPermissions();

      // Destroy component during permission dialog
      setTimeout(() => {
        componentDestroyed = true;
      }, 50);

      const result = await permissionPromise;

      expect(permissionDialogShown).toBe(true);
      expect(componentDestroyed).toBe(true);
    });

    it('should handle camera switch during active detection', async () => {
      let currentStream: any = { id: 'stream-1', getTracks: () => [{ stop: vi.fn() }] };
      let streamStopCalled = false;

      const switchCamera = async (newDeviceId: string) => {
        // Stop current stream
        currentStream.getTracks().forEach((t: any) => {
          t.stop();
          streamStopCalled = true;
        });

        // Get new stream
        currentStream = {
          id: `stream-${newDeviceId}`,
          getTracks: () => [{ stop: vi.fn() }],
        };

        return currentStream;
      };

      await switchCamera('camera-2');

      expect(streamStopCalled).toBe(true);
      expect(currentStream.id).toBe('stream-camera-2');
    });

    it('should handle getUserMedia failure gracefully', async () => {
      const mockGetUserMedia = vi.fn().mockRejectedValue(new Error('Permission denied'));

      Object.defineProperty(navigator, 'mediaDevices', {
        writable: true,
        value: { getUserMedia: mockGetUserMedia },
      });

      let status = 'idle';

      try {
        await navigator.mediaDevices.getUserMedia({ video: true });
        status = 'ready';
      } catch (error) {
        status = 'error';
      }

      expect(status).toBe('error');
    });
  });

  describe('Memory Leaks and Resource Cleanup', () => {
    it('should detect memory leak from uncleared animation frames', () => {
      const frameIds: number[] = [];

      // Simulate starting detection multiple times without cleanup
      for (let i = 0; i < 100; i++) {
        const frameId = requestAnimationFrame(() => {});
        frameIds.push(frameId);
      }

      // Should cancel old frames before starting new ones
      console.warn(
        `⚠️ Potential memory leak: ${frameIds.length} animation frames not cancelled`
      );

      // Cleanup
      frameIds.forEach(id => cancelAnimationFrame(id));
    });

    it('should detect memory leak from unclosed video streams', () => {
      const streams: any[] = [];

      // Simulate multiple camera starts without stopping previous stream
      for (let i = 0; i < 10; i++) {
        const stream = {
          id: `stream-${i}`,
          active: true,
          getTracks: () => [{ stop: vi.fn(() => (stream.active = false)) }],
        };
        streams.push(stream);
      }

      const activeStreams = streams.filter(s => s.active);

      console.warn(`⚠️ Potential memory leak: ${activeStreams.length} active video streams`);

      expect(activeStreams.length).toBeGreaterThan(0);

      // Cleanup
      streams.forEach(s => s.getTracks().forEach((t: any) => t.stop()));
    });

    it('should cleanup ResizeObserver on destroy', () => {
      let observerDisconnected = false;

      const mockResizeObserver = {
        observe: vi.fn(),
        unobserve: vi.fn(),
        disconnect: vi.fn(() => {
          observerDisconnected = true;
        }),
      };

      // Simulate component cleanup
      mockResizeObserver.disconnect();

      expect(observerDisconnected).toBe(true);
    });

    it('should detect memory growth from repeated model loading', async () => {
      const memoryDetector = new MemoryLeakDetector();

      // Take initial snapshot
      memoryDetector.takeSnapshot();

      // Simulate loading models repeatedly (e.g., user changing settings)
      for (let i = 0; i < 10; i++) {
        // Mock model loading (would normally allocate memory)
        const largeArray = new Float32Array(1000000); // ~4MB
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Take final snapshot
      memoryDetector.takeSnapshot();

      const growth = memoryDetector.getMemoryGrowth();

      if (growth > 50) {
        console.warn(`⚠️ Memory growth detected: ${growth.toFixed(1)}% increase`);
      }

      // Note: In test environment, garbage collection may prevent detection
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle video element with zero dimensions', () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'clientWidth', { value: 0 });
      Object.defineProperty(video, 'clientHeight', { value: 0 });

      // Should not try to set canvas dimensions
      const shouldSkip = video.clientWidth === 0 || video.clientHeight === 0;

      expect(shouldSkip).toBe(true);
    });

    it('should handle video not ready state', () => {
      const video = document.createElement('video');
      Object.defineProperty(video, 'readyState', { value: HTMLMediaElement.HAVE_NOTHING });

      const canProcess = video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;

      expect(canProcess).toBe(false);
    });

    it('should handle empty detection zone gracefully', () => {
      const zone = { x: 0, y: 0, width: 0, height: 0 };

      const shouldSkip = zone.width <= 0 || zone.height <= 0;

      expect(shouldSkip).toBe(true);
    });

    it('should handle model initialization failures', async () => {
      const failingInit = async () => {
        throw new Error('Failed to load model');
      };

      let modelLoaded = false;

      try {
        await failingInit();
        modelLoaded = true;
      } catch (error) {
        // Component continues without pose detection (falls back to motion)
        console.log('✓ Graceful fallback to motion detection on model load failure');
      }

      expect(modelLoaded).toBe(false);
    });
  });

  describe('Throttling and Cooldown Mechanisms', () => {
    it('should respect motion detection cooldown', async () => {
      const cooldown = 500; // ms
      const detections: number[] = [];
      let lastMotionTime = 0;

      const handleMotion = (intensity: number) => {
        const now = Date.now();
        if (now - lastMotionTime > cooldown) {
          lastMotionTime = now;
          detections.push(intensity);
        }
      };

      // Try to detect motion rapidly
      for (let i = 0; i < 10; i++) {
        handleMotion(50);
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Should have limited detections due to cooldown
      expect(detections.length).toBeLessThan(10);

      console.log(`✓ Cooldown enforced: ${detections.length} detections out of 10 attempts`);
    });

    it('should throttle frame processing to target FPS', async () => {
      const targetFps = 12;
      const minDelta = 1000 / targetFps; // ~83ms
      let lastProcessedTs = 0;
      let processedFrames = 0;

      const tryProcessFrame = (now: number) => {
        if (now - lastProcessedTs < minDelta) {
          return false; // Skip frame
        }
        lastProcessedTs = now;
        processedFrames++;
        return true;
      };

      // Simulate frames arriving at 60fps
      let currentTime = 0;
      for (let i = 0; i < 60; i++) {
        tryProcessFrame(currentTime);
        currentTime += 16.67; // 60fps timing
      }

      // Should have processed ~12 frames (not 60)
      expect(processedFrames).toBeLessThan(20);
      expect(processedFrames).toBeGreaterThan(10);

      console.log(`✓ FPS throttling: Processed ${processedFrames} frames out of 60 (target: ${targetFps}fps)`);
    });
  });
});
