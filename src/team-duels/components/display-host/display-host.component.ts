import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, signal, viewChild, ElementRef, inject } from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { TeamDuelsFirebaseService, GameClientState, GameState } from '../../services/team-duels-firebase.service';

interface DisplayClient extends GameClientState {
  deviceId: string;
}

@Component({
  selector: 'app-display-host',
  templateUrl: './display-host.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class DisplayHostComponent implements OnInit, OnDestroy {
  sessionId = input.required<string>();

  clients = signal<DisplayClient[]>([]);
  gameState = signal<GameState>({ status: 'idle', initialLivepool: 60 });
  
  private clientListenerCleanup?: () => void;
  
  // Audio state
  private startSoundAudio = new Audio();
  private announcementAudio = new Audio();
  private announcedThresholds = new Map<string, Set<number>>(); // deviceId -> Set of announced thresholds
  availableVoices = signal<SpeechSynthesisVoice[]>([]);

  private readonly PRE_RECORDED_VOICES: { [key: string]: { name: string; files: { [key: string]: string } } } = {
    'default': {
      name: 'Pre-recorded (Default)',
      files: {
        'fünfzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785980/f%C3%BCnfzig',
        'vierzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785981/vierzig',
        'dreißig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785982/drei%C3%9Fig',
        'zwanzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785984/zwanzig',
        'zehn': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785985/zehn',
        'fünf': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785985/f%C3%BCnf',
        'drei': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762785986/drei'
      }
    },
    'crusader': {
      name: 'Crusader',
      files: {
        'fünfzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786496/f%C3%BCnfzig_crusader',
        'vierzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786497/vierzig_crusader',
        'dreißig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786498/drei%C3%9Fig_crusader',
        'zwanzig': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786499/zwanzig_crusader',
        'zehn': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786499/zehn_crusader',
        'fünf': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786500/f%C3%BCnf_crusader',
        'drei': 'https://res.cloudinary.com/dg8zbx8ja/raw/upload/v1762786501/drei_crusader'
      }
    }
  };

  private document: Document = inject(DOCUMENT);
  container = viewChild.required<ElementRef>('container');
  isFullScreen = signal(!!this.document.fullscreenElement);

  constructor(private firebaseService: TeamDuelsFirebaseService) {
      this.document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }
  
  ngOnInit(): void {
    this.loadVoices();
    // FIX: Explicitly type `clientsData` to prevent `newState` from being inferred as `unknown`.
    this.clientListenerCleanup = this.firebaseService.listenForClients(this.sessionId(), (clientsData: { [key: string]: GameClientState }) => {
        const previousClients = new Map(this.clients().map(c => [c.deviceId, c]));
        const clientList: DisplayClient[] = [];

        for (const deviceId in clientsData) {
            const newState = clientsData[deviceId];
            const oldState = previousClients.get(deviceId);
            
            if (oldState) {
                this.checkAndAnnounceThresholds(deviceId, oldState.livepool, newState);
            }
            clientList.push({ deviceId, ...newState });
        }
        this.clients.set(clientList.sort((a,b) => a.deviceId.localeCompare(b.deviceId)));
    });
    // Set initial game state in Firebase
    this.firebaseService.setGameState(this.sessionId(), this.gameState());
  }
  
  ngOnDestroy(): void {
    this.clientListenerCleanup?.();
    this.startSoundAudio.pause();
    this.announcementAudio.pause();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    }
    this.document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }

  // --- Game Control ---
  startGame(): void {
    this.resetGameInternals();
    const newState: GameState = { ...this.gameState(), status: 'running' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
    this.playStartSound();
  }

  pauseGame(): void {
    const newState: GameState = { ...this.gameState(), status: 'paused' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
  }

  resumeGame(): void {
    const newState: GameState = { ...this.gameState(), status: 'running' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
  }

  resetGame(): void {
    this.resetGameInternals();
    const newState: GameState = { ...this.gameState(), status: 'idle' };
    this.gameState.set(newState);
    // Setting the global game state is sufficient.
    // Clients listen for this change and will reset their own state.
    this.firebaseService.setGameState(this.sessionId(), newState);
  }

  private resetGameInternals(): void {
    this.announcedThresholds.clear();
  }

  getLivepoolPercentage(client: DisplayClient): number {
    const initialPool = client.initialLivepool ?? this.gameState().initialLivepool;
    if (initialPool === 0) return 0;
    const percentage = (client.livepool / initialPool) * 100;
    return Math.max(0, Math.min(100, percentage));
  }

  toggleFullscreen(): void {
    const elem = this.container().nativeElement;
    if (!this.document.fullscreenElement) {
      elem.requestFullscreen().catch((err: any) => {
        console.error(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
      });
    } else {
      this.document.exitFullscreen();
    }
  }

  private onFullscreenChange = (): void => {
    this.isFullScreen.set(!!this.document.fullscreenElement);
  };
  
  // --- Audio Logic ---
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

  private playStartSound(): void {
    this.startSoundAudio.src = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/beeps/start-sound-beep-102201.mp3';
    this.startSoundAudio.play().catch(err => console.error("Audio playback failed:", err));
  }

  private speak(text: string, voiceURI: string): void {
    const selectedVoiceKey = voiceURI;
    const preRecordedVoicePack = this.PRE_RECORDED_VOICES[selectedVoiceKey];

    if (preRecordedVoicePack) {
      const url = preRecordedVoicePack.files[text];
      if (url) {
        this.announcementAudio.src = url;
        this.announcementAudio.play().catch(err => console.error("Audio playback failed:", err));
      }
    } else {
      if (!('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const selectedVoice = this.availableVoices().find(v => v.voiceURI === selectedVoiceKey);
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.lang = 'de-DE';
      utterance.pitch = 1.0;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }

  private checkAndAnnounceThresholds(deviceId: string, oldValue: number, newState: GameClientState): void {
    const thresholds: { value: number; text: string }[] = [
        { value: 50, text: 'fünfzig' }, { value: 40, text: 'vierzig' },
        { value: 30, text: 'dreißig' }, { value: 20, text: 'zwanzig' },
        { value: 10, text: 'zehn' }, { value: 5, text: 'fünf' },
        { value: 3, text: 'drei' },
    ];
    if (!this.announcedThresholds.has(deviceId)) {
        this.announcedThresholds.set(deviceId, new Set());
    }
    const announced = this.announcedThresholds.get(deviceId)!;
    for (const threshold of thresholds) {
        if (oldValue > threshold.value && newState.livepool <= threshold.value && !announced.has(threshold.value)) {
            this.speak(threshold.text, newState.selectedVoiceURI ?? 'default');
            announced.add(threshold.value);
        }
    }
  }
}