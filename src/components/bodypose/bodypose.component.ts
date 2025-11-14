import {
  Component,
  ChangeDetectionStrategy,
  signal,
  ViewChild,
  ElementRef,
  AfterViewInit,
  computed,
  output,
  OnDestroy,
  inject,
  effect,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import type { Pose, Keypoint } from '@tensorflow-models/pose-detection';
import { DetectionSettingsService } from '../../services/detection-settings.service';
import { TfjsModelLoaderService } from '../../services/tfjs-model-loader.service';
import { ToastService } from '../../sprint-duels/services/toast.service';
import { ToastComponent } from '../../sprint-duels/components/toast/toast.component';

type SupportedModel = 'MoveNet' | 'BlazePose';
type MovenetModelType = 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER';
type BlazeposeModelType = 'lite' | 'full' | 'heavy';
type ModelVariant = MovenetModelType | BlazeposeModelType;
type SupportedExercise =
  | 'None'
  | 'Crunches'
  | 'HeelTaps'
  | 'RussianTwists'
  | 'ToeTouches'
  | 'AlternatingLegVups'
  | 'DoubleLegVups'
  | 'WindshieldWipers'
  | 'PlankWithBallRoll'
  | 'SidePlankRotation'
  | 'PushUp';
type AnalysisMode = 'live' | 'file';
type ExerciseState = 'up' | 'down' | 'neutral' | 'tapped';

interface FeedbackText {
  title: string;
  torso?: string;
  arms?: string;
  legs?: string;
}

interface RecordedFrame {
  timestamp: number;
  keypoints: Keypoint[];
  confidence: number;
}

interface StickmanRecording {
  id: string;
  name: string;
  duration: number;
  frameCount: number;
  frames: RecordedFrame[];
  recordedAt: Date;
  targetFps: number;
}

interface RecordingPlaybackState {
  recordingId: string;
  state: 'stopped' | 'playing' | 'paused';
  currentFrame: number;
  playbackStartTime: number;
  playbackPausedAt: number;
}

type PlaybackState = 'stopped' | 'playing' | 'paused';

@Component({
  selector: 'app-bodypose',
  templateUrl: './bodypose.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ToastComponent],
  standalone: true,
  styles: [
    `
      .in-fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        z-index: 9999 !important;
        background: black !important;
        display: flex;
        flex-direction: column;
      }

      .in-fullscreen .p-3 {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .in-fullscreen .aspect-video {
        flex: 1;
      }

      /* Hide the original controls when in fullscreen */
      .in-fullscreen .space-y-2 {
        display: none;
      }
    `,
  ],
})
export class BodyposeComponent implements AfterViewInit, OnDestroy {
  @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;
  @ViewChild('canvasEl') canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') fileInputEl!: ElementRef<HTMLInputElement>;

  goBack = output<void>();

  isLoading = signal<boolean>(true);
  errorMessage = signal<string | null>(null);
  isCameraOn = signal<boolean>(true);

  availableCameras = signal<MediaDeviceInfo[]>([]);
  selectedCameraId = signal<string>('');

  private detectionSettings = inject(DetectionSettingsService);
  private injector = inject(Injector);
  private tfjsModelLoader = inject(TfjsModelLoaderService);
  private toastService = inject(ToastService);
  private effectCleanup?: () => void;

  selectedModel = signal<SupportedModel>('BlazePose');
  selectedVariant = signal<ModelVariant>('lite');

  currentFps = signal<number>(0);

  // Expose global settings signals directly
  targetFps = this.detectionSettings.targetFps;
  videoResolution = this.detectionSettings.videoResolution;
  showStickmanOnly = this.detectionSettings.showStickmanOnly;

  resolutionSettings = {
    low: { width: 320, height: 240 },
    medium: { width: 640, height: 480 },
    high: { width: 1280, height: 720 },
    ultra: { width: 1920, height: 1080 },
  };

  selectedExercise = signal<SupportedExercise>('None');

  analysisMode = signal<AnalysisMode>('live');
  uploadedVideoUrl = signal<string | null>(null);

  isVideoPlaying = signal<boolean>(false);
  isSlowMotion = signal<boolean>(false);
  videoCurrentTime = signal<number>(0);
  videoDuration = signal<number>(0);

  torsoColor = signal<string>('#34d399');
  armsColor = signal<string>('#60a5fa');
  legsColor = signal<string>('#34d399');

  feedbackVisible = signal(false);

  isConfigOpen = signal<boolean>(true);
  isFullscreen = signal<boolean>(false);

  referencePose = signal<Keypoint[] | null>(null);
  lastDetectedPose = signal<Pose | null>(null);
  liveStickmanColor = signal<string>('#f87171');
  isPoseTimerRunning = signal<boolean>(false);

  // Expose global settings signal directly
  poseMatchDuration = this.detectionSettings.poseMatchDuration;

  poseMatchTimer = signal<number>(0);

  repCount = signal<number>(0);
  isCountingReps = signal<boolean>(false);
  exerciseState = signal<ExerciseState>('neutral');

  // Recording and playback signals
  isRecording = signal<boolean>(false);
  recordingStartTime = signal<number>(0);
  currentRecording = signal<StickmanRecording | null>(null);
  savedRecordings = signal<StickmanRecording[]>([]);

  // Playback signals - now supports multiple recordings
  activePlaybackStates = signal<Map<string, RecordingPlaybackState>>(new Map());

  // Fullscreen states for individual recordings
  fullscreenRecordingId = signal<string | null>(null);

  exerciseStatusColor = computed(() => {
    const green = '#34d399';
    const torsoOk = this.torsoColor() === green;
    const armsOk = this.armsColor() === green;
    const legsOk = this.legsColor() === green;

    return torsoOk && armsOk && legsOk ? green : '#f87171';
  });

  availableVariants = computed<ModelVariant[]>(() => {
    if (this.selectedModel() === 'MoveNet') {
      return ['SINGLEPOSE_LIGHTNING', 'SINGLEPOSE_THUNDER'];
    } else {
      return ['lite', 'full', 'heavy'];
    }
  });

  currentFeedback = computed<FeedbackText | null>(
    () => this.feedbackTexts[this.selectedExercise()]
  );

  private detector!: poseDetection.PoseDetector;
  private videoWidth = 640;
  private videoHeight = 480;
  private isDetecting = false;
  private stream: MediaStream | null = null;
  private feedbackTimeout: any;

  private lastFrameTime = -1;
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private lastTimerTick = 0;

  // Recording variables
  private recordingFrameBuffer: RecordedFrame[] = [];
  private recordingInterval: any = null;
  private playbackAnimationIds = new Map<string, number>();

  private readonly G = '<span class="text-green-400 font-semibold">GRÜN:</span>';
  private readonly R = '<span class="text-red-500 font-semibold">ROT:</span>';

  private feedbackTexts: Record<SupportedExercise, FeedbackText | null> = {
    None: null,
    Crunches: {
      title: 'Crunches',
      torso: `${this.G} Your shoulders are sufficiently lifted off the ground. <br> ${this.R} Your shoulders are too close to the ground.`,
      arms: `${this.G} Your hands approach your knees. <br> ${this.R} Your hands don't move far enough forward.`,
    },
    HeelTaps: {
      title: 'Heel Taps',
      torso: `${this.G} Your shoulders stay consistently lifted off the ground. <br> ${this.R} You let your shoulders fall back to the ground.`,
      arms: `${this.G} Your hand reaches your heel on both sides. <br> ${this.R} You don't bend sideways enough.`,
    },
    RussianTwists: {
      title: 'Russian Twists',
      torso: `${this.G} Your torso shows clear rotation. <br> ${this.R} The movement comes only from your arms, not your torso.`,
    },
    ToeTouches: {
      title: 'Toe Touches',
      legs: `${this.G} Your legs are mostly straight. <br> ${this.R} Your knees are bent too much.`,
      torso: `${this.G} Your hands reach your ankles/toes. <br> ${this.R} You don't crunch up high enough.`,
    },
    AlternatingLegVups: {
      title: 'Alternating Leg V-Ups',
      torso: `${this.G} Your hands touch the ankle of the rising leg. <br> ${this.R} A large gap remains between hands and leg.`,
    },
    DoubleLegVups: {
      title: 'Double Leg V-Ups',
      torso: `${this.G} Your body forms a sharp 'V' shape. <br> ${this.R} The angle between torso and legs is too wide.`,
      legs: `${this.G} Your legs are sufficiently straight. <br> ${this.R} Your knees are bent too much.`,
    },
    WindshieldWipers: {
      title: 'Windshield Wipers',
      torso: `${this.G} Your shoulders stay stable and flat on the ground. <br> ${this.R} One or both shoulders lift off the ground.`,
      legs: `${this.G} Your hips and legs show clear rotation. <br> ${this.R} Your legs stay mostly vertical.`,
    },
    PlankWithBallRoll: {
      title: 'Plank with Ball Roll',
      torso: `${this.G} Your body forms a straight line from shoulders to ankles. <br> ${this.R} Your hips sag or lift too high.`,
    },
    SidePlankRotation: {
      title: 'Side Plank with Rotation',
      torso: `${this.G} Your hips stay elevated forming a straight line. <br> ${this.R} Your hips sag toward the ground.`,
    },
    PushUp: {
      title: 'Push Up',
      torso: `${this.G} Your body forms a straight line from shoulders to ankles. <br> ${this.R} Your hips sag or lift too high.`,
    },
  };

  async ngAfterViewInit(): Promise<void> {
    try {
      // Initialize variant from global settings
      this.initializeFromGlobalSettings();

      // Setup effect to sync with global settings changes
      // Must use runInInjectionContext because ngAfterViewInit is not an injection context
      runInInjectionContext(this.injector, () => {
        // Sync video resolution changes
        const resolutionEffect = effect(() => {
          const resolution = this.videoResolution();
          const settings = this.resolutionSettings[resolution];
          this.videoWidth = settings.width;
          this.videoHeight = settings.height;

          // Reinitialize camera if in live mode and camera is on
          if (this.analysisMode() === 'live' && this.isCameraOn() && this.detector) {
            this.setupCamera(this.selectedCameraId()).catch((err) =>
              console.error('Failed to update camera resolution:', err)
            );
          }
        });

        const syncEffect = effect(() => {
          const globalPoseModel = this.detectionSettings.poseModel();
          const globalPoseLibrary = this.detectionSettings.poseLibrary();
          const globalMoveNetModel = this.detectionSettings.moveNetModel();

          // Skip if detector not initialized yet
          if (!this.detector) {
            return;
          }

          // Update model if library changed
          if (globalPoseLibrary === 'mediapipe' && this.selectedModel() !== 'BlazePose') {
            this.selectedModel.set('BlazePose');
            // Update variant to match global setting
            if (globalPoseModel !== this.selectedVariant()) {
              this.selectedVariant.set(globalPoseModel as BlazeposeModelType);
              // Reload detector
              this.loadPoseDetector().catch((err) =>
                console.error('Failed to reload detector:', err)
              );
            }
          } else if (globalPoseLibrary === 'movenet' && this.selectedModel() !== 'MoveNet') {
            this.selectedModel.set('MoveNet');
            // Update variant to match global setting
            const expectedVariant =
              globalMoveNetModel === 'thunder' ? 'SINGLEPOSE_THUNDER' : 'SINGLEPOSE_LIGHTNING';
            if (expectedVariant !== this.selectedVariant()) {
              this.selectedVariant.set(expectedVariant);
              // Reload detector
              this.loadPoseDetector().catch((err) =>
                console.error('Failed to reload detector:', err)
              );
            }
          } else if (
            this.selectedModel() === 'BlazePose' &&
            globalPoseModel !== this.selectedVariant()
          ) {
            // Variant changed for BlazePose
            this.selectedVariant.set(globalPoseModel as BlazeposeModelType);
            // Reload detector
            this.loadPoseDetector().catch((err) =>
              console.error('Failed to reload detector:', err)
            );
          } else if (this.selectedModel() === 'MoveNet') {
            // Variant changed for MoveNet
            const expectedVariant =
              globalMoveNetModel === 'thunder' ? 'SINGLEPOSE_THUNDER' : 'SINGLEPOSE_LIGHTNING';
            if (expectedVariant !== this.selectedVariant()) {
              this.selectedVariant.set(expectedVariant);
              // Reload detector
              this.loadPoseDetector().catch((err) =>
                console.error('Failed to reload detector:', err)
              );
            }
          }
        });

        this.effectCleanup = () => {
          syncEffect.destroy();
          resolutionEffect.destroy();
        };
      });

      // Initialize video resolution from global settings
      const initialResolution = this.videoResolution();
      const initialSettings = this.resolutionSettings[initialResolution];
      this.videoWidth = initialSettings.width;
      this.videoHeight = initialSettings.height;

      await this.setupEnvironment();

      // After detector is initialized, sync with global settings if needed
      this.syncWithGlobalSettings();

      if (this.analysisMode() === 'live') {
        this.isDetecting = true;
        this.detectPosesLoop();
      }

      document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
      document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
      document.addEventListener('mozfullscreenchange', () => this.onFullscreenChange());
      document.addEventListener('MSFullscreenChange', () => this.onFullscreenChange());
    } catch (error: unknown) {
      console.error('Initialization failed:', error);
      let message = 'An unknown error occurred during setup.';
      if (error instanceof Error) {
        message = error.message;
      }

      if (message.includes('Permission denied')) {
        this.errorMessage.set(
          'Camera access was denied. Please allow camera permissions and refresh.'
        );
      } else {
        this.errorMessage.set(message);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private initializeFromGlobalSettings(): void {
    const globalPoseLibrary = this.detectionSettings.poseLibrary();
    const globalPoseModel = this.detectionSettings.poseModel();

    // Set model based on global library setting
    if (globalPoseLibrary === 'mediapipe') {
      this.selectedModel.set('BlazePose');
      this.selectedVariant.set(globalPoseModel as BlazeposeModelType);
    } else if (globalPoseLibrary === 'movenet') {
      this.selectedModel.set('MoveNet');
      // Map movenet model to variant
      const moveNetModel = this.detectionSettings.moveNetModel();
      if (moveNetModel === 'lightning') {
        this.selectedVariant.set('SINGLEPOSE_LIGHTNING');
      } else if (moveNetModel === 'thunder') {
        this.selectedVariant.set('SINGLEPOSE_THUNDER');
      } else {
        this.selectedVariant.set('SINGLEPOSE_LIGHTNING');
      }
    }
  }

  private syncWithGlobalSettings(): void {
    if (!this.detector) return;

    const globalPoseModel = this.detectionSettings.poseModel();
    const globalPoseLibrary = this.detectionSettings.poseLibrary();
    const globalMoveNetModel = this.detectionSettings.moveNetModel();

    let needsReload = false;

    // Check if model needs to change
    if (globalPoseLibrary === 'mediapipe' && this.selectedModel() !== 'BlazePose') {
      this.selectedModel.set('BlazePose');
      needsReload = true;
    } else if (globalPoseLibrary === 'movenet' && this.selectedModel() !== 'MoveNet') {
      this.selectedModel.set('MoveNet');
      needsReload = true;
    }

    // Check if variant needs to change
    if (this.selectedModel() === 'BlazePose' && globalPoseModel !== this.selectedVariant()) {
      this.selectedVariant.set(globalPoseModel as BlazeposeModelType);
      needsReload = true;
    } else if (this.selectedModel() === 'MoveNet') {
      const expectedVariant =
        globalMoveNetModel === 'thunder' ? 'SINGLEPOSE_THUNDER' : 'SINGLEPOSE_LIGHTNING';
      if (expectedVariant !== this.selectedVariant()) {
        this.selectedVariant.set(expectedVariant);
        needsReload = true;
      }
    }

    // Reload detector if settings changed
    if (needsReload) {
      this.loadPoseDetector().catch((err) =>
        console.error('Failed to sync detector with global settings:', err)
      );
    }
  }

  ngOnDestroy(): void {
    this.effectCleanup?.();
    this.isDetecting = false;
    this.stopRecording();
    this.stopAllPlayback();
    this.stopStream();
    this.detector?.dispose();
    if (this.uploadedVideoUrl()) {
      URL.revokeObjectURL(this.uploadedVideoUrl()!);
    }
  }

  onGoBack(): void {
    this.goBack.emit();
  }

  // Recording and playback methods
  startRecording(): void {
    if (this.isRecording()) return;

    this.recordingFrameBuffer = [];
    this.recordingStartTime.set(Date.now());
    this.isRecording.set(true);

    const newRecording: StickmanRecording = {
      id: `recording_${Date.now()}`,
      name: `Recording ${new Date().toLocaleString()}`,
      duration: 0,
      frameCount: 0,
      frames: [],
      recordedAt: new Date(),
      targetFps: this.targetFps(),
    };

    this.currentRecording.set(newRecording);
  }

  stopRecording(): void {
    if (!this.isRecording()) return;

    this.isRecording.set(false);

    const currentRecording = this.currentRecording();
    if (currentRecording) {
      const endTime = Date.now();
      const duration = (endTime - this.recordingStartTime()) / 1000;

      const finalRecording: StickmanRecording = {
        ...currentRecording,
        duration,
        frameCount: this.recordingFrameBuffer.length,
        frames: [...this.recordingFrameBuffer],
      };

      this.savedRecordings.update((recordings) => [...recordings, finalRecording]);
      this.currentRecording.set(null);
      this.recordingFrameBuffer = [];
    }
  }

  private captureFrame(keypoints: Keypoint[]): void {
    if (!this.isRecording()) return;

    const frame: RecordedFrame = {
      timestamp: Date.now() - this.recordingStartTime(),
      keypoints: keypoints.map((k) => ({ ...k })),
      confidence: keypoints.reduce((sum, k) => sum + (k.score || 0), 0) / keypoints.length,
    };

    this.recordingFrameBuffer.push(frame);

    // Update current recording duration
    const currentRecording = this.currentRecording();
    if (currentRecording) {
      this.currentRecording.set({
        ...currentRecording,
        duration: frame.timestamp / 1000,
        frameCount: this.recordingFrameBuffer.length,
      });
    }
  }

  deleteRecording(recordingId: string): void {
    // Stop playback for this recording if it's active
    this.stopRecordingPlayback({ id: recordingId } as StickmanRecording);

    this.savedRecordings.update((recordings) => recordings.filter((r) => r.id !== recordingId));
  }

  // New playback methods for individual recordings
  startRecordingPlayback(recording: StickmanRecording): void {
    const existingState = this.activePlaybackStates().get(recording.id);
    if (existingState?.state === 'playing') return;

    const playbackState: RecordingPlaybackState = {
      recordingId: recording.id,
      state: 'playing',
      currentFrame: 0,
      playbackStartTime: Date.now(),
      playbackPausedAt: 0,
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, playbackState));

    // Draw the first frame immediately
    if (recording.frames.length > 0) {
      this.drawRecordingFrame(recording, 0);
    }

    this.playbackLoop(recording);
  }

  pauseRecordingPlayback(recording: StickmanRecording): void {
    const currentState = this.activePlaybackStates().get(recording.id);
    if (!currentState || currentState.state !== 'playing') return;

    const updatedState: RecordingPlaybackState = {
      ...currentState,
      state: 'paused',
      playbackPausedAt: Date.now(),
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));

    const animationId = this.playbackAnimationIds.get(recording.id);
    if (animationId) {
      cancelAnimationFrame(animationId);
      this.playbackAnimationIds.delete(recording.id);
    }
  }

  resumeRecordingPlayback(recording: StickmanRecording): void {
    const currentState = this.activePlaybackStates().get(recording.id);
    if (!currentState || currentState.state !== 'paused') return;

    const pauseDuration = Date.now() - currentState.playbackPausedAt;
    const updatedState: RecordingPlaybackState = {
      ...currentState,
      state: 'playing',
      playbackStartTime: currentState.playbackStartTime + pauseDuration,
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));
    this.playbackLoop(recording);
  }

  stopRecordingPlayback(recording: StickmanRecording): void {
    this.activePlaybackStates.update((states) => {
      const newStates = new Map(states);
      newStates.delete(recording.id);
      return newStates;
    });

    const animationId = this.playbackAnimationIds.get(recording.id);
    if (animationId) {
      cancelAnimationFrame(animationId);
      this.playbackAnimationIds.delete(recording.id);
    }
  }

  stepForwardFrame(recording: StickmanRecording): void {
    const currentState = this.activePlaybackStates().get(recording.id);
    const nextFrame = (currentState?.currentFrame || 0) + 1;

    if (nextFrame >= recording.frames.length) return;

    const updatedState: RecordingPlaybackState = {
      recordingId: recording.id,
      state: 'paused',
      currentFrame: nextFrame,
      playbackStartTime: Date.now(),
      playbackPausedAt: Date.now(),
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));
    this.drawRecordingFrame(recording, nextFrame);
  }

  stepBackwardFrame(recording: StickmanRecording): void {
    const currentState = this.activePlaybackStates().get(recording.id);
    const prevFrame = Math.max(0, (currentState?.currentFrame || 0) - 1);

    const updatedState: RecordingPlaybackState = {
      recordingId: recording.id,
      state: 'paused',
      currentFrame: prevFrame,
      playbackStartTime: Date.now(),
      playbackPausedAt: Date.now(),
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));
    this.drawRecordingFrame(recording, prevFrame);
  }

  seekToRecordingFrame(recording: StickmanRecording, frameIndex: number): void {
    if (frameIndex < 0 || frameIndex >= recording.frames.length) return;

    const currentState = this.activePlaybackStates().get(recording.id);
    const updatedState: RecordingPlaybackState = {
      recordingId: recording.id,
      state: currentState?.state || 'paused',
      currentFrame: frameIndex,
      playbackStartTime: currentState?.playbackStartTime || Date.now(),
      playbackPausedAt: currentState?.playbackPausedAt || Date.now(),
    };

    this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));
    this.drawRecordingFrame(recording, frameIndex);
  }

  private playbackLoop(recording: StickmanRecording): void {
    const currentState = this.activePlaybackStates().get(recording.id);
    if (!currentState || currentState.state !== 'playing') return;

    const elapsed = Date.now() - currentState.playbackStartTime;
    const currentFrameIndex = Math.floor((elapsed / 1000) * recording.targetFps);

    if (currentFrameIndex >= recording.frames.length) {
      // Playback finished
      this.stopRecordingPlayback(recording);
      return;
    }

    if (currentFrameIndex !== currentState.currentFrame) {
      const updatedState = { ...currentState, currentFrame: currentFrameIndex };
      this.activePlaybackStates.update((states) => new Map(states).set(recording.id, updatedState));
      console.log(`Drawing frame ${currentFrameIndex} for recording ${recording.id}`);
      this.drawRecordingFrame(recording, currentFrameIndex);
    }

    const animationId = requestAnimationFrame(() => this.playbackLoop(recording));
    this.playbackAnimationIds.set(recording.id, animationId);
  }

  private drawRecordingFrame(recording: StickmanRecording, frameIndex: number): void {
    const frame = recording.frames[frameIndex];
    if (frame) {
      // This will be called from the recording card's canvas
      this.drawRecordingCardFrame(recording.id, frame.keypoints, frame.confidence);
    }
  }

  private drawRecordingCardFrame(
    recordingId: string,
    keypoints: Keypoint[],
    confidence: number
  ): void {
    const canvas = document.querySelector(`#recording-canvas-${recordingId}`) as HTMLCanvasElement;
    if (!canvas) {
      console.log(`Canvas not found for recording: ${recordingId}`);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Update canvas size if in fullscreen mode
    const isFullscreen = this.fullscreenRecordingId() === recordingId;
    if (isFullscreen) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    } else {
      canvas.width = 320;
      canvas.height = 180;
    }

    // Clear canvas and set background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!keypoints || keypoints.length === 0) {
      console.log(`No keypoints for recording: ${recordingId}`);
      return;
    }

    // Scale and center the stickman to fit the canvas with padding
    const padding = isFullscreen ? 40 : 20; // More padding in fullscreen
    const availableWidth = canvas.width - padding * 2;
    const availableHeight = canvas.height - padding * 2;

    // Calculate pose bounding box
    const xValues = keypoints.map((kp) => kp.x);
    const yValues = keypoints.map((kp) => kp.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);

    const poseWidth = maxX - minX || 1;
    const poseHeight = maxY - minY || 1;

    // Calculate scale to fit within available space, maintaining aspect ratio
    const scale = Math.min(availableWidth / poseWidth, availableHeight / poseHeight) * 0.8;

    // Center the pose in the canvas
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const poseCenterX = (minX + maxX) / 2;
    const poseCenterY = (minY + maxY) / 2;

    const offsetX = centerX - poseCenterX * scale;
    const offsetY = centerY - poseCenterY * scale;

    const scaledKeypoints = keypoints.map((kp) => ({
      ...kp,
      x: kp.x * scale + offsetX,
      y: kp.y * scale + offsetY,
    }));

    this.drawSimplifiedStickman(ctx, scaledKeypoints, false, true);
  }

  private stopAllPlayback(): void {
    this.activePlaybackStates().forEach((_, recordingId) => {
      const animationId = this.playbackAnimationIds.get(recordingId);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    });
    this.activePlaybackStates.set(new Map());
    this.playbackAnimationIds.clear();
  }

  getRecordingPlaybackState(recordingId: string): RecordingPlaybackState | null {
    return this.activePlaybackStates().get(recordingId) || null;
  }

  // Fullscreen methods for individual recordings
  toggleRecordingFullscreen(recordingId: string): void {
    if (this.fullscreenRecordingId() === recordingId) {
      this.exitRecordingFullscreen();
    } else {
      this.enterRecordingFullscreen(recordingId);
    }
  }

  private enterRecordingFullscreen(recordingId: string): void {
    const recordingElement = document.querySelector(
      `#recording-card-${recordingId}`
    ) as HTMLElement;
    if (!recordingElement) return;

    this.fullscreenRecordingId.set(recordingId);

    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFullscreen) {
        this.fullscreenRecordingId.set(null);
        document.removeEventListener('fullscreenchange', handleFullscreenChange);
        document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
        document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      }
    };

    // Add event listeners
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    // Enter fullscreen
    if (recordingElement.requestFullscreen) {
      recordingElement.requestFullscreen();
    } else if ((recordingElement as any).webkitRequestFullscreen) {
      (recordingElement as any).webkitRequestFullscreen();
    } else if ((recordingElement as any).mozRequestFullScreen) {
      (recordingElement as any).mozRequestFullScreen();
    } else if ((recordingElement as any).msRequestFullscreen) {
      (recordingElement as any).msRequestFullscreen();
    }
  }

  private exitRecordingFullscreen(): void {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if ((document as any).webkitExitFullscreen) {
      (document as any).webkitExitFullscreen();
    } else if ((document as any).mozCancelFullScreen) {
      (document as any).mozCancelFullScreen();
    } else if ((document as any).msExitFullscreen) {
      (document as any).msExitFullscreen();
    }
  }

  onFullscreenChange(): void {
    const isFullscreen = !!(
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    );
    this.isFullscreen.set(isFullscreen);
  }

  async toggleFullscreen(): Promise<void> {
    const mainElement = document.querySelector('.bodypose-main');
    if (!mainElement) return;

    try {
      if (!this.isFullscreen()) {
        if (mainElement.requestFullscreen) {
          await mainElement.requestFullscreen();
        } else if ((mainElement as any).webkitRequestFullscreen) {
          await (mainElement as any).webkitRequestFullscreen();
        } else if ((mainElement as any).mozRequestFullScreen) {
          await (mainElement as any).mozRequestFullScreen();
        } else if ((mainElement as any).msRequestFullscreen) {
          await (mainElement as any).msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).mozCancelFullScreen) {
          await (document as any).mozCancelFullScreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        }
      }
    } catch (error) {
      console.error('Error toggling fullscreen:', error);
    }
  }

  toggleConfig(): void {
    this.isConfigOpen.update((value) => !value);
  }

  async toggleCamera(): Promise<void> {
    if (this.analysisMode() !== 'live') return;

    this.isCameraOn.update((v) => !v);

    if (this.isCameraOn()) {
      this.isLoading.set(true);
      this.errorMessage.set(null);
      try {
        await this.setupCamera(this.selectedCameraId());
        this.isDetecting = true;
        this.detectPosesLoop();
      } catch (error: unknown) {
        this.errorMessage.set(error instanceof Error ? error.message : 'Failed to start camera.');
        this.isCameraOn.set(false);
      } finally {
        this.isLoading.set(false);
      }
    } else {
      this.isDetecting = false;
      this.stopStream();
      const video = this.videoEl.nativeElement;
      video.srcObject = null;
      video.src = '';
      this.drawResults([]);
      this.lastDetectedPose.set(null);
      this.currentFps.set(0);
    }
  }

  toggleReferencePose(): void {
    if (this.referencePose()) {
      this.referencePose.set(null);
      this.isPoseTimerRunning.set(false);
    } else {
      const lastPose = this.lastDetectedPose();
      if (lastPose && lastPose.keypoints.length > 0) {
        this.referencePose.set(JSON.parse(JSON.stringify(lastPose.keypoints)));
      }
    }
  }

  onFpsChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.targetFps.set(value);
    this.detectionSettings.saveSettings();
  }

  onShowStickmanOnlyChange(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.detectionSettings.showStickmanOnly.set(enabled);
    this.detectionSettings.saveSettings();
  }

  onExerciseChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const exercise = select.value as SupportedExercise;
    this.selectedExercise.set(exercise);
    this.referencePose.set(null);
    this.isCountingReps.set(false);

    this.repCount.set(0);
    this.exerciseState.set(exercise === 'Crunches' ? 'down' : 'neutral');

    if (this.selectedExercise() === 'None') {
      this.torsoColor.set('#34d399');
      this.armsColor.set('#60a5fa');
      this.legsColor.set('#34d399');
    } else {
      this.torsoColor.set('#f87171');
      this.armsColor.set('#f87171');
      this.legsColor.set('#f87171');
    }
    this.triggerFeedbackDisplay();
  }

  onDoubleClick(): void {
    this.triggerFeedbackDisplay();
  }

  triggerFeedbackDisplay(): void {
    if (this.selectedExercise() === 'None') {
      this.feedbackVisible.set(false);
      return;
    }
    this.feedbackVisible.set(true);
    clearTimeout(this.feedbackTimeout);
    this.feedbackTimeout = setTimeout(() => {
      this.feedbackVisible.set(false);
    }, 2000);
  }

  triggerFileInput(): void {
    this.fileInputEl.nativeElement.click();
  }

  async setAnalysisMode(mode: AnalysisMode): Promise<void> {
    if (mode === 'file' && this.analysisMode() === 'file') {
      this.triggerFileInput();
      return;
    }
    if (this.analysisMode() === mode) return;

    this.analysisMode.set(mode);
    this.isDetecting = false;
    this.errorMessage.set(null);
    this.drawResults([]);

    this.isCountingReps.set(false);
    this.isPoseTimerRunning.set(false);
    this.repCount.set(0);
    this.exerciseState.set(this.selectedExercise() === 'Crunches' ? 'down' : 'neutral');

    this.stopStream();
    if (this.uploadedVideoUrl()) {
      URL.revokeObjectURL(this.uploadedVideoUrl()!);
      this.uploadedVideoUrl.set(null);
    }

    this.isVideoPlaying.set(false);
    this.isSlowMotion.set(false);
    this.videoCurrentTime.set(0);
    this.videoDuration.set(0);

    const video = this.videoEl.nativeElement;
    video.src = '';
    video.srcObject = null;
    video.playbackRate = 1.0;

    if (mode === 'live') {
      this.isCameraOn.set(true);
      this.isLoading.set(true);
      try {
        await this.setupCamera(this.selectedCameraId());
        this.isDetecting = true;
        this.detectPosesLoop();
      } catch (error: unknown) {
        this.errorMessage.set(
          error instanceof Error ? error.message : 'Failed to switch to live mode.'
        );
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      if (this.uploadedVideoUrl()) {
        URL.revokeObjectURL(this.uploadedVideoUrl()!);
      }

      const file = input.files[0];
      const url = URL.createObjectURL(file);
      this.uploadedVideoUrl.set(url);

      this.isVideoPlaying.set(false);
      this.isSlowMotion.set(false);
      this.videoCurrentTime.set(0);

      const video = this.videoEl.nativeElement;
      video.srcObject = null;
      video.src = url;
      video.load();
      video.playbackRate = 1.0;

      input.value = '';
    }
  }

  onVideoPlay(): void {
    this.isVideoPlaying.set(true);
    if (this.analysisMode() === 'file') {
      this.isDetecting = true;
      this.detectPosesLoop();
    }
  }

  onVideoPause(): void {
    this.isVideoPlaying.set(false);
    if (this.analysisMode() === 'file') {
      this.isDetecting = false;
    }
  }

  togglePlayPause(): void {
    const video = this.videoEl.nativeElement;
    if (video.paused) {
      video.play().catch((e) => console.error('Video play failed', e));
    } else {
      video.pause();
    }
  }

  toggleSlowMotion(): void {
    this.isSlowMotion.update((v) => !v);
    this.videoEl.nativeElement.playbackRate = this.isSlowMotion() ? 0.5 : 1.0;
  }

  resetVideo(): void {
    const video = this.videoEl.nativeElement;
    video.currentTime = 0;
    this.videoCurrentTime.set(0);
  }

  onTimeUpdate(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.videoCurrentTime.set(video.currentTime);
  }

  onLoadedMetadata(event: Event): void {
    const video = event.target as HTMLVideoElement;
    this.videoDuration.set(video.duration);
  }

  onSeek(event: Event): void {
    const video = this.videoEl.nativeElement;
    const targetTime = Number((event.target as HTMLInputElement).value);
    video.currentTime = targetTime;
    this.videoCurrentTime.set(targetTime);
  }

  formatTime(totalSeconds: number): string {
    if (isNaN(totalSeconds) || totalSeconds < 0) {
      return '00:00';
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  async onCameraChange(event: Event): Promise<void> {
    this.selectedCameraId.set((event.target as HTMLSelectElement).value);
    if (this.analysisMode() !== 'live' || !this.isCameraOn()) return;

    this.isLoading.set(true);
    try {
      await this.setupCamera(this.selectedCameraId());
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to switch camera.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onModelChange(event: Event): Promise<void> {
    const model = (event.target as HTMLSelectElement).value as SupportedModel;
    if (this.selectedModel() === model) return;

    this.isDetecting = false;
    this.isLoading.set(true);
    this.selectedModel.set(model);

    // Update global settings when model changes
    if (model === 'BlazePose') {
      this.detectionSettings.poseLibrary.set('mediapipe');
      // Use current global poseModel or default to 'lite'
      const currentModel = this.detectionSettings.poseModel();
      this.selectedVariant.set(currentModel as BlazeposeModelType);
    } else if (model === 'MoveNet') {
      this.detectionSettings.poseLibrary.set('movenet');
      // Use current global moveNetModel or default to 'lightning'
      const currentMoveNetModel = this.detectionSettings.moveNetModel();
      if (currentMoveNetModel === 'lightning') {
        this.selectedVariant.set('SINGLEPOSE_LIGHTNING');
      } else if (currentMoveNetModel === 'thunder') {
        this.selectedVariant.set('SINGLEPOSE_THUNDER');
      } else {
        this.selectedVariant.set('SINGLEPOSE_LIGHTNING');
      }
    }
    this.detectionSettings.saveSettings();

    try {
      await this.loadPoseDetector();
      if (this.isCameraOn()) {
        this.isDetecting = true;
        requestAnimationFrame(() => this.detectPosesLoop());
      }
    } catch (error: unknown) {
      this.errorMessage.set(error instanceof Error ? error.message : 'Failed to switch AI model.');
    } finally {
      this.isLoading.set(false);
    }
  }

  async onVariantChange(event: Event): Promise<void> {
    const variant = (event.target as HTMLSelectElement).value as ModelVariant;
    if (this.selectedVariant() === variant) return;

    this.isDetecting = false;
    this.isLoading.set(true);
    this.selectedVariant.set(variant);

    // Update global settings when variant changes
    if (this.selectedModel() === 'BlazePose' && ['lite', 'full', 'heavy'].includes(variant)) {
      this.detectionSettings.poseModel.set(variant as 'lite' | 'full' | 'heavy');
      this.detectionSettings.saveSettings();
    } else if (this.selectedModel() === 'MoveNet') {
      if (variant === 'SINGLEPOSE_LIGHTNING') {
        this.detectionSettings.moveNetModel.set('lightning');
      } else if (variant === 'SINGLEPOSE_THUNDER') {
        this.detectionSettings.moveNetModel.set('thunder');
      }
      this.detectionSettings.saveSettings();
    }

    try {
      await this.loadPoseDetector();
      if (this.isCameraOn()) {
        this.isDetecting = true;
        requestAnimationFrame(() => this.detectPosesLoop());
      }
    } catch (error: unknown) {
      this.errorMessage.set(
        error instanceof Error ? error.message : 'Failed to switch model variant.'
      );
    } finally {
      this.isLoading.set(false);
    }
  }

  toggleRepCounting(): void {
    this.isCountingReps.update((v) => !v);
    if (!this.isCountingReps()) {
      this.repCount.set(0);
      this.exerciseState.set(this.selectedExercise() === 'Crunches' ? 'down' : 'neutral');
    }
  }

  togglePoseMatchTimer(): void {
    if (this.isPoseTimerRunning()) {
      this.isPoseTimerRunning.set(false);
      this.poseMatchTimer.set(0);
    } else {
      this.poseMatchTimer.set(this.poseMatchDuration());
      this.lastTimerTick = performance.now();
      this.isPoseTimerRunning.set(true);
    }
  }

  onPoseMatchDurationChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.poseMatchDuration.set(value);
    this.detectionSettings.saveSettings();
  }

  onResolutionChange(event: Event): void {
    const resolution = (event.target as HTMLSelectElement).value as
      | 'low'
      | 'medium'
      | 'high'
      | 'ultra';
    this.detectionSettings.videoResolution.set(resolution);
    this.detectionSettings.saveSettings();
    const settings = this.resolutionSettings[resolution];
    this.videoWidth = settings.width;
    this.videoHeight = settings.height;

    if (this.analysisMode() === 'live' && this.isCameraOn()) {
      this.setupCamera(this.selectedCameraId());
    }
  }

  private async setupEnvironment(): Promise<void> {
    await this.getAvailableCameras();
    await tf.setBackend('webgl');
    await tf.ready();
    if (this.analysisMode() === 'live') {
      await this.setupCamera(this.selectedCameraId());
    }
    await this.loadPoseDetector();
  }

  private async getAvailableCameras(): Promise<void> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      throw new Error('Your browser does not support camera enumeration.');
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoDevices = devices.filter((device) => device.kind === 'videoinput');
    this.availableCameras.set(videoDevices);
    if (videoDevices.length > 0) {
      this.selectedCameraId.set(videoDevices[0].deviceId);
    } else if (this.analysisMode() === 'live') {
      throw new Error('No cameras found.');
    }
  }

  // Helper method to get user-friendly camera labels
  getCameraLabel(camera: MediaDeviceInfo): string {
    if (camera.label) {
      // Try to identify front vs rear camera from label
      const labelLower = camera.label.toLowerCase();
      if (
        labelLower.includes('front') ||
        labelLower.includes('user') ||
        labelLower.includes('facing front')
      ) {
        return `Front Camera (${camera.label})`;
      } else if (
        labelLower.includes('back') ||
        labelLower.includes('rear') ||
        labelLower.includes('environment') ||
        labelLower.includes('facing back')
      ) {
        return `Rear Camera (${camera.label})`;
      }
      return camera.label;
    }
    // Fallback when label is not available
    const cameras = this.availableCameras();
    const index = cameras.findIndex((c) => c.deviceId === camera.deviceId);
    if (index === 0) return 'Front Camera (Default)';
    if (index === cameras.length - 1) return 'Rear Camera';
    return `Camera ${index + 1}`;
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private async setupCamera(deviceId?: string): Promise<void> {
    this.stopStream();

    const video = this.videoEl.nativeElement;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support the MediaDevices API.');
    }

    const resolution = this.resolutionSettings[this.videoResolution()];

    // Build video constraints - only use facingMode if no specific deviceId is provided
    const videoConstraints: any = {
      width: { ideal: resolution.width },
      height: { ideal: resolution.height },
      frameRate: { ideal: 60, max: 60 },
    };

    // If deviceId is specified, use it exclusively
    if (deviceId) {
      videoConstraints.deviceId = { exact: deviceId };
    } else {
      // Only use facingMode as fallback when no deviceId is specified
      videoConstraints.facingMode = { ideal: 'user' }; // Prefer front camera as default
    }

    const constraints: MediaStreamConstraints = {
      video: videoConstraints,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.src = '';
    video.srcObject = this.stream;

    return new Promise((resolve) => {
      video.onloadedmetadata = () => {
        this.videoWidth = video.videoWidth;
        this.videoHeight = video.videoHeight;
        video.width = this.videoWidth;
        video.height = this.videoHeight;
        this.canvasEl.nativeElement.width = this.videoWidth;
        this.canvasEl.nativeElement.height = this.videoHeight;
        resolve();
      };
    });
  }

  private async loadPoseDetector(): Promise<void> {
    this.detector?.dispose();

    const model =
      this.selectedModel() === 'BlazePose'
        ? poseDetection.SupportedModels.BlazePose
        : poseDetection.SupportedModels.MoveNet;

    let detectorConfig: any;

    if (this.selectedModel() === 'BlazePose') {
      const variant = this.selectedVariant() as BlazeposeModelType;
      const modelUrls = this.tfjsModelLoader.getBlazePoseModelUrls(variant);

      // Check if local models exist
      const detectorExists = await this.tfjsModelLoader.checkModelExists(
        modelUrls.detectorModelUrl
      );
      const landmarkExists = await this.tfjsModelLoader.checkModelExists(
        modelUrls.landmarkModelUrl
      );
      const useLocalModels = detectorExists && landmarkExists;

      detectorConfig = {
        runtime: 'tfjs' as const,
        modelType: variant,
        ...(useLocalModels && {
          detectorModelUrl: modelUrls.detectorModelUrl,
          landmarkModelUrl: modelUrls.landmarkModelUrl,
        }),
      };

      if (useLocalModels) {
        console.log(`Loading BlazePose ${variant} from local paths`);
        this.toastService.show(`BlazePose ${variant} loaded from local assets`, 'success', 4000);
      } else {
        console.log(`Local BlazePose models not found, loading from CDN`);
        this.toastService.show(`BlazePose ${variant} loaded from CDN`, 'info', 4000);
      }
    } else {
      const variant = this.selectedVariant() as MovenetModelType;
      const modelType = variant === 'SINGLEPOSE_LIGHTNING' ? 'lightning' : 'thunder';
      const localModelUrl = this.tfjsModelLoader.getMoveNetModelUrl(modelType);
      const useLocalModel = await this.tfjsModelLoader.checkModelExists(localModelUrl);

      detectorConfig = {
        modelType: poseDetection.movenet.modelType[variant],
        ...(useLocalModel && { modelUrl: localModelUrl }),
      };

      if (useLocalModel) {
        console.log(`Loading MoveNet ${modelType} from local path: ${localModelUrl}`);
        this.toastService.show(`MoveNet ${modelType} loaded from local assets`, 'success', 4000);
      } else {
        console.log(`Local MoveNet model not found, loading from CDN`);
        this.toastService.show(`MoveNet ${modelType} loaded from CDN`, 'info', 4000);
      }
    }

    this.detector = await poseDetection.createDetector(model, detectorConfig);
  }

  private async detectPosesLoop(): Promise<void> {
    if (!this.isDetecting) return;

    requestAnimationFrame(() => this.detectPosesLoop());

    const now = performance.now();

    if (this.isPoseTimerRunning()) {
      if (this.liveStickmanColor() === '#34d399') {
        const delta = now - this.lastTimerTick;
        this.poseMatchTimer.update((t) => {
          const newTime = t - delta / 1000;
          if (newTime <= 0) {
            this.isPoseTimerRunning.set(false);
            return 0;
          }
          return newTime;
        });
      }
      this.lastTimerTick = now;
    }

    const targetFps = this.targetFps();
    if (targetFps > 0) {
      const targetInterval = 1000 / targetFps;
      if (this.lastFrameTime > 0 && now - this.lastFrameTime < targetInterval) {
        return;
      }
    } else {
      this.drawResults([]);
      return;
    }
    this.lastFrameTime = now;

    this.frameCount++;
    if (now > this.lastFpsUpdate + 1000) {
      this.currentFps.set((this.frameCount * 1000) / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    if (
      this.videoEl.nativeElement.readyState < 2 ||
      (this.videoEl.nativeElement.paused && this.analysisMode() === 'file')
    ) {
      return;
    }

    try {
      const poses = await this.detector.estimatePoses(this.videoEl.nativeElement, {
        flipHorizontal: false,
      });

      const refPose = this.referencePose();

      if (poses.length > 0 && poses[0].score! > 0.3) {
        this.lastDetectedPose.set(poses[0]);
        const liveKeypoints = poses[0].keypoints;

        if (refPose) {
          this.analyzePoseAlignment(liveKeypoints, refPose);
        }

        const currentExercise = this.selectedExercise();
        if (currentExercise !== 'None' && !refPose) {
          switch (currentExercise) {
            case 'Crunches':
              this.analyzeCrunches(liveKeypoints);
              break;
            case 'HeelTaps':
              this.analyzeHeelTaps(liveKeypoints);
              break;
            case 'RussianTwists':
              this.analyzeRussianTwists(liveKeypoints);
              break;
            case 'ToeTouches':
              this.analyzeToeTouches(liveKeypoints);
              break;
            case 'AlternatingLegVups':
              this.analyzeAlternatingLegVups(liveKeypoints);
              break;
            case 'DoubleLegVups':
              this.analyzeDoubleLegVups(liveKeypoints);
              break;
            case 'WindshieldWipers':
              this.analyzeWindshieldWipers(liveKeypoints);
              break;
            case 'PlankWithBallRoll':
              this.analyzePlankWithBallRoll(liveKeypoints);
              break;
            case 'SidePlankRotation':
              this.analyzeSidePlankRotation(liveKeypoints);
              break;
            case 'PushUp':
              this.analyzePushUp(liveKeypoints);
              break;
          }
        } else if (currentExercise === 'None') {
          this.torsoColor.set('#34d399');
          this.armsColor.set('#60a5fa');
          this.legsColor.set('#34d399');
        }
      } else {
        this.lastDetectedPose.set(null);
        if (refPose) this.liveStickmanColor.set('#f87171');
        if (this.selectedExercise() !== 'None') {
          this.torsoColor.set('#f87171');
          this.armsColor.set('#f87171');
          this.legsColor.set('#f87171');
        }
      }
      // Capture frame for recording if needed
      if (this.isRecording() && poses.length > 0) {
        this.captureFrame(poses[0].keypoints);
      }

      this.drawResults(poses);
    } catch (error: unknown) {
      console.error('Error during pose detection:', error);
      this.detector?.dispose();
      this.isDetecting = false;
      this.errorMessage.set('Pose detection model failed.');
    }
  }

  private drawResults(poses: Pose[]): void {
    const ctx = this.canvasEl.nativeElement.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, this.videoWidth, this.videoHeight);

    // Normal mode: draw reference pose and detected poses
    this.referencePose() && this.drawSimplifiedStickman(ctx, this.referencePose()!, true, false);
    poses.forEach(
      (pose) => pose.score! > 0.3 && this.drawSimplifiedStickman(ctx, pose.keypoints, false, false)
    );
  }

  private drawSimplifiedStickman(
    ctx: CanvasRenderingContext2D,
    keypoints: Keypoint[],
    isReference = false,
    isPlayback = false
  ): void {
    const keypointsMap = new Map(keypoints.map((k) => [k.name!, k]));

    const [leftShoulder, rightShoulder, leftHip, rightHip, leftEye, rightEye] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_eye',
      'right_eye',
    ].map((name) => keypointsMap.get(name));

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftEye || !rightEye) return;

    const shoulderMid = {
      x: (leftShoulder.x + rightShoulder.x) / 2,
      y: (leftShoulder.y + rightShoulder.y) / 2,
    };
    const hipMid = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };

    const isPoseMatchingMode = !!this.referencePose() && !isReference;
    const isExerciseAnalysisMode =
      this.selectedExercise() !== 'None' && !isPoseMatchingMode && !isReference;
    const lineWidth = isReference ? 6 : 4;
    const jointRadius = isReference ? 6 : 5;

    let torsoColor: string,
      neckColor: string,
      armColor: string,
      legColor: string,
      jointColor: string;
    const referenceColor = '#a855f7';

    if (isReference) {
      [torsoColor, neckColor, armColor, legColor] = Array(4).fill(referenceColor);
      jointColor = '#f0f9ff';
    } else if (isPlayback) {
      // Special coloring for playback mode
      torsoColor = '#fbbf24';
      neckColor = '#f59e0b';
      armColor = '#3b82f6';
      legColor = '#10b981';
      jointColor = '#fef3c7';
    } else if (isPoseMatchingMode) {
      [torsoColor, neckColor, armColor, legColor] = Array(4).fill(this.liveStickmanColor());
      jointColor = '#f0f9ff';
    } else if (isExerciseAnalysisMode) {
      torsoColor = this.torsoColor();
      armColor = this.armsColor();
      legColor = this.legsColor();
      neckColor = this.torsoColor();
      jointColor = '#f0f9ff';
    } else {
      torsoColor = '#34d399';
      neckColor = '#fbbf24';
      armColor = '#60a5fa';
      legColor = '#34d399';
      jointColor = '#f0f9ff';
    }

    this.drawSegment(ctx, shoulderMid, hipMid, torsoColor, lineWidth);
    this.drawSegment(ctx, shoulderMid, eyeMid, neckColor, lineWidth);

    const [
      leftElbow,
      leftWrist,
      rightElbow,
      rightWrist,
      leftKnee,
      leftAnkle,
      leftToe,
      rightKnee,
      rightAnkle,
      rightToe,
    ] = [
      'left_elbow',
      'left_wrist',
      'right_elbow',
      'right_wrist',
      'left_knee',
      'left_ankle',
      'left_foot_index',
      'right_knee',
      'right_ankle',
      'right_foot_index',
    ].map((name) => keypointsMap.get(name));

    if (leftElbow && leftWrist) {
      this.drawSegment(ctx, shoulderMid, leftElbow, armColor, lineWidth);
      this.drawSegment(ctx, leftElbow, leftWrist, armColor, lineWidth);
    }
    if (rightElbow && rightWrist) {
      this.drawSegment(ctx, shoulderMid, rightElbow, armColor, lineWidth);
      this.drawSegment(ctx, rightElbow, rightWrist, armColor, lineWidth);
    }
    if (leftKnee && leftAnkle) {
      this.drawSegment(ctx, hipMid, leftKnee, legColor, lineWidth);
      this.drawSegment(ctx, leftKnee, leftAnkle, legColor, lineWidth);
      leftToe && this.drawSegment(ctx, leftAnkle, leftToe, legColor, lineWidth);
    }
    if (rightKnee && rightAnkle) {
      this.drawSegment(ctx, hipMid, rightKnee, legColor, lineWidth);
      this.drawSegment(ctx, rightKnee, rightAnkle, legColor, lineWidth);
      rightToe && this.drawSegment(ctx, rightAnkle, rightToe, legColor, lineWidth);
    }

    [
      shoulderMid,
      hipMid,
      eyeMid,
      leftElbow,
      leftWrist,
      rightElbow,
      rightWrist,
      leftKnee,
      leftAnkle,
      rightKnee,
      rightAnkle,
      leftToe,
      rightToe,
    ].forEach((joint) => joint && this.drawPoint(ctx, joint.x, joint.y, jointRadius, jointColor));
  }

  private drawSegment = (
    ctx: CanvasRenderingContext2D,
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    color: string,
    lineWidth: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.stroke();
  };

  private drawPoint = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    color: string
  ) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fillStyle = color;
    ctx.fill();
  };

  private getAngle(p1: Keypoint, p2: Keypoint, p3: Keypoint): number {
    if (p1.z != null && p2.z != null && p3.z != null) {
      return this.getAngle3D(p1, p2, p3);
    }
    return this.getAngle2D(p1, p2, p3);
  }

  private getAngle2D(p1: Keypoint, p2: Keypoint, p3: Keypoint): number {
    const angleRad = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angleDeg = Math.abs((angleRad * 180) / Math.PI);
    return angleDeg > 180 ? 360 - angleDeg : angleDeg;
  }

  private getAngle3D(p1: Keypoint, p2: Keypoint, p3: Keypoint): number {
    const v1 = { x: p1.x - p2.x, y: p1.y - p2.y, z: (p1.z || 0) - (p2.z || 0) };
    const v2 = { x: p3.x - p2.x, y: p3.y - p2.y, z: (p3.z || 0) - (p2.z || 0) };

    const dotProduct = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
    const magV1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const magV2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    const cosTheta = dotProduct / (magV1 * magV2);
    const clampedCosTheta = Math.max(-1.0, Math.min(1.0, cosTheta));

    const angleRad = Math.acos(clampedCosTheta);
    return (angleRad * 180) / Math.PI;
  }

  private getDistance = (p1: Keypoint, p2: Keypoint) =>
    Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  private analyzePoseAlignment(liveKps: Keypoint[], refKps: Keypoint[]): void {
    const liveMap = new Map(liveKps.map((k) => [k.name!, k]));
    const refMap = new Map(refKps.map((k) => [k.name!, k]));
    let totalDist = 0,
      count = 0;
    const refShoulders = [refMap.get('left_shoulder'), refMap.get('right_shoulder')];
    if (!refShoulders[0] || !refShoulders[1]) {
      this.liveStickmanColor.set('#f87171');
      return;
    }
    const normFactor = this.getDistance(refShoulders[0], refShoulders[1]);
    if (normFactor === 0) {
      this.liveStickmanColor.set('#f87171');
      return;
    }

    refMap.forEach((refKp, name) => {
      const liveKp = liveMap.get(name);
      if (liveKp?.score! > 0.3 && refKp?.score! > 0.3) {
        totalDist += this.getDistance(liveKp, refKp);
        count++;
      }
    });

    if (count < 5) {
      this.liveStickmanColor.set('#f87171');
      return;
    }
    const avgNormDist = totalDist / count / normFactor;
    this.liveStickmanColor.set(avgNormDist < 0.15 ? '#34d399' : '#f87171');
  }

  private analyzeCrunches(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lKnee, rKnee, lWrist, rWrist] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_wrist',
      'right_wrist',
    ].map((n) => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lKnee || !rKnee || !lWrist || !rWrist)
      return;

    const shoulderMid = {
      ...lShoulder,
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
    };
    const hipMid = { ...lHip, x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
    const kneeMid = { ...lKnee, x: (lKnee.x + rKnee.x) / 2, y: (lKnee.y + rKnee.y) / 2 };
    const wristMid = { ...lWrist, x: (lWrist.x + rWrist.x) / 2, y: (lWrist.y + rWrist.y) / 2 };

    const torsoLength = this.getDistance(shoulderMid, hipMid);
    const shoulderLiftAngle = this.getAngle(kneeMid, hipMid, shoulderMid);
    const reachDist = this.getDistance(wristMid, kneeMid);

    const shoulderLifted = shoulderLiftAngle < 85;
    const handsReached = reachDist < torsoLength * 0.8;
    const isUp = shoulderLifted && handsReached;
    const isDown = shoulderLiftAngle > 90;

    this.torsoColor.set(shoulderLifted ? '#34d399' : '#f87171');
    this.armsColor.set(handsReached ? '#34d399' : '#f87171');
    this.legsColor.set('#34d399');

    if (this.isCountingReps()) {
      if (this.exerciseState() === 'down' && isUp) {
        this.exerciseState.set('up');
      } else if (this.exerciseState() === 'up' && isDown) {
        this.repCount.update((count) => count + 1);
        this.exerciseState.set('down');
      }
    }
  }

  private analyzeHeelTaps(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lWrist, lAnkle, rWrist, rAnkle] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_wrist',
      'left_ankle',
      'right_wrist',
      'right_ankle',
    ].map((n) => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lWrist || !lAnkle || !rWrist || !rAnkle)
      return;

    const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
    const hipMidY = (lHip.y + rHip.y) / 2;
    const torsoHeight = Math.abs(hipMidY - shoulderMidY);

    const shoulderLiftOk = shoulderMidY < hipMidY - torsoHeight * 0.1;
    const reachLeftOk = this.getDistance(lWrist, lAnkle) < torsoHeight * 0.5;
    const reachRightOk = this.getDistance(rWrist, rAnkle) < torsoHeight * 0.5;
    const hasTapped = reachLeftOk || reachRightOk;

    this.torsoColor.set(shoulderLiftOk ? '#34d399' : '#f87171');
    this.armsColor.set(hasTapped ? '#34d399' : '#f87171');
    this.legsColor.set('#34d399');

    if (this.isCountingReps()) {
      if (this.exerciseState() === 'neutral' && hasTapped) {
        this.exerciseState.set('tapped');
        this.repCount.update((count) => count + 1);
      } else if (this.exerciseState() === 'tapped' && !hasTapped) {
        this.exerciseState.set('neutral');
      }
    }
  }

  private analyzeRussianTwists(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder] = ['left_shoulder', 'right_shoulder'].map((n) => map.get(n));
    if (!lShoulder || !rShoulder) return;

    const shoulderYDiff = Math.abs(lShoulder.y - rShoulder.y);
    const shoulderWidth = this.getDistance(lShoulder, rShoulder);
    const rotationOk = shoulderYDiff > shoulderWidth * 0.2;

    this.torsoColor.set(rotationOk ? '#34d399' : '#f87171');
    this.armsColor.set(rotationOk ? '#34d399' : '#f87171');
    this.legsColor.set('#34d399');
  }

  private analyzeToeTouches(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lHip, lKnee, lAnkle, rHip, rKnee, rAnkle, lWrist, rWrist] = [
      'left_hip',
      'left_knee',
      'left_ankle',
      'right_hip',
      'right_knee',
      'right_ankle',
      'left_wrist',
      'right_wrist',
    ].map((n) => map.get(n));
    if (!lHip || !lKnee || !lAnkle || !rHip || !rKnee || !rAnkle || !lWrist || !rWrist) return;

    const legAngleL = this.getAngle(lHip, lKnee, lAnkle);
    const legAngleR = this.getAngle(rHip, rKnee, rAnkle);
    const legsStraight = legAngleL > 150 && legAngleR > 150;
    const wristMidY = (lWrist.y + rWrist.y) / 2;
    const ankleMidY = (lAnkle.y + rAnkle.y) / 2;
    const reachOk = wristMidY < ankleMidY + 50;

    this.legsColor.set(legsStraight ? '#34d399' : '#f87171');
    this.armsColor.set(reachOk ? '#34d399' : '#f87171');
    this.torsoColor.set(reachOk ? '#34d399' : '#f87171');
  }

  private analyzeAlternatingLegVups(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lAnkle, rAnkle, lWrist, rWrist] = [
      'left_ankle',
      'right_ankle',
      'left_wrist',
      'right_wrist',
    ].map((n) => map.get(n));
    if (!lAnkle || !rAnkle || !lWrist || !rWrist) return;

    const wristMid = { ...lWrist, x: (lWrist.x + rWrist.x) / 2, y: (lWrist.y + rWrist.y) / 2 };
    const distL = this.getDistance(wristMid, lAnkle);
    const distR = this.getDistance(wristMid, rAnkle);
    const contact = Math.min(distL, distR) < 100;

    this.legsColor.set(contact ? '#34d399' : '#f87171');
    this.armsColor.set(contact ? '#34d399' : '#f87171');
    this.torsoColor.set(contact ? '#34d399' : '#f87171');
  }

  private analyzeDoubleLegVups(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lKnee, rKnee, lAnkle, rAnkle] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_knee',
      'right_knee',
      'left_ankle',
      'right_ankle',
    ].map((n) => map.get(n));

    if (!lShoulder || !rShoulder || !lHip || !rHip || !lKnee || !rKnee || !lAnkle || !rAnkle)
      return;

    const shoulderMid = {
      ...lShoulder,
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
      z: ((lShoulder.z || 0) + (rShoulder.z || 0)) / 2,
    };
    const hipMid = {
      ...lHip,
      x: (lHip.x + rHip.x) / 2,
      y: (lHip.y + rHip.y) / 2,
      z: ((lHip.z || 0) + (rHip.z || 0)) / 2,
    };
    const ankleMid = {
      ...lAnkle,
      x: (lAnkle.x + rAnkle.x) / 2,
      y: (lAnkle.y + rAnkle.y) / 2,
      z: ((lAnkle.z || 0) + (rAnkle.z || 0)) / 2,
    };

    const vAngle = this.getAngle(shoulderMid, hipMid, ankleMid);
    const vShapeOk = vAngle < 100;

    const legAngleL = this.getAngle(lHip, lKnee, lAnkle);
    const legAngleR = this.getAngle(rHip, rKnee, rAnkle);
    const legsStraight = legAngleL > 140 && legAngleR > 140;

    const formOk = vShapeOk && legsStraight;

    this.legsColor.set(legsStraight ? '#34d399' : '#f87171');
    this.torsoColor.set(vShapeOk ? '#34d399' : '#f87171');
    this.armsColor.set(formOk ? '#34d399' : '#f87171');
  }

  private analyzeWindshieldWipers(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
    ].map((n) => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip) return;

    const shoulderYDiff = Math.abs(lShoulder.y - rShoulder.y);
    const shouldersStable = shoulderYDiff < 50;
    const hipAngleRad = Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x);
    const hipAngleDeg = Math.abs((hipAngleRad * 180) / Math.PI);
    const hipRotationOk = hipAngleDeg > 20 && hipAngleDeg < 160;

    this.torsoColor.set(shouldersStable ? '#34d399' : '#f87171');
    this.legsColor.set(hipRotationOk ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }

  private analyzePlankWithBallRoll(kps: Keypoint[]): void {
    this.analyzePushUp(kps);
  }

  private analyzeSidePlankRotation(kps: Keypoint[]): void {
    const map = new Map(kps.map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_ankle',
      'right_ankle',
    ].map((n) => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lAnkle || !rAnkle) return;

    const shoulderMid = {
      ...lShoulder,
      x: (lShoulder.x + rShoulder.x) / 2,
      y: (lShoulder.y + rShoulder.y) / 2,
      z: ((lShoulder.z || 0) + (rShoulder.z || 0)) / 2,
    };
    const hipMid = {
      ...lHip,
      x: (lHip.x + rHip.x) / 2,
      y: (lHip.y + rHip.y) / 2,
      z: ((lHip.z || 0) + (rHip.z || 0)) / 2,
    };
    const ankleMid = {
      ...lAnkle,
      x: (lAnkle.x + rAnkle.x) / 2,
      y: (lAnkle.y + rAnkle.y) / 2,
      z: ((lAnkle.z || 0) + (rAnkle.z || 0)) / 2,
    };

    const bodyLineAngle = this.getAngle(shoulderMid, hipMid, ankleMid);
    const hipsNotSagging = bodyLineAngle > 150;

    this.torsoColor.set(hipsNotSagging ? '#34d399' : '#f87171');
    this.legsColor.set(hipsNotSagging ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }

  private analyzePushUp(keypoints: Keypoint[]): void {
    const keypointsMap = new Map(keypoints.filter((k) => k.score! > 0.3).map((k) => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle] = [
      'left_shoulder',
      'right_shoulder',
      'left_hip',
      'right_hip',
      'left_ankle',
      'right_ankle',
    ].map((n) => keypointsMap.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lAnkle || !rAnkle) {
      this.torsoColor.set('#f87171');
      this.legsColor.set('#f87171');
      return;
    }
    const isLeftVisible =
      lShoulder.score! + lHip.score! + lAnkle.score! >
      rShoulder.score! + rHip.score! + rAnkle.score!;
    const [shoulder, hip, ankle] = isLeftVisible
      ? [lShoulder, lHip, lAnkle]
      : [rShoulder, rHip, rAnkle];

    const angle = this.getAngle(shoulder, hip, ankle);
    const formOk = angle > 160;
    this.torsoColor.set(formOk ? '#34d399' : '#f87171');
    this.legsColor.set(formOk ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }
}
