import { ChangeDetectionStrategy, Component, input, output, signal, viewChild, ElementRef, inject, Renderer2, OnInit, OnDestroy } from '@angular/core';
import { DetectorComponent } from '../detector/detector.component';
import { DisplayComponent } from '../display/display.component';
import { CommonModule, DOCUMENT } from '@angular/common';

type DisplaySignal = 
  | { type: 'color', value: string, timestamp: number, intensity?: number } 
  | { type: 'math_op', op: string, sum: number, timestamp: number, intensity?: number }
  | { type: 'math_result', sum: number, timestamp: number, intensity?: number }
  | { type: 'wechsel_text', value: 'Rechts' | 'Links', timestamp: number, intensity?: number }
  | { type: 'counter', count: number, timestamp: number, intensity?: number }
  | null;

@Component({
  selector: 'app-single-device',
  templateUrl: './single-device.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent, DisplayComponent],
})
export class SingleDeviceComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  goBack = output<void>();

  motionSignal = signal<DisplaySignal>(null);
  lingerDuration = signal(1000);
  displayContentType = signal<'color' | 'math' | 'wechsel' | 'counter'>('color');
  private readonly colors = ['#ef4444', '#22c55e', '#3b82f6', '#f1f5f9', '#facc15', '#a855f7', '#22d3ee'];

  // Math game state
  maxOperations = signal(5);
  mathGameStatus = signal<'idle' | 'running' | 'finished'>('idle');
  currentSum = signal(0);
  operationsDone = signal(0);
  
  // Counter state
  detectionCount = signal(0);

  detectorComponent = viewChild.required(DetectorComponent);
  private displayContainer = viewChild.required<ElementRef>('displayContainer');
  private document: Document = inject(DOCUMENT);
  private renderer = inject(Renderer2);
  private fullscreenChangeListener!: () => void;
  private resultTimeoutId: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.fullscreenChangeListener = this.renderer.listen('document', 'fullscreenchange', () => {});
  }

  ngOnDestroy(): void {
    if (this.fullscreenChangeListener) {
      this.fullscreenChangeListener();
    }
    if (this.resultTimeoutId) {
      clearTimeout(this.resultTimeoutId);
      this.resultTimeoutId = null;
    }
  }

  onGoBack() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.goBack.emit();
  }

  handleMotion(intensity: number) {
    if (this.displayContentType() === 'color') {
      const randomColor = this.colors[Math.floor(Math.random() * this.colors.length)];
      this.motionSignal.set({ type: 'color', value: randomColor, timestamp: Date.now(), intensity });
    } else if (this.displayContentType() === 'math') {
      this.runMathGameStep(intensity);
    } else if (this.displayContentType() === 'counter') {
      this.detectionCount.update(c => c + 1);
      this.motionSignal.set({ type: 'counter', count: this.detectionCount(), timestamp: Date.now(), intensity });
    } else { // 'wechsel'
      const text = Math.random() < 0.5 ? 'Rechts' : 'Links';
      this.motionSignal.set({ type: 'wechsel_text', value: text, timestamp: Date.now(), intensity });
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
    const elem = this.displayContainer().nativeElement;
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
}
