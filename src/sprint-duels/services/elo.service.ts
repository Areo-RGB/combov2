import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EloService {
  // K-factor determines how much ratings change. Higher K = more volatile.
  private readonly K_FACTOR = 32;

  /**
   * Calculates the win probability of player A against player B.
   * @param eloA Elo rating of player A.
   * @param eloB Elo rating of player B.
   * @returns The probability (0-1) of player A winning.
   */
  calculateWinProbability(eloA: number, eloB: number): number {
    return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
  }

  /**
   * Calculates the new Elo ratings for two players after a match.
   * @param eloA Elo rating of player A.
   * @param eloB Elo rating of player B.
   * @param result Result from player A's perspective: 1 for win, 0.5 for draw, 0 for loss.
   * @returns An object with the new ratings and the change for each player.
   */
  calculateNewRatings(eloA: number, eloB: number, result: 1 | 0.5 | 0): { newEloA: number, newEloB: number, changeA: number, changeB: number } {
    const probabilityA = this.calculateWinProbability(eloA, eloB);
    const probabilityB = 1 - probabilityA;

    const changeA = Math.round(this.K_FACTOR * (result - probabilityA));
    const changeB = Math.round(this.K_FACTOR * ((1 - result) - probabilityB));

    return {
      newEloA: eloA + changeA,
      newEloB: eloB + changeB,
      changeA,
      changeB
    };
  }
}
