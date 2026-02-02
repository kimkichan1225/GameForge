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
  createdAt: number;
}

export class Room {
  public readonly id: string;
  public name: string;
  public hostId: string;
  public players: Map<string, Player> = new Map();
  public maxPlayers: number;
  public status: RoomState['status'] = 'waiting';
  public mapId: string;
  public createdAt: number;
  public raceStartTime?: number;

  constructor(id: string, name: string, hostId: string, mapId: string = 'default', maxPlayers: number = 4) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.mapId = mapId;
    this.maxPlayers = maxPlayers;
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
    };
  }
}
