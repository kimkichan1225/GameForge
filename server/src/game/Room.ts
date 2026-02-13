import { BuildingPhase, RelayMapData } from './BuildingPhase.js';

export type RoomType = 'create_map' | 'load_map';
export type GameMode = 'race' | 'shooter';
export type ShooterSubMode = 'ffa' | 'team' | 'domination';

// 8가지 플레이어 색상 (최대 8인)
export const PLAYER_COLORS = [
  { id: 'red', hex: '#FF4444', name: '빨강' },
  { id: 'blue', hex: '#4444FF', name: '파랑' },
  { id: 'yellow', hex: '#FFFF00', name: '노랑' },
  { id: 'green', hex: '#44FF44', name: '초록' },
  { id: 'white', hex: '#FFFFFF', name: '흰색' },
  { id: 'black', hex: '#333333', name: '검정' },
  { id: 'orange', hex: '#FF8800', name: '주황' },
  { id: 'purple', hex: '#AA44FF', name: '보라' },
] as const;

export type PlayerColorId = typeof PLAYER_COLORS[number]['id'];

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
  color: PlayerColorId;  // 플레이어 색상
  team?: 'a' | 'b';  // 팀전/점령전 모드에서의 팀
  position?: { x: number; y: number; z: number };
  velocity?: { x: number; y: number; z: number };
  animation?: string;
  checkpoint: number;
  finishTime?: number;
  // 슈터 모드 전용
  health?: number;
  kills?: number;
  deaths?: number;
  isAlive?: boolean;
  weaponType?: string;
  respawnTimer?: number;
  invincibleUntil?: number;
  rotation?: { yaw: number; pitch: number };
}

export interface RoomState {
  id: string;
  name: string;
  hostId: string;
  players: Map<string, Player>;
  maxPlayers: number;
  status: 'waiting' | 'building' | 'countdown' | 'playing' | 'finished';
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
  scoreLimit?: number;
  timeLimit?: number;
  perspective?: 'fps' | 'tps';
  shooterSubMode?: ShooterSubMode;
}

export class Room {
  public readonly id: string;
  public name: string;
  public hostId: string;
  public players: Map<string, Player> = new Map();
  public maxPlayers: number;
  public status: RoomState['status'] = 'waiting';
  public mapId: string;
  public mapName?: string;
  public mapThumbnailUrl?: string;
  public gameMode: GameMode;
  public roomType: RoomType;
  public isPrivate: boolean;
  public buildTimeLimit?: number;
  public scoreLimit: number;
  public timeLimit: number;
  public perspective: 'fps' | 'tps';
  public shooterSubMode: ShooterSubMode;
  public teamAColor: PlayerColorId = 'blue';
  public teamBColor: PlayerColorId = 'red';
  public createdAt: number;
  public raceStartTime?: number;

  // 빌딩 페이즈 관련
  public buildingPhase: BuildingPhase | null = null;
  public relayMapData: RelayMapData | null = null;

  constructor(id: string, options: RoomOptions) {
    this.id = id;
    this.name = options.name;
    this.hostId = options.hostId;
    this.mapId = options.mapId ?? 'default';
    this.mapName = options.mapName;
    this.mapThumbnailUrl = options.mapThumbnailUrl;
    this.maxPlayers = options.maxPlayers ?? 4;
    this.gameMode = options.gameMode ?? 'race';
    this.roomType = options.roomType ?? 'create_map';
    this.isPrivate = options.isPrivate ?? false;
    this.buildTimeLimit = options.buildTimeLimit;
    this.scoreLimit = options.scoreLimit ?? 30;
    this.timeLimit = options.timeLimit ?? 300;
    this.perspective = options.perspective ?? 'fps';
    this.shooterSubMode = options.shooterSubMode ?? 'ffa';
    this.createdAt = Date.now();
  }

  // 빌딩 페이즈 시작
  startBuildingPhase(io: import('socket.io').Server, onComplete?: (relayMapData: RelayMapData) => void): BuildingPhase {
    this.status = 'building';
    this.buildingPhase = new BuildingPhase(io, this, this.buildTimeLimit);

    // 빌딩 완료 시 콜백 등록
    if (onComplete) {
      this.buildingPhase.onComplete((relayMapData) => {
        this.relayMapData = relayMapData;
        this.buildingPhase = null;
        onComplete(relayMapData);
      });
    }

    this.buildingPhase.start();
    return this.buildingPhase;
  }

  // 빌딩 페이즈 종료 및 릴레이 맵 저장
  completeBuildingPhase(): RelayMapData | null {
    if (!this.buildingPhase) return null;

    this.relayMapData = this.buildingPhase.complete();
    this.buildingPhase = null;
    return this.relayMapData;
  }

  // 팀 모드 여부 (팀전 또는 점령전)
  get isTeamMode(): boolean {
    return this.gameMode === 'shooter' && (this.shooterSubMode === 'team' || this.shooterSubMode === 'domination');
  }

  // 사용 중인 색상 목록 반환
  getUsedColors(): PlayerColorId[] {
    return Array.from(this.players.values()).map(p => p.color);
  }

  // 사용 가능한 첫 번째 색상 반환
  getFirstAvailableColor(): PlayerColorId {
    const usedColors = this.getUsedColors();
    for (const color of PLAYER_COLORS) {
      if (!usedColors.includes(color.id)) {
        return color.id;
      }
    }
    return 'red'; // fallback (8인 초과 시)
  }

  addPlayer(playerId: string, nickname: string): Player | null {
    // 대기 상태가 아니면 참가 불가
    if (this.status !== 'waiting') {
      return null;
    }

    // 인원 제한 체크 (race condition 방지를 위해 status 체크 후)
    if (this.players.size >= this.maxPlayers) {
      return null;
    }

    const isHost = this.players.size === 0;

    // 팀 모드: 자동 밸런스 배정 + 팀 색상 적용
    if (this.isTeamMode) {
      const teamACount = Array.from(this.players.values()).filter(p => p.team === 'a').length;
      const teamBCount = Array.from(this.players.values()).filter(p => p.team === 'b').length;
      const team: 'a' | 'b' = teamACount <= teamBCount ? 'a' : 'b';
      const color = team === 'a' ? this.teamAColor : this.teamBColor;

      const player: Player = {
        id: playerId,
        nickname,
        isHost,
        isReady: false,
        color,
        team,
        checkpoint: 0,
      };

      if (isHost) {
        this.hostId = playerId;
      }

      this.players.set(playerId, player);
      return player;
    }

    // 비팀 모드: 기존 방식
    const color = this.getFirstAvailableColor();
    const player: Player = {
      id: playerId,
      nickname,
      isHost,
      isReady: false,
      color,
      checkpoint: 0,
    };

    if (isHost) {
      this.hostId = playerId;
    }

    this.players.set(playerId, player);
    return player;
  }

  // 플레이어 색상 변경
  setPlayerColor(playerId: string, color: PlayerColorId): boolean {
    const player = this.players.get(playerId);
    if (!player) return false;

    // 대기 상태에서만 색상 변경 가능
    if (this.status !== 'waiting') return false;

    // 이미 다른 플레이어가 사용 중인 색상인지 확인
    const usedColors = this.getUsedColors();
    const isUsedByOther = usedColors.some((c, idx) => {
      const players = Array.from(this.players.values());
      return c === color && players[idx].id !== playerId;
    });

    if (isUsedByOther) return false;

    player.color = color;
    return true;
  }

  // 팀 색상 변경 (팀 리더만 가능)
  setTeamColor(playerId: string, teamId: 'a' | 'b', color: PlayerColorId): boolean {
    if (!this.isTeamMode) return false;
    if (this.status !== 'waiting') return false;

    // 팀 리더(해당 팀의 첫 번째 플레이어)인지 확인
    const teamPlayers = Array.from(this.players.values()).filter(p => p.team === teamId);
    if (teamPlayers.length === 0 || teamPlayers[0].id !== playerId) return false;

    // 상대팀 색상과 중복 방지
    const otherTeamColor = teamId === 'a' ? this.teamBColor : this.teamAColor;
    if (color === otherTeamColor) return false;

    // 팀 색상 업데이트
    if (teamId === 'a') {
      this.teamAColor = color;
    } else {
      this.teamBColor = color;
    }

    // 팀원 전체 색상 업데이트
    for (const player of teamPlayers) {
      player.color = color;
    }

    return true;
  }

  // 팀 이동
  switchTeam(playerId: string): boolean {
    if (!this.isTeamMode) return false;
    if (this.status !== 'waiting') return false;

    const player = this.players.get(playerId);
    if (!player || !player.team) return false;

    const targetTeam: 'a' | 'b' = player.team === 'a' ? 'b' : 'a';
    const halfMax = Math.ceil(this.maxPlayers / 2);
    const targetTeamCount = Array.from(this.players.values()).filter(p => p.team === targetTeam).length;

    // 상대 팀이 가득 찼으면 이동 불가
    if (targetTeamCount >= halfMax) return false;

    player.team = targetTeam;
    player.color = targetTeam === 'a' ? this.teamAColor : this.teamBColor;

    return true;
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

    // 빌딩 페이즈 중에 나가면 해당 플레이어 처리
    if (this.buildingPhase) {
      this.buildingPhase.handlePlayerLeave(playerId);
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
    mapName?: string;
    mapThumbnailUrl?: string;
  }): void {
    if (settings.name !== undefined) this.name = settings.name;
    if (settings.maxPlayers !== undefined) this.maxPlayers = Math.max(1, Math.min(8, settings.maxPlayers));
    if (settings.isPrivate !== undefined) this.isPrivate = settings.isPrivate;
    if (settings.buildTimeLimit !== undefined) this.buildTimeLimit = settings.buildTimeLimit;
    if (settings.mapId !== undefined) this.mapId = settings.mapId;
    if (settings.mapName !== undefined) this.mapName = settings.mapName;
    if (settings.mapThumbnailUrl !== undefined) this.mapThumbnailUrl = settings.mapThumbnailUrl;
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
    // 빌딩/릴레이 관련 상태 초기화
    if (this.buildingPhase) {
      this.buildingPhase.stop();
      this.buildingPhase = null;
    }
    this.relayMapData = null;
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
      mapName: this.mapName,
      mapThumbnailUrl: this.mapThumbnailUrl,
      gameMode: this.gameMode,
      roomType: this.roomType,
      isPrivate: this.isPrivate,
      buildTimeLimit: this.buildTimeLimit,
      scoreLimit: this.scoreLimit,
      timeLimit: this.timeLimit,
      perspective: this.perspective,
      shooterSubMode: this.shooterSubMode,
      ...(this.isTeamMode ? { teamAColor: this.teamAColor, teamBColor: this.teamBColor } : {}),
      playerCount: this.players.size,
      canStart: this.canStart(),
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
      mapName: this.mapName,
      mapThumbnailUrl: this.mapThumbnailUrl,
      gameMode: this.gameMode,
      roomType: this.roomType,
      isPrivate: this.isPrivate,
      scoreLimit: this.scoreLimit,
      timeLimit: this.timeLimit,
      perspective: this.perspective,
      shooterSubMode: this.shooterSubMode,
      ...(this.isTeamMode ? { teamAColor: this.teamAColor, teamBColor: this.teamBColor } : {}),
    };
  }
}
