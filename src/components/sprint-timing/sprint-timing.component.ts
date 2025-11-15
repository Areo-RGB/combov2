import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
  viewChild,
  ElementRef,
  inject,
  Renderer2,
  OnInit,
  OnDestroy,
  effect,
  Injector,
  runInInjectionContext,
} from '@angular/core';
import { DetectorComponent } from '../detector/detector.component';
import { HeaderComponent } from '../header/header.component';
import { CommonModule, DOCUMENT } from '@angular/common';
import { DetectionSettingsService } from '../../services/detection-settings.service';
import { SettingsComponent } from '../../sprint-duels/components/settings/settings.component';

type StartMode = 'manual' | 'flying';

type LapResult = {
  id: number;
  time: number;
  formatted: string;
};

@Component({
  selector: 'app-sprint-timing',
  templateUrl: './sprint-timing.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent, HeaderComponent, SettingsComponent],
})
export class SprintTimingComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  startMode = input.required<StartMode>();
  goBack = output<void>();

  // Timing state
  isTiming = signal(false);
  isArmed = signal(false);
  startTime = signal(0);
  elapsedTime = signal(0);
  lapResults = signal<LapResult[]>([]);

  // Settings
  showSettings = signal(false);
  minDetectionDelay = signal(2000);

  private timerInterval: any = null;
  private lastDetectionTime = 0;
  private detectionStartTimeout: ReturnType<typeof setTimeout> | null = null;

  detectorComponent = viewChild.required(DetectorComponent);
  private displayContainer = viewChild.required<ElementRef>('displayContainer');
  private document: Document = inject(DOCUMENT);
  private renderer = inject(Renderer2);
  private fullscreenChangeListener!: () => void;
  private detectionSettings = inject(DetectionSettingsService);
  private injector = inject(Injector);
  private effectCleanup?: () => void;

  ngOnInit(): void {
    this.fullscreenChangeListener = this.renderer.listen('document', 'fullscreenchange', () => {});
    
    // Initialize from global settings
    this.minDetectionDelay.set(this.detectionSettings.motionCooldown());

    // Sync with global settings changes
    runInInjectionContext(this.injector, () => {
      const syncEffect = effect(() => {
        const globalCooldown = this.detectionSettings.motionCooldown();
        if (globalCooldown !== this.minDetectionDelay()) {
          this.minDetectionDelay.set(globalCooldown);
        }
      });
      this.effectCleanup = () => syncEffect.destroy();
    });
  }

  ngOnDestroy(): void {
    this.effectCleanup?.();
    if (this.fullscreenChangeListener) {
      this.fullscreenChangeListener();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (this.detectionStartTimeout) {
      clearTimeout(this.detectionStartTimeout);
    }
  }

  onGoBack() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.goBack.emit();
  }

  handleManualStart() {
    if (this.isTiming()) return;

    // Start detection after 1 second delay
    if (this.detectionStartTimeout) {
      clearTimeout(this.detectionStartTimeout);
    }

    const detector = this.detectorComponent();
    if (detector && detector.status() === 'ready') {
      this.detectionStartTimeout = setTimeout(() => {
        if (detector.status() === 'ready') {
          detector.startDetection();
        }
        // Start timer immediately after detection starts
        this.playStartBeep();
        this.startTimer();
      }, 1000);
    } else {
      // If detector is already detecting or not ready, start timer immediately
      this.playStartBeep();
      this.startTimer();
    }
  }

  handleArm() {
    this.isArmed.set(true);

    // Start detection after 1 second delay for flying start mode
    if (this.detectionStartTimeout) {
      clearTimeout(this.detectionStartTimeout);
    }

    const detector = this.detectorComponent();
    if (detector && detector.status() === 'ready') {
      this.detectionStartTimeout = setTimeout(() => {
        if (detector.status() === 'ready') {
          detector.startDetection();
        }
      }, 1000);
    }
  }

  handleMotion(intensity: number) {
    const now = Date.now();

    // Check min detection delay
    if (now - this.lastDetectionTime < this.minDetectionDelay()) {
      return;
    }
    this.lastDetectionTime = now;

    // Flying start mode: first motion starts the timer
    if (this.startMode() === 'flying' && this.isArmed() && !this.isTiming()) {
      this.startTimer();
      return;
    }

    // Any mode: motion while timing records a lap
    if (this.isTiming()) {
      this.recordLap();
    }
  }

  private startTimer() {
    const now = Date.now();
    this.startTime.set(now);
    this.isTiming.set(true);
    this.isArmed.set(false);

    // Update elapsed time every 10ms
    this.timerInterval = setInterval(() => {
      this.elapsedTime.set(Date.now() - this.startTime());
    }, 10);
  }

  private recordLap() {
    const lapTime = Date.now() - this.startTime();
    const formatted = this.formatTime(lapTime);

    const newLap: LapResult = {
      id: Date.now(),
      time: lapTime,
      formatted,
    };

    this.lapResults.update((laps) => [...laps, newLap].sort((a, b) => a.time - b.time));
    this.stopTimer();
  }

  private stopTimer() {
    this.isTiming.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  handleReset() {
    this.stopTimer();
    this.startTime.set(0);
    this.elapsedTime.set(0);
    this.isArmed.set(this.startMode() === 'flying');
    this.lastDetectionTime = 0;

    // Stop detection if it was started
    const detector = this.detectorComponent();
    if (detector && detector.status() === 'detecting') {
      detector.stopDetection();
    }

    // Clear any pending detection start timeout
    if (this.detectionStartTimeout) {
      clearTimeout(this.detectionStartTimeout);
      this.detectionStartTimeout = null;
    }
  }

  clearHistory() {
    this.lapResults.set([]);
  }

  deleteLap(id: number) {
    this.lapResults.update((laps) => laps.filter((lap) => lap.id !== id));
  }

  private formatTime(time: number): string {
    if (time < 0) time = 0;
    const minutes = Math.floor(time / 60000);
    const seconds = Math.floor((time % 60000) / 1000);
    const milliseconds = time % 1000;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  get displayTime(): string {
    return this.formatTime(this.elapsedTime());
  }

  get timeColor(): string {
    if (this.isTiming()) return 'text-green-400';
    if (this.lapResults().length > 0) return 'text-blue-400';
    return 'text-white';
  }

  private playStartBeep() {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gainNode.gain.setValueAtTime(1, audioContext.currentTime);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
    setTimeout(() => audioContext.close(), 200);
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

  exportToCSV() {
    if (this.lapResults().length === 0) {
      alert('No results to export');
      return;
    }

    let csvContent = 'Lap,Time (ms),Time (formatted)\n';
    this.lapResults().forEach((lap, index) => {
      csvContent += `${index + 1},${lap.time},${lap.formatted}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = this.document.createElement('a');
    link.href = url;
    link.download = `sprint_results_${this.sessionId()}.csv`;
    this.document.body.appendChild(link);
    link.click();
    this.document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  onMinDelayChange(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    const newValue = Number(value);
    this.minDetectionDelay.set(newValue);
    // Sync back to global settings
    this.detectionSettings.motionCooldown.set(newValue);
    this.detectionSettings.saveSettings();
  }

}
