export interface Player {
  id: string;
  name: string;
  jerseyNumber: number;
  elo: number;
  stats: {
    wins: number;
    losses: number;
    draws: number;
  };
  tournamentWins: number;
  isParticipating: boolean;
  lastEloChange?: number;
}

export interface Match {
  id: string;
  player1Id: string;
  player2Id: string;
  player1Name: string;
  player2Name: string;
  player1Jersey: number;
  player2Jersey: number;
  winnerId: string | null; // null for a draw
  eloChangeP1: number;
  eloChangeP2: number;
  timestamp: number;
  tournamentId?: string;
  round?: number;
}

export interface Duel {
  player1: Player;
  player2: Player;
}

export interface TournamentMatch extends Duel {
  id: string;
  round: number;
  winner?: Player;
}

export interface TournamentBracket {
  rounds: TournamentMatch[][];
}

export interface Tournament {
  id: string;
  players: Player[];
  winnersBracket: TournamentBracket;
  losersBracket: TournamentBracket;
  grandFinal: TournamentMatch[];
  status: 'seeding' | 'running' | 'grand-final' | 'finished';
  winner: Player | null;
  grandFinalBestOfThree: {
    p1: Player;
    p2: Player;
    p1Wins: number;
    p2Wins: number;
    winner: Player | null;
  } | null;
}
