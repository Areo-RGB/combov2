import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatchService } from '../../services/match.service';
import { Match } from '../../sprint-duels.types';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-history',
  templateUrl: './history.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class HistoryComponent {
  matchService = inject(MatchService);

  getEloChangeClass(change: number): string {
    if (change === 0) return 'text-gray-400';
    return change > 0 ? 'text-green-400' : 'text-red-400';
  }
}
