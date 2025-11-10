import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-team-duels-lobby',
  templateUrl: './lobby.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class TeamDuelsLobbyComponent {
  goBack = output<void>();
  sessionStarted = output<{ sessionId: string, role: 'game' | 'display' }>();

  inputSessionId = signal('');
  errorMessage = signal('');

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createSessionAndStart(role: 'game' | 'display') {
    const newSessionId = this.generateSessionId();
    this.sessionStarted.emit({ sessionId: newSessionId, role });
  }
  
  joinSession() {
    const sessionId = this.inputSessionId().trim().toUpperCase();
    if (sessionId.length < 6) {
      this.errorMessage.set('Please enter a valid 6-character session ID.');
      return;
    }
    this.errorMessage.set('');
    this.sessionStarted.emit({ sessionId, role: 'game' });
  }
  
  handleSessionIdInput(event: Event) {
    const inputElement = event.target as HTMLInputElement;
    this.inputSessionId.set(inputElement.value);
  }
}
