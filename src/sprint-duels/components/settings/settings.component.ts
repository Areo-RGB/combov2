import { ChangeDetectionStrategy, Component, inject, signal, ElementRef, viewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PlayerService } from '../../services/player.service';
import { MatchService } from '../../services/match.service';
import { ToastService } from '../../services/toast.service';
import { AudioService } from '../../services/audio.service';
import { StorageService } from '../../services/storage.service';
import { ConfirmationModalComponent } from '../confirmation-modal/confirmation-modal.component';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmationModalComponent],
})
export class SettingsComponent {
  private document: Document = inject(DOCUMENT);
  playerService = inject(PlayerService);
  matchService = inject(MatchService);
  toastService = inject(ToastService);
  audioService = inject(AudioService);
  storageService = inject(StorageService);

  showResetAllModal = signal(false);
  
  isFullScreen = signal(!!this.document.fullscreenElement);

  constructor() {
    this.document.addEventListener('fullscreenchange', () => {
      this.isFullScreen.set(!!this.document.fullscreenElement);
    });
  }

  toggleFullscreen(): void {
    if (!this.document.fullscreenElement) {
      this.document.documentElement.requestFullscreen();
    } else {
      this.document.exitFullscreen();
    }
  }

  onAudioToggle(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.audioService.toggleAudio(enabled);
  }
  
  resetPlayer(playerId: string): void {
      const player = this.playerService.resetPlayer(playerId);
      if (player) {
          this.toastService.show(`${player.name} has been reset.`, 'success');
      }
  }

  confirmResetAllData(): void {
    this.playerService.resetAllPlayers();
    this.matchService.clearHistory();
    this.storageService.clearAll();
    this.toastService.show('All application data has been reset.', 'success');
    this.showResetAllModal.set(false);
  }
}
