import { Injectable } from '@angular/core';
import { Match } from '../sprint-duels.types';

declare const firebase: any;

@Injectable({ 
  providedIn: 'root' 
})
export class SprintDuelsFirebaseService {
  private db: any;
  private matchesRef: any;

  constructor() {
    if (typeof firebase !== 'undefined' && firebase.database) {
      this.db = firebase.database();
      this.matchesRef = this.db.ref('sprint-duels/matches');
    } else {
      console.error('Firebase is not initialized.');
    }
  }

  async writeMatch(match: Match): Promise<void> {
    if (!this.matchesRef) throw new Error('Firebase not initialized');
    const newMatchRef = this.matchesRef.child(match.id);
    await newMatchRef.set(match);
  }
  
  async getMatches(): Promise<Match[]> {
    if (!this.matchesRef) {
        console.warn('Firebase not available for fetching matches.');
        return [];
    };
    try {
        const snapshot = await this.matchesRef.orderByChild('timestamp').once('value');
        const matches: Match[] = [];
        if (snapshot.exists()) {
          snapshot.forEach((childSnapshot: any) => {
            matches.push(childSnapshot.val());
          });
        }
        return matches.sort((a, b) => b.timestamp - a.timestamp);
    } catch(error) {
        console.error("Could not fetch matches from Firebase:", error);
        return [];
    }
  }

  async deleteAllMatches(): Promise<void> {
    if (!this.matchesRef) throw new Error('Firebase not initialized');
    await this.matchesRef.remove();
  }
}
