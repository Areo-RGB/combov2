import { ChangeDetectionStrategy, Component, input, OnDestroy, OnInit, signal, viewChild, ElementRef, inject, computed } from '@angular/core';
import { DOCUMENT, CommonModule } from '@angular/common';
import { TeamDuelsFirebaseService, GameClientState, GameState } from '../../services/team-duels-firebase.service';
import { WebRTCService, Message } from '../../services/webrtc.service';

interface DisplayClient extends GameClientState {
  deviceId: string;
  connectionState: RTCPeerConnectionState;
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
  private firebaseSignalListenerCleanup?: () => void;
  
  // Audio state
  private startSoundAudio = new Audio();
  private announcementAudio = new Audio();
  private warningAudioPlayers = new Map<string, HTMLAudioElement>();
  private warningPlayedFlags = new Map<string, boolean>();
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
  private firebaseService = inject(TeamDuelsFirebaseService);
  private webrtcService = inject(WebRTCService);

  webrtcStatus = computed(() => {
    const clients = this.clients();
    if (clients.length === 0) {
      return { text: 'Awaiting players', color: 'text-gray-400', bgColor: 'bg-gray-500', isPinging: false };
    }

    const failed = clients.some(c => ['failed', 'closed'].includes(c.connectionState));
    if (failed) {
      return { text: 'Connection Issue', color: 'text-red-400', bgColor: 'bg-red-500', isPinging: false };
    }

    const disconnected = clients.some(c => c.connectionState === 'disconnected');
    if (disconnected) {
      return { text: 'Reconnecting...', color: 'text-yellow-400', bgColor: 'bg-yellow-500', isPinging: true };
    }
    
    const connecting = clients.some(c => c.connectionState === 'connecting' || c.connectionState === 'new');
    if (connecting) {
      return { text: 'Connecting...', color: 'text-yellow-400', bgColor: 'bg-yellow-500', isPinging: true };
    }
    
    return { text: 'Connections Stable', color: 'text-green-400', bgColor: 'bg-green-500', isPinging: false };
  });

  constructor() {
      this.document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }
  
  ngOnInit(): void {
    this.loadVoices();
    this.setupWebRTCListeners();

    // Listen for new clients joining the lobby
    this.clientListenerCleanup = this.firebaseService.listenForClients(this.sessionId(), (deviceId) => {
      // This callback fires once per new client.
      if (!this.clients().some(c => c.deviceId === deviceId)) {
        console.log(`New client detected: ${deviceId}. Initiating WebRTC connection.`);
        this.webrtcService.createConnectionAndOffer(deviceId);
        // Add a placeholder to our clients list
        this.clients.update(clients => [...clients, { deviceId, livepool: 0, lastReactionTime: 0, connectionState: 'new' }]);
      }
    });

    // Set initial game state in Firebase for any new clients to see
    this.firebaseService.setGameState(this.sessionId(), this.gameState());
  }

  private setupWebRTCListeners(): void {
    const hostId = 'display-host'; 
    
    // Setup signaling callbacks
    this.webrtcService.onSdpOffer = (targetId, sdp) => {
      this.firebaseService.sendSignal(this.sessionId(), targetId, { from: hostId, type: 'offer', data: sdp.toJSON() });
    };
    this.webrtcService.onIceCandidate = (targetId, candidate) => {
      this.firebaseService.sendSignal(this.sessionId(), targetId, { from: hostId, type: 'ice-candidate', data: candidate.toJSON() });
    };

    // Firebase listener for incoming signals from clients
    this.firebaseSignalListenerCleanup = this.firebaseService.listenForSignals(this.sessionId(), hostId, (signal) => {
        if (signal.type === 'answer') {
            this.webrtcService.handleAnswer(signal.from, signal.data);
        } else if (signal.type === 'ice-candidate') {
            this.webrtcService.addIceCandidate(signal.from, signal.data);
        }
    });

    // Handle messages received over data channels
    this.webrtcService.onMessageReceived = (peerId, message) => {
        this.handleClientMessage(peerId, message);
    };

    // Handle connection state changes
    this.webrtcService.onConnectionStateChange = (peerId, state) => {
        console.log(`Connection state with ${peerId} changed to ${state}`);
        this.clients.update(clients =>
            clients.map(c => c.deviceId === peerId ? { ...c, connectionState: state } : c)
        );

        // Keep disconnected clients in the list to allow for reconnection attempts.
        // Remove only if permanently failed or closed.
        if (state === 'failed' || state === 'closed') {
            // Use a timeout to allow the UI to show the final state before removal.
            setTimeout(() => {
                this.clients.update(currentClients => currentClients.filter(c => c.deviceId !== peerId));
                this.webrtcService.closeConnection(peerId);
            }, 3000);
        }
    };
  }

  private handleClientMessage(deviceId: string, message: Message): void {
    if (message.type === 'clientStateUpdate') {
      const newState: GameClientState = message.payload;
      const oldState = this.clients().find(c => c.deviceId === deviceId);

      if (oldState) {
          this.checkAndAnnounceThresholds(deviceId, oldState.livepool, newState);
          const hasPlayedWarning = this.warningPlayedFlags.get(deviceId) ?? false;
          if (newState.livepool < 10 && !hasPlayedWarning) {
              this.playWarningSoundForDevice(deviceId);
              this.warningPlayedFlags.set(deviceId, true);
          }
          if (newState.livepool <= 0) {
              this.stopWarningSoundForDevice(deviceId);
          }
      }

      this.clients.update(clients => 
        clients.map(c => c.deviceId === deviceId ? { ...c, ...newState, deviceId } : c).sort((a,b) => a.deviceId.localeCompare(b.deviceId))
      );
    }
  }
  
  ngOnDestroy(): void {
    this.clientListenerCleanup?.();
    this.firebaseSignalListenerCleanup?.();
    this.webrtcService.closeAllConnections();

    this.startSoundAudio.pause();
    this.announcementAudio.pause();
    this.stopAllWarningSounds();
    this.warningAudioPlayers.forEach(player => player.src = '');
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
    this.firebaseService.setGameState(this.sessionId(), newState); // For late joiners
    this.webrtcService.broadcastMessage({ type: 'gameStateUpdate', payload: newState });
    this.playStartSound();
  }

  pauseGame(): void {
    const newState: GameState = { ...this.gameState(), status: 'paused' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
    this.webrtcService.broadcastMessage({ type: 'gameStateUpdate', payload: newState });
  }

  resumeGame(): void {
    const newState: GameState = { ...this.gameState(), status: 'running' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
    this.webrtcService.broadcastMessage({ type: 'gameStateUpdate', payload: newState });
  }

  resetGame(): void {
    this.resetGameInternals();
    const newState: GameState = { ...this.gameState(), status: 'idle' };
    this.gameState.set(newState);
    this.firebaseService.setGameState(this.sessionId(), newState);
    this.webrtcService.broadcastMessage({ type: 'gameStateUpdate', payload: newState });
  }

  private resetGameInternals(): void {
    this.announcedThresholds.clear();
    this.stopAllWarningSounds();
    this.warningPlayedFlags.clear();
  }

  getLivepoolPercentage(client: DisplayClient): number {
    const initialPool = client.initialLivepool ?? this.gameState().initialLivepool;
    if (initialPool <= 0) return 0;
    const percentage = (client.livepool / initialPool) * 100;
    return Math.max(0, Math.min(100, percentage));
  }

  getClientBorderColor(state: RTCPeerConnectionState): string {
    switch (state) {
      case 'connected':
        return 'border-green-500';
      case 'connecting':
      case 'new':
        return 'border-yellow-500';
      case 'disconnected':
      case 'failed':
      case 'closed':
        return 'border-red-500';
      default:
        return 'border-gray-700';
    }
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

  private playWarningSoundForDevice(deviceId: string): void {
    let player = this.warningAudioPlayers.get(deviceId);
    if (!player) {
      player = new Audio();
      this.warningAudioPlayers.set(deviceId, player);
    }
    player.src = 'https://video-idea.fra1.cdn.digitaloceanspaces.com/warning-alarm-loop-1-279206.mp3';
    player.loop = true;
    player.play().catch(err => console.error(`Warning audio playback failed for ${deviceId}:`, err));
  }

  private stopWarningSoundForDevice(deviceId: string): void {
    const player = this.warningAudioPlayers.get(deviceId);
    if (player && !player.paused) {
      player.pause();
      player.currentTime = 0;
    }
  }

  private stopAllWarningSounds(): void {
    this.warningAudioPlayers.forEach(player => {
      if (!player.paused) {
        player.pause();
        player.currentTime = 0;
      }
    });
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
