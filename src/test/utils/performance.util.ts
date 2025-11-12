import { vi } from 'vitest';

/**
 * Performance testing utilities for mobile device simulation
 */

export interface PerformanceMetrics {
  executionTime: number;
  memoryUsed?: number;
  fps?: number;
  frameDrops?: number;
}

export interface MobileDeviceProfile {
  name: string;
  cpuSlowdown: number; // Multiplier for CPU-bound operations
  memoryLimit: number; // MB
  frameTime: number; // Target ms per frame (16.67ms = 60fps)
}

export const DEVICE_PROFILES: Record<string, MobileDeviceProfile> = {
  'high-end': {
    name: 'High-end Mobile (Flagship)',
    cpuSlowdown: 1,
    memoryLimit: 8192,
    frameTime: 16.67, // 60fps
  },
  'mid-range': {
    name: 'Mid-range Mobile',
    cpuSlowdown: 2.5,
    memoryLimit: 4096,
    frameTime: 33.33, // 30fps
  },
  'low-end': {
    name: 'Low-end Mobile (Budget)',
    cpuSlowdown: 4,
    memoryLimit: 2048,
    frameTime: 50, // 20fps
  },
  'throttled': {
    name: 'Throttled Device (Background)',
    cpuSlowdown: 6,
    memoryLimit: 1024,
    frameTime: 100, // 10fps
  },
};

/**
 * Measure execution time of an async function
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T>,
  iterations: number = 1
): Promise<{ result: T; metrics: PerformanceMetrics }> {
  const times: number[] = [];
  let lastResult: T;

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    lastResult = await fn();
    const end = performance.now();
    times.push(end - start);
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

  return {
    result: lastResult!,
    metrics: {
      executionTime: avgTime,
    },
  };
}

/**
 * Simulate CPU slowdown for mobile device
 */
export async function simulateCPUSlowdown(
  fn: () => Promise<any>,
  profile: MobileDeviceProfile
): Promise<void> {
  const start = performance.now();
  await fn();
  const actualTime = performance.now() - start;

  // Add artificial delay to simulate slower CPU
  const slowdownDelay = actualTime * (profile.cpuSlowdown - 1);
  if (slowdownDelay > 0) {
    await new Promise(resolve => setTimeout(resolve, slowdownDelay));
  }
}

/**
 * Check if operation meets frame budget
 */
export function checkFrameBudget(
  executionTime: number,
  profile: MobileDeviceProfile
): { withinBudget: boolean; budgetUsed: number; framesDropped: number } {
  const budgetUsed = (executionTime / profile.frameTime) * 100;
  const framesDropped = Math.max(0, Math.ceil(executionTime / profile.frameTime) - 1);

  return {
    withinBudget: executionTime <= profile.frameTime,
    budgetUsed,
    framesDropped,
  };
}

/**
 * Simulate frame processing loop and detect frame drops
 */
export async function simulateFrameLoop(
  processFrame: () => Promise<void>,
  frameCount: number,
  profile: MobileDeviceProfile
): Promise<{ totalFrames: number; droppedFrames: number; avgFrameTime: number }> {
  const frameTimes: number[] = [];
  let droppedFrames = 0;

  for (let i = 0; i < frameCount; i++) {
    const start = performance.now();
    await processFrame();
    const frameTime = performance.now() - start;

    frameTimes.push(frameTime);

    if (frameTime > profile.frameTime) {
      droppedFrames += Math.floor(frameTime / profile.frameTime);
    }

    // Wait for next frame
    const remainingTime = Math.max(0, profile.frameTime - frameTime);
    await new Promise(resolve => setTimeout(resolve, remainingTime));
  }

  const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;

  return {
    totalFrames: frameCount,
    droppedFrames,
    avgFrameTime,
  };
}

/**
 * Test race condition by running operations concurrently
 */
export async function testRaceCondition<T>(
  operations: Array<() => Promise<T>>,
  iterations: number = 100
): Promise<{ races: number; results: T[][] }> {
  let races = 0;
  const allResults: T[][] = [];

  for (let i = 0; i < iterations; i++) {
    const results = await Promise.all(operations.map(op => op()));
    allResults.push(results);

    // Check if results are inconsistent (simple equality check)
    const firstResult = JSON.stringify(results[0]);
    if (results.some(r => JSON.stringify(r) !== firstResult)) {
      races++;
    }
  }

  return { races, results: allResults };
}

/**
 * Simulate concurrent state updates
 */
export async function simulateConcurrentUpdates<T>(
  initialState: T,
  updates: Array<(state: T) => T>,
  delay: number = 0
): Promise<T[]> {
  const states: T[] = [initialState];

  // Apply updates concurrently with random delays
  await Promise.all(
    updates.map(async (update, index) => {
      const randomDelay = delay * Math.random();
      await new Promise(resolve => setTimeout(resolve, randomDelay));
      states[index + 1] = update(states[states.length - 1]);
    })
  );

  return states;
}

/**
 * Memory leak detector
 */
export class MemoryLeakDetector {
  private snapshots: number[] = [];

  takeSnapshot(): void {
    if (performance.memory) {
      this.snapshots.push(performance.memory.usedJSHeapSize);
    }
  }

  detectLeak(threshold: number = 1.5): boolean {
    if (this.snapshots.length < 2) return false;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    return last > first * threshold;
  }

  getMemoryGrowth(): number {
    if (this.snapshots.length < 2) return 0;

    const first = this.snapshots[0];
    const last = this.snapshots[this.snapshots.length - 1];

    return ((last - first) / first) * 100;
  }

  reset(): void {
    this.snapshots = [];
  }
}

/**
 * Mock performance.now() with controllable time
 */
export class MockPerformance {
  private currentTime = 0;

  now(): number {
    return this.currentTime;
  }

  advance(ms: number): void {
    this.currentTime += ms;
  }

  reset(): void {
    this.currentTime = 0;
  }
}

/**
 * Create a debounced test helper
 */
export function createDebounceTester(delay: number) {
  let timeoutId: NodeJS.Timeout | null = null;
  let callCount = 0;
  let executionCount = 0;

  const debounced = (fn: Function) => {
    callCount++;
    if (timeoutId) clearTimeout(timeoutId);

    return new Promise((resolve) => {
      timeoutId = setTimeout(() => {
        executionCount++;
        resolve(fn());
      }, delay);
    });
  };

  return {
    debounced,
    getCallCount: () => callCount,
    getExecutionCount: () => executionCount,
    reset: () => {
      callCount = 0;
      executionCount = 0;
      if (timeoutId) clearTimeout(timeoutId);
    },
  };
}

/**
 * Assert performance meets threshold
 */
export function assertPerformance(
  metrics: PerformanceMetrics,
  maxTime: number,
  message?: string
): void {
  if (metrics.executionTime > maxTime) {
    throw new Error(
      message ||
      `Performance threshold exceeded: ${metrics.executionTime.toFixed(2)}ms > ${maxTime}ms`
    );
  }
}
