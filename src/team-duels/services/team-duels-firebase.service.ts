import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, off, Database, goOffline, goOnline, remove, onChildAdded } from 'firebase/database';
import { firebaseConfig } from '../../firebase.config';

export interface GameClientState {
  livepool: number;
  lastReactionTime: number;
  initialLivepool?: number;
  selectedVoiceURI?: string;
}

export interface GameState {
  status: 'idle' | 'running' | 'paused';
  initialLivepool: number;
}

export interface Signal {
  from: string;
  type: 'offer' | 'answer' | 'ice-candidate';
  data: any;
}


@Injectable()
export class TeamDuelsFirebaseService {
  private app: FirebaseApp;
  private db: Database;
  private basePath = 'team-duels';

  constructor() {
    if (!getApps().length) {
      this.app = initializeApp(firebaseConfig);
    } else {
      this.app = getApp();
    }
    this.db = getDatabase(this.app);
  }

  // --- Presence Methods ---

  listenForClients(sessionId: string, onClientAdded: (deviceId: string) => void): () => void {
    const clientsRef = ref(this.db, `${this.basePath}/${sessionId}/clients`);
    const unsubscribe = onChildAdded(clientsRef, (snapshot) => {
      onClientAdded(snapshot.key!);
    });
    return unsubscribe;
  }

  async setClientPresence(sessionId: string, deviceId: string): Promise<void> {
    const clientRef = ref(this.db, `${this.basePath}/${sessionId}/clients/${deviceId}`);
    await set(clientRef, { isPresent: true });
  }

  // --- Signaling Methods ---

  async sendSignal(sessionId: string, to: string, signal: Signal): Promise<void> {
    const signalRef = ref(this.db, `${this.basePath}/${sessionId}/signals/${to}/${self.crypto.randomUUID()}`);
    await set(signalRef, signal);
  }

  listenForSignals(sessionId: string, myId: string, callback: (signal: Signal) => void): () => void {
    const signalsRef = ref(this.db, `${this.basePath}/${sessionId}/signals/${myId}`);
    // Use onChildAdded to process signals as they arrive and avoid race conditions.
    const unsubscribe = onChildAdded(signalsRef, (snapshot) => {
      if (snapshot.exists()) {
        const signal = snapshot.val() as Signal;
        callback(signal);
        // Remove the individual signal after it has been processed.
        remove(snapshot.ref);
      }
    });
    // The return from onChildAdded is the unsubscribe function.
    return unsubscribe;
  }

  // --- Game State (for late joiners) ---

  async setGameState(sessionId: string, state: GameState): Promise<void> {
    const stateRef = ref(this.db, `${this.basePath}/${sessionId}/gameState`);
    await set(stateRef, state);
  }
  
  // --- Connection Management ---
  
  disconnect() {
    goOffline(this.db);
  }
  
  connect() {
    goOnline(this.db);
  }
}