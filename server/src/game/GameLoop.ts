import { Server } from 'socket.io';
import { Room, Player } from './Room.js';

interface GameState {
  roomId: string;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  startTime?: number;
  countdown: number;
  players: PlayerState[];
  rankings: RankingEntry[];
}

interface PlayerState {
  id: string;
  nickname: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  animation: string;
  checkpoint: number;
  finished: boolean;
  finishTime?: number;
}

interface RankingEntry {
  playerId: string;
  nickname: string;
  time: number;
  rank: number;
}

export class GameLoop {
  private io: Server;
  private room: Room;
  private intervalId: NodeJS.Timeout | null = null;
  private countdown: number = 3;
  private gameStartTime: number = 0;
  private tickRate: number = 20; // 20Hz = 50ms per tick

  constructor(io: Server, room: Room) {
    this.io = io;
    this.room = room;
  }

  start(): void {
    this.room.status = 'countdown';
    this.countdown = 3;

    // Notify clients game is starting
    this.io.to(this.room.id).emit('game:starting', { countdown: this.countdown });

    // Countdown phase
    const countdownInterval = setInterval(() => {
      this.io.to(this.room.id).emit('game:countdown', { count: this.countdown });

      if (this.countdown <= 0) {
        clearInterval(countdownInterval);
        this.startRace();
      }
      this.countdown--;
    }, 1000);
  }

  private startRace(): void {
    this.room.status = 'playing';
    this.gameStartTime = Date.now();
    this.room.raceStartTime = this.gameStartTime;

    // Reset all player states
    for (const player of this.room.players.values()) {
      player.checkpoint = 0;
      player.finishTime = undefined;
    }

    this.io.to(this.room.id).emit('game:start', {
      startTime: this.gameStartTime,
    });

    // Start game loop at 20Hz
    this.intervalId = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  private tick(): void {
    if (this.room.status !== 'playing') {
      this.stop();
      return;
    }

    const gameState = this.buildGameState();
    this.io.to(this.room.id).emit('game:state', gameState);
  }

  private buildGameState(): GameState {
    const players: PlayerState[] = [];
    const rankings: RankingEntry[] = [];

    for (const player of this.room.players.values()) {
      players.push({
        id: player.id,
        nickname: player.nickname,
        position: player.position || { x: 0, y: 0, z: 0 },
        velocity: player.velocity || { x: 0, y: 0, z: 0 },
        animation: player.animation || 'Idle',
        checkpoint: player.checkpoint,
        finished: player.finishTime !== undefined,
        finishTime: player.finishTime,
      });

      if (player.finishTime) {
        rankings.push({
          playerId: player.id,
          nickname: player.nickname,
          time: player.finishTime - this.gameStartTime,
          rank: 0,
        });
      }
    }

    // Sort rankings by time
    rankings.sort((a, b) => a.time - b.time);
    rankings.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    return {
      roomId: this.room.id,
      status: this.room.status,
      startTime: this.gameStartTime,
      countdown: this.countdown,
      players,
      rankings,
    };
  }

  updatePlayerPosition(
    playerId: string,
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    animation?: string
  ): void {
    this.room.updatePlayerPosition(playerId, position, velocity, animation);
  }

  playerReachedCheckpoint(playerId: string, checkpointIndex: number): boolean {
    const player = this.room.getPlayer(playerId);
    if (!player) return false;

    // Validate checkpoint order
    if (checkpointIndex === player.checkpoint + 1) {
      player.checkpoint = checkpointIndex;

      this.io.to(this.room.id).emit('game:checkpoint', {
        playerId,
        nickname: player.nickname,
        checkpoint: checkpointIndex,
      });

      return true;
    }
    return false;
  }

  playerFinished(playerId: string): boolean {
    const player = this.room.getPlayer(playerId);
    if (!player || player.finishTime) return false;

    player.finishTime = Date.now();
    const raceTime = player.finishTime - this.gameStartTime;

    this.io.to(this.room.id).emit('game:playerFinished', {
      playerId,
      nickname: player.nickname,
      time: raceTime,
    });

    // Check if all players finished
    const allFinished = Array.from(this.room.players.values()).every(
      (p) => p.finishTime !== undefined
    );

    if (allFinished) {
      this.endRace();
    }

    return true;
  }

  playerDied(playerId: string): void {
    const player = this.room.getPlayer(playerId);
    if (!player) return;

    this.io.to(this.room.id).emit('game:playerDied', {
      playerId,
      nickname: player.nickname,
    });
  }

  private endRace(): void {
    this.room.status = 'finished';
    this.stop();

    const finalState = this.buildGameState();
    this.io.to(this.room.id).emit('game:finished', {
      rankings: finalState.rankings,
    });
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}

// Store active game loops
const activeGames: Map<string, GameLoop> = new Map();

export function startGame(io: Server, room: Room): GameLoop {
  // Stop existing game if any
  const existing = activeGames.get(room.id);
  if (existing) {
    existing.stop();
  }

  const gameLoop = new GameLoop(io, room);
  activeGames.set(room.id, gameLoop);
  gameLoop.start();

  return gameLoop;
}

export function getGameLoop(roomId: string): GameLoop | undefined {
  return activeGames.get(roomId);
}

export function stopGame(roomId: string): void {
  const game = activeGames.get(roomId);
  if (game) {
    game.stop();
    activeGames.delete(roomId);
  }
}
