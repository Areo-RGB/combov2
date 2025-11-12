import { ChangeDetectionStrategy, Component, signal, inject, effect, OnDestroy, viewChild, ElementRef, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DetectorComponent } from './components/detector/detector.component';
import { DisplayComponent } from './components/display/display.component';
import { SingleDeviceComponent } from './components/single-device/single-device.component';
import { SprintTimingComponent } from './components/sprint-timing/sprint-timing.component';
import { SprintMultiSetupComponent } from './components/sprint-multi-setup/sprint-multi-setup.component';
import { SprintTimingMultiComponent } from './components/sprint-timing-multi/sprint-timing-multi.component';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseService } from './services/firebase.service';
import { SprintDuelsComponent } from './sprint-duels/sprint-duels.component';
import { TeamDuelsComponent } from './team-duels/team-duels.component';
import { SettingsComponent } from './sprint-duels/components/settings/settings.component';
import { RtcService } from './services/rtc.service';
import { SignalingService } from './services/signaling.service';
import { CameraService } from './services/camera.service';

// Define the shape of signals for the display component
type DisplaySignal = 
  | { type: 'color', value: string, timestamp: number, intensity?: number } 
  | { type: 'math_op', op: string, sum: number, timestamp: number, intensity?: number }
  | { type: 'math_result', sum: number, timestamp: number, intensity?: number }
  | { type: 'wechsel_text', value: 'Rechts' | 'Links', timestamp: number, intensity?: number }
  | { type: 'counter', count: number, timestamp: number, intensity?: number }
  | null;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DetectorComponent, DisplayComponent, SingleDeviceComponent, SprintTimingComponent, SprintMultiSetupComponent, SprintTimingMultiComponent, SprintDuelsComponent, TeamDuelsComponent, HeaderComponent, SettingsComponent],
})
export class AppComponent implements OnDestroy, OnInit {
  mode = signal<'selection' | 'motion-games' | 'detector' | 'display' | 'single' | 'sprint-timing-menu' | 'sprint-timing-single-menu' | 'sprint-timing-manual' | 'sprint-timing-flying' | 'sprint-multi-setup' | 'sprint-multi-timing' | 'sprint-duels' | 'team-duels' | 'detection-settings'>('selection');
  sessionId = signal('');
  inputSessionId = signal('');
  errorMessage = signal('');
  lingerDuration = signal(1000);
  displayContentType = signal<'color' | 'math' | 'wechsel' | 'counter'>('color');
  useRtc = signal(true);
  lastPhotoDataUrl = signal<string | null>(null);
  multiDeviceConfig = signal<any>(null);
  joinSprintSessionId = signal<string | null>(null);

  // Math game state
  maxOperations = signal(5);
  mathGameStatus = signal<'idle' | 'running' | 'finished'>('idle');
  currentSum = signal(0);
  operationsDone = signal(0);

  // Counter state
  detectionCount = signal(0);
  
  // Collapsible state for settings
  displaySettingsExpanded = signal(true);
  
  toggleDisplaySettings(): void {
    this.displaySettingsExpanded.update(v => !v);
  }

  private firebaseService = inject(FirebaseService);
  private rtc = inject(RtcService);
  private signaling = inject(SignalingService);
  private camera = inject(CameraService);
  motionSignal = signal<DisplaySignal>(null);
  private currentSessionIdForListener: string | null = null;
  private readonly colors = ['#ef4444', '#22c55e', '#3b82f6', '#f1f5f9', '#facc15', '#a855f7', '#22d3ee'];
  private resultTimeoutId: ReturnType<typeof setTimeout> | null = null;

  private displayContainer = viewChild<ElementRef>('displayContainer');
  private document: Document = inject(DOCUMENT);

  isAppFullScreen = signal(!!this.document.fullscreenElement);

  constructor() {
    effect((onCleanup) => {
        const mode = this.mode();
        const sid = this.sessionId();
        const contentType = this.displayContentType();

        // If we enter display mode with a valid session ID, start listening / advertising (RTC or Firebase)
        if (mode === 'display' && sid) {
            if (this.useRtc()) {
              this.signaling.startDisplayHandshake(sid).catch(() => {});
            }
            this.currentSessionIdForListener = sid;
            this.firebaseService.listenForMotion(sid, (data) => {
                if (data) {
                    const intensity = data.intensity ?? 20; // Use a default intensity if none is provided
                    if (contentType === 'color') {
                        const randomColor = this.colors[Math.floor(Math.random() * this.colors.length)];
                        this.motionSignal.set({ type: 'color', value: randomColor, timestamp: data.timestamp, intensity });
                    } else if (contentType === 'math') {
                        this.runMathGameStep(intensity);
                    } else if (contentType === 'counter') {
                        this.detectionCount.update(c => c + 1);
                        this.motionSignal.set({ type: 'counter', count: this.detectionCount(), timestamp: data.timestamp, intensity });
                    } else { // 'wechsel'
                        const text = Math.random() < 0.5 ? 'Rechts' : 'Links';
                        this.motionSignal.set({ type: 'wechsel_text', value: text, timestamp: data.timestamp, intensity });
                    }
                }
            });

            onCleanup(() => {
                if (this.currentSessionIdForListener) {
                   this.firebaseService.cleanupListener(this.currentSessionIdForListener);
                   this.currentSessionIdForListener = null;
                }
            });
        }

        // If we enter detector mode with a session ID, start discovery/signaling for RTC
        if (mode === 'detector' && sid && this.useRtc()) {
          this.signaling.startDetectorHandshake(sid).catch(() => {});
        }
    });
  }
  
  ngOnInit(): void {
    this.document.addEventListener('fullscreenchange', this.onFullscreenChange);
    // Hook RTC messages to trigger display actions when in display mode
    this.rtc.onMessage((msg) => {
      if (!msg || msg.t !== 'motion') return;
      this.handleRtcTrigger(msg.intensity ?? 20, msg.ts ?? Date.now());
    });
  }

  async capturePhoto(): Promise<void> {
    try {
      const photo = await this.camera.takePhotoToDataUrl(70);
      this.lastPhotoDataUrl.set(photo.dataUrl ?? null);
    } catch {
      // ignore cancellation/errors
    }
  }

  private runMathGameStep(intensity?: number) {
    if (this.resultTimeoutId) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = null;
    }

    let status = this.mathGameStatus();
    let sum = this.currentSum();
    let done = this.operationsDone();
    const max = this.maxOperations();

    if (status === 'idle' || status === 'finished') {
      sum = 0;
      done = 0;
      this.mathGameStatus.set('running');
    }

    done++;
    const operator = (sum === 0) ? '+' : (Math.random() < 0.5 ? '+' : '-');
    let value;

    if (operator === '+') {
      value = Math.floor(Math.random() * 9) + 1;
      sum += value;
    } else { // operator is '-'
      value = Math.floor(Math.random() * Math.min(sum, 9)) + 1;
      sum -= value;
    }

    this.currentSum.set(sum);
    this.operationsDone.set(done);

    // Always show the operation.
    this.motionSignal.set({
      type: 'math_op',
      op: `${operator} ${value}`,
      sum: sum,
      timestamp: Date.now(),
      intensity
    });

    if (done >= max) {
      this.mathGameStatus.set('finished');
      // After showing the last operation, show the final result after a delay.
      this.resultTimeoutId = setTimeout(() => {
        // Check that the game hasn't been reset in the meantime
        if (this.mathGameStatus() === 'finished' && this.operationsDone() === done) {
          this.motionSignal.set({
            type: 'math_result',
            sum: this.currentSum(),
            timestamp: Date.now(),
            intensity
          });
        }
        this.resultTimeoutId = null;
      }, this.lingerDuration() + 500); // A bit longer than the operation display time
    }
  }

  generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  startDetector() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('detector');
  }

  joinDisplay() {
    if (this.inputSessionId().trim().length < 6) {
      this.errorMessage.set('Please enter a valid 6-character session ID.');
      return;
    }
    this.errorMessage.set('');
    this.sessionId.set(this.inputSessionId().trim().toUpperCase());
    this.mode.set('display');
  }

  startSingleDeviceMode() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('single');
  }

  startSprintTimingSingleMenu() {
    this.mode.set('sprint-timing-single-menu');
  }

  startSprintTimingManual() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('sprint-timing-manual');
  }

  startSprintTimingFlying() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('sprint-timing-flying');
  }

  startMultiDeviceSetup() {
    this.joinSprintSessionId.set(null);
    this.mode.set('sprint-multi-setup');
  }

  joinMultiDevice(sessionId: string) {
    this.joinSprintSessionId.set(sessionId);
    this.mode.set('sprint-multi-setup');
  }

  handleMultiDeviceStart(config: any) {
    this.multiDeviceConfig.set(config);
    this.sessionId.set(config.sessionId);
    this.mode.set('sprint-multi-timing');
  }

  goBackToSelection() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.mode.set('selection');
    this.sessionId.set('');
    this.inputSessionId.set('');
    this.motionSignal.set(null);
    this.resetDisplayState();
  }

  handleSessionIdInput(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.inputSessionId.set(inputElement.value);
  }

  handleMotion(intensity: number) {
    if (this.useRtc()) {
      this.rtc.sendMotion(intensity);
      return;
    }
    this.firebaseService.writeMotion(this.sessionId(), intensity);
  }

  onLingerDurationChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.lingerDuration.set(Number(value));
  }
  
  onMaxOperationsChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.maxOperations.set(Number(value));
    this.resetDisplayState();
  }

  onDisplayContentChange(type: 'color' | 'math' | 'wechsel' | 'counter') {
    this.displayContentType.set(type);
    this.resetDisplayState();
  }

  private resetDisplayState(): void {
    if (this.resultTimeoutId) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = null;
    }
    this.mathGameStatus.set('idle');
    this.currentSum.set(0);
    this.operationsDone.set(0);
    this.detectionCount.set(0);
    this.motionSignal.set(null);
  }

  private handleRtcTrigger(intensity: number, timestamp: number): void {
    if (this.mode() !== 'display') return;
    const contentType = this.displayContentType();
    if (contentType === 'color') {
      const randomColor = this.colors[Math.floor(Math.random() * this.colors.length)];
      this.motionSignal.set({ type: 'color', value: randomColor, timestamp, intensity });
    } else if (contentType === 'math') {
      this.runMathGameStep(intensity);
    } else if (contentType === 'counter') {
      this.detectionCount.update(c => c + 1);
      this.motionSignal.set({ type: 'counter', count: this.detectionCount(), timestamp, intensity });
    } else { // 'wechsel'
      const text = Math.random() < 0.5 ? 'Rechts' : 'Links';
      this.motionSignal.set({ type: 'wechsel_text', value: text, timestamp, intensity });
    }
  }

  toggleFullscreen(): void {
    const displayContainerEl = this.displayContainer();
    if (!displayContainerEl) {
      return;
    }
    const elem = displayContainerEl.nativeElement;
    if (!this.document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      }
    } else {
      if (this.document.exitFullscreen) {
        this.document.exitFullscreen();
      }
    }
  }
  
  toggleAppFullscreen(): void {
    if (!this.document.fullscreenElement) {
        this.document.documentElement.requestFullscreen();
    } else {
        if (this.document.exitFullscreen) {
            this.document.exitFullscreen();
        }
    }
  }

  private onFullscreenChange = (): void => {
    this.isAppFullScreen.set(!!this.document.fullscreenElement);
  }

  ngOnDestroy(): void {
    if (this.resultTimeoutId) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = null;
    }
    if (this.currentSessionIdForListener) {
      this.firebaseService.cleanupListener(this.currentSessionIdForListener);
    }
    this.document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }
}
