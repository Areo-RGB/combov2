import { Injectable, signal, WritableSignal } from '@angular/core';
import { Player } from '../sprint-duels.types';
import { StorageService } from './storage.service';

const DEFAULT_PLAYERS_DATA = [
    { name: 'Kayden', jerseyNumber: 2 },
    { name: 'Erik', jerseyNumber: 3 },
    { name: 'Lion', jerseyNumber: 4 },
    { name: 'Finley', jerseyNumber: 5 },
    { name: 'Lennox', jerseyNumber: 6 },
    { name: 'Lasse', jerseyNumber: 7 },
    { name: 'Levi', jerseyNumber: 8 },
    { name: 'Erray', jerseyNumber: 9 },
    { name: 'Jakob', jerseyNumber: 10 },
    { name: 'Paul', jerseyNumber: 11 },
    { name: 'Arvid', jerseyNumber: 12 },
    { name: 'Silas', jerseyNumber: 13 },
    { name: 'Metin', jerseyNumber: 14 },
    { name: 'Berat', jerseyNumber: 16 },
    { name: 'Joker22', jerseyNumber: 22 },
    { name: 'Joker33', jerseyNumber: 33 }
];
const JOKER_NAMES = new Set(['Joker22', 'Joker33']);

const INITIAL_ELO = 1000;

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  players: WritableSignal<Player[]> = signal([]);
  
  constructor(private storageService: StorageService) {
    this.loadPlayers();
  }

  private loadPlayers(): void {
    const storedPlayers = this.storageService.get<Player[]>('players');
    if (storedPlayers) {
      this.players.set(storedPlayers);
    } else {
      this.resetAllPlayers();
    }
  }

  updatePlayer(updatedPlayer: Player): void {
    this.players.update(players => 
      players.map(p => p.id === updatedPlayer.id ? updatedPlayer : p)
    );
    this.savePlayers();
  }
  
  updateMultiplePlayers(updatedPlayers: Player[]): void {
    const updatedPlayerMap = new Map(updatedPlayers.map(p => [p.id, p]));
    this.players.update(players =>
      players.map(p => updatedPlayerMap.get(p.id) || p)
    );
    this.savePlayers();
  }

  toggleParticipation(playerId: string, isParticipating: boolean): void {
     this.players.update(players => 
      players.map(p => p.id === playerId ? { ...p, isParticipating } : p)
    );
    this.savePlayers();
  }

  getPlayerById(id: string): Player | undefined {
    return this.players().find(p => p.id === id);
  }

  resetPlayer(playerId: string): Player | undefined {
    const defaultData = DEFAULT_PLAYERS_DATA.find(dp => {
      const currentPlayer = this.getPlayerById(playerId);
      return dp.jerseyNumber === currentPlayer?.jerseyNumber;
    });

    if (!defaultData) return undefined;
    
    const resetPlayer: Player = {
        id: playerId,
        name: defaultData.name,
        jerseyNumber: defaultData.jerseyNumber,
        elo: INITIAL_ELO,
        stats: { wins: 0, losses: 0, draws: 0 },
        tournamentWins: 0,
        isParticipating: !JOKER_NAMES.has(defaultData.name),
        lastEloChange: 0
    };
    
    this.updatePlayer(resetPlayer);
    return resetPlayer;
  }
  
  resetAllPlayers(): Player[] {
     const initialPlayers: Player[] = DEFAULT_PLAYERS_DATA.map(p => ({
        id: self.crypto.randomUUID(),
        name: p.name,
        jerseyNumber: p.jerseyNumber,
        elo: INITIAL_ELO,
        stats: { wins: 0, losses: 0, draws: 0 },
        tournamentWins: 0,
        isParticipating: !JOKER_NAMES.has(p.name)
      }));
      this.players.set(initialPlayers);
      this.savePlayers();
      return initialPlayers;
  }
  
  private savePlayers(): void {
    this.storageService.set('players', this.players());
  }
}