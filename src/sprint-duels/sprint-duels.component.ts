import { ChangeDetectionStrategy, Component, output, signal, viewChild, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RankingListComponent } from './components/ranking-list/ranking-list.component';
import { MatchMakerComponent } from './components/match-maker/match-maker.component';
import { HistoryComponent } from './components/history/history.component';
import { SettingsComponent } from './components/settings/settings.component';
import { ToastComponent } from './components/toast/toast.component';

type ActiveTab = 'rankings' | 'match-maker' | 'history' | 'settings';

@Component({
  selector: 'app-sprint-duels',
  templateUrl: './sprint-duels.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RankingListComponent,
    MatchMakerComponent,
    HistoryComponent,
    SettingsComponent,
    ToastComponent
  ],
})
export class SprintDuelsComponent {
  goBack = output<void>();

  activeTab = signal<ActiveTab>('rankings');

  private matchMaker = viewChild(MatchMakerComponent);

  isArenaViewActive = computed(() => this.matchMaker()?.isArenaViewActive() ?? false);

  setActiveTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
  }

  getTabClass(tab: ActiveTab): string {
    return this.activeTab() === tab
      ? 'bg-blue-600 text-white'
      : 'text-gray-300 hover:text-white';
  }
}