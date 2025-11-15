import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  ElementRef,
  viewChild,
  effect,
} from '@angular/core';
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

  // Detection settings tab
  detectionTab = signal<'motion' | 'lobby'>('motion');

  // Camera selection properties
  availableCameras = signal<MediaDeviceInfo[]>([]);
  isLoadingCameras = signal<boolean>(false);

  toggleDisplaySettings(): void {
    this.displaySettingsExpanded.update((v) => !v);
  }

  toggleAudioSettings(): void {
    this.audioSettingsExpanded.update((v) => !v);
  }

  toggleDetectionSettings(): void {
    this.detectionSettingsExpanded.update((v) => !v);
  }

  toggleDataManagement(): void {
    this.dataManagementExpanded.update((v) => !v);
  }

  constructor() {
    this.document.addEventListener('fullscreenchange', () => {
      this.isFullScreen.set(!!this.document.fullscreenElement);
    });

    // Load available cameras on component init
    this.loadAvailableCameras();
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

  // Camera selection methods
  private async loadAvailableCameras(): Promise<void> {
    this.isLoadingCameras.set(true);
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        console.warn('Camera enumeration not supported in this browser');
        return;
      }

      // First, request camera permission to get labels
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        console.warn('Camera permission denied or not available:', error);
      }

      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((device) => device.kind === 'videoinput');
      this.availableCameras.set(videoDevices);
    } catch (error) {
      console.error('Failed to load available cameras:', error);
    } finally {
      this.isLoadingCameras.set(false);
    }
  }

  onCameraChange(event: Event): void {
    const selectedCameraId = (event.target as HTMLSelectElement).value;
    this.detectionSettings.selectedCameraId.set(selectedCameraId);
    this.detectionSettings.saveSettings();
  }

  getCameraLabel(camera: MediaDeviceInfo): string {
    if (camera.label) {
      // Try to identify front vs rear camera from label
      const labelLower = camera.label.toLowerCase();
      if (labelLower.includes('front') || labelLower.includes('user') || labelLower.includes('facing front')) {
        return `Front Camera (${camera.label})`;
      } else if (labelLower.includes('back') || labelLower.includes('rear') || labelLower.includes('environment') || labelLower.includes('facing back')) {
        return `Rear Camera (${camera.label})`;
      }
      return camera.label;
    }
    // Fallback when label is not available
    const cameras = this.availableCameras();
    const index = cameras.findIndex(c => c.deviceId === camera.deviceId);
    if (index === 0) return 'Front Camera (Default)';
    if (index === cameras.length - 1) return 'Rear Camera';
    return `Camera ${index + 1}`;
  }

  // Video and performance settings handlers
  onTargetFpsChange(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.detectionSettings.targetFps.set(value);
    this.detectionSettings.saveSettings();
  }

  onVideoResolutionChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'low' | 'medium' | 'high' | 'ultra';
    this.detectionSettings.videoResolution.set(value);
    this.detectionSettings.saveSettings();
  }


}
