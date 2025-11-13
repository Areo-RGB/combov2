import { Injectable, signal } from '@angular/core';
import { Player } from '../sprint-duels.types';
import { StorageService } from './storage.service';
import { BEEP_SOUND_URL, NUMBER_SOUNDS } from '../sprint-duels-audio';

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  isAudioEnabled = signal<boolean>(true);
  private isPlaying = signal(false);

  constructor(private storageService: StorageService) {
    const savedSetting = this.storageService.get<boolean>('audioEnabled');
    if (savedSetting !== null) {
      this.isAudioEnabled.set(savedSetting);
    }
  }

  toggleAudio(enabled: boolean): void {
    this.isAudioEnabled.set(enabled);
    this.storageService.set('audioEnabled', enabled);
  }

  private playAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isAudioEnabled()) {
        resolve();
        return;
      }
      const audio = new Audio(url);
      // Set crossOrigin to 'anonymous' to allow loading from a different origin (CDN).
      // This is crucial for fixing CORS (Cross-Origin Resource Sharing) issues which
      // likely caused the "no supported source was found" error.
      audio.crossOrigin = 'anonymous';

      audio.onended = () => resolve();

      audio.onerror = () => {
        // When an error occurs, the audio element's `error` property contains a MediaError object
        // which is more informative than the raw event.
        const error = audio.error;
        const errorMessage = `Failed to load audio. Code: ${error?.code}, Message: ${error?.message}`;
        console.error(`Error with audio URL: ${url}`, errorMessage);
        reject(new Error(errorMessage));
      };

      // The play() method returns a promise which can be rejected if playback fails.
      audio.play().catch((error) => {
        console.error(`The play() request was interrupted for ${url}`, error);
        reject(error);
      });
    });
  }

  async playBeep(): Promise<void> {
    if (!this.isAudioEnabled()) return;
    try {
      await this.playAudio(BEEP_SOUND_URL);
    } catch (error) {
      console.error('Failed to play beep sound.', error);
    }
  }

  async playStartRaceCue(p1: Player, p2: Player): Promise<void> {
    if (!this.isAudioEnabled() || this.isPlaying()) return;

    this.isPlaying.set(true);

    const p1Sound = NUMBER_SOUNDS[p1.jerseyNumber];
    const p2Sound = NUMBER_SOUNDS[p2.jerseyNumber];

    if (!p1Sound || !p2Sound) {
      console.error('Audio for one of the jersey numbers is not available.');
      this.isPlaying.set(false);
      return;
    }

    try {
      // Small delay before starting
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Play player numbers
      await this.playAudio(p1Sound);
      await new Promise((resolve) => setTimeout(resolve, 150)); // Pause between numbers
      await this.playAudio(p2Sound);

      // Add a longer, more deliberate delay before the start beep
      await new Promise((resolve) => setTimeout(resolve, 750));
      await this.playAudio(BEEP_SOUND_URL);
    } catch (error) {
      console.error('Audio sequence failed.', error);
    } finally {
      this.isPlaying.set(false);
    }
  }
}
