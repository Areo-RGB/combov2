import { ChangeDetectionStrategy, Component, signal, inject, effect, OnDestroy, viewChild, ElementRef, OnInit } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DetectorComponent } from './components/detector/detector.component';
import { DisplayComponent } from './components/display/display.component';
import { SingleDeviceComponent } from './components/single-device/single-device.component';
import { FirebaseService } from './services/firebase.service';
import { SprintDuelsComponent } from './sprint-duels/sprint-duels.component';

// Define the shape of signals for the display component
type DisplaySignal = 
  | { type: 'color', value: string, timestamp: number } 
  | { type: 'math_op', op: string, sum: number, timestamp: number }
  | { type: 'math_result', sum: number, timestamp: number }
  | { type: 'wechsel_text', value: 'Rechts' | 'Links', timestamp: number }
  | { type: 'counter', count: number, timestamp: number }
  | null;

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DetectorComponent, DisplayComponent, SingleDeviceComponent, SprintDuelsComponent],
})
export class AppComponent implements OnDestroy, OnInit {
  mode = signal<'selection' | 'motion-games' | 'detector' | 'display' | 'single' | 'sprint-duels'>('selection');
  sessionId = signal('');
  inputSessionId = signal('');
  errorMessage = signal('');
  lingerDuration = signal(1000);
  displayContentType = signal<'color' | 'math' | 'wechsel' | 'counter'>('color');

  // Math game state
  maxOperations = signal(5);
  mathGameStatus = signal<'idle' | 'running' | 'finished'>('idle');
  currentSum = signal(0);
  operationsDone = signal(0);

  // Counter state
  detectionCount = signal(0);

  private firebaseService = inject(FirebaseService);
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

        // If we enter display mode with a valid session ID, start listening.
        if (mode === 'display' && sid) {
            this.currentSessionIdForListener = sid;
            this.firebaseService.listenForMotion(sid, (data) => {
                if (data) {
                    if (contentType === 'color') {
                        const randomColor = this.colors[Math.floor(Math.random() * this.colors.length)];
                        this.motionSignal.set({ type: 'color', value: randomColor, timestamp: data.timestamp });
                    } else if (contentType === 'math') {
                        this.runMathGameStep();
                    } else if (contentType === 'counter') {
                        this.detectionCount.update(c => c + 1);
                        this.motionSignal.set({ type: 'counter', count: this.detectionCount(), timestamp: data.timestamp });
                    } else { // 'wechsel'
                        const text = Math.random() < 0.5 ? 'Rechts' : 'Links';
                        this.motionSignal.set({ type: 'wechsel_text', value: text, timestamp: data.timestamp });
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
    });
  }
  
  ngOnInit(): void {
    this.document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  private runMathGameStep() {
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
      timestamp: Date.now()
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
            timestamp: Date.now()
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

  handleMotion() {
    this.firebaseService.writeMotion(this.sessionId());
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
