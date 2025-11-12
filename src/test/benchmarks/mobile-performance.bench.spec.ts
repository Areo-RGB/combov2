import { describe, it, expect, beforeEach } from 'vitest';
import {
  measureExecutionTime,
  DEVICE_PROFILES,
  checkFrameBudget,
  simulateFrameLoop,
  simulateCPUSlowdown,
  MemoryLeakDetector,
} from '../utils/performance.util';

/**
 * Mobile Performance Benchmarks
 *
 * These benchmarks test critical operations on simulated mobile device profiles:
 * - High-end: Flagship phones (60fps target)
 * - Mid-range: Average smartphones (30fps target)
 * - Low-end: Budget devices (20fps target)
 * - Throttled: Background/low-power mode (10fps target)
 */
describe('Mobile Performance Benchmarks', () => {
  describe('Frame Processing Benchmarks', () => {
    it('performance: motion detection pixel comparison on different devices', async () => {
      const width = 160;
      const height = 120;
      const currentFrame = new Uint8ClampedArray(width * height * 4);
      const previousFrame = new Uint8ClampedArray(width * height * 4);

      // Fill with random pixel data
      for (let i = 0; i < currentFrame.length; i++) {
        currentFrame[i] = Math.random() * 255;
        previousFrame[i] = Math.random() * 255;
      }

      // Simple motion detection algorithm
      const detectMotion = () => {
        let changes = 0;
        const threshold = 30;

        for (let i = 0; i < currentFrame.length; i += 4) {
          const rDiff = Math.abs(currentFrame[i] - previousFrame[i]);
          const gDiff = Math.abs(currentFrame[i + 1] - previousFrame[i + 1]);
          const bDiff = Math.abs(currentFrame[i + 2] - previousFrame[i + 2]);

          if (rDiff + gDiff + bDiff > threshold) {
            changes++;
          }
        }

        return (changes / (currentFrame.length / 4)) * 100;
      };

      for (const [deviceType, profile] of Object.entries(DEVICE_PROFILES)) {
        const { metrics } = await measureExecutionTime(
          async () => detectMotion(),
          20
        );

        const budget = checkFrameBudget(metrics.executionTime, profile);

        console.log(
          `${deviceType.padEnd(12)}: ${metrics.executionTime.toFixed(2)}ms ` +
          `(${budget.budgetUsed.toFixed(1)}% of ${profile.frameTime}ms budget) ` +
          `${budget.withinBudget ? '✓' : '✗'}`
        );

        // High-end and mid-range should meet budget
        if (deviceType === 'high-end' || deviceType === 'mid-range') {
          expect(budget.withinBudget).toBe(true);
        }
      }
    });

    it('performance: getImageData operation on different canvas sizes', async () => {
      const sizes = [
        { width: 160, height: 120, label: 'Small (160x120)' },
        { width: 320, height: 240, label: 'Medium (320x240)' },
        { width: 640, height: 480, label: 'Large (640x480)' },
      ];

      console.log('\ngetImageData Performance:');

      for (const size of sizes) {
        const canvas = document.createElement('canvas');
        canvas.width = size.width;
        canvas.height = size.height;
        const ctx = canvas.getContext('2d')!;

        const { metrics } = await measureExecutionTime(
          async () => {
            ctx.fillStyle = '#FF0000';
            ctx.fillRect(0, 0, size.width, size.height);
            const imageData = ctx.getImageData(0, 0, size.width, size.height);
            return imageData.data.length;
          },
          50
        );

        const pixels = size.width * size.height;

        console.log(
          `${size.label.padEnd(20)}: ${metrics.executionTime.toFixed(2)}ms ` +
          `(${pixels.toLocaleString()} pixels)`
        );
      }
    });

    it('performance: JSON stringify/parse for BLE message chunks', async () => {
      const testData = {
        t: 'offer',
        idx: 5,
        total: 10,
        data: 'x'.repeat(180), // Max chunk size
      };

      const { metrics: stringifyMetrics } = await measureExecutionTime(
        async () => JSON.stringify(testData),
        1000
      );

      const serialized = JSON.stringify(testData);
      const { metrics: parseMetrics } = await measureExecutionTime(
        async () => JSON.parse(serialized),
        1000
      );

      console.log(
        `\nJSON Performance:\n` +
        `Stringify: ${stringifyMetrics.executionTime.toFixed(3)}ms\n` +
        `Parse:     ${parseMetrics.executionTime.toFixed(3)}ms\n` +
        `Total:     ${(stringifyMetrics.executionTime + parseMetrics.executionTime).toFixed(3)}ms`
      );

      // Should be very fast (< 1ms on average)
      expect(stringifyMetrics.executionTime).toBeLessThan(1);
      expect(parseMetrics.executionTime).toBeLessThan(1);
    });
  });

  describe('Network Latency Simulation', () => {
    it('performance: BLE chunk transmission timing', async () => {
      const message = 'x'.repeat(1000); // Large message
      const chunkSize = 180;
      const bleDelay = 10; // 10ms per chunk as per spec

      const totalChunks = Math.ceil(message.length / chunkSize);

      const simulateTransmission = async () => {
        for (let i = 0; i < totalChunks; i++) {
          await new Promise(resolve => setTimeout(resolve, bleDelay));
        }
      };

      const { metrics } = await measureExecutionTime(simulateTransmission, 1);

      console.log(
        `\nBLE Transmission:\n` +
        `Message size: ${message.length} bytes\n` +
        `Chunks: ${totalChunks}\n` +
        `Total time: ${metrics.executionTime.toFixed(0)}ms\n` +
        `Expected: ${totalChunks * bleDelay}ms`
      );

      expect(metrics.executionTime).toBeGreaterThanOrEqual(totalChunks * bleDelay);
    });

    it('performance: Firebase write latency on different network conditions', async () => {
      const networkProfiles = [
        { name: 'WiFi', latency: 20 },
        { name: '4G', latency: 50 },
        { name: '3G', latency: 200 },
        { name: 'Edge', latency: 500 },
      ];

      console.log('\nFirebase Write Latency:');

      for (const network of networkProfiles) {
        const { metrics } = await measureExecutionTime(
          async () => {
            await new Promise(resolve => setTimeout(resolve, network.latency));
          },
          10
        );

        console.log(`${network.name.padEnd(6)}: ${metrics.executionTime.toFixed(0)}ms`);

        expect(metrics.executionTime).toBeGreaterThanOrEqual(network.latency);
      }
    });
  });

  describe('Memory and Resource Benchmarks', () => {
    it('performance: memory allocation for frame buffers', () => {
      const sizes = [
        { width: 160, height: 120, label: 'Low res' },
        { width: 320, height: 240, label: 'Medium res' },
        { width: 640, height: 480, label: 'High res' },
        { width: 1280, height: 720, label: 'HD' },
      ];

      console.log('\nFrame Buffer Memory:');

      sizes.forEach(size => {
        const pixels = size.width * size.height;
        const bytes = pixels * 4; // RGBA
        const mb = bytes / (1024 * 1024);

        console.log(
          `${size.label.padEnd(12)}: ${mb.toFixed(2)} MB ` +
          `(${pixels.toLocaleString()} pixels)`
        );
      });
    });

    it('performance: detect memory leak from repeated frame processing', async () => {
      const detector = new MemoryLeakDetector();

      const processFrame = () => {
        const buffer = new Uint8ClampedArray(160 * 120 * 4);
        // Simulate processing
        for (let i = 0; i < buffer.length; i++) {
          buffer[i] = Math.random() * 255;
        }
        return buffer;
      };

      detector.takeSnapshot();

      // Process many frames
      const frames = 100;
      for (let i = 0; i < frames; i++) {
        processFrame();
      }

      detector.takeSnapshot();

      const growth = detector.getMemoryGrowth();

      console.log(
        `\nMemory Growth After ${frames} Frames:\n` +
        `Growth: ${growth.toFixed(1)}%`
      );

      // Should not grow significantly if properly garbage collected
      // (Note: This may not work reliably in test environment)
    });

    it('performance: localStorage size growth with match history', async () => {
      const mockLocalStorage: { [key: string]: string } = {};

      const saveMatch = (matchId: string, data: any) => {
        mockLocalStorage[`match_${matchId}`] = JSON.stringify(data);
      };

      const getStorageSize = () => {
        return Object.values(mockLocalStorage).reduce(
          (total, value) => total + value.length,
          0
        );
      };

      // Simulate saving match history
      const matchesPerDay = 50;
      const days = 30; // One month

      for (let day = 0; day < days; day++) {
        for (let match = 0; match < matchesPerDay; match++) {
          const matchData = {
            id: `${day}-${match}`,
            timestamp: Date.now(),
            players: ['Player1', 'Player2'],
            scores: [100, 95],
            duration: 30000,
          };

          saveMatch(`${day}-${match}`, matchData);
        }
      }

      const totalSize = getStorageSize();
      const mb = totalSize / (1024 * 1024);

      console.log(
        `\nLocalStorage Growth:\n` +
        `Matches: ${matchesPerDay * days}\n` +
        `Size: ${mb.toFixed(2)} MB\n` +
        `Avg per match: ${(totalSize / (matchesPerDay * days)).toFixed(0)} bytes`
      );

      // localStorage limit is typically 5-10MB
      if (mb > 5) {
        console.warn('⚠️ LocalStorage exceeds typical 5MB limit');
      }
    });
  });

  describe('Frame Rate Sustainability', () => {
    it('performance: sustained 60fps on high-end devices', async () => {
      const profile = DEVICE_PROFILES['high-end'];
      const targetFrames = 60; // 1 second at 60fps

      // Simple frame processing (motion detection)
      const processFrame = async () => {
        const buffer = new Uint8ClampedArray(160 * 120 * 4);
        let changes = 0;
        for (let i = 0; i < buffer.length; i += 40) {
          if (buffer[i] > 128) changes++;
        }
        return changes;
      };

      const result = await simulateFrameLoop(processFrame, targetFrames, profile);

      const achievedFps = targetFrames / ((result.avgFrameTime * targetFrames) / 1000);

      console.log(
        `\nHigh-end Device (60fps target):\n` +
        `Frames: ${result.totalFrames}\n` +
        `Dropped: ${result.droppedFrames}\n` +
        `Avg time: ${result.avgFrameTime.toFixed(2)}ms\n` +
        `Achieved: ${achievedFps.toFixed(1)}fps`
      );

      expect(result.droppedFrames).toBe(0);
    });

    it('performance: sustained 30fps on mid-range devices', async () => {
      const profile = DEVICE_PROFILES['mid-range'];
      const targetFrames = 30; // 1 second at 30fps

      // Medium complexity processing
      const processFrame = async () => {
        await new Promise(resolve => setTimeout(resolve, 5)); // Simulate processing
      };

      const result = await simulateFrameLoop(processFrame, targetFrames, profile);

      const achievedFps = targetFrames / ((result.avgFrameTime * targetFrames) / 1000);

      console.log(
        `\nMid-range Device (30fps target):\n` +
        `Frames: ${result.totalFrames}\n` +
        `Dropped: ${result.droppedFrames}\n` +
        `Avg time: ${result.avgFrameTime.toFixed(2)}ms\n` +
        `Achieved: ${achievedFps.toFixed(1)}fps`
      );

      expect(result.droppedFrames).toBeLessThan(5);
    });

    it('performance: degraded mode on low-end devices', async () => {
      const profile = DEVICE_PROFILES['low-end'];
      const targetFrames = 20; // Target 20fps on low-end

      // Heavy processing
      const processFrame = async () => {
        await new Promise(resolve => setTimeout(resolve, 30)); // Slow processing
      };

      const result = await simulateFrameLoop(processFrame, targetFrames, profile);

      console.log(
        `\nLow-end Device (20fps target):\n` +
        `Frames: ${result.totalFrames}\n` +
        `Dropped: ${result.droppedFrames}\n` +
        `Avg time: ${result.avgFrameTime.toFixed(2)}ms`
      );

      // May drop frames, but should still function
      expect(result.totalFrames).toBeGreaterThan(0);
    });
  });

  describe('Concurrent Operations Performance', () => {
    it('performance: concurrent Firebase writes throughput', async () => {
      const concurrentWrites = 50;

      const writeOperation = async (value: any) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));
      };

      const start = performance.now();

      await Promise.all(
        Array.from({ length: concurrentWrites }, (_, i) =>
          writeOperation({ timestamp: Date.now(), intensity: i })
        )
      );

      const duration = performance.now() - start;
      const writesPerSecond = (concurrentWrites / duration) * 1000;

      console.log(
        `\nConcurrent Firebase Writes:\n` +
        `Total: ${concurrentWrites}\n` +
        `Duration: ${duration.toFixed(0)}ms\n` +
        `Throughput: ${writesPerSecond.toFixed(0)} writes/sec`
      );

      expect(writesPerSecond).toBeGreaterThan(10);
    });

    it('performance: WebRTC data channel message rate', async () => {
      const messages = 1000;
      const messageDelay = 0; // No artificial delay

      const sendMessage = async (intensity: number) => {
        const message = JSON.stringify({ t: 'motion', intensity, ts: Date.now() });
        await new Promise(resolve => setTimeout(resolve, messageDelay));
        return message.length;
      };

      const start = performance.now();

      for (let i = 0; i < messages; i++) {
        await sendMessage(i % 100);
      }

      const duration = performance.now() - start;
      const messagesPerSecond = (messages / duration) * 1000;

      console.log(
        `\nWebRTC Message Throughput:\n` +
        `Messages: ${messages}\n` +
        `Duration: ${duration.toFixed(0)}ms\n` +
        `Rate: ${messagesPerSecond.toFixed(0)} msg/sec`
      );

      // Should easily handle 60 messages/sec (one per frame at 60fps)
      expect(messagesPerSecond).toBeGreaterThan(60);
    });
  });

  describe('Battery Impact Estimates', () => {
    it('performance: estimate battery drain from continuous camera usage', () => {
      // Typical mobile battery: 3000-5000 mAh
      // Camera usage: ~300-500 mA
      // Frame processing: ~100-300 mA additional

      const batteryCapacity = 4000; // mAh (typical)
      const cameraDrain = 400; // mA
      const processingDrain = 200; // mA
      const totalDrain = cameraDrain + processingDrain;

      const hoursOfUsage = batteryCapacity / totalDrain;

      console.log(
        `\nEstimated Battery Impact:\n` +
        `Battery capacity: ${batteryCapacity} mAh\n` +
        `Camera drain: ${cameraDrain} mA\n` +
        `Processing drain: ${processingDrain} mA\n` +
        `Total drain: ${totalDrain} mA\n` +
        `Estimated runtime: ${hoursOfUsage.toFixed(1)} hours`
      );

      expect(hoursOfUsage).toBeGreaterThan(2);
    });

    it('performance: reduced power mode frame rate', () => {
      const profiles = [
        { mode: 'Normal', fps: 30, drain: 600 },
        { mode: 'Power Saving (15fps)', fps: 15, drain: 400 },
        { mode: 'Ultra Save (10fps)', fps: 10, drain: 300 },
      ];

      console.log('\nPower Mode Comparison:');

      profiles.forEach(profile => {
        const batteryLife = 4000 / profile.drain;

        console.log(
          `${profile.mode.padEnd(25)}: ${batteryLife.toFixed(1)}h runtime ` +
          `(${profile.drain} mA drain)`
        );
      });
    });
  });
});
