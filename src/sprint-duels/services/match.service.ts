import { Injectable, signal, WritableSignal, inject } from '@angular/core';
import { Match, Player } from '../sprint-duels.types';
import { StorageService } from './storage.service';
import { SprintDuelsFirebaseService } from './sprint-duels-firebase.service';
import { PlayerService } from './player.service';
import { EloService } from './elo.service';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class MatchService {
  matchHistory: WritableSignal<Match[]> = signal([]);
  isLoading = signal(true);

  private storageService = inject(StorageService);
  private firebaseService = inject(SprintDuelsFirebaseService);
  private playerService = inject(PlayerService);
  private eloService = inject(EloService);
  private toastService = inject(ToastService);

  constructor() {
    this.loadMatchHistory();
  }

  async loadMatchHistory(): Promise<void> {
    this.isLoading.set(true);
    try {
      // Prioritize Firebase
      const firebaseHistory = await this.firebaseService.getMatches();
      if (firebaseHistory.length > 0) {
        this.matchHistory.set(firebaseHistory);
        this.storageService.set('matchHistory', firebaseHistory); // Sync local
      } else {
        // Fallback to local storage if Firebase is empty or unavailable
        const localHistory = this.storageService.get<Match[]>('matchHistory') || [];
        this.matchHistory.set(localHistory);
      }
    } catch (error) {
      console.error('Error loading match history:', error);
      this.toastService.show('Could not load remote history, using local backup.', 'info');
      const localHistory = this.storageService.get<Match[]>('matchHistory') || [];
      this.matchHistory.set(localHistory);
    } finally {
      this.isLoading.set(false);
    }
  }

  recordMatch(player1: Player, player2: Player, result: 'p1' | 'p2' | 'draw'): void {
    const resultValue = result === 'p1' ? 1 : result === 'p2' ? 0 : 0.5;

    const { newEloA, newEloB, changeA, changeB } = this.eloService.calculateNewRatings(
      player1.elo,
      player2.elo,
      resultValue
    );

    // Update Player 1
    const updatedP1: Player = {
      ...player1,
      elo: newEloA,
      lastEloChange: changeA,
      stats: {
        ...player1.stats,
        wins: player1.stats.wins + (result === 'p1' ? 1 : 0),
        losses: player1.stats.losses + (result === 'p2' ? 1 : 0),
        draws: player1.stats.draws + (result === 'draw' ? 1 : 0),
      },
    };

    // Update Player 2
    const updatedP2: Player = {
      ...player2,
      elo: newEloB,
      lastEloChange: changeB,
      stats: {
        ...player2.stats,
        wins: player2.stats.wins + (result === 'p2' ? 1 : 0),
        losses: player2.stats.losses + (result === 'p1' ? 1 : 0),
        draws: player2.stats.draws + (result === 'draw' ? 1 : 0),
      },
    };

    this.playerService.updateMultiplePlayers([updatedP1, updatedP2]);

    const newMatch: Match = {
      id: self.crypto.randomUUID(),
      player1Id: player1.id,
      player2Id: player2.id,
      player1Name: player1.name,
      player2Name: player2.name,
      player1Jersey: player1.jerseyNumber,
      player2Jersey: player2.jerseyNumber,
      winnerId: result === 'p1' ? player1.id : result === 'p2' ? player2.id : null,
      eloChangeP1: changeA,
      eloChangeP2: changeB,
      timestamp: Date.now(),
    };

    this.addMatchToHistory(newMatch);
  }

  private async addMatchToHistory(match: Match): Promise<void> {
    const updatedHistory = [match, ...this.matchHistory()];
    this.matchHistory.set(updatedHistory);
    this.storageService.set('matchHistory', updatedHistory);

    try {
      await this.firebaseService.writeMatch(match);
    } catch (error) {
      console.error('Failed to save match to Firebase, saved locally.', error);
      this.toastService.show('Could not save match online, saved locally.', 'error');
    }
  }

  async clearHistory(): Promise<void> {
    this.matchHistory.set([]);
    this.storageService.remove('matchHistory');
    try {
      await this.firebaseService.deleteAllMatches();
      this.toastService.show('Match history cleared successfully.', 'success');
    } catch (error) {
      console.error('Failed to clear Firebase history.', error);
      this.toastService.show('Could not clear online history.', 'error');
    }
  }
}
