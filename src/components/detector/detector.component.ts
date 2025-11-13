import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  output,
  viewChild,
  input,
  signal,
  AfterViewInit,
  effect,
  inject,
  NgZone,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { Camera } from '@capacitor/camera';
import { PoseLandmarker, FilesetResolver, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import { DiffyDetectionService } from '../../services/diffy-detection.service';
import { SpeedyDetectionService } from '../../services/speedy-detection.service';
import { DetectionSettingsService } from '../../services/detection-settings.service';

@Component({
  selector: 'app-detector',
  templateUrl: './detector.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetectorComponent implements OnInit, AfterViewInit, OnDestroy {
  sessionId = input.required<string>();
  goBack = output<void>();
  showBackButton = input<boolean>(true);
  motionDetected = output<number>();

  private videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  // FIX: Corrected typo from `viewchild` to `viewChild`.
  private canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  // FIX: Corrected typo from `viewchild` to `viewChild`.
  private overlayCanvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('overlayCanvas');

  status = signal<'idle' | 'initializing' | 'ready' | 'detecting' | 'error' | 'no_camera'>('idle');
  lastMotionSignal = signal<string | null>(null);
  settingsExpanded = signal<boolean>(true); // Settings expanded by default
  detectionZone = signal<{ x: number; y: number; width: number; height: number } | null>(null);

  availableCameras = signal<MediaDeviceInfo[]>([]);

  // Inject the centralized detection settings service
  private detectionSettings = inject(DetectionSettingsService);

  // Expose settings from the centralized service for template binding
  get sensitivity() {
    return this.detectionSettings.sensitivity;
  }
  get motionCooldown() {
    return this.detectionSettings.motionCooldown;
  }
  get signalCadence() {
    return this.detectionSettings.signalCadence;
  }
  get zoneWidthPercent() {
    return this.detectionSettings.zoneWidthPercent;
  }
  get zonePositionPercent() {
    return this.detectionSettings.zonePositionPercent;
  }
  get useFullScreenDetection() {
    return this.detectionSettings.useFullScreenDetection;
  }
  get detectionMethod() {
    return this.detectionSettings.detectionMethod;
  }
  get poseLibrary() {
    return this.detectionSettings.poseLibrary;
  }
  get poseModel() {
    return this.detectionSettings.poseModel;
  }
  get moveNetModel() {
    return this.detectionSettings.moveNetModel;
  }
  get useDiffyJS() {
    return this.detectionSettings.useDiffyJS;
  }
  get useSpeedyVision() {
    return this.detectionSettings.useSpeedyVision;
  }
  get selectedCameraId() {
    return this.detectionSettings.selectedCameraId;
  }

  private stream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  private lastImageData: ImageData | null = null;
  private lastMotionTime = 0;
  private detectionCounter = 0;
  readonly CANVAS_WIDTH = 160;
  readonly CANVAS_HEIGHT = 120;

  private videoDimensions: { width: number; height: number } | null = null;

  // Performance and cleanup improvements
  private zone = inject(NgZone);
  private injector = inject(Injector);
  private diffyService = inject(DiffyDetectionService);
  private speedyService = inject(SpeedyDetectionService);
  private zoneEffectCleanup?: () => void;
  private resizeObserver?: ResizeObserver;
  private ctx?: CanvasRenderingContext2D;
  private overlayCtx?: CanvasRenderingContext2D;

  private useRVFC = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  private vfcHandle: number | null = null;
  private targetFps = 12;
  private lastProcessedTs = 0;

  // MediaPipe Pose Detection
  private poseLandmarker: PoseLandmarker | null = null;
  private lastPoseDetectionTime = 0;
  private previousPersonDetected = false;

  // MoveNet Pose Detection
  private moveNetDetector: poseDetection.PoseDetector | null = null;

  // Landmark position tracking
  private landmarkTrackingEnabled = signal(false);
  private previousLandmarks: Array<{ x: number; y: number; z?: number }> | null = null;
  private readonly POSITION_CHANGE_THRESHOLD = 0.15; // 15% of frame dimension

  constructor() {
    // Effect moved to ngAfterViewInit to ensure viewChild refs are available.
  }

  async ngOnInit(): Promise<void> {
    this.status.set('initializing');
    await this.initializePoseDetection();
  }

  private async initializePoseDetection(): Promise<void> {
    if (this.poseLibrary() === 'mediapipe') {
      await this.initializeMediaPipe();
    } else {
      await this.initializeMoveNet();
    }
  }

  private async initializeMediaPipe(): Promise<void> {
    try {
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm'
      );

      const modelName = this.poseModel();
      const modelUrl = `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_${modelName}/float16/1/pose_landmarker_${modelName}.task`;

      this.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: modelUrl,
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numPoses: 2, // Detect up to 2 people (for duels)
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
      // Continue without pose detection, fall back to motion detection
    }
  }

  private async initializeMoveNet(): Promise<void> {
    try {
      const modelType = this.moveNetModel();
      let model: poseDetection.SupportedModels;
      let detectorConfig: poseDetection.MoveNetModelConfig;

      if (modelType === 'multipose') {
        model = poseDetection.SupportedModels.MoveNet;
        detectorConfig = {
          modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
          enableTracking: true,
          trackerType: poseDetection.TrackerType.BoundingBox,
        };
      } else {
        model = poseDetection.SupportedModels.MoveNet;
        detectorConfig = {
          modelType:
            modelType === 'lightning'
              ? poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
              : poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        };
      }

      this.moveNetDetector = await poseDetection.createDetector(model, detectorConfig);
    } catch (error) {
      console.error('Failed to initialize MoveNet:', error);
      // Continue without pose detection, fall back to motion detection
    }
  }

  ngAfterViewInit(): void {
    // Prepare canvases and contexts once
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false })!;
    this.ctx.imageSmoothingEnabled = false;

    const overlay = this.overlayCanvasRef().nativeElement;
    this.overlayCtx = overlay.getContext('2d', { alpha: true })!;

    this.setupOverlayCanvas();

    // The effect must be created in an injection context.
    // ngAfterViewInit is not one, so we use runInInjectionContext.
    runInInjectionContext(this.injector, () => {
      const zoneEffect = effect(() => {
        const useFullScreen = this.useFullScreenDetection();
        const percent = this.zoneWidthPercent();
        const positionPercent = this.zonePositionPercent();

        if (useFullScreen) {
          this.detectionZone.set(null); // null means full screen in processFrame
        } else {
          if (percent > 0) {
            const zoneWidth = Math.floor(this.CANVAS_WIDTH * (percent / 100));

            const centerX = this.CANVAS_WIDTH * (positionPercent / 100);
            let zoneX = Math.floor(centerX - zoneWidth / 2);
            zoneX = Math.max(0, Math.min(zoneX, this.CANVAS_WIDTH - zoneWidth));

            this.detectionZone.set({
              x: zoneX,
              y: 0,
              width: zoneWidth,
              height: this.CANVAS_HEIGHT,
            });
          } else {
            // percent is 0, which means 'off'
            // An empty zone to detect nothing
            this.detectionZone.set({ x: 0, y: 0, width: 0, height: 0 });
          }
        }

        // Reset last image data when zone changes to prevent comparing differently sized areas
        this.lastImageData = null;
        this.drawPersistentZone();
      });

      this.zoneEffectCleanup = () => zoneEffect.destroy();
    });

    this.startCamera();
  }

  private setupOverlayCanvas() {
    const video = this.videoRef().nativeElement;
    const overlay = this.overlayCanvasRef().nativeElement;

    const setCanvasDimensions = () => {
      if (video.clientWidth > 0 && video.clientHeight > 0) {
        this.videoDimensions = { width: video.clientWidth, height: video.clientHeight };
        overlay.width = this.videoDimensions.width;
        overlay.height = this.videoDimensions.height;
        this.drawPersistentZone();
      }
    };

    video.addEventListener('loadedmetadata', setCanvasDimensions);
    this.resizeObserver = new ResizeObserver(setCanvasDimensions);
    this.resizeObserver.observe(video);
  }

  async startCamera(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.videoRef().nativeElement.srcObject = null;
      this.stream = null;
    }

    try {
      // Ensure Android runtime permission for camera is granted
      try {
        const perm = await Camera.checkPermissions();
        if (perm.camera !== 'granted') {
          const res = await Camera.requestPermissions({ permissions: ['camera'] as any });
          if (res.camera !== 'granted') {
            this.status.set('error');
            return;
          }
        }
      } catch {
        // If Camera plugin not available on web, ignore and proceed
      }

      if (!navigator.mediaDevices?.getUserMedia) {
        this.status.set('no_camera');
        return;
      }

      if (this.availableCameras().length === 0) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        this.availableCameras.set(videoDevices);
        if (videoDevices.length > 0 && !this.selectedCameraId()) {
          this.selectedCameraId.set(videoDevices[0].deviceId);
        }
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 15, max: 24 },
          ...(this.selectedCameraId()
            ? { deviceId: { exact: this.selectedCameraId() } }
            : { facingMode: { ideal: 'environment' } }),
        },
        audio: false,
      };

      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      const video = this.videoRef().nativeElement;
      video.srcObject = this.stream;
      await video.play().catch(() => {});

      if (this.status() !== 'detecting') {
        this.status.set('ready');
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      this.status.set('error');
    }
  }

  startDetection(): void {
    this.status.set('detecting');
    this.lastMotionTime = Date.now();
    this.detectionCounter = 0;

    // Priority: Speedy-vision > DiffyJS > Canvas
    if (this.detectionMethod() === 'motion' && this.useSpeedyVision()) {
      this.initializeSpeedyVision();
    } else if (this.detectionMethod() === 'motion' && this.useDiffyJS()) {
      this.initializeDiffyJS();
    } else {
      this.zone.runOutsideAngular(() => {
        this.queueNextFrame();
      });
    }
  }

  private initializeDiffyJS(): void {
    const video = this.videoRef().nativeElement;

    // Configure diffyjs with current settings
    this.diffyService.initialize(video, {
      sensitivityLevel: this.sensitivity(),
      detectionZone: this.detectionZone(),
      cooldown: this.motionCooldown(),
      cadence: this.signalCadence(),
      debug: false, // Set to true to see diff visualization
    });

    // Listen for motion detection events
    const handleDiffyMotion = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { intensity } = customEvent.detail;

      this.zone.run(() => {
        this.handleMotionDetected(intensity);
      });
    };

    window.addEventListener('diffyMotionDetected', handleDiffyMotion);

    // Store cleanup function
    if (!this.diffyCleanupFn) {
      this.diffyCleanupFn = () => {
        window.removeEventListener('diffyMotionDetected', handleDiffyMotion);
      };
    }
  }

  private diffyCleanupFn?: () => void;

  private async initializeSpeedyVision(): Promise<void> {
    const video = this.videoRef().nativeElement;

    // Check WebGL2 support
    if (!this.speedyService.isSupported()) {
      console.warn('Speedy-vision requires WebGL2, falling back to canvas detection');
      this.useSpeedyVision.set(false);
      this.detectionSettings.saveSettings();
      this.zone.runOutsideAngular(() => {
        this.queueNextFrame();
      });
      return;
    }

    try {
      // Configure speedy-vision with current settings
      await this.speedyService.initialize(video, {
        sensitivityLevel: this.sensitivity(),
        detectionZone: this.detectionZone(),
        cooldown: this.motionCooldown(),
        cadence: this.signalCadence(),
        debug: false,
      });

      // Listen for motion detection events
      const handleSpeedyMotion = (event: Event) => {
        const customEvent = event as CustomEvent;
        const { intensity } = customEvent.detail;

        this.zone.run(() => {
          this.handleMotionDetected(intensity);
        });
      };

      window.addEventListener('speedyMotionDetected', handleSpeedyMotion);

      // Store cleanup function
      if (!this.speedyCleanupFn) {
        this.speedyCleanupFn = () => {
          window.removeEventListener('speedyMotionDetected', handleSpeedyMotion);
        };
      }
    } catch (error) {
      console.error('Failed to initialize speedy-vision:', error);
      this.useSpeedyVision.set(false);
      this.detectionSettings.saveSettings();
      // Fallback to canvas detection
      this.zone.runOutsideAngular(() => {
        this.queueNextFrame();
      });
    }
  }

  private speedyCleanupFn?: () => void;

  private queueNextFrame() {
    if (this.status() !== 'detecting') return;
    const video = this.videoRef().nativeElement as HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: any) => void) => number;
    };

    if (this.useRVFC && video.requestVideoFrameCallback) {
      this.vfcHandle = video.requestVideoFrameCallback((now) => this.onFrame(now));
    } else {
      this.animationFrameId = requestAnimationFrame((now) => this.onFrame(now));
    }
  }

  private onFrame(now: number) {
    if (this.status() !== 'detecting') return;

    // Throttle to target FPS
    const minDelta = 1000 / this.targetFps;
    if (now - this.lastProcessedTs < minDelta) {
      this.queueNextFrame();
      return;
    }
    this.lastProcessedTs = now;

    this.processFrame();
    this.queueNextFrame();
  }

  private processFrame(): void {
    const video = this.videoRef().nativeElement;
    if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return;

    if (this.detectionMethod() === 'pose') {
      this.processPoseDetection();
    } else {
      this.processMotionDetection();
    }
  }

  private processMotionDetection(): void {
    // Skip canvas processing if using GPU-accelerated libraries
    if (this.useSpeedyVision() && this.speedyService.isActive()) {
      return;
    }
    if (this.useDiffyJS() && this.diffyService.isActive()) {
      return;
    }

    const ctx = this.ctx!;
    const video = this.videoRef().nativeElement;
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT);

    const zone = this.detectionZone();
    const x = zone ? Math.max(0, zone.x) : 0;
    const y = zone ? Math.max(0, zone.y) : 0;
    const width = zone ? Math.min(this.CANVAS_WIDTH - x, zone.width) : this.CANVAS_WIDTH;
    const height = zone ? Math.min(this.CANVAS_HEIGHT - y, zone.height) : this.CANVAS_HEIGHT;

    if (width <= 0 || height <= 0) return;

    const current = ctx.getImageData(x, y, width, height);

    if (
      this.lastImageData &&
      current.width === this.lastImageData.width &&
      current.height === this.lastImageData.height
    ) {
      const motionThreshold = 11 - this.sensitivity();
      const changedPct = this.calculateDifferenceFast(
        current.data,
        this.lastImageData.data,
        30,
        motionThreshold,
        2
      );

      if (changedPct > motionThreshold) {
        const now = Date.now();
        if (now - this.lastMotionTime > this.motionCooldown()) {
          this.lastMotionTime = now;
          this.zone.run(() => this.handleMotionDetected(changedPct));
        }
      }
    }

    this.lastImageData = current;
  }

  private async processPoseDetection(): Promise<void> {
    if (this.poseLibrary() === 'mediapipe') {
      await this.processMediaPipePoseDetection();
    } else {
      await this.processMoveNetPoseDetection();
    }
  }

  private processMediaPipePoseDetection(): void {
    if (!this.poseLandmarker) {
      console.warn('Pose landmarker not initialized');
      return;
    }

    const video = this.videoRef().nativeElement;
    const now = Date.now();

    try {
      // Detect poses in the current video frame
      const result: PoseLandmarkerResult = this.poseLandmarker.detectForVideo(video, now);

      // Check if a person is detected
      const personDetected = result.landmarks && result.landmarks.length > 0;

      // Landmark tracking mode: detect large position changes
      if (this.landmarkTrackingEnabled() && personDetected) {
        const currentLandmarks = result.landmarks[0]; // Use first person's landmarks
        const positionChange = this.calculateLandmarkPositionChange(currentLandmarks);

        // Trigger if position change exceeds threshold
        if (positionChange > this.POSITION_CHANGE_THRESHOLD) {
          if (now - this.lastPoseDetectionTime > this.motionCooldown()) {
            this.lastPoseDetectionTime = now;
            // Scale intensity based on position change (0-100)
            const intensity = Math.min(100, Math.round((positionChange / this.POSITION_CHANGE_THRESHOLD) * 50));
            this.zone.run(() => this.handleMotionDetected(intensity));
          }
        }
      }
      // Standard mode: detect motion when person enters the frame
      else if (!this.landmarkTrackingEnabled() && personDetected && !this.previousPersonDetected) {
        // Calculate confidence score as intensity (0-100)
        const intensity =
          result.landmarks.length > 0
            ? Math.min(100, result.landmarks.length * 50) // Scale based on number of people detected
            : 0;

        if (now - this.lastPoseDetectionTime > this.motionCooldown()) {
          this.lastPoseDetectionTime = now;
          this.zone.run(() => this.handleMotionDetected(intensity));
        }
      }

      // Update previous state
      this.previousPersonDetected = personDetected;

      // Draw pose landmarks on overlay canvas
      this.drawMediaPipeLandmarks(result);
    } catch (error) {
      console.error('MediaPipe pose detection error:', error);
    }
  }

  private async processMoveNetPoseDetection(): Promise<void> {
    if (!this.moveNetDetector) {
      console.warn('MoveNet detector not initialized');
      return;
    }

    const video = this.videoRef().nativeElement;
    const now = Date.now();

    try {
      // Detect poses in the current video frame
      const poses = await this.moveNetDetector.estimatePoses(video);

      // Check if a person is detected
      const personDetected = poses && poses.length > 0;

      // Landmark tracking mode: detect large position changes
      if (this.landmarkTrackingEnabled() && personDetected) {
        const currentPose = poses[0]; // Use first person's pose
        const currentLandmarks = currentPose.keypoints.map((kp) => ({ x: kp.x, y: kp.y }));
        const positionChange = this.calculateLandmarkPositionChange(currentLandmarks);

        // Trigger if position change exceeds threshold
        if (positionChange > this.POSITION_CHANGE_THRESHOLD) {
          if (now - this.lastPoseDetectionTime > this.motionCooldown()) {
            this.lastPoseDetectionTime = now;
            // Scale intensity based on position change (0-100)
            const intensity = Math.min(100, Math.round((positionChange / this.POSITION_CHANGE_THRESHOLD) * 50));
            this.zone.run(() => this.handleMotionDetected(intensity));
          }
        }
      }
      // Standard mode: detect motion when person enters the frame
      else if (!this.landmarkTrackingEnabled() && personDetected && !this.previousPersonDetected) {
        // Calculate confidence score as intensity (0-100)
        const avgScore =
          poses.length > 0
            ? poses.reduce((sum, pose) => sum + (pose.score || 0), 0) / poses.length
            : 0;
        const intensity = Math.min(100, Math.round(avgScore * 100));

        if (now - this.lastPoseDetectionTime > this.motionCooldown()) {
          this.lastPoseDetectionTime = now;
          this.zone.run(() => this.handleMotionDetected(intensity));
        }
      }

      // Update previous state
      this.previousPersonDetected = personDetected;

      // Draw pose landmarks on overlay canvas
      this.drawMoveNetPoses(poses);
    } catch (error) {
      console.error('MoveNet pose detection error:', error);
    }
  }

  private drawMediaPipeLandmarks(result: PoseLandmarkerResult): void {
    if (!this.overlayCtx || !this.videoDimensions) return;

    // Clear previous landmarks
    this.clearOverlay();

    // Redraw detection zone if in motion mode
    if (this.detectionMethod() === 'motion') {
      this.drawPersistentZone();
      return;
    }

    const ctx = this.overlayCtx;
    const { width, height } = this.videoDimensions;

    // Draw landmarks for each detected person
    for (const landmarks of result.landmarks) {
      // Draw connections between landmarks
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 2;

      // Define pose connections (MediaPipe pose connections)
      const connections = [
        [11, 12],
        [11, 13],
        [13, 15],
        [12, 14],
        [14, 16], // Arms
        [11, 23],
        [12, 24],
        [23, 24], // Torso
        [23, 25],
        [25, 27],
        [24, 26],
        [26, 28], // Legs
      ];

      // Draw connections
      for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];

        if (startPoint && endPoint) {
          ctx.beginPath();
          ctx.moveTo(startPoint.x * width, startPoint.y * height);
          ctx.lineTo(endPoint.x * width, endPoint.y * height);
          ctx.stroke();
        }
      }

      // Draw landmark points
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 4, 0, 2 * Math.PI);
        ctx.fill();
      }
    }
  }

  private drawMoveNetPoses(poses: poseDetection.Pose[]): void {
    if (!this.overlayCtx || !this.videoDimensions) return;

    // Clear previous landmarks
    this.clearOverlay();

    // Redraw detection zone if in motion mode
    if (this.detectionMethod() === 'motion') {
      this.drawPersistentZone();
      return;
    }

    const ctx = this.overlayCtx;
    const { width, height } = this.videoDimensions;

    // Draw landmarks for each detected person
    for (const pose of poses) {
      // Define pose connections for MoveNet
      const adjacentKeyPoints = poseDetection.util.getAdjacentPairs(
        poseDetection.SupportedModels.MoveNet
      );

      // Draw connections
      ctx.strokeStyle = 'rgba(0, 255, 0, 0.8)';
      ctx.lineWidth = 2;

      for (const [i, j] of adjacentKeyPoints) {
        const kp1 = pose.keypoints[i];
        const kp2 = pose.keypoints[j];

        // Only draw if both keypoints have sufficient confidence
        if (kp1 && kp2 && (kp1.score || 0) > 0.3 && (kp2.score || 0) > 0.3) {
          ctx.beginPath();
          ctx.moveTo(kp1.x, kp1.y);
          ctx.lineTo(kp2.x, kp2.y);
          ctx.stroke();
        }
      }

      // Draw keypoint circles
      ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
      for (const keypoint of pose.keypoints) {
        if ((keypoint.score || 0) > 0.3) {
          ctx.beginPath();
          ctx.arc(keypoint.x, keypoint.y, 4, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  }

  private calculateDifferenceFast(
    a: Uint8ClampedArray,
    b: Uint8ClampedArray,
    colorThreshold = 30,
    motionPercentThreshold = 6,
    pixelStride = 2
  ): number {
    const totalPixels = a.length / 4;
    const sampledPixels = Math.ceil(totalPixels / pixelStride);
    const earlyExitCount = Math.ceil((motionPercentThreshold / 100) * sampledPixels);

    let changed = 0;
    for (let i = 0; i < a.length; i += 4 * pixelStride) {
      const dr = Math.abs(a[i] - b[i]);
      const dg = Math.abs(a[i + 1] - b[i + 1]);
      const db = Math.abs(a[i + 2] - b[i + 2]);
      if (dr + dg + db > colorThreshold) {
        changed++;
        if (changed >= earlyExitCount) {
          // Return a value guaranteed to be over the threshold
          return motionPercentThreshold + 1;
        }
      }
    }
    return (changed / sampledPixels) * 100;
  }

  private handleMotionDetected(intensity: number): void {
    this.detectionCounter++;

    if (this.detectionCounter >= this.signalCadence()) {
      this.detectionCounter = 0; // Reset counter
      this.motionDetected.emit(intensity);
      this.lastMotionSignal.set('Motion signal sent!');

      setTimeout(() => this.lastMotionSignal.set(null), 2000);
    } else {
      const cadence = this.signalCadence();
      if (cadence > 1) {
        // Only show progress if cadence is more than 1
        this.lastMotionSignal.set(`Detected ${this.detectionCounter} of ${cadence}`);
        setTimeout(() => {
          if (this.lastMotionSignal() && this.lastMotionSignal()!.startsWith('Detected')) {
            this.lastMotionSignal.set(null);
          }
        }, 1000);
      }
    }
  }

  enableLandmarkTracking(): void {
    this.landmarkTrackingEnabled.set(true);
    this.previousLandmarks = null;
  }

  disableLandmarkTracking(): void {
    this.landmarkTrackingEnabled.set(false);
    this.previousLandmarks = null;
  }

  private calculateLandmarkPositionChange(
    currentLandmarks: Array<{ x: number; y: number; z?: number }>
  ): number {
    if (!this.previousLandmarks || this.previousLandmarks.length !== currentLandmarks.length) {
      this.previousLandmarks = currentLandmarks;
      return 0;
    }

    // Calculate average position change across key landmarks
    // Focus on core body landmarks (shoulders, hips, knees) for reliable detection
    const keyLandmarkIndices = [11, 12, 23, 24, 25, 26]; // shoulders, hips, knees

    let totalChange = 0;
    let validLandmarks = 0;

    for (const idx of keyLandmarkIndices) {
      if (idx < currentLandmarks.length && idx < this.previousLandmarks.length) {
        const current = currentLandmarks[idx];
        const previous = this.previousLandmarks[idx];

        // Calculate Euclidean distance
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        totalChange += distance;
        validLandmarks++;
      }
    }

    // Update previous landmarks
    this.previousLandmarks = currentLandmarks;

    return validLandmarks > 0 ? totalChange / validLandmarks : 0;
  }

  ngOnDestroy(): void {
    this.stopDetection();
    this.zoneEffectCleanup?.();
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined; // Explicitly clear reference

    // Clean up speedy-vision resources
    this.speedyService.cleanup();
    this.speedyCleanupFn?.();

    // Clean up diffyjs resources
    this.diffyService.cleanup();
    this.diffyCleanupFn?.();

    // Clean up MediaPipe resources
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }

    // Clean up MoveNet resources
    if (this.moveNetDetector) {
      this.moveNetDetector.dispose();
      this.moveNetDetector = null;
    }

    const video = this.videoRef()?.nativeElement;
    if (video) {
      // Clean up event listener
      video.onloadedmetadata = null;
    }
  }

  stopDetection(): void {
    const video = this.videoRef()?.nativeElement as HTMLVideoElement & {
      cancelVideoFrameCallback?: (id: number) => void;
    };

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.vfcHandle && video?.cancelVideoFrameCallback) {
      video.cancelVideoFrameCallback(this.vfcHandle);
      this.vfcHandle = null;
    }

    // Stop speedy-vision if active
    if (this.speedyService.isActive()) {
      this.speedyService.cleanup();
    }

    // Stop diffyjs if active
    if (this.diffyService.isActive()) {
      this.diffyService.cleanup();
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
      this.stream = null;
    }

    if (this.status() === 'detecting') {
      this.status.set('ready');
    }
  }

  onGoBack(): void {
    this.stopDetection();
    this.goBack.emit();
  }

  onSensitivityChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.sensitivity.set(Number(value));
    this.detectionSettings.saveSettings();
  }

  onCooldownChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 0) {
      this.motionCooldown.set(numValue);
      this.detectionSettings.saveSettings();
    }
  }

  onSignalCadenceChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const numValue = Number(value);
    if (!isNaN(numValue) && numValue >= 1) {
      this.signalCadence.set(numValue);
      this.detectionCounter = 0; // Reset on change
      this.detectionSettings.saveSettings();
    }
  }

  onZoneWidthChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.zoneWidthPercent.set(Number(value));
    this.detectionSettings.saveSettings();
  }

  onZonePositionChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.zonePositionPercent.set(Number(value));
    this.detectionSettings.saveSettings();
  }

  onFullScreenToggleChange(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.useFullScreenDetection.set(checked);
    this.detectionSettings.saveSettings();
  }

  onCameraChange(event: Event) {
    const selectedId = (event.target as HTMLSelectElement).value;
    this.selectedCameraId.set(selectedId);
    this.detectionSettings.saveSettings();
    this.startCamera();
  }

  toggleSettings(): void {
    this.settingsExpanded.update((expanded) => !expanded);
  }

  onDetectionMethodChange(method: 'motion' | 'pose'): void {
    this.detectionMethod.set(method);
    this.detectionSettings.saveSettings();
    // Reset detection state when switching methods
    this.lastImageData = null;
    this.previousPersonDetected = false;
    this.lastMotionTime = 0;
    this.lastPoseDetectionTime = 0;
    this.detectionCounter = 0;
    // Stop GPU-accelerated libraries if switching away from motion
    if (method !== 'motion') {
      if (this.speedyService.isActive()) {
        this.speedyService.cleanup();
      }
      if (this.diffyService.isActive()) {
        this.diffyService.cleanup();
      }
    }
    // Clear and redraw overlay
    this.drawPersistentZone();
  }

  onUseDiffyJSChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.useDiffyJS.set(checked);

    // Disable speedy-vision if enabling diffyjs
    if (checked) {
      this.useSpeedyVision.set(false);
    }

    this.detectionSettings.saveSettings();

    // If switching while detecting, restart detection with new method
    if (this.status() === 'detecting' && this.detectionMethod() === 'motion') {
      this.stopDetection();
      this.status.set('ready');
      // User can manually restart detection to apply the change
    }
  }

  onUseSpeedyVisionChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.useSpeedyVision.set(checked);

    // Disable diffyjs if enabling speedy-vision
    if (checked) {
      this.useDiffyJS.set(false);
    }

    this.detectionSettings.saveSettings();

    // If switching while detecting, restart detection with new method
    if (this.status() === 'detecting' && this.detectionMethod() === 'motion') {
      this.stopDetection();
      this.status.set('ready');
      // User can manually restart detection to apply the change
    }
  }

  async onPoseLibraryChange(event: Event): Promise<void> {
    const library = (event.target as HTMLSelectElement).value as 'mediapipe' | 'movenet';
    this.poseLibrary.set(library);
    this.detectionSettings.saveSettings();

    // Clean up existing detectors
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    if (this.moveNetDetector) {
      this.moveNetDetector.dispose();
      this.moveNetDetector = null;
    }

    // Initialize the new library
    await this.initializePoseDetection();

    // Reset detection state
    this.previousPersonDetected = false;
    this.lastPoseDetectionTime = 0;
  }

  async onPoseModelChange(event: Event): Promise<void> {
    const model = (event.target as HTMLSelectElement).value as 'lite' | 'full' | 'heavy';
    this.poseModel.set(model);
    this.detectionSettings.saveSettings();

    // Reinitialize MediaPipe with the new model
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }

    await this.initializeMediaPipe();

    // Reset detection state
    this.previousPersonDetected = false;
    this.lastPoseDetectionTime = 0;
  }

  async onMoveNetModelChange(event: Event): Promise<void> {
    const model = (event.target as HTMLSelectElement).value as
      | 'lightning'
      | 'thunder'
      | 'multipose';
    this.moveNetModel.set(model);
    this.detectionSettings.saveSettings();

    // Reinitialize MoveNet with the new model
    if (this.moveNetDetector) {
      this.moveNetDetector.dispose();
      this.moveNetDetector = null;
    }

    await this.initializeMoveNet();

    // Reset detection state
    this.previousPersonDetected = false;
    this.lastPoseDetectionTime = 0;
  }

  private clearOverlay() {
    if (this.overlayCtx && this.overlayCanvasRef()) {
      const overlay = this.overlayCanvasRef().nativeElement;
      this.overlayCtx.clearRect(0, 0, overlay.width, overlay.height);
    }
  }

  private drawPersistentZone() {
    this.clearOverlay();
    const zone = this.detectionZone();
    if (zone && this.videoDimensions) {
      const scaleX = this.videoDimensions.width / this.CANVAS_WIDTH;
      const scaleY = this.videoDimensions.height / this.CANVAS_HEIGHT;
      const displayZone = {
        x: zone.x * scaleX,
        y: zone.y * scaleY,
        width: zone.width * scaleX,
        height: zone.height * scaleY,
      };
      this.drawRect(displayZone, 'rgba(239, 68, 68, 0.7)');
    }
  }

  private drawRect(rect: { x: number; y: number; width: number; height: number }, color: string) {
    if (this.overlayCtx) {
      this.overlayCtx.strokeStyle = color;
      this.overlayCtx.lineWidth = 3;
      this.overlayCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
    }
  }
}
