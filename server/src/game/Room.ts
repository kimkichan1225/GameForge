export type RoomType = 'create_map' | 'load_map';
export type GameMode = 'race' | 'shooter';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  animation?: string;
  checkpoint: number;
  finishTime?: number;
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, Player>;
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  mapId: string;
  gameMode: GameMode;
  roomType: RoomType;
  isPrivate: boolean;
  buildTimeLimit?: number;  // 맵 제작 시간 제한 (초)
  createdAt: number;
}

export interface RoomOptions {
  name: string;
  hostId: string;
  mapId?: string;
  mapName?: string;
  mapThumbnailUrl?: string;
  maxPlayers?: number;
  gameMode?: GameMode;
  roomType?: RoomType;
  isPrivate?: boolean;
  buildTimeLimit?: number;
}

export class Room {
  public readonly id: string;
  public name: string;
  public hostId: string;
  public players: Map<string, Player> = new Map();
  public maxPlayers: number;
  public status: RoomState['status'] = 'waiting';
  public mapId: string;
  public gameMode: GameMode;
  public roomType: RoomType;
  public isPrivate: boolean;
  public buildTimeLimit?: number;
  public createdAt: number;
  public raceStartTime?: number;

  constructor(id: string, options: RoomOptions) {
    this.id = id;
    this.name = options.name;
    this.hostId = options.hostId;
    this.mapId = options.mapId ?? 'default';
    this.maxPlayers = options.maxPlayers ?? 4;
    this.gameMode = options.gameMode ?? 'race';
    this.roomType = options.roomType ?? 'create_map';
    this.isPrivate = options.isPrivate ?? false;
    this.buildTimeLimit = options.buildTimeLimit;
    this.createdAt = Date.now();
  }

  addPlayer(playerId: string, nickname: string): Player | null {
    if (this.players.size >= this.maxPlayers) {
      return null;
    }

    if (this.status !== 'waiting') {
      return null;
    }

    const isHost = this.players.size === 0;
    const player: Player = {
      id: playerId,
      nickname,
      isHost,
      isReady: false,
      checkpoint: 0,
    };

    if (isHost) {
      this.hostId = playerId;
    }

    this.players.set(playerId, player);
    return player;
  }

  removePlayer(playerId: string): boolean {
    const player = this.players.get(playerId);
    if (!player) {
      return false;
    }

    this.players.delete(playerId);

    // If host left, assign new host
    if (player.isHost && this.players.size > 0) {
      const newHost = this.players.values().next().value;
      if (newHost) {
        newHost.isHost = true;
        this.hostId = newHost.id;
      }
    }

    return true;
  }

  getPlayer(playerId: string): Player | undefined {
    return this.players.get(playerId);
  }

  setPlayerReady(playerId: string, ready: boolean): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;
    player.isReady = ready;
    return true;
  }

  canStart(): boolean {
    if (this.players.size < 1) return false;
    for (const player of this.players.values()) {
      if (!player.isHost && !player.isReady) return false;
    }
    return true;
  }

  // 방 설정 업데이트 (방장만 가능)
  updateSettings(settings: {
    name?: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    buildTimeLimit?: number;
    mapId?: string;
  }): void {
    if (settings.name !== undefined) this.name = settings.name;
    if (settings.maxPlayers !== undefined) this.maxPlayers = Math.max(1, Math.min(8, settings.maxPlayers));
    if (settings.isPrivate !== undefined) this.isPrivate = settings.isPrivate;
    if (settings.buildTimeLimit !== undefined) this.buildTimeLimit = settings.buildTimeLimit;
    if (settings.mapId !== undefined) this.mapId = settings.mapId;
  }

  // 게임 종료 후 대기방으로 돌아갈 때 호출
  resetForNewGame(): void {
    this.status = 'waiting';
    for (const player of this.players.values()) {
      player.isReady = false;
      player.checkpoint = 0;
      player.finishTime = undefined;
      player.position = undefined;
      player.velocity = undefined;
      player.animation = undefined;
    }
  }

  // 모든 플레이어가 게임을 종료했는지 확인
  isAllPlayersInLobby(): boolean {
    // 게임이 끝났거나 대기 중일 때만 true
    return this.status === 'waiting';
  }

  updatePlayerPosition(
    playerId: string,
    position: { x: number; y: number; z: number },
    velocity?: { x: number; y: number; z: number },
    animation?: string
  ): void {
    const player = this.players.get(playerId);
    if (player) {
      player.position = position;
      if (velocity) {
        player.velocity = velocity;
      }
      if (animation) {
        player.animation = animation;
      }
    }
  }

  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      hostId: this.hostId,
      players: Array.from(this.players.values()),
      maxPlayers: this.maxPlayers,
      status: this.status,
      mapId: this.mapId,
      gameMode: this.gameMode,
      roomType: this.roomType,
      isPrivate: this.isPrivate,
      buildTimeLimit: this.buildTimeLimit,
      playerCount: this.players.size,
    };
  }

  toListItem(): object {
    return {
      id: this.id,
      name: this.name,
      playerCount: this.players.size,
      maxPlayers: this.maxPlayers,
      status: this.status,
      mapId: this.mapId,
      gameMode: this.gameMode,
      roomType: this.roomType,
      isPrivate: this.isPrivate,
    };
  }
}
