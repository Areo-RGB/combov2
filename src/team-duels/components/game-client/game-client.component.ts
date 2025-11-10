import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, signal, viewChild, inject, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetectorComponent } from '../../../components/detector/detector.component';
import { TeamDuelsFirebaseService, GameState, GameClientState } from '../../services/team-duels-firebase.service';
import { WebRTCService, Message } from '../../services/webrtc.service';

@Component({
  selector: 'app-game-client',
  templateUrl: './game-client.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DetectorComponent],
})
export class GameClientComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();
  deviceId = input.required<string>();

  // Local state mirrored from Host
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
  private firebaseSignalListenerCleanup?: () => void;
  
  detector = viewChild(DetectorComponent);
  private zone = inject(NgZone);
  private firebaseService = inject(TeamDuelsFirebaseService);
  private webrtcService = inject(WebRTCService);

  ngOnInit(): void {
    this.loadVoices();
    this.setupWebRTCListeners();
    // Announce presence to the host
    this.firebaseService.setClientPresence(this.sessionId(), this.deviceId());
  }

  ngOnDestroy(): void {
    this.firebaseSignalListenerCleanup?.();
    this.webrtcService.closeAllConnections();
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = null;
    }
  }
  
  private setupWebRTCListeners(): void {
    const hostId = 'display-host';

    // Setup signaling callbacks
    this.webrtcService.onSdpAnswer = (targetId, sdp) => {
      this.firebaseService.sendSignal(this.sessionId(), targetId, { from: this.deviceId(), type: 'answer', data: sdp.toJSON() });
    };
    this.webrtcService.onIceCandidate = (targetId, candidate) => {
      this.firebaseService.sendSignal(this.sessionId(), targetId, { from: this.deviceId(), type: 'ice-candidate', data: candidate.toJSON() });
    };

    // Listen for signals from host via Firebase
    this.firebaseSignalListenerCleanup = this.firebaseService.listenForSignals(this.sessionId(), this.deviceId(), (signal) => {
        if (signal.type === 'offer') {
            this.webrtcService.handleOfferAndCreateAnswer(signal.from, signal.data);
        } else if (signal.type === 'ice-candidate') {
            this.webrtcService.addIceCandidate(signal.from, signal.data);
        }
    });

    // Handle incoming messages from host
    this.webrtcService.onMessageReceived = (peerId, message) => {
        if (peerId === hostId && message.type === 'gameStateUpdate') {
            this.handleHostMessage(message.payload);
        }
    };
    
    // When data channel opens, send initial state
    this.webrtcService.onDataChannelOpen = (peerId) => {
        if (peerId === hostId) {
            this.sendCurrentState();
        }
    };

    this.webrtcService.onConnectionStateChange = (peerId, state) => {
        console.log(`Connection state with ${peerId} changed to ${state}`);
        if (state === 'connected') {
            this.gameState.update(s => s ? { ...s, status: 'idle' } : { status: 'idle', initialLivepool: 60 });
        } else if (state === 'failed' || state === 'disconnected') {
            this.gameState.set(null); // Show connecting status
        }
    };
  }

  private handleHostMessage(state: GameState): void {
      const previousStatus = this.gameState()?.status;
      this.gameState.set(state);
      
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
    const state: GameClientState = {
      livepool: this.livepool(),
      lastReactionTime: this.lastReactionTime() ?? 0,
      initialLivepool: this.initialLivepool(),
      selectedVoiceURI: this.selectedVoiceURI()
    };
    this.webrtcService.sendMessage('display-host', { type: 'clientStateUpdate', payload: state });
  }
  
  onInitialLivepoolChange(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      if (!isNaN(value) && value > 0) {
          this.initialLivepool.set(value);
          if (this.gameState()?.status === 'idle') {
            this.livepool.set(value);
            this.sendCurrentState();
          }
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

      // Send update to Host via WebRTC
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

    this.sendCurrentState();
  }
}