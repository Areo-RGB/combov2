import { ChangeDetectionStrategy, Component, output, signal, viewChild, OnDestroy, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetectorComponent } from '../components/detector/detector.component';

@Component({
  selector: 'app-team-duels',
  templateUrl: './team-duels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class TeamDuelsComponent implements OnDestroy {
  goBack = output<void>();

  mode = signal<'selection' | 'single-device'>('selection');

  // Game state
  livepool = signal(60);
  initialLivepool = signal(60);
  timerStartTime = signal<number | null>(null);
  elapsedTime = signal<string>('0.00');
  lastReactionTime = signal<number | null>(null);
  gameState = signal<'idle' | 'running' | 'paused'>('idle');
  private animationFrameId: number | null = null;
  private audioContext = new Audio();
  
  detector = viewChild(DetectorComponent);
  private zone = inject(NgZone);

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.audioContext.pause();
    this.audioContext.src = '';
  }

  private playStartSound(): void {
    this.audioContext.src = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/start-sound-beep-102201.mp3';
    this.audioContext.play().catch(err => console.error("Audio playback failed:", err));
  }

  startGame(): void {
    this.resetGame();
    this.gameState.set('running');
    this.playStartSound();
    if (this.detector()?.status() !== 'detecting') {
      this.detector()?.startDetection();
    }
  }

  pauseGame(): void {
    if (this.gameState() === 'running') {
      this.gameState.set('paused');
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
    }
  }

  resumeGame(): void {
    if (this.gameState() === 'paused') {
      this.gameState.set('running');
      if (this.timerStartTime() !== null) {
        this.runTimer();
      }
    }
  }

  stopDetectionAndGame(): void {
    this.detector()?.stopDetection();
    this.resetGame();
  }

  startSingleDeviceMode(): void {
    this.mode.set('single-device');
  }

  handleMotion(): void {
    if (this.gameState() !== 'running') return;
    if (this.detector()?.status() !== 'detecting') return;

    if (this.timerStartTime() === null) {
      // First detection: start timer
      this.timerStartTime.set(Date.now());
      this.lastReactionTime.set(null);
      this.runTimer();
    } else {
      // Second detection: stop timer
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      
      const stoppedTime = Date.now();
      const reactionTime = (stoppedTime - this.timerStartTime()!) / 1000;
      
      this.lastReactionTime.set(reactionTime);
      this.elapsedTime.set(reactionTime.toFixed(2));
      
      this.livepool.update(pool => pool - reactionTime);
      
      this.timerStartTime.set(null);
    }
  }
  
  runTimer(): void {
    const update = () => {
      if (this.timerStartTime() !== null) {
        const elapsed = (Date.now() - this.timerStartTime()!) / 1000;
        this.elapsedTime.set(elapsed.toFixed(2));
        this.animationFrameId = requestAnimationFrame(update);
      }
    };
    
    this.zone.runOutsideAngular(() => {
        this.animationFrameId = requestAnimationFrame(update);
    });
  }

  resetGame(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.livepool.set(this.initialLivepool());
    this.timerStartTime.set(null);
    this.elapsedTime.set('0.00');
    this.lastReactionTime.set(null);
    this.gameState.set('idle');
  }
  
  onInitialLivepoolChange(event: Event) {
      const input = event.target as HTMLInputElement;
      const value = Number(input.value);
      if (!isNaN(value) && value > 0) {
          this.initialLivepool.set(value);
          this.resetGame();
      }
  }

  goBackToSelection(): void {
    this.resetGame();
    this.mode.set('selection');
  }

  onGoBackToMenu(): void {
    this.resetGame();
    this.goBack.emit();
  }

  getLivepoolPercentage(): number {
    const percentage = (this.livepool() / this.initialLivepool()) * 100;
    return Math.max(0, Math.min(100, percentage));
  }
}