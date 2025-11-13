import {
  ChangeDetectionStrategy,
  Component,
  signal,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { SprintTimingComponent } from './components/sprint-timing/sprint-timing.component';
import { SprintMultiSetupComponent } from './components/sprint-multi-setup/sprint-multi-setup.component';
import { SprintTimingMultiComponent } from './components/sprint-timing-multi/sprint-timing-multi.component';
import { HeaderComponent } from './components/header/header.component';
import { FirebaseService } from './services/firebase.service';
import { SprintDuelsComponent } from './sprint-duels/sprint-duels.component';
import { TeamDuelsComponent } from './team-duels/team-duels.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SprintTimingComponent,
    SprintMultiSetupComponent,
    SprintTimingMultiComponent,
    SprintDuelsComponent,
    TeamDuelsComponent,
    HeaderComponent,
  ],
})
export class AppComponent implements OnDestroy, OnInit {
  mode = signal<
    | 'selection'
    | 'sprint-timing-menu'
    | 'sprint-timing-single-menu'
    | 'sprint-timing-manual'
    | 'sprint-timing-flying'
    | 'sprint-multi-setup'
    | 'sprint-multi-timing'
    | 'sprint-duels'
    | 'team-duels'
  >('selection');
  sessionId = signal('');
  multiDeviceConfig = signal<any>(null);
  joinSprintSessionId = signal<string | null>(null);

  private firebaseService = inject(FirebaseService);
  private document: Document = inject(DOCUMENT);

  isAppFullScreen = signal(!!this.document.fullscreenElement);

  ngOnInit(): void {
    this.document.addEventListener('fullscreenchange', this.onFullscreenChange);
  }

  generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  startSprintTimingSingleMenu() {
    this.mode.set('sprint-timing-single-menu');
  }

  startSprintTimingManual() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('sprint-timing-manual');
  }

  startSprintTimingFlying() {
    const newSessionId = this.generateSessionId();
    this.sessionId.set(newSessionId);
    this.mode.set('sprint-timing-flying');
  }

  startMultiDeviceSetup() {
    this.joinSprintSessionId.set(null);
    this.mode.set('sprint-multi-setup');
  }

  joinMultiDevice(sessionId: string) {
    this.joinSprintSessionId.set(sessionId);
    this.mode.set('sprint-multi-setup');
  }

  handleMultiDeviceStart(config: any) {
    this.multiDeviceConfig.set(config);
    this.sessionId.set(config.sessionId);
    this.mode.set('sprint-multi-timing');
  }

  goBackToSelection() {
    if (this.document.fullscreenElement) {
      this.document.exitFullscreen();
    }
    this.mode.set('selection');
    this.sessionId.set('');
  }

  toggleAppFullscreen(): void {
    if (!this.document.fullscreenElement) {
      this.document.documentElement.requestFullscreen();
    } else {
      if (this.document.exitFullscreen) {
        this.document.exitFullscreen();
      }
    }
  }

  private onFullscreenChange = (): void => {
    this.isAppFullScreen.set(!!this.document.fullscreenElement);
  };

  ngOnDestroy(): void {
    this.document.removeEventListener('fullscreenchange', this.onFullscreenChange);
  }
}
