import { Injectable, signal, NgZone } from '@angular/core';
import Speedy from 'speedy-vision';

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
 * Motion result with optical flow data
 */
export interface SpeedyMotionResult {
  detected: boolean;
  intensity: number;
  velocity: number;
  direction: { x: number; y: number };
  confidence: number;
  timestamp: number;
}

/**
 * Configuration for SpeedyDetectionService
 */
export interface SpeedyDetectionConfig {
  /**
   * Sensitivity level (1-10)
   * Higher = more sensitive to motion
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
   * Enable debug mode
   */
  debug?: boolean;
}

/**
 * Angular service wrapping speedy-vision for GPU-accelerated motion detection
 * Uses optical flow and feature tracking for advanced motion analysis
 */
@Injectable({
  providedIn: 'root'
})
export class SpeedyDetectionService {
  private media: any = null;
  private pipeline: any = null;
  private config: SpeedyDetectionConfig | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // State management with Angular signals
  public motionDetected = signal(false);
  public lastMotionTime = signal<number>(0);
  public detectionCounter = signal<number>(0);
  public webGLSupported = signal<boolean>(true);

  // Performance tracking
  private lastFrameTime = 0;
  private frameCount = 0;
  public currentFPS = signal<number>(0);

  constructor(private zone: NgZone) {
    // Check WebGL2 support
    this.checkWebGLSupport();
  }

  /**
   * Check if WebGL2 is supported
   */
  private checkWebGLSupport(): void {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      this.webGLSupported.set(!!gl);
    } catch (e) {
      this.webGLSupported.set(false);
    }
  }

  /**
   * Check if speedy-vision is supported in this environment
   */
  isSupported(): boolean {
    return Speedy.isSupported() && this.webGLSupported();
  }

  /**
   * Initialize speedy-vision motion detection with optical flow
   * @param videoElement - The video element to monitor
   * @param config - Detection configuration
   */
  async initialize(videoElement: HTMLVideoElement, config: SpeedyDetectionConfig): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Speedy-vision requires WebGL2 support');
    }

    await this.cleanup(); // Clean up any existing instance
    this.config = config;

    try {
      // Load media from video element
      this.media = await Speedy.load(videoElement);

      // Build detection pipeline with optical flow
      this.pipeline = Speedy.Pipeline();

      // Create source node
      const source = Speedy.Image.Source();
      source.media = this.media;

      // Convert to greyscale for faster processing
      const greyscale = Speedy.Filter.Greyscale();

      // Apply Gaussian blur to reduce noise
      const blur = Speedy.Filter.GaussianBlur();
      blur.kernelSize = Speedy.Size(5, 5);

      // Nightvision for better low-light performance
      const nightvision = Speedy.Filter.Nightvision();
      nightvision.gain = 0.5;
      nightvision.offset = 0.5;
      nightvision.decay = 0.0;

      // Harris corner detector for feature points
      const harris = Speedy.Keypoint.Detector.Harris();
      harris.quality = 0.1; // Lower = more features detected
      harris.capacity = this.calculateFeatureCapacity(config.sensitivityLevel);

      // Optical flow tracker (LK - Lucas-Kanade)
      const lk = Speedy.Keypoint.Tracker.LK();
      lk.windowSize = Speedy.Size(21, 21);
      lk.levels = 5; // Image pyramid levels
      lk.discardThreshold = 0.0001;
      lk.epsilon = 0.01;
      lk.numberOfIterations = 30;

      // Sink to receive keypoints
      const sink = Speedy.Keypoint.Sink();

      // Connect pipeline nodes
      source.output().connectTo(greyscale.input());
      greyscale.output().connectTo(blur.input());
      blur.output().connectTo(nightvision.input());
      nightvision.output().connectTo(harris.input());
      harris.output().connectTo(lk.input());
      lk.output().connectTo(sink.input());

      // Initialize pipeline
      this.pipeline.init(
        source, greyscale, blur, nightvision,
        harris, lk, sink
      );

      // Start processing loop
      this.isRunning = true;
      this.zone.runOutsideAngular(() => {
        this.processLoop();
      });

    } catch (error) {
      console.error('Failed to initialize speedy-vision:', error);
      throw error;
    }
  }

  /**
   * Calculate feature detection capacity based on sensitivity
   * Higher sensitivity = detect more features
   */
  private calculateFeatureCapacity(sensitivityLevel: number): number {
    // Sensitivity 1-10 maps to capacity 20-200
    return 20 + (sensitivityLevel - 1) * 20;
  }

  /**
   * Scale detection zone from canvas coordinates to video coordinates
   */
  private scaleZoneToVideoSize(
    zone: DetectionZone,
    videoWidth: number,
    videoHeight: number
  ): DetectionZone {
    const CANVAS_WIDTH = 160;
    const CANVAS_HEIGHT = 120;

    const scaleX = videoWidth / CANVAS_WIDTH;
    const scaleY = videoHeight / CANVAS_HEIGHT;

    return {
      x: Math.floor(zone.x * scaleX),
      y: Math.floor(zone.y * scaleY),
      width: Math.floor(zone.width * scaleX),
      height: Math.floor(zone.height * scaleY)
    };
  }

  /**
   * Main processing loop using requestAnimationFrame
   */
  private processLoop(): void {
    if (!this.isRunning || !this.pipeline) {
      return;
    }

    const process = async () => {
      if (!this.isRunning || !this.pipeline) return;

      try {
        // Run pipeline and get results
        const result = await this.pipeline.run();
        const keypoints = result.keypoints;

        // Update FPS counter
        this.updateFPS();

        // Analyze motion from optical flow
        if (keypoints && keypoints.length > 0) {
          const motionData = this.analyzeOpticalFlow(keypoints);

          if (motionData.detected) {
            this.handleMotionDetected(motionData);
          }
        }

      } catch (error) {
        console.error('Speedy pipeline error:', error);
      }

      // Continue loop
      this.animationFrameId = requestAnimationFrame(() => process());
    };

    process();
  }

  /**
   * Analyze optical flow from tracked keypoints
   */
  private analyzeOpticalFlow(keypoints: any[]): SpeedyMotionResult {
    if (!this.config) {
      return {
        detected: false,
        intensity: 0,
        velocity: 0,
        direction: { x: 0, y: 0 },
        confidence: 0,
        timestamp: Date.now()
      };
    }

    // Filter keypoints with valid flow data
    const movingKeypoints = keypoints.filter(kp => {
      // Check if keypoint has flow data (tracked)
      return kp.flow && (Math.abs(kp.flow.x) > 0.1 || Math.abs(kp.flow.y) > 0.1);
    });

    if (movingKeypoints.length === 0) {
      return {
        detected: false,
        intensity: 0,
        velocity: 0,
        direction: { x: 0, y: 0 },
        confidence: 0,
        timestamp: Date.now()
      };
    }

    // Calculate average motion vector
    let totalFlowX = 0;
    let totalFlowY = 0;
    let totalMagnitude = 0;

    for (const kp of movingKeypoints) {
      const flowX = kp.flow.x;
      const flowY = kp.flow.y;
      const magnitude = Math.sqrt(flowX * flowX + flowY * flowY);

      totalFlowX += flowX;
      totalFlowY += flowY;
      totalMagnitude += magnitude;
    }

    const avgFlowX = totalFlowX / movingKeypoints.length;
    const avgFlowY = totalFlowY / movingKeypoints.length;
    const avgVelocity = totalMagnitude / movingKeypoints.length;

    // Calculate confidence based on number of moving keypoints
    const confidence = Math.min(100, (movingKeypoints.length / keypoints.length) * 100);

    // Determine if motion exceeds threshold
    // Map sensitivity (1-10) to threshold (10-1)
    // Higher sensitivity = lower threshold
    const velocityThreshold = 11 - this.config.sensitivityLevel;
    const detected = avgVelocity > velocityThreshold;

    // Normalize intensity to 0-100 range
    const intensity = Math.min(100, avgVelocity * 10);

    return {
      detected,
      intensity,
      velocity: avgVelocity,
      direction: { x: avgFlowX, y: avgFlowY },
      confidence,
      timestamp: Date.now()
    };
  }

  /**
   * Handle motion detection with cooldown and cadence logic
   */
  private handleMotionDetected(motionData: SpeedyMotionResult): void {
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
        const event = new CustomEvent('speedyMotionDetected', {
          detail: {
            intensity: motionData.intensity,
            velocity: motionData.velocity,
            direction: motionData.direction,
            confidence: motionData.confidence,
            timestamp: now
          }
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
   * Update FPS counter
   */
  private updateFPS(): void {
    const now = performance.now();
    this.frameCount++;

    if (now - this.lastFrameTime >= 1000) {
      this.zone.run(() => {
        this.currentFPS.set(this.frameCount);
      });
      this.frameCount = 0;
      this.lastFrameTime = now;
    }
  }

  /**
   * Update configuration dynamically
   */
  updateConfig(config: Partial<SpeedyDetectionConfig>): void {
    if (this.config) {
      this.config = { ...this.config, ...config };

      // Reset state if cooldown or cadence changed
      if (config.cooldown !== undefined || config.cadence !== undefined) {
        this.detectionCounter.set(0);
      }
    }
  }

  /**
   * Get current detection progress for UI display
   */
  getDetectionProgress(): { current: number; total: number } | null {
    if (!this.config) return null;

    return {
      current: this.detectionCounter(),
      total: this.config.cadence
    };
  }

  /**
   * Clean up resources and stop detection
   */
  async cleanup(): Promise<void> {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.pipeline) {
      try {
        await this.pipeline.release();
      } catch (e) {
        console.warn('Error releasing pipeline:', e);
      }
      this.pipeline = null;
    }

    if (this.media) {
      try {
        await this.media.release();
      } catch (e) {
        console.warn('Error releasing media:', e);
      }
      this.media = null;
    }

    this.config = null;
    this.motionDetected.set(false);
    this.detectionCounter.set(0);
    this.currentFPS.set(0);
    this.frameCount = 0;
  }

  /**
   * Check if service is initialized and active
   */
  isActive(): boolean {
    return this.isRunning && this.pipeline !== null;
  }

  /**
   * Get current FPS for performance monitoring
   */
  getFPS(): number {
    return this.currentFPS();
  }
}
