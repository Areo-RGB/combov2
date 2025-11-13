import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, onValue, off, Database } from 'firebase/database';
import { firebaseConfig } from '../firebase.config';

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private app: FirebaseApp;
  private db: Database;

  constructor() {
    if (!getApps().length) {
      this.app = initializeApp(firebaseConfig);
    } else {
      this.app = getApp();
    }
    this.db = getDatabase(this.app);
  }

  writeMotion(sessionId: string, intensity: number): void {
    try {
      const motionRef = ref(this.db, `sessions/${sessionId}`);
      set(motionRef, {
        timestamp: Date.now(),
        intensity: intensity,
      });
    } catch (error) {
      console.error('Error writing to Firebase:', error);
    }
  }

  listenForMotion(
    sessionId: string,
    callback: (data: { timestamp: number; intensity?: number } | null) => void
  ): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    onValue(
      motionRef,
      (snapshot) => {
        callback(snapshot.val());
      },
      (error) => {
        console.error('Error listening to Firebase:', error);
        callback(null);
      }
    );
  }

  cleanupListener(sessionId: string): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    off(motionRef, 'value');
  }
}
