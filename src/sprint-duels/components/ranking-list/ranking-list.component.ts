import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { PlayerService } from '../../services/player.service';
import { MatchService } from '../../services/match.service';
import { Player } from '../../sprint-duels.types';
import { CommonModule } from '@angular/common';

interface HeadToHeadStats {
  opponentName: string;
  opponentJersey: number;
  wins: number;
  losses: number;
  draws: number;
}

@Component({
  selector: 'app-ranking-list',
  templateUrl: './ranking-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class RankingListComponent {
  playerService = inject(PlayerService);
  matchService = inject(MatchService);

  expandedPlayerId = signal<string | null>(null);

  rankedPlayers = computed(() => {
    return [...this.playerService.players()].sort((a, b) => b.elo - a.elo);
  });

  headToHeadStats = computed(() => {
    const expandedId = this.expandedPlayerId();
    if (!expandedId) return null;

    const statsMap = new Map<string, HeadToHeadStats>();
    const matches = this.matchService.matchHistory();

    for (const match of matches) {
      let opponentId: string | null = null;
      let result: 'win' | 'loss' | 'draw';

      if (match.player1Id === expandedId) {
        opponentId = match.player2Id;
        if (match.winnerId === expandedId) result = 'win';
        else if (match.winnerId === null) result = 'draw';
        else result = 'loss';
      } else if (match.player2Id === expandedId) {
        opponentId = match.player1Id;
        if (match.winnerId === expandedId) result = 'win';
        else if (match.winnerId === null) result = 'draw';
        else result = 'loss';
      }

      if (opponentId) {
        const opponent = this.playerService.getPlayerById(opponentId);
        if (!opponent) continue;
        
        if (!statsMap.has(opponentId)) {
          statsMap.set(opponentId, {
            opponentName: opponent.name,
            opponentJersey: opponent.jerseyNumber,
            wins: 0, losses: 0, draws: 0
          });
        }

        const currentStats = statsMap.get(opponentId)!;
        if (result === 'win') currentStats.wins++;
        else if (result === 'loss') currentStats.losses++;
        else currentStats.draws++;
      }
    }
    return Array.from(statsMap.values()).sort((a,b) => a.opponentName.localeCompare(b.opponentName));
  });

  toggleExpand(playerId: string): void {
    this.expandedPlayerId.update(current => current === playerId ? null : playerId);
  }

  getWinPercentage(stats: HeadToHeadStats): number {
    const total = stats.wins + stats.losses;
    if (total === 0) return 50;
    return (stats.wins / total) * 100;
  }

  getEloChangeClass(player: Player): string {
    if (player.lastEloChange === undefined || player.lastEloChange === 0) return 'text-gray-400';
    return player.lastEloChange > 0 ? 'text-green-400' : 'text-red-400';
  }
}
