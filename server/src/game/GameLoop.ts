import { Server } from 'socket.io';
import { Room, Player } from './Room.js';
import type { RelayMapData } from './BuildingPhase.js';

interface GameState {
  roomId: string;
  status: 'waiting' | 'building' | 'countdown' | 'playing' | 'finished';
  startTime?: number;
  countdown: number;
  players: PlayerState[];
  rankings: RankingEntry[];
  gracePeriod: number; // 첫 완주자 후 남은 유예 시간 (초)
  firstFinisherId?: string;
}

interface PlayerState {
  id: string;
  nickname: string;
  color: string;  // 플레이어 색상 ID
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
  dnf?: boolean; // Did Not Finish
}

export class GameLoop {
  private io: Server;
  private room: Room;
  private intervalId: NodeJS.Timeout | null = null;
  private countdown: number = 3;
  private gameStartTime: number = 0;
  private tickRate: number = 20; // 20Hz = 50ms per tick
  private gracePeriod: number = 0; // 유예 시간 (초)
  private gracePeriodStartTime: number = 0;
  private firstFinisherId: string | undefined;
  private GRACE_PERIOD_DURATION: number = 10; // 10초 유예 시간

  // 릴레이 레이스 관련
  private relayMapData: RelayMapData | null = null;
  private isRelayRace: boolean = false;

  constructor(io: Server, room: Room, relayMapData?: RelayMapData) {
    this.io = io;
    this.room = room;
    if (relayMapData) {
      this.relayMapData = relayMapData;
      this.isRelayRace = true;
    }
  }

  start(): void {
    this.room.status = 'countdown';
    this.countdown = 3;

    // Notify clients game is starting
    this.io.to(this.room.id).emit('game:starting', {
      countdown: this.countdown,
      isRelayRace: this.isRelayRace,
      relayMapData: this.relayMapData,
    });

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

    // Reset grace period state
    this.gracePeriod = 0;
    this.gracePeriodStartTime = 0;
    this.firstFinisherId = undefined;

    this.io.to(this.room.id).emit('game:start', {
      startTime: this.gameStartTime,
      isRelayRace: this.isRelayRace,
      relayMapData: this.relayMapData,
    });

    // Start game loop at 20Hz
    this.intervalId = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  private tick(): void {
    if (this.room.status !== 'playing') {
      this.stop();
      return;
    }

    // 유예 시간 카운트다운 처리
    if (this.gracePeriodStartTime > 0) {
      const elapsed = (Date.now() - this.gracePeriodStartTime) / 1000;
      this.gracePeriod = Math.max(0, this.GRACE_PERIOD_DURATION - elapsed);

      // 유예 시간 종료 시 게임 종료
      if (this.gracePeriod <= 0) {
        this.endRace();
        return;
      }
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
        color: player.color,
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
      gracePeriod: this.gracePeriod,
      firstFinisherId: this.firstFinisherId,
    };
  }

  updatePlayerPosition(
    playerId: string,
    position: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    animation?: string
  ): void {
    // 위치 값 유효성 검사 (NaN, Infinity 체크)
    if (!position || typeof position.x !== 'number' || typeof position.y !== 'number' || typeof position.z !== 'number') {
      return;
    }
    if (!isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
      return;
    }

    // 극단적인 좌표 값 제한 (-1000 ~ 1000)
    const clamp = (v: number) => Math.max(-1000, Math.min(1000, v));
    const clampedPosition = {
      x: clamp(position.x),
      y: clamp(position.y),
      z: clamp(position.z),
    };

    const clampedVelocity = velocity && isFinite(velocity.x) && isFinite(velocity.y) && isFinite(velocity.z)
      ? { x: clamp(velocity.x), y: clamp(velocity.y), z: clamp(velocity.z) }
      : { x: 0, y: 0, z: 0 };

    this.room.updatePlayerPosition(playerId, clampedPosition, clampedVelocity, animation);
  }

  playerReachedCheckpoint(playerId: string, checkpointIndex: number, isRelayCheckpoint: boolean = false): { success: boolean; teleportTo?: [number, number, number] } {
    const player = this.room.getPlayer(playerId);
    if (!player) return { success: false };

    // 체크포인트 카운트 증가
    player.checkpoint = player.checkpoint + 1;

    let teleportTo: [number, number, number] | undefined;

    // 릴레이 레이스에서 릴레이 체크포인트(세그먼트 끝)인 경우에만 텔레포트
    if (isRelayCheckpoint && this.isRelayRace && this.relayMapData) {
      // checkpointIndex는 relay-checkpoint 인덱스 (0부터 시작)
      // 다음 세그먼트 인덱스 = checkpointIndex + 1
      const nextSegmentIndex = checkpointIndex + 1;
      if (nextSegmentIndex < this.relayMapData.segments.length) {
        const nextSegment = this.relayMapData.segments[nextSegmentIndex];
        teleportTo = nextSegment.spawnPosition;
      }
    }

    this.io.to(this.room.id).emit('game:checkpoint', {
      playerId,
      nickname: player.nickname,
      checkpoint: player.checkpoint,
      teleportTo,
    });

    return { success: true, teleportTo };
  }

  playerFinished(playerId: string): boolean {
    const player = this.room.getPlayer(playerId);
    if (!player || player.finishTime) return false;

    player.finishTime = Date.now();
    const raceTime = player.finishTime - this.gameStartTime;

    // 첫 번째 완주자인 경우 유예 시간 시작
    const isFirstFinisher = !this.firstFinisherId;
    if (isFirstFinisher) {
      this.firstFinisherId = playerId;
      this.gracePeriodStartTime = Date.now();
      this.gracePeriod = this.GRACE_PERIOD_DURATION;

      this.io.to(this.room.id).emit('game:gracePeriodStart', {
        firstFinisherId: playerId,
        nickname: player.nickname,
        time: raceTime,
        duration: this.GRACE_PERIOD_DURATION,
      });
    }

    this.io.to(this.room.id).emit('game:playerFinished', {
      playerId,
      nickname: player.nickname,
      time: raceTime,
      isFirstFinisher,
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

    // 최종 랭킹 계산 (DNF 포함)
    const rankings: RankingEntry[] = [];

    // 완주한 플레이어들
    const finishedPlayers = Array.from(this.room.players.values())
      .filter((p) => p.finishTime !== undefined)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        time: p.finishTime! - this.gameStartTime,
        rank: 0,
        dnf: false,
      }));

    // 시간순으로 정렬
    finishedPlayers.sort((a, b) => a.time - b.time);
    finishedPlayers.forEach((entry, index) => {
      entry.rank = index + 1;
    });
    rankings.push(...finishedPlayers);

    // DNF 플레이어들
    const dnfPlayers = Array.from(this.room.players.values())
      .filter((p) => p.finishTime === undefined)
      .map((p) => ({
        playerId: p.id,
        nickname: p.nickname,
        time: 0,
        rank: finishedPlayers.length + 1,
        dnf: true,
      }));
    rankings.push(...dnfPlayers);

    this.io.to(this.room.id).emit('game:finished', {
      rankings,
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

export function startGameFromBuilding(io: Server, room: Room, relayMapData: RelayMapData): GameLoop {
  // Stop existing game if any
  const existing = activeGames.get(room.id);
  if (existing) {
    existing.stop();
  }

  // 빌딩 페이즈 정리
  if (room.buildingPhase) {
    room.buildingPhase.stop();
    room.buildingPhase = null;
  }

  const gameLoop = new GameLoop(io, room, relayMapData);
  activeGames.set(room.id, gameLoop);
  gameLoop.start();

  // 방 상태 업데이트 브로드캐스트 (countdown 상태로 변경됨)
  io.to(room.id).emit('room:statusUpdated', {
    status: room.status,
  });

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
