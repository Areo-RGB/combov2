import { Injectable } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, onValue, off, Database } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
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

  writeMotion(sessionId: string): void {
    try {
      const motionRef = ref(this.db, `sessions/${sessionId}`);
      set(motionRef, {
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error writing to Firebase:", error);
    }
  }

  listenForMotion(sessionId: string, callback: (data: { timestamp: number } | null) => void): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    onValue(motionRef, (snapshot) => {
      callback(snapshot.val());
    }, (error) => {
      console.error("Error listening to Firebase:", error);
      callback(null);
    });
  }

  cleanupListener(sessionId: string): void {
    const motionRef = ref(this.db, `sessions/${sessionId}`);
    off(motionRef, 'value');
  }
}