import { ChangeDetectionStrategy, Component, input, output, signal, viewChild, ElementRef, inject, Renderer2, OnInit, OnDestroy } from '@angular/core';
import { DetectorComponent } from '../detector/detector.component';
import { CommonModule, DOCUMENT } from '@angular/common';
import { SprintTimingService, DeviceRole, MessageType, LapData } from '../../services/sprint-timing.service';

type StartMode = 'manual' | 'flying';

type LapResult = {
  id: number;
  time: number;
  formatted: string;
  athleteName: string;
  deviceRole: DeviceRole;
};

@Component({
  selector: 'app-sprint-timing-multi',
  templateUrl: './sprint-timing-multi.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class SprintTimingMultiComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  startMode = input.required<StartMode>();
  deviceRole = input.required<DeviceRole>();
  minDetectionDelayInput = input<number>(2000);
  selectedCameraId = input<string | null>(null);
  isSingleDevice = input<boolean>(false); // True if single-device mode
  goBack = output<void>();

  private sprintService = inject(SprintTimingService);
  private document: Document = inject(DOCUMENT);
  private renderer = inject(Renderer2);

  // Timing state
  isTiming = signal(false);
  isArmed = signal(false);
  startTime = signal(0);
  elapsedTime = signal(0);
  lapResults = signal<LapResult[]>([]);
  lapCounter = signal(0);

  // Settings
  showSettings = signal(false);
  minDetectionDelay = signal(2000);

  private timerInterval: any = null;
  private lastDetectionTime = 0;
  private fullscreenChangeListener!: () => void;

  detectorComponent = viewChild.required(DetectorComponent);
  private displayContainer = viewChild.required<ElementRef>('displayContainer');

  readonly DeviceRole = DeviceRole;

  ngOnInit(): void {
    this.fullscreenChangeListener = this.renderer.listen('document', 'fullscreenchange', () => {});
    this.minDetectionDelay.set(this.minDetectionDelayInput());

    // Setup multi-device messaging if not single device mode
    if (!this.isSingleDevice()) {
      this.sprintService.listenForMessages(this.sessionId(), (message) => {
        this.handleMessage(message);
      });
    }
  }

  ngOnDestroy(): void {
    if (this.fullscreenChangeListener) {
      this.fullscreenChangeListener();
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    if (!this.isSingleDevice()) {
      this.sprintService.cleanupSession(this.sessionId());
    }
  }

  private handleMessage(message: any): void {
    switch (message.type) {
      case MessageType.Start:
        if (this.deviceRole() !== DeviceRole.Start) {
          this.startTime.set(message.timestamp);
          this.isTiming.set(true);
          this.isArmed.set(false);
          this.startTimer();
        }
        break;

      case MessageType.Finish:
        if (this.startTime() > 0) {
          const finishTime = message.timestamp;
          const lapTime = finishTime - this.startTime();
          const lapData = message.data.lap;

          const newLap: LapResult = {
            id: Date.now(),
            time: lapTime,
            formatted: this.formatTime(lapTime),
            athleteName: lapData.athleteName,
            deviceRole: lapData.deviceRole,
          };

          this.lapResults.update(laps => [...laps, newLap].sort((a, b) => a.time - b.time));

          // If this was a FINISH device, stop timing
          if (lapData.deviceRole === DeviceRole.Finish) {
            this.stopTimer();
            this.elapsedTime.set(lapTime);
          }
        }
        break;

      case MessageType.Reset:
        this.handleResetLocal();
        break;

      case MessageType.ReturnToLobby:
        this.onGoBack();
        break;
    }
  }

  onGoBack(): void {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.goBack.emit();
  }

  handleManualStart(): void {
    if (this.isTiming() || this.deviceRole() !== DeviceRole.Start) return;

    this.playStartBeep();
    const now = Date.now();
    this.startTime.set(now);
    this.isTiming.set(true);
    this.isArmed.set(false);
    this.lapCounter.set(0);

    // Broadcast to other devices
    if (!this.isSingleDevice()) {
      this.sprintService.publishMessage(this.sessionId(), MessageType.Start, {});
    }

    this.startTimer();
  }

  handleArm(): void {
    this.isArmed.set(true);
  }

  handleMotion(intensity: number): void {
    const now = Date.now();

    // Check min detection delay
    if (now - this.lastDetectionTime < this.minDetectionDelay()) {
      return;
    }
    this.lastDetectionTime = now;

    // Flying start mode: START device - first motion starts the timer
    if (this.startMode() === 'flying' && this.deviceRole() === DeviceRole.Start && this.isArmed() && !this.isTiming()) {
      this.startTime.set(now);
      this.isTiming.set(true);
      this.isArmed.set(false);
      this.lapCounter.set(0);

      // Broadcast to other devices
      if (!this.isSingleDevice()) {
        this.sprintService.publishMessage(this.sessionId(), MessageType.Start, {});
      }

      this.startTimer();
      return;
    }

    // Any device: motion while timing records a lap
    if (this.isTiming() && this.deviceRole() !== DeviceRole.Start) {
      this.recordLap();
    }
  }

  private recordLap(): void {
    const lapTime = Date.now() - this.startTime();
    this.lapCounter.update(c => c + 1);

    const lapNumber = this.lapResults().length + 1;
    const athleteName = this.deviceRole() === DeviceRole.Finish ? 'Finish' : `Lap ${lapNumber}`;

    const lapData: LapData = {
      athleteId: `lap-${lapNumber}`,
      athleteName,
      deviceRole: this.deviceRole(),
    };

    if (this.isSingleDevice()) {
      // Single device mode
      const newLap: LapResult = {
        id: Date.now(),
        time: lapTime,
        formatted: this.formatTime(lapTime),
        athleteName,
        deviceRole: this.deviceRole(),
      };

      this.lapResults.update(laps => [...laps, newLap].sort((a, b) => a.time - b.time));

      if (this.deviceRole() === DeviceRole.Finish) {
        this.stopTimer();
        this.elapsedTime.set(lapTime);
      }
    } else {
      // Multi-device mode: broadcast
      this.sprintService.publishMessage(this.sessionId(), MessageType.Finish, { lap: lapData });
    }
  }

  private startTimer(): void {
    // Update elapsed time every 10ms
    this.timerInterval = setInterval(() => {
      this.elapsedTime.set(Date.now() - this.startTime());
    }, 10);
  }

  private stopTimer(): void {
    this.isTiming.set(false);
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  handleReset(): void {
    if (this.isSingleDevice() || this.deviceRole() === DeviceRole.Start) {
      // Broadcast reset to other devices
      if (!this.isSingleDevice()) {
        this.sprintService.publishMessage(this.sessionId(), MessageType.Reset, {});
      }
      this.handleResetLocal();
    }
  }

  private handleResetLocal(): void {
    this.stopTimer();
    this.startTime.set(0);
    this.elapsedTime.set(0);
    this.isArmed.set(this.startMode() === 'flying' && this.deviceRole() === DeviceRole.Start);
    this.lastDetectionTime = 0;
    this.lapCounter.set(0);
  }

  clearHistory(): void {
    this.lapResults.set([]);
  }

  deleteLap(id: number): void {
    this.lapResults.update(laps => laps.filter(lap => lap.id !== id));
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

  private playStartBeep(): void {
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

  exportToCSV(): void {
    if (this.lapResults().length === 0) {
      alert('No results to export');
      return;
    }

    let csvContent = 'Lap,Device,Athlete,Time (ms),Time (formatted)\n';
    this.lapResults().forEach((lap, index) => {
      csvContent += `${index + 1},${lap.deviceRole},${lap.athleteName},${lap.time},${lap.formatted}\n`;
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

  onMinDelayChange(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.minDetectionDelay.set(Number(value));
  }

  get canStart(): boolean {
    return this.deviceRole() === DeviceRole.Start && !this.isTiming();
  }

  get shouldShowArm(): boolean {
    return this.startMode() === 'flying' && this.deviceRole() === DeviceRole.Start && !this.isTiming() && this.lapResults().length === 0;
  }

  get shouldShowReset(): boolean {
    return this.isTiming() || this.lapResults().length > 0;
  }
}
