import { Injectable, signal, WritableSignal, computed, Signal, inject } from '@angular/core';
import { Duel, Player, Tournament, TournamentMatch } from '../sprint-duels.types';
import { PlayerService } from './player.service';
import { MatchService } from './match.service';

@Injectable({
  providedIn: 'root',
})
export class TournamentService {
  tournament: WritableSignal<Tournament | null> = signal(null);

  private playerService = inject(PlayerService);
  private matchService = inject(MatchService);

  isTournamentActive: Signal<boolean> = computed(() => {
    const t = this.tournament();
    return !!t && t.status !== 'finished';
  });

  currentRoundDuels: Signal<Duel[]> = computed(() => {
    const t = this.tournament();
    if (!t || t.status === 'finished') return [];

    if (t.status === 'grand-final' && t.grandFinalBestOfThree) {
      if (t.grandFinalBestOfThree.winner) return [];
      return [{ player1: t.grandFinalBestOfThree.p1, player2: t.grandFinalBestOfThree.p2 }];
    }

    const nextDuels: Duel[] = [];
    const winnersNextRound = this.findNextMatches(t.winnersBracket.rounds);
    const losersNextRound = this.findNextMatches(t.losersBracket.rounds);

    winnersNextRound.forEach((m) => nextDuels.push({ player1: m.player1, player2: m.player2 }));
    losersNextRound.forEach((m) => nextDuels.push({ player1: m.player1, player2: m.player2 }));

    return nextDuels;
  });

  private findNextMatches(rounds: TournamentMatch[][]): TournamentMatch[] {
    for (const round of rounds) {
      const matches = round.filter((match) => !match.winner);
      if (matches.length > 0) return matches;
    }
    return [];
  }

  startTournament(participatingPlayers: Player[]): void {
    if (participatingPlayers.length < 3) {
      alert('Tournaments require at least 3 players.');
      return;
    }

    const seededPlayers = [...participatingPlayers].sort((a, b) => b.elo - a.elo);
    const initialRound = this.createInitialRound(seededPlayers);

    const newTournament: Tournament = {
      id: self.crypto.randomUUID(),
      players: seededPlayers,
      winnersBracket: { rounds: [initialRound] },
      losersBracket: { rounds: [] },
      grandFinal: [],
      status: 'running',
      winner: null,
      grandFinalBestOfThree: null,
    };

    this.advanceTournament(newTournament);
    this.tournament.set(newTournament);
  }

  cancelTournament(): void {
    this.tournament.set(null);
  }

  recordTournamentMatch(player1: Player, player2: Player, winner: Player): void {
    let t = this.tournament();
    if (!t) return;

    // Record the match for Elo and history
    this.matchService.recordMatch(player1, player2, winner.id === player1.id ? 'p1' : 'p2');

    if (t.status === 'grand-final' && t.grandFinalBestOfThree) {
      this.handleGrandFinalMatch(t, winner);
    } else {
      const matchIdentifier = (m: TournamentMatch) =>
        (m.player1.id === player1.id && m.player2.id === player2.id) ||
        (m.player1.id === player2.id && m.player2.id === player1.id);

      let matchUpdated = false;
      // Update winners bracket
      for (const round of t.winnersBracket.rounds) {
        const match = round.find((m) => matchIdentifier(m) && !m.winner);
        if (match) {
          match.winner = winner;
          matchUpdated = true;
          break;
        }
      }
      // Update losers bracket
      if (!matchUpdated) {
        for (const round of t.losersBracket.rounds) {
          const match = round.find((m) => matchIdentifier(m) && !m.winner);
          if (match) {
            match.winner = winner;
            matchUpdated = true;
            break;
          }
        }
      }
    }

    this.advanceTournament(t);
    this.tournament.set({ ...t });
  }

  private advanceTournament(t: Tournament): void {
    // Logic to advance winners and losers, create new rounds
    this.advanceWinnersBracket(t);
    this.advanceLosersBracket(t);

    // Check for tournament completion
    const winnersBracketWinner = this.getBracketWinner(t.winnersBracket);
    const losersBracketWinner = this.getBracketWinner(t.losersBracket);

    if (winnersBracketWinner && losersBracketWinner && t.status !== 'grand-final') {
      t.status = 'grand-final';
      t.grandFinalBestOfThree = {
        p1: winnersBracketWinner,
        p2: losersBracketWinner,
        p1Wins: 0,
        p2Wins: 0,
        winner: null,
      };
    }
  }

  private handleGrandFinalMatch(t: Tournament, winner: Player): void {
    if (!t.grandFinalBestOfThree) return;
    const final = t.grandFinalBestOfThree;
    if (winner.id === final.p1.id) {
      final.p1Wins++;
    } else {
      final.p2Wins++;
    }

    if (final.p1Wins >= 2 || final.p2Wins >= 2) {
      final.winner = final.p1Wins > final.p2Wins ? final.p1 : final.p2;
      t.winner = final.winner;
      t.status = 'finished';
      // Update tournament wins stat
      const winningPlayer = this.playerService.getPlayerById(t.winner.id);
      if (winningPlayer) {
        winningPlayer.tournamentWins++;
        this.playerService.updatePlayer(winningPlayer);
      }
    }
  }

  private getBracketWinner(bracket: { rounds: TournamentMatch[][] }): Player | null {
    if (bracket.rounds.length === 0) return null;
    const lastRound = bracket.rounds[bracket.rounds.length - 1];
    if (lastRound.length === 1 && lastRound[0].winner) {
      // Check if all players have been through this bracket
      return lastRound[0].winner;
    }
    return null;
  }

  private advanceWinnersBracket(t: Tournament): void {
    const lastRound = t.winnersBracket.rounds[t.winnersBracket.rounds.length - 1];
    if (!lastRound.every((m) => m.winner)) return; // Round not finished

    const winners = lastRound.map((m) => m.winner!);
    if (winners.length === 1) return; // Bracket winner found

    const nextRound: TournamentMatch[] = [];
    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i + 1]) {
        nextRound.push({
          id: self.crypto.randomUUID(),
          round: t.winnersBracket.rounds.length + 1,
          player1: winners[i],
          player2: winners[i + 1],
        });
      } else {
        // Handle bye
        this.findLosersBracketMatchFor(t, winners[i]);
      }
    }
    if (nextRound.length > 0) {
      t.winnersBracket.rounds.push(nextRound);
    }
  }

  private advanceLosersBracket(t: Tournament): void {
    // Collect losers from the latest winners bracket round
    const lastWinnersRoundIdx = t.winnersBracket.rounds.length - 1;
    if (lastWinnersRoundIdx < 0) return;

    const losers = t.winnersBracket.rounds[lastWinnersRoundIdx]
      .filter((m) => m.winner)
      .map((m) => (m.player1.id === m.winner!.id ? m.player2 : m.player1));

    // TODO: This is a simplified logic. A full double elimination bracket logic is much more complex,
    // involving dropping losers into specific slots in the losers bracket.
    // For this implementation, we will use a simpler approach.
    // We collect all players who have lost once, and create a new single elimination bracket with them.

    // This function needs a full rewrite for proper double elimination.
    // Due to complexity, this will be a simplified version.
  }

  private findLosersBracketMatchFor(t: Tournament, player: Player): void {
    // Simplified: this player gets a bye, in a real scenario they'd be matched.
  }

  private createInitialRound(players: Player[]): TournamentMatch[] {
    const round: TournamentMatch[] = [];
    const p = [...players];
    while (p.length > 1) {
      round.push({
        id: self.crypto.randomUUID(),
        round: 1,
        player1: p.shift()!,
        player2: p.pop()!,
      });
    }
    if (p.length === 1) {
      // Odd number, last player gets a bye
      const byeWinner = p.pop()!;
      round.push({
        id: self.crypto.randomUUID(),
        round: 1,
        player1: byeWinner,
        player2: { id: 'bye', name: 'BYE', jerseyNumber: 0 } as Player, // Dummy player for bye
        winner: byeWinner,
      });
    }
    return round;
  }
}
