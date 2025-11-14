import { Injectable, signal } from '@angular/core';

export interface DetectionSettings {
  // Detection method and library
  detectionMethod: 'motion' | 'pose';
  poseLibrary: 'mediapipe' | 'movenet';
  poseModel: 'lite' | 'full' | 'heavy';
  moveNetModel: 'lightning' | 'thunder' | 'multipose';

  // GPU acceleration options
  useSpeedyVision: boolean;
  useDiffyJS: boolean;

  // Motion detection settings
  sensitivity: number; // 1-10
  motionCooldown: number; // Minimum delay between detections in ms
  signalCadence: number; // Signal on every Nth detection

  // Detection zone settings
  zoneWidthPercent: number; // 0-100, 0 = off, 100 = full width
  zonePositionPercent: number; // 0-100, horizontal position
  useFullScreenDetection: boolean;

  // Camera settings
  selectedCameraId: string;

  // Video and performance settings
  targetFps: number; // Target frames per second (1-60)
  videoResolution: 'low' | 'medium' | 'high' | 'ultra'; // Video resolution
  showStickmanOnly: boolean; // Show only stickman overlay
  poseMatchDuration: number; // Pose match timer duration in seconds
}

const DEFAULT_SETTINGS: DetectionSettings = {
  detectionMethod: 'motion',
  poseLibrary: 'mediapipe',
  poseModel: 'lite',
  moveNetModel: 'lightning',
  useSpeedyVision: false,
  useDiffyJS: false,
  sensitivity: 5,
  motionCooldown: 500,
  signalCadence: 1,
  zoneWidthPercent: 5,
  zonePositionPercent: 50,
  useFullScreenDetection: false,
  selectedCameraId: '',
  targetFps: 60,
  videoResolution: 'high',
  showStickmanOnly: false,
  poseMatchDuration: 30,
};

@Injectable({
  providedIn: 'root',
})
export class DetectionSettingsService {
  private readonly STORAGE_KEY = 'detection_settings';

  // Reactive signals for all settings
  detectionMethod = signal<'motion' | 'pose'>(DEFAULT_SETTINGS.detectionMethod);
  poseLibrary = signal<'mediapipe' | 'movenet'>(DEFAULT_SETTINGS.poseLibrary);
  poseModel = signal<'lite' | 'full' | 'heavy'>(DEFAULT_SETTINGS.poseModel);
  moveNetModel = signal<'lightning' | 'thunder' | 'multipose'>(DEFAULT_SETTINGS.moveNetModel);
  useSpeedyVision = signal<boolean>(DEFAULT_SETTINGS.useSpeedyVision);
  useDiffyJS = signal<boolean>(DEFAULT_SETTINGS.useDiffyJS);
  sensitivity = signal<number>(DEFAULT_SETTINGS.sensitivity);
  motionCooldown = signal<number>(DEFAULT_SETTINGS.motionCooldown);
  signalCadence = signal<number>(DEFAULT_SETTINGS.signalCadence);
  zoneWidthPercent = signal<number>(DEFAULT_SETTINGS.zoneWidthPercent);
  zonePositionPercent = signal<number>(DEFAULT_SETTINGS.zonePositionPercent);
  useFullScreenDetection = signal<boolean>(DEFAULT_SETTINGS.useFullScreenDetection);
  selectedCameraId = signal<string>(DEFAULT_SETTINGS.selectedCameraId);
  targetFps = signal<number>(DEFAULT_SETTINGS.targetFps);
  videoResolution = signal<'low' | 'medium' | 'high' | 'ultra'>(DEFAULT_SETTINGS.videoResolution);
  showStickmanOnly = signal<boolean>(DEFAULT_SETTINGS.showStickmanOnly);
  poseMatchDuration = signal<number>(DEFAULT_SETTINGS.poseMatchDuration);

  constructor() {
    this.loadSettings();
  }

  /**
   * Load settings from localStorage
   */
  private loadSettings(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const settings: DetectionSettings = JSON.parse(stored);
        this.applySettings(settings);
      }
    } catch (error) {
      console.error('Failed to load detection settings:', error);
    }
  }

  /**
   * Save settings to localStorage
   */
  saveSettings(): void {
    try {
      const settings: DetectionSettings = {
        detectionMethod: this.detectionMethod(),
        poseLibrary: this.poseLibrary(),
        poseModel: this.poseModel(),
        moveNetModel: this.moveNetModel(),
        useSpeedyVision: this.useSpeedyVision(),
        useDiffyJS: this.useDiffyJS(),
        sensitivity: this.sensitivity(),
        motionCooldown: this.motionCooldown(),
        signalCadence: this.signalCadence(),
        zoneWidthPercent: this.zoneWidthPercent(),
        zonePositionPercent: this.zonePositionPercent(),
        useFullScreenDetection: this.useFullScreenDetection(),
        selectedCameraId: this.selectedCameraId(),
        targetFps: this.targetFps(),
        videoResolution: this.videoResolution(),
        showStickmanOnly: this.showStickmanOnly(),
        poseMatchDuration: this.poseMatchDuration(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save detection settings:', error);
    }
  }

  /**
   * Apply settings from a DetectionSettings object
   */
  private applySettings(settings: DetectionSettings): void {
    this.detectionMethod.set(settings.detectionMethod);
    this.poseLibrary.set(settings.poseLibrary);
    this.poseModel.set(settings.poseModel);
    this.moveNetModel.set(settings.moveNetModel);
    this.useSpeedyVision.set(settings.useSpeedyVision);
    this.useDiffyJS.set(settings.useDiffyJS);
    this.sensitivity.set(settings.sensitivity);
    this.motionCooldown.set(settings.motionCooldown);
    this.signalCadence.set(settings.signalCadence);
    this.zoneWidthPercent.set(settings.zoneWidthPercent);
    this.zonePositionPercent.set(settings.zonePositionPercent);
    this.useFullScreenDetection.set(settings.useFullScreenDetection);
    this.selectedCameraId.set(settings.selectedCameraId);
    this.targetFps.set(settings.targetFps ?? DEFAULT_SETTINGS.targetFps);
    this.videoResolution.set(settings.videoResolution ?? DEFAULT_SETTINGS.videoResolution);
    this.showStickmanOnly.set(settings.showStickmanOnly ?? DEFAULT_SETTINGS.showStickmanOnly);
    this.poseMatchDuration.set(settings.poseMatchDuration ?? DEFAULT_SETTINGS.poseMatchDuration);
  }

  /**
   * Reset all settings to defaults
   */
  resetToDefaults(): void {
    this.applySettings(DEFAULT_SETTINGS);
    this.saveSettings();
  }

  /**
   * Get all settings as a plain object
   */
  getSettings(): DetectionSettings {
    return {
      detectionMethod: this.detectionMethod(),
      poseLibrary: this.poseLibrary(),
      poseModel: this.poseModel(),
      moveNetModel: this.moveNetModel(),
      useSpeedyVision: this.useSpeedyVision(),
      useDiffyJS: this.useDiffyJS(),
      sensitivity: this.sensitivity(),
      motionCooldown: this.motionCooldown(),
      signalCadence: this.signalCadence(),
      zoneWidthPercent: this.zoneWidthPercent(),
      zonePositionPercent: this.zonePositionPercent(),
      useFullScreenDetection: this.useFullScreenDetection(),
      selectedCameraId: this.selectedCameraId(),
      targetFps: this.targetFps(),
      videoResolution: this.videoResolution(),
      showStickmanOnly: this.showStickmanOnly(),
      poseMatchDuration: this.poseMatchDuration(),
    };
  }
}
