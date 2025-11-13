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

  constructor() {
    // Effect moved to ngAfterViewInit to ensure viewChild refs are available.
  }

  ngOnInit(): void {
    this.status.set('initializing');
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
    if (this.useSpeedyVision()) {
      this.initializeSpeedyVision();
    } else if (this.useDiffyJS()) {
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

    this.processMotionDetection();
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

  onDetectionMethodChange(method: 'diffy' | 'speedy'): void {
    // Update detection library preferences based on method
    if (method === 'diffy') {
      this.useDiffyJS.set(true);
      this.useSpeedyVision.set(false);
    } else if (method === 'speedy') {
      this.useSpeedyVision.set(true);
      this.useDiffyJS.set(false);
    }
    this.detectionSettings.saveSettings();
    // Reset detection state when switching methods
    this.lastImageData = null;
    this.lastMotionTime = 0;
    this.detectionCounter = 0;
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
    if (this.status() === 'detecting') {
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
    if (this.status() === 'detecting') {
      this.stopDetection();
      this.status.set('ready');
      // User can manually restart detection to apply the change
    }
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
