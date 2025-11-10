import { ChangeDetectionStrategy, Component, output, signal, viewChild, OnDestroy, inject, NgZone, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DetectorComponent } from '../components/detector/detector.component';
import { TeamDuelsLobbyComponent } from './components/lobby/lobby.component';
import { GameClientComponent } from './components/game-client/game-client.component';
import { DisplayHostComponent } from './components/display-host/display-host.component';
import { TeamDuelsFirebaseService } from './services/team-duels-firebase.service';

@Component({
  selector: 'app-team-duels',
  templateUrl: './team-duels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, 
    DetectorComponent,
    TeamDuelsLobbyComponent,
    GameClientComponent,
    DisplayHostComponent
  ],
  providers: [TeamDuelsFirebaseService] // Scope service to this feature
})
export class TeamDuelsComponent implements OnDestroy, OnInit {
  goBack = output<void>();

  mode = signal<'selection' | 'single-device' | 'lobby' | 'game-client' | 'display-host'>('selection');

  // Multi-device state
  sessionId = signal<string | null>(null);
  deviceId = signal<string>('');
  role = signal<'game' | 'display' | null>(null);

  // --- SINGLE DEVICE STATE (Kept for single device mode) ---
  livepool = signal(60);
  initialLivepool = signal(60);
  timerStartTime = signal<number | null>(null);
  elapsedTime = signal<string>('0.00');
  lastReactionTime = signal<number | null>(null);
  gameState = signal<'idle' | 'running' | 'paused'>('idle');
  private animationFrameId: number | null = null;
  
  // Audio state for single-device mode
  private startSoundAudio = new Audio();
  private announcementAudio = new Audio();
  private announcedThresholds = signal<Set<number>>(new Set());
  availableVoices = signal<SpeechSynthesisVoice[]>([]);
  selectedVoiceURI = signal<string>('default');

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

  preRecordedVoiceOptions = Object.entries(this.PRE_RECORDED_VOICES).map(([key, value]) => ({ key, name: value.name }));
  
  detector = viewChild(DetectorComponent);
  private zone = inject(NgZone);
  private firebaseService = inject(TeamDuelsFirebaseService);

  ngOnInit(): void {
    this.loadVoices();
    // Create a persistent device ID for multi-device mode
    let storedId = localStorage.getItem('team-duels-deviceId');
    if (!storedId) {
      storedId = self.crypto.randomUUID();
      localStorage.setItem('team-duels-deviceId', storedId);
    }
    this.deviceId.set(storedId);
  }

  ngOnDestroy(): void {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    this.startSoundAudio.pause();
    this.startSoundAudio.src = '';
    this.announcementAudio.pause();
    this.announcementAudio.src = '';
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.onvoiceschanged = null;
    }
    // Disconnect from Firebase when leaving the feature entirely
    this.firebaseService.disconnect();
  }

  // --- Mode Navigation ---
  startSingleDeviceMode(): void {
    this.mode.set('single-device');
  }

  startMultiDeviceMode(): void {
    this.firebaseService.connect(); // Ensure we are connected for the lobby
    this.mode.set('lobby');
  }

  onSessionStarted(event: { sessionId: string, role: 'game' | 'display' }): void {
    this.sessionId.set(event.sessionId);
    this.role.set(event.role);
    this.mode.set(event.role === 'game' ? 'game-client' : 'display-host');
  }

  goBackToSelection(): void {
    this.resetGame(); // Reset single player game state
    this.mode.set('selection');
    // Clear multi-device state and disconnect
    this.sessionId.set(null);
    this.role.set(null);
    this.firebaseService.disconnect();
  }

  onGoBackToMenu(): void {
    this.goBack.emit();
  }

  // --- SINGLE DEVICE LOGIC ---
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

  private speak(text: string): void {
    const selectedVoiceKey = this.selectedVoiceURI();
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
      const selectedVoice = this.availableVoices().find(v => v.voiceURI === this.selectedVoiceURI());
      if (selectedVoice) utterance.voice = selectedVoice;
      utterance.lang = 'de-DE';
      utterance.pitch = 1.0;
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  }

  private checkAndAnnounceThresholds(oldValue: number, newValue: number): void {
    const thresholds: { value: number; text: string }[] = [
        { value: 50, text: 'fünfzig' }, { value: 40, text: 'vierzig' },
        { value: 30, text: 'dreißig' }, { value: 20, text: 'zwanzig' },
        { value: 10, text: 'zehn' }, { value: 5, text: 'fünf' },
        { value: 3, text: 'drei' },
    ];
    const announced = this.announcedThresholds();
    for (const threshold of thresholds) {
        if (oldValue > threshold.value && newValue <= threshold.value && !announced.has(threshold.value)) {
            this.speak(threshold.text);
            this.announcedThresholds.update(s => s.add(threshold.value));
        }
    }
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

  handleMotion(): void {
    if (this.gameState() !== 'running' || this.detector()?.status() !== 'detecting') return;

    if (this.timerStartTime() === null) {
      this.timerStartTime.set(Date.now());
      this.lastReactionTime.set(null);
      this.runTimer();
    } else {
      if (this.animationFrameId) {
        cancelAnimationFrame(this.animationFrameId);
        this.animationFrameId = null;
      }
      const reactionTime = (Date.now() - this.timerStartTime()!) / 1000;
      this.lastReactionTime.set(reactionTime);
      this.elapsedTime.set(reactionTime.toFixed(2));
      const oldPool = this.livepool();
      const newPool = oldPool - reactionTime;
      this.livepool.set(newPool);
      this.checkAndAnnounceThresholds(oldPool, newPool);
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
    this.announcedThresholds.set(new Set());
  }
  
  onInitialLivepoolChange(event: Event) {
      const value = Number((event.target as HTMLInputElement).value);
      if (!isNaN(value) && value > 0) {
          this.initialLivepool.set(value);
          this.resetGame();
      }
  }

  onVoiceChange(event: Event) {
    this.selectedVoiceURI.set((event.target as HTMLSelectElement).value);
  }

  getLivepoolPercentage(): number {
    const percentage = (this.livepool() / this.initialLivepool()) * 100;
    return Math.max(0, Math.min(100, percentage));
  }
}
