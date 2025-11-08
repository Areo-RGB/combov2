import { ChangeDetectionStrategy, Component, computed, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerService } from '../../services/player.service';
import { EloService } from '../../services/elo.service';
import { MatchService } from '../../services/match.service';
import { AudioService } from '../../services/audio.service';
import { TournamentService } from '../../services/tournament.service';
import { Duel, Player } from '../../sprint-duels.types';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-match-maker',
  templateUrl: './match-maker.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class MatchMakerComponent {
  playerService = inject(PlayerService);
  eloService = inject(EloService);
  matchService = inject(MatchService);
  audioService = inject(AudioService);
  tournamentService = inject(TournamentService);
  toastService = inject(ToastService);
  
  duels = signal<Duel[]>([]);
  private lastPlayerToRunTwiceId = signal<string | null>(null);
  isArenaViewActive = signal(false);

  participatingPlayers = computed(() => this.playerService.players().filter(p => p.isParticipating));

  isRoundInProgress = computed(() => this.duels().length > 0);
  
  isTournamentActive = this.tournamentService.isTournamentActive;

  constructor() {
    effect(() => {
      // When duels are cleared (and not in a tournament), exit arena view
      if (this.isArenaViewActive() && this.duels().length === 0 && !this.isTournamentActive()) {
        this.isArenaViewActive.set(false);
      }
    });
  }

  ngOnInit(): void {
      if (this.isTournamentActive()) {
          this.duels.set(this.tournamentService.currentRoundDuels());
          if (this.duels().length > 0) {
            this.isArenaViewActive.set(true);
          }
      }
  }

  toggleParticipation(player: Player, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.playerService.toggleParticipation(player.id, isChecked);
  }

  generateRandomPairings(): void {
    this.generatePairings(this.shuffle([...this.participatingPlayers()]));
  }

  generateEloBasedPairings(): void {
    const sortedPlayers = [...this.participatingPlayers()].sort((a, b) => b.elo - a.elo);
    this.generatePairings(sortedPlayers);
  }

  private generatePairings(players: Player[]): void {
    if (players.length < 2) {
      this.toastService.show('Not enough participating players to create a duel.', 'error');
      return;
    }

    const newDuels: Duel[] = [];
    let playersToPair = [...players];

    while (playersToPair.length >= 2) {
      newDuels.push({ player1: playersToPair.shift()!, player2: playersToPair.shift()! });
    }

    if (playersToPair.length === 1) { // Odd player out
      const oddPlayer = playersToPair[0];
      const potentialOpponents = players.filter(p => p.id !== oddPlayer.id && p.id !== this.lastPlayerToRunTwiceId());
      
      let opponent: Player;
      if (potentialOpponents.length > 0) {
        opponent = potentialOpponents[Math.floor(Math.random() * potentialOpponents.length)];
      } else {
        // Fallback if everyone has run twice recently
        opponent = players.filter(p => p.id !== oddPlayer.id)[0];
      }
      
      newDuels.push({ player1: oddPlayer, player2: opponent });
      this.lastPlayerToRunTwiceId.set(opponent.id);
    } else {
        this.lastPlayerToRunTwiceId.set(null);
    }
    
    this.duels.set(newDuels);
    this.isArenaViewActive.set(true);
  }

  async declareWinner(duel: Duel, winner: Player): Promise<void> {
    if (this.isTournamentActive()) {
        this.tournamentService.recordTournamentMatch(duel.player1, duel.player2, winner);
        this.duels.set(this.tournamentService.currentRoundDuels());
    } else {
        this.matchService.recordMatch(duel.player1, duel.player2, winner.id === duel.player1.id ? 'p1' : 'p2');
        this.removeDuel(duel);
    }
  }

  declareDraw(duel: Duel): void {
    this.matchService.recordMatch(duel.player1, duel.player2, 'draw');
    this.removeDuel(duel);
  }
  
  startTournament(): void {
      this.tournamentService.startTournament(this.participatingPlayers());
      this.duels.set(this.tournamentService.currentRoundDuels());
      if (this.duels().length > 0) {
        this.isArenaViewActive.set(true);
      }
  }
  
  cancelTournament(): void {
      this.tournamentService.cancelTournament();
      this.duels.set([]);
      this.isArenaViewActive.set(false);
  }

  private removeDuel(duel: Duel): void {
    this.duels.update(d => d.filter(d => d !== duel));
  }

  private shuffle<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  speakName(name: string): void {
    if (!('speechSynthesis' in window)) {
      this.toastService.show('Speech synthesis not supported.', 'error');
      return;
    }
    
    // Cancel any previous utterance to avoid overlaps
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(name);
    
    // The list of voices is loaded asynchronously. We can't rely on it being present
    // immediately. Setting the lang is a good hint for the browser to pick a suitable voice.
    utterance.lang = 'de-DE';
    utterance.pitch = 1.1;
    utterance.rate = 0.9;
    
    window.speechSynthesis.speak(utterance);
  }
}