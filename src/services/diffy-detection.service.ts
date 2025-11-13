import { Injectable, signal, NgZone } from '@angular/core';
import { create, DiffyInstance, DiffyOptions } from 'diffyjs';

/**
 * Detection zone configuration
 */
export interface DetectionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Motion detection result
 */
export interface MotionResult {
  detected: boolean;
  intensity: number;
  timestamp: number;
  zone?: 'left' | 'right' | 'top' | 'bottom' | 'full';
}

/**
 * Configuration for DiffyDetectionService
 */
export interface DiffyDetectionConfig {
  /**
   * Sensitivity level (1-10)
   * Maps to diffyjs sensitivity parameter
   */
  sensitivityLevel: number;

  /**
   * Detection zone configuration
   * null = full screen detection
   */
  detectionZone: DetectionZone | null;

  /**
   * Minimum delay between detections (ms)
   */
  cooldown: number;

  /**
   * Signal cadence - emit on every Nth detection
   */
  cadence: number;

  /**
   * Enable debug visualization
   */
  debug?: boolean;
}

/**
 * Angular service wrapping diffyjs for motion detection
 * Integrates with existing detector.component.ts architecture
 */
@Injectable({
  providedIn: 'root',
})
export class DiffyDetectionService {
  private diffyInstance: DiffyInstance | null = null;
  private config: DiffyDetectionConfig | null = null;

  // State management with Angular signals
  public motionDetected = signal(false);
  public lastMotionTime = signal<number>(0);
  public detectionCounter = signal<number>(0);

  // Matrix resolution for motion detection
  // Higher resolution = more granular detection, slower processing
  private readonly MATRIX_WIDTH = 40; // 40x30 provides good balance
  private readonly MATRIX_HEIGHT = 30;

  constructor(private zone: NgZone) {}

  /**
   * Initialize diffyjs motion detection
   * @param videoElement - The video element to monitor
   * @param config - Detection configuration
   */
  initialize(videoElement: HTMLVideoElement, config: DiffyDetectionConfig): void {
    this.cleanup(); // Clean up any existing instance
    this.config = config;

    // Map sensitivity level (1-10) to diffyjs parameters
    const { sensitivity, threshold } = this.mapSensitivityToParams(config.sensitivityLevel);

    const options: DiffyOptions = {
      resolution: {
        x: this.MATRIX_WIDTH,
        y: this.MATRIX_HEIGHT,
      },
      sensitivity,
      threshold,
      debug: config.debug || false,
      onFrame: (matrix) => this.processFrame(matrix),
    };

    // Create diffyjs instance outside Angular zone for performance
    this.zone.runOutsideAngular(() => {
      this.diffyInstance = create(options);
    });
  }

  /**
   * Map sensitivity level (1-10) to diffyjs parameters
   * Based on analysis of detector.component.ts sensitivity handling
   *
   * Sensitivity 1 = most sensitive (detect small movements)
   * Sensitivity 10 = least sensitive (only large movements)
   */
  private mapSensitivityToParams(level: number): { sensitivity: number; threshold: number } {
    // Clamp to valid range
    const clampedLevel = Math.max(1, Math.min(10, level));

    // Inverse mapping: higher level = less sensitive
    // sensitivity: 0.1-0.5 (lower = more contrast = more sensitive)
    // threshold: 10-50 (lower = more sensitive)

    const sensitivity = 0.1 + ((clampedLevel - 1) / 9) * 0.4; // 0.1 to 0.5
    const threshold = 10 + ((clampedLevel - 1) / 9) * 40; // 10 to 50

    return { sensitivity, threshold };
  }

  /**
   * Process each frame from diffyjs
   * @param matrix - 2D array of motion intensity values (0-255)
   */
  private processFrame(matrix: number[][]): void {
    if (!this.config) return;

    const zone = this.config.detectionZone;
    const motionAmount = this.calculateMotionInZone(matrix, zone);

    // Use adaptive threshold based on sensitivity
    // Higher sensitivity = lower threshold
    const detectionThreshold = 11 - this.config.sensitivityLevel;

    if (motionAmount > detectionThreshold) {
      this.handleMotionDetected(motionAmount);
    }
  }

  /**
   * Calculate total motion within specified zone
   * @param matrix - Motion intensity matrix
   * @param zone - Detection zone (null = full screen)
   * @returns Average motion intensity in zone (0-100)
   */
  private calculateMotionInZone(matrix: number[][], zone: DetectionZone | null): number {
    const matrixHeight = matrix.length;
    const matrixWidth = matrix[0]?.length || 0;

    if (matrixHeight === 0 || matrixWidth === 0) return 0;

    // Full screen detection
    if (!zone || zone.width === 0 || zone.height === 0) {
      return this.calculateAverageMotion(matrix, 0, 0, matrixWidth, matrixHeight);
    }

    // Calculate zone boundaries in matrix coordinates
    // Zone is defined in canvas coordinates (160x120)
    // Need to map to matrix coordinates (40x30)
    const CANVAS_WIDTH = 160;
    const CANVAS_HEIGHT = 120;

    const scaleX = matrixWidth / CANVAS_WIDTH;
    const scaleY = matrixHeight / CANVAS_HEIGHT;

    const startX = Math.floor(zone.x * scaleX);
    const startY = Math.floor(zone.y * scaleY);
    const endX = Math.min(matrixWidth, Math.ceil((zone.x + zone.width) * scaleX));
    const endY = Math.min(matrixHeight, Math.ceil((zone.y + zone.height) * scaleY));

    const width = endX - startX;
    const height = endY - startY;

    if (width <= 0 || height <= 0) return 0;

    return this.calculateAverageMotion(matrix, startX, startY, width, height);
  }

  /**
   * Calculate average motion in specified region
   */
  private calculateAverageMotion(
    matrix: number[][],
    startX: number,
    startY: number,
    width: number,
    height: number
  ): number {
    let total = 0;
    let count = 0;

    const endY = Math.min(matrix.length, startY + height);
    const endX = Math.min(matrix[0]?.length || 0, startX + width);

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        if (matrix[y] && matrix[y][x] !== undefined) {
          total += matrix[y][x];
          count++;
        }
      }
    }

    // Return normalized value (0-100)
    // diffyjs returns 0-255, normalize to 0-100 for consistency
    return count > 0 ? (total / count) * (100 / 255) : 0;
  }

  /**
   * Handle motion detection with cooldown and cadence logic
   * Matches behavior of detector.component.ts handleMotionDetected()
   */
  private handleMotionDetected(intensity: number): void {
    if (!this.config) return;

    const now = Date.now();
    const lastMotion = this.lastMotionTime();

    // Check cooldown
    if (now - lastMotion < this.config.cooldown) {
      return;
    }

    // Update detection counter
    const currentCounter = this.detectionCounter();
    const newCounter = currentCounter + 1;

    // Check cadence
    if (newCounter >= this.config.cadence) {
      // Emit detection event in Angular zone
      this.zone.run(() => {
        this.motionDetected.set(true);
        this.lastMotionTime.set(now);
        this.detectionCounter.set(0);

        // Trigger custom event for component to listen
        const event = new CustomEvent('diffyMotionDetected', {
          detail: { intensity, timestamp: now },
        });
        window.dispatchEvent(event);

        // Auto-reset after emission
        setTimeout(() => this.motionDetected.set(false), 100);
      });
    } else {
      this.zone.run(() => {
        this.detectionCounter.set(newCounter);
      });
    }
  }

  /**
   * Update configuration without recreating instance
   */
  updateConfig(config: Partial<DiffyDetectionConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config };

      // Reset state if cooldown or cadence changed
      if (config.cooldown !== undefined || config.cadence !== undefined) {
        this.detectionCounter.set(0);
      }
    }
  }

  /**
   * Get current detection counter for UI display
   */
  getDetectionProgress(): { current: number; total: number } | null {
    if (!this.config) return null;

    return {
      current: this.detectionCounter(),
      total: this.config.cadence,
    };
  }

  /**
   * Clean up resources and stop detection
   */
  cleanup(): void {
    if (this.diffyInstance) {
      this.diffyInstance.stop();
      this.diffyInstance = null;
    }

    this.config = null;
    this.motionDetected.set(false);
    this.detectionCounter.set(0);
  }

  /**
   * Check if service is initialized and active
   */
  isActive(): boolean {
    return this.diffyInstance !== null;
  }
}
