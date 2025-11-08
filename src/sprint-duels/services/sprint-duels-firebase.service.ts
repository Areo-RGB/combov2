import { Injectable } from '@angular/core';
import { Match } from '../sprint-duels.types';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, get, query, orderByChild, remove, Database } from 'firebase/database';
import { firebaseConfig } from '../../firebase.config';

@Injectable({ 
  providedIn: 'root' 
})
export class SprintDuelsFirebaseService {
  private app: FirebaseApp;
  private db: Database;
  private matchesRefPath = 'sprint-duels/matches';

  constructor() {
    if (!getApps().length) {
      this.app = initializeApp(firebaseConfig);
    } else {
      this.app = getApp();
    }
    this.db = getDatabase(this.app);
  }

  async writeMatch(match: Match): Promise<void> {
    const newMatchRef = ref(this.db, `${this.matchesRefPath}/${match.id}`);
    await set(newMatchRef, match);
  }
  
  async getMatches(): Promise<Match[]> {
    try {
      const matchesRef = ref(this.db, this.matchesRefPath);
      const matchesQuery = query(matchesRef, orderByChild('timestamp'));
      const snapshot = await get(matchesQuery);

      const matches: Match[] = [];
      if (snapshot.exists()) {
        snapshot.forEach((childSnapshot) => {
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
    const matchesRef = ref(this.db, this.matchesRefPath);
    await remove(matchesRef);
  }
}