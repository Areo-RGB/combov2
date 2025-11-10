import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, signal, viewChild, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetectorComponent } from '../../../components/detector/detector.component';
import { TeamDuelsFirebaseService, GameState } from '../../services/team-duels-firebase.service';

@Component({
  selector: 'app-game-client',
  templateUrl: './game-client.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class GameClientComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  deviceId = input.required<string>();

  // Local state mirrored from Firebase
  gameState = signal<GameState | null>(null);

  // This device's specific game state
  livepool = signal(60);
  timerStartTime = signal<number | null>(null);
  elapsedTime = signal<string>('0.00');
  lastReactionTime = signal<number | null>(null);
  
  // Client-side settings
  initialLivepool = signal(60);
  selectedVoiceURI = signal<string>('default');
  availableVoices = signal<SpeechSynthesisVoice[]>([]);

  private readonly PRE_RECORDED_VOICES: { [key: string]: { name: string; files: { [key: string]: string } } } = {
    'default': {
      name: 'Pre-recorded (Default)',
      files: {}
    },
    'crusader': {
      name: 'Crusader',
      files: {}
    }
  };
  preRecordedVoiceOptions = Object.entries(this.PRE_RECORDED_VOICES).map(([key, value]) => ({ key, name: value.name }));

  private animationFrameId: number | null = null;
  private gameStateListenerCleanup?: () => void;
  
  detector = viewChild(DetectorComponent);
  private zone = inject(NgZone);

  constructor(private firebaseService: TeamDuelsFirebaseService) {}

  ngOnInit(): void {
    this.loadVoices();
    this.gameStateListenerCleanup = this.firebaseService.listenForGameState(this.sessionId(), (state) => {
        if (!state) return;
        
        const previousStatus = this.gameState()?.status;
        this.gameState.set(state);
        
        // Handle state transitions commanded by the display host
        if (state.status === 'idle' && previousStatus !== 'idle') {
            this.resetGame();
        }
        if (state.status === 'running' && previousStatus !== 'running') {
            this.detector()?.startDetection();
        }
        if (state.status === 'paused' || state.status === 'idle') {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    });
    this.resetGame(); // Send initial state
  }

  ngOnDestroy(): void {
    this.gameStateListenerCleanup?.();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = null;
    }
  }
  
  private loadVoices(): void {
    if ('speechSynthesis' in window) {
      const setVoices = () => {
        const voices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('de'));
        this.availableVoices.set(voices);
      };
      window.speechSynthesis.onvoiceschanged = setVoices;
      setVoices();
    }
  }

  private sendCurrentState(): void {
    this.firebaseService.updateClientState(this.sessionId(), this.deviceId(), {
      livepool: this.livepool(),
      lastReactionTime: this.lastReactionTime() ?? 0,
      initialLivepool: this.initialLivepool(),
      selectedVoiceURI: this.selectedVoiceURI()
    });
  }
  
  onInitialLivepoolChange(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      if (!isNaN(value) && value > 0) {
          this.initialLivepool.set(value);
          this.livepool.set(value); // also update current livepool if changed while idle
          this.sendCurrentState();
      }
  }

  onVoiceChange(event: Event) {
    this.selectedVoiceURI.set((event.target as HTMLSelectElement).value);
    this.sendCurrentState();
  }

  handleMotion(): void {
    if (this.gameState()?.status !== 'running' || this.detector()?.status() !== 'detecting') return;

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
      
      const reactionTime = (Date.now() - this.timerStartTime()!) / 1000;
      
      this.lastReactionTime.set(reactionTime);
      this.elapsedTime.set(reactionTime.toFixed(2));
      
      this.livepool.update(pool => pool - reactionTime);

      // Send update to Firebase
      this.sendCurrentState();

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
    const initialPool = this.initialLivepool();
    this.livepool.set(initialPool);
    this.timerStartTime.set(null);
    this.elapsedTime.set('0.00');
    this.lastReactionTime.set(null);

    // Send reset state to Firebase
    this.sendCurrentState();
  }
}
