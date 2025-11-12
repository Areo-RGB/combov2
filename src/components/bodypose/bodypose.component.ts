import { Component, ChangeDetectionStrategy, signal, ViewChild, ElementRef, AfterViewInit, computed, output, OnDestroy } from '@angular/core';
import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import type { Pose, Keypoint } from '@tensorflow-models/pose-detection';

type SupportedModel = 'MoveNet' | 'BlazePose';
type MovenetModelType = 'SINGLEPOSE_LIGHTNING' | 'SINGLEPOSE_THUNDER';
type BlazeposeModelType = 'lite' | 'full' | 'heavy';
type ModelVariant = MovenetModelType | BlazeposeModelType;
type SupportedExercise = 'None' | 'Crunches' | 'HeelTaps' | 'RussianTwists' | 'ToeTouches' | 'AlternatingLegVups' | 'DoubleLegVups' | 'WindshieldWipers' | 'PlankWithBallRoll' | 'SidePlankRotation' | 'PushUp';
type AnalysisMode = 'live' | 'file';
type ExerciseState = 'up' | 'down' | 'neutral' | 'tapped';

interface FeedbackText {
  title: string;
  torso?: string;
  arms?: string;
  legs?: string;
}

@Component({
  selector: 'app-bodypose',
  templateUrl: './bodypose.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
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

  selectedModel = signal<SupportedModel>('BlazePose');
  selectedVariant = signal<ModelVariant>('lite');

  currentFps = signal<number>(0);
  targetFps = signal<number>(60);

  videoResolution = signal<'low' | 'medium' | 'high' | 'ultra'>('high');
  resolutionSettings = {
    low: { width: 320, height: 240 },
    medium: { width: 640, height: 480 },
    high: { width: 1280, height: 720 },
    ultra: { width: 1920, height: 1080 }
  };

  showStickmanOnly = signal<boolean>(false);

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
  poseMatchDuration = signal<number>(30);
  poseMatchTimer = signal<number>(0);

  repCount = signal<number>(0);
  isCountingReps = signal<boolean>(false);
  exerciseState = signal<ExerciseState>('neutral');

  exerciseStatusColor = computed(() => {
    const green = '#34d399';
    const torsoOk = this.torsoColor() === green;
    const armsOk = this.armsColor() === green;
    const legsOk = this.legsColor() === green;

    return (torsoOk && armsOk && legsOk) ? green : '#f87171';
  });

  availableVariants = computed<ModelVariant[]>(() => {
    if (this.selectedModel() === 'MoveNet') {
      return ['SINGLEPOSE_LIGHTNING', 'SINGLEPOSE_THUNDER'];
    } else {
      return ['lite', 'full', 'heavy'];
    }
  });

  currentFeedback = computed<FeedbackText | null>(() => this.feedbackTexts[this.selectedExercise()]);

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
      legs: `${this.G} Your legs are sufficiently straight. <br> ${this.R} Your knees are bent too much.`
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
      await this.setupEnvironment();
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
        this.errorMessage.set('Camera access was denied. Please allow camera permissions and refresh.');
      } else {
        this.errorMessage.set(message);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.isDetecting = false;
    this.stopStream();
    this.detector?.dispose();
    if (this.uploadedVideoUrl()) {
      URL.revokeObjectURL(this.uploadedVideoUrl()!);
    }
  }

  onGoBack(): void {
    this.goBack.emit();
  }

  onFullscreenChange(): void {
    const isFullscreen = !!(document.fullscreenElement ||
                           (document as any).webkitFullscreenElement ||
                           (document as any).mozFullScreenElement ||
                           (document as any).msFullscreenElement);
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
    this.isConfigOpen.update(value => !value);
  }

  async toggleCamera(): Promise<void> {
    if (this.analysisMode() !== 'live') return;

    this.isCameraOn.update(v => !v);

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
    this.targetFps.set(Number((event.target as HTMLInputElement).value));
  }

  onShowStickmanOnlyChange(event: Event): void {
    this.showStickmanOnly.set((event.target as HTMLInputElement).checked);
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
        this.errorMessage.set(error instanceof Error ? error.message : 'Failed to switch to live mode.');
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
      video.play().catch(e => console.error("Video play failed", e));
    } else {
      video.pause();
    }
  }

  toggleSlowMotion(): void {
    this.isSlowMotion.update(v => !v);
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
    this.selectedVariant.set(this.availableVariants()[0]);

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

    try {
        await this.loadPoseDetector();
        if (this.isCameraOn()) {
          this.isDetecting = true;
          requestAnimationFrame(() => this.detectPosesLoop());
        }
    } catch (error: unknown) {
       this.errorMessage.set(error instanceof Error ? error.message : 'Failed to switch model variant.');
    } finally {
        this.isLoading.set(false);
    }
  }

  toggleRepCounting(): void {
    this.isCountingReps.update(v => !v);
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
    this.poseMatchDuration.set(Number((event.target as HTMLInputElement).value));
  }

  onResolutionChange(event: Event): void {
    const resolution = (event.target as HTMLSelectElement).value as 'low' | 'medium' | 'high' | 'ultra';
    this.videoResolution.set(resolution);
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
    const videoDevices = devices.filter(device => device.kind === 'videoinput');
    this.availableCameras.set(videoDevices);
    if (videoDevices.length > 0) {
      this.selectedCameraId.set(videoDevices[0].deviceId);
    } else if (this.analysisMode() === 'live') {
      throw new Error('No cameras found.');
    }
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
  }

  private async setupCamera(deviceId?: string): Promise<void> {
    this.stopStream();

    const video = this.videoEl.nativeElement;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Your browser does not support the MediaDevices API.');
    }

    const resolution = this.resolutionSettings[this.videoResolution()];
    const constraints: MediaStreamConstraints = {
      video: {
        width: { ideal: resolution.width },
        height: { ideal: resolution.height },
        deviceId: deviceId ? { exact: deviceId } : undefined,
        facingMode: 'user',
        frameRate: { ideal: 60, max: 60 }
      }
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

    const model = this.selectedModel() === 'BlazePose' ? poseDetection.SupportedModels.BlazePose : poseDetection.SupportedModels.MoveNet;
    const detectorConfig = this.selectedModel() === 'BlazePose'
      ? { runtime: 'tfjs' as const, modelType: this.selectedVariant() as BlazeposeModelType }
      : { modelType: poseDetection.movenet.modelType[this.selectedVariant() as MovenetModelType] };

    this.detector = await poseDetection.createDetector(model, detectorConfig);
  }

  private async detectPosesLoop(): Promise<void> {
    if (!this.isDetecting) return;

    requestAnimationFrame(() => this.detectPosesLoop());

    const now = performance.now();

    if (this.isPoseTimerRunning()) {
      if (this.liveStickmanColor() === '#34d399') {
        const delta = now - this.lastTimerTick;
        this.poseMatchTimer.update(t => {
            const newTime = t - (delta / 1000);
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
        if (this.lastFrameTime > 0 && (now - this.lastFrameTime) < targetInterval) {
            return;
        }
    } else {
        this.drawResults([]);
        return;
    }
    this.lastFrameTime = now;

    this.frameCount++;
    if (now > this.lastFpsUpdate + 1000) {
      this.currentFps.set(this.frameCount * 1000 / (now - this.lastFpsUpdate));
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }

    if (this.videoEl.nativeElement.readyState < 2 || (this.videoEl.nativeElement.paused && this.analysisMode() === 'file')) {
      return;
    }

    try {
      const poses = await this.detector.estimatePoses(this.videoEl.nativeElement, { flipHorizontal: false });

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
            case 'Crunches': this.analyzeCrunches(liveKeypoints); break;
            case 'HeelTaps': this.analyzeHeelTaps(liveKeypoints); break;
            case 'RussianTwists': this.analyzeRussianTwists(liveKeypoints); break;
            case 'ToeTouches': this.analyzeToeTouches(liveKeypoints); break;
            case 'AlternatingLegVups': this.analyzeAlternatingLegVups(liveKeypoints); break;
            case 'DoubleLegVups': this.analyzeDoubleLegVups(liveKeypoints); break;
            case 'WindshieldWipers': this.analyzeWindshieldWipers(liveKeypoints); break;
            case 'PlankWithBallRoll': this.analyzePlankWithBallRoll(liveKeypoints); break;
            case 'SidePlankRotation': this.analyzeSidePlankRotation(liveKeypoints); break;
            case 'PushUp': this.analyzePushUp(liveKeypoints); break;
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

    this.referencePose() && this.drawSimplifiedStickman(ctx, this.referencePose()!, true);
    poses.forEach(pose => pose.score! > 0.3 && this.drawSimplifiedStickman(ctx, pose.keypoints, false));
  }

  private drawSimplifiedStickman(ctx: CanvasRenderingContext2D, keypoints: Keypoint[], isReference = false): void {
    const keypointsMap = new Map(keypoints.map(k => [k.name!, k]));

    const [leftShoulder, rightShoulder, leftHip, rightHip, leftEye, rightEye] =
      ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_eye', 'right_eye'].map(name => keypointsMap.get(name));

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftEye || !rightEye) return;

    const shoulderMid = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
    const hipMid = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
    const eyeMid = { x: (leftEye.x + rightEye.x) / 2, y: (leftEye.y + rightEye.y) / 2 };

    const isPoseMatchingMode = !!this.referencePose() && !isReference;
    const isExerciseAnalysisMode = this.selectedExercise() !== 'None' && !isPoseMatchingMode && !isReference;
    const lineWidth = isReference ? 6 : 4;
    const jointRadius = isReference ? 6 : 5;

    let torsoColor: string, neckColor: string, armColor: string, legColor: string, jointColor: string;
    const referenceColor = '#a855f7';

    if (isReference) {
      [torsoColor, neckColor, armColor, legColor] = Array(4).fill(referenceColor);
      jointColor = '#f0f9ff';
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
      torsoColor = '#34d399'; neckColor = '#fbbf24'; armColor = '#60a5fa'; legColor = '#34d399'; jointColor = '#f0f9ff';
    }

    this.drawSegment(ctx, shoulderMid, hipMid, torsoColor, lineWidth);
    this.drawSegment(ctx, shoulderMid, eyeMid, neckColor, lineWidth);

    const [leftElbow, leftWrist, rightElbow, rightWrist, leftKnee, leftAnkle, leftToe, rightKnee, rightAnkle, rightToe] =
      ['left_elbow', 'left_wrist', 'right_elbow', 'right_wrist', 'left_knee', 'left_ankle', 'left_foot_index', 'right_knee', 'right_ankle', 'right_foot_index'].map(name => keypointsMap.get(name));

    if(leftElbow && leftWrist) { this.drawSegment(ctx, shoulderMid, leftElbow, armColor, lineWidth); this.drawSegment(ctx, leftElbow, leftWrist, armColor, lineWidth); }
    if(rightElbow && rightWrist) { this.drawSegment(ctx, shoulderMid, rightElbow, armColor, lineWidth); this.drawSegment(ctx, rightElbow, rightWrist, armColor, lineWidth); }
    if(leftKnee && leftAnkle) { this.drawSegment(ctx, hipMid, leftKnee, legColor, lineWidth); this.drawSegment(ctx, leftKnee, leftAnkle, legColor, lineWidth); leftToe && this.drawSegment(ctx, leftAnkle, leftToe, legColor, lineWidth); }
    if(rightKnee && rightAnkle) { this.drawSegment(ctx, hipMid, rightKnee, legColor, lineWidth); this.drawSegment(ctx, rightKnee, rightAnkle, legColor, lineWidth); rightToe && this.drawSegment(ctx, rightAnkle, rightToe, legColor, lineWidth); }

    [shoulderMid, hipMid, eyeMid, leftElbow, leftWrist, rightElbow, rightWrist, leftKnee, leftAnkle, rightKnee, rightAnkle, leftToe, rightToe].forEach(joint => joint && this.drawPoint(ctx, joint.x, joint.y, jointRadius, jointColor));
  }

  private drawSegment = (ctx: CanvasRenderingContext2D, p1: {x:number, y:number}, p2: {x:number, y:number}, color: string, lineWidth: number) => {
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineWidth = lineWidth; ctx.strokeStyle = color; ctx.stroke();
  }

  private drawPoint = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) => {
    ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
  }

  private getAngle(p1: Keypoint, p2: Keypoint, p3: Keypoint): number {
    if (p1.z != null && p2.z != null && p3.z != null) {
      return this.getAngle3D(p1, p2, p3);
    }
    return this.getAngle2D(p1, p2, p3);
  }

  private getAngle2D(p1: Keypoint, p2: Keypoint, p3: Keypoint): number {
    const angleRad = Math.atan2(p3.y - p2.y, p3.x - p2.x) - Math.atan2(p1.y - p2.y, p1.x - p2.x);
    let angleDeg = Math.abs(angleRad * 180 / Math.PI);
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
    return angleRad * 180 / Math.PI;
  }

  private getDistance = (p1: Keypoint, p2: Keypoint) => Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));

  private analyzePoseAlignment(liveKps: Keypoint[], refKps: Keypoint[]): void {
    const liveMap = new Map(liveKps.map(k => [k.name!, k]));
    const refMap = new Map(refKps.map(k => [k.name!, k]));
    let totalDist = 0, count = 0;
    const refShoulders = [refMap.get('left_shoulder'), refMap.get('right_shoulder')];
    if (!refShoulders[0] || !refShoulders[1]) { this.liveStickmanColor.set('#f87171'); return; }
    const normFactor = this.getDistance(refShoulders[0], refShoulders[1]);
    if (normFactor === 0) { this.liveStickmanColor.set('#f87171'); return; }

    refMap.forEach((refKp, name) => {
        const liveKp = liveMap.get(name);
        if (liveKp?.score! > 0.3 && refKp?.score! > 0.3) {
            totalDist += this.getDistance(liveKp, refKp);
            count++;
        }
    });

    if (count < 5) { this.liveStickmanColor.set('#f87171'); return; }
    const avgNormDist = (totalDist / count) / normFactor;
    this.liveStickmanColor.set(avgNormDist < 0.15 ? '#34d399' : '#f87171');
  }

  private analyzeCrunches(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lKnee, rKnee, lWrist, rWrist] = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_knee', 'right_knee', 'left_wrist', 'right_wrist'].map(n => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lKnee || !rKnee || !lWrist || !rWrist) return;

    const shoulderMid = { ...lShoulder, x: (lShoulder.x + rShoulder.x)/2, y: (lShoulder.y + rShoulder.y)/2 };
    const hipMid = { ...lHip, x: (lHip.x + rHip.x)/2, y: (lHip.y + rHip.y)/2 };
    const kneeMid = { ...lKnee, x: (lKnee.x + rKnee.x)/2, y: (lKnee.y + rKnee.y)/2 };
    const wristMid = { ...lWrist, x: (lWrist.x + rWrist.x)/2, y: (lWrist.y + rWrist.y)/2 };

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
        this.repCount.update(count => count + 1);
        this.exerciseState.set('down');
      }
    }
  }

  private analyzeHeelTaps(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lWrist, lAnkle, rWrist, rAnkle] = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_wrist', 'left_ankle', 'right_wrist', 'right_ankle'].map(n => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lWrist || !lAnkle || !rWrist || !rAnkle) return;

    const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
    const hipMidY = (lHip.y + rHip.y) / 2;
    const torsoHeight = Math.abs(hipMidY - shoulderMidY);

    const shoulderLiftOk = shoulderMidY < hipMidY - (torsoHeight * 0.1);
    const reachLeftOk = this.getDistance(lWrist, lAnkle) < torsoHeight * 0.5;
    const reachRightOk = this.getDistance(rWrist, rAnkle) < torsoHeight * 0.5;
    const hasTapped = reachLeftOk || reachRightOk;

    this.torsoColor.set(shoulderLiftOk ? '#34d399' : '#f87171');
    this.armsColor.set(hasTapped ? '#34d399' : '#f87171');
    this.legsColor.set('#34d399');

    if (this.isCountingReps()) {
      if (this.exerciseState() === 'neutral' && hasTapped) {
        this.exerciseState.set('tapped');
        this.repCount.update(count => count + 1);
      } else if (this.exerciseState() === 'tapped' && !hasTapped) {
        this.exerciseState.set('neutral');
      }
    }
  }

  private analyzeRussianTwists(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lShoulder, rShoulder] = ['left_shoulder', 'right_shoulder'].map(n => map.get(n));
    if (!lShoulder || !rShoulder) return;

    const shoulderYDiff = Math.abs(lShoulder.y - rShoulder.y);
    const shoulderWidth = this.getDistance(lShoulder, rShoulder);
    const rotationOk = shoulderYDiff > shoulderWidth * 0.2;

    this.torsoColor.set(rotationOk ? '#34d399' : '#f87171');
    this.armsColor.set(rotationOk ? '#34d399' : '#f87171');
    this.legsColor.set('#34d399');
  }

  private analyzeToeTouches(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lHip, lKnee, lAnkle, rHip, rKnee, rAnkle, lWrist, rWrist] = ['left_hip', 'left_knee', 'left_ankle', 'right_hip', 'right_knee', 'right_ankle', 'left_wrist', 'right_wrist'].map(n => map.get(n));
    if(!lHip || !lKnee || !lAnkle || !rHip || !rKnee || !rAnkle || !lWrist || !rWrist) return;

    const legAngleL = this.getAngle(lHip, lKnee, lAnkle);
    const legAngleR = this.getAngle(rHip, rKnee, rAnkle);
    const legsStraight = legAngleL > 150 && legAngleR > 150;
    const wristMidY = (lWrist.y + rWrist.y)/2;
    const ankleMidY = (lAnkle.y + rAnkle.y)/2;
    const reachOk = wristMidY < ankleMidY + 50;

    this.legsColor.set(legsStraight ? '#34d399' : '#f87171');
    this.armsColor.set(reachOk ? '#34d399' : '#f87171');
    this.torsoColor.set(reachOk ? '#34d399' : '#f87171');
  }

  private analyzeAlternatingLegVups(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lAnkle, rAnkle, lWrist, rWrist] = ['left_ankle', 'right_ankle', 'left_wrist', 'right_wrist'].map(n => map.get(n));
    if(!lAnkle || !rAnkle || !lWrist || !rWrist) return;

    const wristMid = { ...lWrist, x: (lWrist.x+rWrist.x)/2, y: (lWrist.y+rWrist.y)/2 };
    const distL = this.getDistance(wristMid, lAnkle);
    const distR = this.getDistance(wristMid, rAnkle);
    const contact = Math.min(distL, distR) < 100;

    this.legsColor.set(contact ? '#34d399' : '#f87171');
    this.armsColor.set(contact ? '#34d399' : '#f87171');
    this.torsoColor.set(contact ? '#34d399' : '#f87171');
  }

  private analyzeDoubleLegVups(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [
      lShoulder, rShoulder, lHip, rHip,
      lKnee, rKnee, lAnkle, rAnkle
    ] = [
      'left_shoulder', 'right_shoulder', 'left_hip', 'right_hip',
      'left_knee', 'right_knee', 'left_ankle', 'right_ankle'
    ].map(n => map.get(n));

    if(!lShoulder || !rShoulder || !lHip || !rHip || !lKnee || !rKnee || !lAnkle || !rAnkle) return;

    const shoulderMid = { ...lShoulder, x: (lShoulder.x + rShoulder.x)/2, y: (lShoulder.y + rShoulder.y)/2, z: ((lShoulder.z || 0) + (rShoulder.z || 0))/2 };
    const hipMid = { ...lHip, x: (lHip.x + rHip.x)/2, y: (lHip.y + rHip.y)/2, z: ((lHip.z || 0) + (rHip.z || 0))/2 };
    const ankleMid = { ...lAnkle, x: (lAnkle.x + rAnkle.x)/2, y: (lAnkle.y + rAnkle.y)/2, z: ((lAnkle.z || 0) + (rAnkle.z || 0))/2 };

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
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip] = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip'].map(n => map.get(n));
    if(!lShoulder || !rShoulder || !lHip || !rHip) return;

    const shoulderYDiff = Math.abs(lShoulder.y - rShoulder.y);
    const shouldersStable = shoulderYDiff < 50;
    const hipAngleRad = Math.atan2(rHip.y - lHip.y, rHip.x - lHip.x);
    const hipAngleDeg = Math.abs(hipAngleRad * 180 / Math.PI);
    const hipRotationOk = hipAngleDeg > 20 && hipAngleDeg < 160;

    this.torsoColor.set(shouldersStable ? '#34d399' : '#f87171');
    this.legsColor.set(hipRotationOk ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }

  private analyzePlankWithBallRoll(kps: Keypoint[]): void {
    this.analyzePushUp(kps);
  }

  private analyzeSidePlankRotation(kps: Keypoint[]): void {
    const map = new Map(kps.map(k => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle] = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle'].map(n => map.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lAnkle || !rAnkle) return;

    const shoulderMid = { ...lShoulder, x: (lShoulder.x + rShoulder.x)/2, y: (lShoulder.y + rShoulder.y)/2, z: ((lShoulder.z || 0) + (rShoulder.z || 0))/2 };
    const hipMid = { ...lHip, x: (lHip.x + rHip.x)/2, y: (lHip.y + rHip.y)/2, z: ((lHip.z || 0) + (rHip.z || 0))/2 };
    const ankleMid = { ...lAnkle, x: (lAnkle.x + rAnkle.x)/2, y: (lAnkle.y + rAnkle.y)/2, z: ((lAnkle.z || 0) + (rAnkle.z || 0))/2 };

    const bodyLineAngle = this.getAngle(shoulderMid, hipMid, ankleMid);
    const hipsNotSagging = bodyLineAngle > 150;

    this.torsoColor.set(hipsNotSagging ? '#34d399' : '#f87171');
    this.legsColor.set(hipsNotSagging ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }

  private analyzePushUp(keypoints: Keypoint[]): void {
    const keypointsMap = new Map(keypoints.filter(k => k.score! > 0.3).map(k => [k.name!, k]));
    const [lShoulder, rShoulder, lHip, rHip, lAnkle, rAnkle] = ['left_shoulder', 'right_shoulder', 'left_hip', 'right_hip', 'left_ankle', 'right_ankle'].map(n => keypointsMap.get(n));
    if (!lShoulder || !rShoulder || !lHip || !rHip || !lAnkle || !rAnkle) {
      this.torsoColor.set('#f87171'); this.legsColor.set('#f87171'); return;
    }
    const isLeftVisible = (lShoulder.score! + lHip.score! + lAnkle.score!) > (rShoulder.score! + rHip.score! + rAnkle.score!);
    const [shoulder, hip, ankle] = isLeftVisible ? [lShoulder, lHip, lAnkle] : [rShoulder, rHip, rAnkle];

    const angle = this.getAngle(shoulder, hip, ankle);
    const formOk = angle > 160;
    this.torsoColor.set(formOk ? '#34d399' : '#f87171');
    this.legsColor.set(formOk ? '#34d399' : '#f87171');
    this.armsColor.set('#34d399');
  }
}
