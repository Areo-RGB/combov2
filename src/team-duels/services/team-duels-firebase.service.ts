import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, off, Database, goOffline, goOnline } from 'firebase/database';
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

  // Used by Display Host
  async setGameState(sessionId: string, state: GameState): Promise<void> {
    const stateRef = ref(this.db, `${this.basePath}/${sessionId}/gameState`);
    await set(stateRef, state);
  }

  listenForClients(sessionId: string, callback: (clients: { [deviceId: string]: GameClientState }) => void): () => void {
    const clientsRef = ref(this.db, `${this.basePath}/${sessionId}/clients`);
    onValue(clientsRef, (snapshot) => {
      callback(snapshot.val() ?? {});
    });
    return () => off(clientsRef);
  }

  // Used by Game Client
  async updateClientState(sessionId: string, deviceId: string, state: GameClientState): Promise<void> {
    const clientRef = ref(this.db, `${this.basePath}/${sessionId}/clients/${deviceId}`);
    await set(clientRef, state);
  }
  
  listenForGameState(sessionId: string, callback: (state: GameState | null) => void): () => void {
    const stateRef = ref(this.db, `${this.basePath}/${sessionId}/gameState`);
    onValue(stateRef, (snapshot) => {
      callback(snapshot.val());
    });
    return () => off(stateRef);
  }
  
  disconnect() {
    goOffline(this.db);
  }
  
  connect() {
    goOnline(this.db);
  }
}
