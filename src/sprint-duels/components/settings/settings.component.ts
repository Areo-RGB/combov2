import { ChangeDetectionStrategy, Component, inject, signal, ElementRef, viewChild, effect } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { PlayerService } from '../../services/player.service';
import { MatchService } from '../../services/match.service';
import { ToastService } from '../../services/toast.service';
import { AudioService } from '../../services/audio.service';
import { StorageService } from '../../services/storage.service';
import { DetectionSettingsService } from '../../../services/detection-settings.service';
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
  detectionSettings = inject(DetectionSettingsService);

  showResetAllModal = signal(false);

  isFullScreen = signal(!!this.document.fullscreenElement);

  // Collapsible state for settings sections
  displaySettingsExpanded = signal(true);
  audioSettingsExpanded = signal(true);
  detectionSettingsExpanded = signal(true);
  dataManagementExpanded = signal(true);
  
  toggleDisplaySettings(): void {
    this.displaySettingsExpanded.update(v => !v);
  }

  toggleAudioSettings(): void {
    this.audioSettingsExpanded.update(v => !v);
  }

  toggleDetectionSettings(): void {
    this.detectionSettingsExpanded.update(v => !v);
  }

  toggleDataManagement(): void {
    this.dataManagementExpanded.update(v => !v);
  }

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

  // Detection Settings Methods
  onDetectionMethodChange(method: 'motion' | 'pose'): void {
    this.detectionSettings.detectionMethod.set(method);
    this.detectionSettings.saveSettings();
  }

  onPoseLibraryChange(library: 'mediapipe' | 'movenet'): void {
    this.detectionSettings.poseLibrary.set(library);
    this.detectionSettings.saveSettings();
  }

  onPoseModelChange(model: 'lite' | 'full' | 'heavy'): void {
    this.detectionSettings.poseModel.set(model);
    this.detectionSettings.saveSettings();
  }

  onMoveNetModelChange(model: 'lightning' | 'thunder' | 'multipose'): void {
    this.detectionSettings.moveNetModel.set(model);
    this.detectionSettings.saveSettings();
  }

  onSpeedyVisionToggle(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.detectionSettings.useSpeedyVision.set(enabled);
    if (enabled) {
      this.detectionSettings.useDiffyJS.set(false);
    }
    this.detectionSettings.saveSettings();
  }

  onDiffyJSToggle(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.detectionSettings.useDiffyJS.set(enabled);
    if (enabled) {
      this.detectionSettings.useSpeedyVision.set(false);
    }
    this.detectionSettings.saveSettings();
  }

  onSensitivityChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.sensitivity.set(value);
    this.detectionSettings.saveSettings();
  }

  onMotionCooldownChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.motionCooldown.set(value);
    this.detectionSettings.saveSettings();
  }

  onSignalCadenceChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.signalCadence.set(value);
    this.detectionSettings.saveSettings();
  }

  onZoneWidthChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.zoneWidthPercent.set(value);
    this.detectionSettings.saveSettings();
  }

  onZonePositionChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.zonePositionPercent.set(value);
    this.detectionSettings.saveSettings();
  }

  onFullScreenDetectionToggle(event: Event): void {
    const enabled = (event.target as HTMLInputElement).checked;
    this.detectionSettings.useFullScreenDetection.set(enabled);
    this.detectionSettings.saveSettings();
  }

  resetDetectionSettings(): void {
    this.detectionSettings.resetToDefaults();
    this.toastService.show('Detection settings have been reset to defaults.', 'success');
  }
}

