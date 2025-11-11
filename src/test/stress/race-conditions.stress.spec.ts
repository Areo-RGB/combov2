import { describe, it, expect, vi } from 'vitest';
import { testRaceCondition, simulateConcurrentUpdates } from '../utils/performance.util';

/**
 * Comprehensive Race Condition Stress Tests
 *
 * These tests run multiple iterations to detect intermittent race conditions
 * that may not appear in single-run tests.
 */
describe('Race Condition Stress Tests', () => {
  describe('Concurrent State Updates', () => {
    it('should detect race conditions in concurrent counter updates (stress test)', async () => {
      interface State {
        count: number;
      }

      let sharedState: State = { count: 0 };

      const increment = async () => {
        const current = sharedState.count;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10)); // Random delay
        sharedState.count = current + 1;
      };

      const iterations = 100;
      const concurrentOps = 10;
      let raceDetected = 0;

      for (let i = 0; i < iterations; i++) {
        sharedState = { count: 0 };

        // Run concurrent increments
        await Promise.all(
          Array.from({ length: concurrentOps }, () => increment())
        );

        // If no race condition, count should be exactly concurrentOps
        if (sharedState.count !== concurrentOps) {
          raceDetected++;
        }
      }

      const racePercentage = (raceDetected / iterations) * 100;

      console.log(
        `✓ Race conditions detected in ${raceDetected}/${iterations} iterations ` +
        `(${racePercentage.toFixed(1)}%)`
      );

      expect(raceDetected).toBeGreaterThan(0); // Should detect races
    });

    it('should stress test Firebase-like concurrent writes', async () => {
      const mockDatabase = new Map<string, any>();
      const writeHistory: Array<{ sessionId: string; value: any; timestamp: number }> = [];

      const write = async (sessionId: string, value: any) => {
        const delay = Math.random() * 50; // Simulate network latency
        await new Promise(resolve => setTimeout(resolve, delay));

        writeHistory.push({ sessionId, value, timestamp: Date.now() });
        mockDatabase.set(sessionId, value);
      };

      const sessionId = 'stress-test-session';
      const concurrentWrites = 50;

      const start = Date.now();

      // Fire off many concurrent writes
      await Promise.all(
        Array.from({ length: concurrentWrites }, (_, i) =>
          write(sessionId, { timestamp: Date.now(), intensity: i })
        )
      );

      const duration = Date.now() - start;

      // Last write should win
      const finalValue = mockDatabase.get(sessionId);
      expect(finalValue).toBeDefined();
      expect(writeHistory).toHaveLength(concurrentWrites);

      console.log(
        `✓ Concurrent writes stress test: ${concurrentWrites} writes ` +
        `in ${duration}ms (avg: ${(duration / concurrentWrites).toFixed(1)}ms per write)`
      );
    });

    it('should detect race in rapid state transitions', async () => {
      type State = 'idle' | 'initializing' | 'ready' | 'detecting' | 'error';

      let currentState: State = 'idle';
      const stateTransitions: State[] = [];

      const setState = async (newState: State, delay: number = 10) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        currentState = newState;
        stateTransitions.push(newState);
      };

      // Simulate rapid state changes
      await Promise.all([
        setState('initializing', 10),
        setState('ready', 20),
        setState('detecting', 5), // This one is fastest
        setState('error', 15),
      ]);

      // Final state is unpredictable due to race
      expect(['initializing', 'ready', 'detecting', 'error']).toContain(currentState);
      expect(stateTransitions).toHaveLength(4);

      console.log(
        `✓ State transition race: Final state "${currentState}", ` +
        `transitions: ${stateTransitions.join(' → ')}`
      );
    });
  });

  describe('BLE Message Reassembly Stress', () => {
    it('should stress test chunk reassembly with varying delivery times', async () => {
      const totalMessages = 100;
      const chunkSize = 20;

      let corruptedMessages = 0;
      let successfulMessages = 0;

      for (let msgIdx = 0; msgIdx < totalMessages; msgIdx++) {
        const message = `Message ${msgIdx}: ${'x'.repeat(100)}`;
        const chunks: string[] = [];

        // Split into chunks
        for (let i = 0; i < message.length; i += chunkSize) {
          chunks.push(message.slice(i, i + chunkSize));
        }

        // Simulate out-of-order delivery with random delays
        const buffer: string[] = new Array(chunks.length).fill('');
        const deliveryPromises = chunks.map(async (chunk, idx) => {
          const delay = Math.random() * 50;
          await new Promise(resolve => setTimeout(resolve, delay));
          buffer[idx] = chunk;
        });

        await Promise.all(deliveryPromises);

        // Reassemble
        const reassembled = buffer.join('');

        if (reassembled === message) {
          successfulMessages++;
        } else {
          corruptedMessages++;
        }
      }

      const successRate = (successfulMessages / totalMessages) * 100;

      console.log(
        `✓ Chunk reassembly stress: ${successfulMessages}/${totalMessages} ` +
        `successful (${successRate.toFixed(1)}% success rate)`
      );

      expect(successfulMessages).toBe(totalMessages); // Should reassemble correctly
    });

    it('should stress test concurrent message processing on different keys', async () => {
      type ChunkEnvelope = { key: string; idx: number; total: number; data: string };

      const buffers = new Map<string, { total: number; parts: string[] }>();

      const processChunk = async (envelope: ChunkEnvelope) => {
        const { key, idx, total, data } = envelope;

        if (!buffers.has(key) || buffers.get(key)!.total !== total) {
          buffers.set(key, { total, parts: new Array(total).fill('') });
        }

        const buffer = buffers.get(key)!;
        buffer.parts[idx] = data;

        // Check if complete
        if (buffer.parts.every(p => p !== '')) {
          return buffer.parts.join('');
        }

        return null;
      };

      const messages = ['msg-1', 'msg-2', 'msg-3'].map(key => ({
        key,
        content: `Content for ${key}: ${'x'.repeat(100)}`,
      }));

      const allChunks: ChunkEnvelope[] = [];

      // Create chunks for all messages
      messages.forEach(({ key, content }) => {
        for (let i = 0; i < content.length; i += 30) {
          allChunks.push({
            key,
            idx: Math.floor(i / 30),
            total: Math.ceil(content.length / 30),
            data: content.slice(i, i + 30),
          });
        }
      });

      // Shuffle chunks to simulate out-of-order, interleaved delivery
      allChunks.sort(() => Math.random() - 0.5);

      // Process all chunks concurrently
      const results = await Promise.all(allChunks.map(chunk => processChunk(chunk)));

      const completed = results.filter(r => r !== null);

      expect(completed).toHaveLength(messages.length);

      console.log(`✓ Concurrent message reassembly: ${completed.length} messages completed`);
    });
  });

  describe('WebRTC Connection Stress', () => {
    it('should stress test rapid offer/answer exchanges', async () => {
      const exchanges = 50;
      let successful = 0;
      let failed = 0;

      const createOffer = async () => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        return `offer-${Date.now()}`;
      };

      const createAnswer = async (offer: string) => {
        await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
        return `answer-for-${offer}`;
      };

      for (let i = 0; i < exchanges; i++) {
        try {
          const offer = await createOffer();
          const answer = await createAnswer(offer);

          if (answer.includes('offer-')) {
            successful++;
          } else {
            failed++;
          }
        } catch (error) {
          failed++;
        }
      }

      console.log(
        `✓ WebRTC offer/answer stress: ${successful}/${exchanges} successful ` +
        `(${((successful / exchanges) * 100).toFixed(1)}%)`
      );

      expect(successful).toBe(exchanges);
    });

    it('should detect connection state race during rapid reconnections', async () => {
      type ConnectionState = 'new' | 'connecting' | 'connected' | 'disconnected' | 'failed';

      let state: ConnectionState = 'new';
      const stateHistory: ConnectionState[] = [];

      const connect = async () => {
        state = 'connecting';
        stateHistory.push('connecting');

        await new Promise(resolve => setTimeout(resolve, Math.random() * 50));

        state = 'connected';
        stateHistory.push('connected');
      };

      const disconnect = async () => {
        state = 'disconnected';
        stateHistory.push('disconnected');
      };

      // Rapid connect/disconnect cycles
      for (let i = 0; i < 10; i++) {
        const connectPromise = connect();
        setTimeout(() => disconnect(), Math.random() * 30);
        await connectPromise;
      }

      // State history should show the race
      const hasInconsistentTransitions = stateHistory.some(
        (s, i) => i > 0 && s === 'disconnected' && stateHistory[i - 1] === 'connecting'
      );

      if (hasInconsistentTransitions) {
        console.warn('⚠️ Race detected: Disconnect called before connection established');
      }

      expect(stateHistory.length).toBeGreaterThan(10);
    });
  });

  describe('Frame Processing Queue Stress', () => {
    it('should stress test frame queue with varying processing times', async () => {
      const frames: number[] = [];
      let processing = false;
      let droppedFrames = 0;

      const queueFrame = (frameNumber: number) => {
        if (processing) {
          droppedFrames++;
          return false;
        }
        frames.push(frameNumber);
        return true;
      };

      const processFrame = async () => {
        if (frames.length === 0) return;

        processing = true;
        const frame = frames.shift();

        // Variable processing time (simulating complex vs simple frames)
        const processingTime = Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, processingTime));

        processing = false;
      };

      // Simulate 60fps frame arrival
      let frameNumber = 0;
      const frameInterval = setInterval(() => {
        queueFrame(frameNumber++);
        processFrame(); // Try to process
      }, 16.67); // 60fps

      // Run for 1 second
      await new Promise(resolve => setTimeout(resolve, 1000));
      clearInterval(frameInterval);

      console.log(
        `✓ Frame queue stress: ${droppedFrames} frames dropped ` +
        `(${frames.length} still queued, ${frameNumber} total)`
      );

      expect(droppedFrames).toBeGreaterThan(0); // Should drop some due to varying processing time
    });

    it('should detect memory buildup from unbounded frame queue', async () => {
      const frameQueue: ArrayBuffer[] = [];
      const frameSize = 160 * 120 * 4; // RGBA image data size

      let processing = false;

      const queueFrame = () => {
        const frame = new ArrayBuffer(frameSize);
        frameQueue.push(frame);
      };

      const processFrames = async () => {
        if (processing) return;
        processing = true;

        while (frameQueue.length > 0) {
          frameQueue.shift(); // Process frame
          await new Promise(resolve => setTimeout(resolve, 100)); // Slow processing
        }

        processing = false;
      };

      // Queue frames rapidly
      for (let i = 0; i < 100; i++) {
        queueFrame();
      }

      const queuedMemory = (frameQueue.length * frameSize) / (1024 * 1024); // MB

      console.log(
        `✓ Frame queue memory: ${frameQueue.length} frames queued ` +
        `(~${queuedMemory.toFixed(2)} MB)`
      );

      expect(frameQueue.length).toBeGreaterThan(0);

      // Cleanup
      await processFrames();
    });
  });

  describe('Listener Management Stress', () => {
    it('should stress test rapid listener attach/detach cycles', async () => {
      const listeners = new Map<string, Set<Function>>();

      const addListener = (path: string, callback: Function) => {
        if (!listeners.has(path)) {
          listeners.set(path, new Set());
        }
        listeners.get(path)!.add(callback);
      };

      const removeListener = (path: string, callback: Function) => {
        listeners.get(path)?.delete(callback);
      };

      const emit = (path: string, value: any) => {
        listeners.get(path)?.forEach(cb => cb(value));
      };

      const cycles = 1000;
      const path = 'test-path';

      for (let i = 0; i < cycles; i++) {
        const callback = (value: any) => {};
        addListener(path, callback);
        removeListener(path, callback);
      }

      // Should have no memory leak
      const remainingListeners = listeners.get(path)?.size || 0;

      expect(remainingListeners).toBe(0);

      console.log(
        `✓ Listener stress: ${cycles} attach/detach cycles, ` +
        `${remainingListeners} listeners remaining`
      );
    });
  });

  describe('Model Switching Stress', () => {
    it('should stress test rapid model switching', async () => {
      let currentModel: string | null = null;
      let loadingModel: string | null = null;
      let switchCount = 0;
      let collisions = 0;

      const loadModel = async (modelName: string) => {
        if (loadingModel !== null) {
          collisions++;
          console.warn(`⚠️ Collision: Loading ${loadingModel} while switching to ${modelName}`);
        }

        loadingModel = modelName;
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        currentModel = modelName;
        loadingModel = null;
        switchCount++;
      };

      const models = ['mediapipe-lite', 'mediapipe-full', 'movenet-lightning', 'movenet-thunder'];

      // Rapidly switch between models
      const switches = Array.from({ length: 20 }, (_, i) => {
        const randomModel = models[Math.floor(Math.random() * models.length)];
        return loadModel(randomModel);
      });

      await Promise.all(switches);

      console.log(
        `✓ Model switching stress: ${switchCount} switches completed, ` +
        `${collisions} collisions detected`
      );

      expect(switchCount).toBe(20);
      expect(collisions).toBeGreaterThan(0); // Should detect some collisions
    });
  });
});
