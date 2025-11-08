import { Injectable } from '@angular/core';

declare const firebase: any;

@Injectable({
  providedIn: 'root',
})
export class FirebaseService {
  private db: any;

  constructor() {
    if (typeof firebase !== 'undefined' && firebase.database) {
      this.db = firebase.database();
    } else {
      console.error('Firebase is not initialized. Make sure the Firebase scripts are included in index.html and configured correctly.');
    }
  }

  writeMotion(sessionId: string): void {
    if (!this.db) return;
    try {
      const motionRef = this.db.ref(`sessions/${sessionId}`);
      motionRef.set({
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Error writing to Firebase:", error);
    }
  }

  listenForMotion(sessionId: string, callback: (data: { timestamp: number } | null) => void): void {
    if (!this.db) return;
    const motionRef = this.db.ref(`sessions/${sessionId}`);
    motionRef.on('value', (snapshot: any) => {
      callback(snapshot.val());
    }, (error: any) => {
      console.error("Error listening to Firebase:", error);
      callback(null);
    });
  }

  cleanupListener(sessionId: string): void {
    if (!this.db) return;
    const motionRef = this.db.ref(`sessions/${sessionId}`);
    motionRef.off('value');
  }
}
