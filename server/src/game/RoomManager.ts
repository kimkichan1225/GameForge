import { Room, Player, type RoomOptions, type GameMode, type RoomType } from './Room.js';

export interface CreateRoomParams {
  hostId: string;
  hostNickname: string;
  roomName: string;
  mapId?: string;
  maxPlayers?: number;
  gameMode?: GameMode;
  roomType?: RoomType;
  isPrivate?: boolean;
  buildTimeLimit?: number;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(params: CreateRoomParams): Room | null {
    const { hostId, hostNickname, roomName, mapId, maxPlayers, gameMode, roomType, isPrivate, buildTimeLimit } = params;

    // Check if player is already in a room
    if (this.playerRooms.has(hostId)) {
      return null;
    }

    const roomId = this.generateRoomId();
    const roomOptions: RoomOptions = {
      name: roomName,
      hostId,
      mapId,
      maxPlayers,
      gameMode,
      roomType,
      isPrivate,
      buildTimeLimit,
    };
    const room = new Room(roomId, roomOptions);

    const player = room.addPlayer(hostId, hostNickname);
    if (!player) {
      return null;
    }

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);

    console.log(`방 생성됨: ${roomId} (${roomName}) by ${hostNickname} [${gameMode}/${roomType}${isPrivate ? '/비공개' : ''}]`);
    return room;
  }

  joinRoom(roomId: string, playerId: string, nickname: string): { room: Room; player: Player } | null {
    // Check if player is already in a room
    if (this.playerRooms.has(playerId)) {
      return null;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return null;
    }

    const player = room.addPlayer(playerId, nickname);
    if (!player) {
      return null;
    }

    this.playerRooms.set(playerId, roomId);
    console.log(`플레이어 ${nickname} (${playerId})가 방 ${roomId}에 참가`);
    return { room, player };
  }

  leaveRoom(playerId: string): { room: Room; isEmpty: boolean } | null {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) {
      return null;
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      this.playerRooms.delete(playerId);
      return null;
    }

    room.removePlayer(playerId);
    this.playerRooms.delete(playerId);

    const isEmpty = room.players.size === 0;
    if (isEmpty) {
      this.rooms.delete(roomId);
      console.log(`방 ${roomId} 삭제됨 (플레이어 없음)`);
    }

    return { room, isEmpty };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getPlayerRoom(playerId: string): Room | undefined {
    const roomId = this.playerRooms.get(playerId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  getRoomList(includePrivate: boolean = false): object[] {
    const list: object[] = [];
    for (const room of this.rooms.values()) {
      // 비공개 방은 기본적으로 제외 (includePrivate가 true면 포함)
      if (!includePrivate && room.isPrivate) {
        continue;
      }
      // waiting 상태인 방만 목록에 표시 (playing, finished 상태는 참가 불가)
      if (room.status !== 'waiting') {
        continue;
      }
      list.push(room.toListItem());
    }
    return list;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomManager = new RoomManager();
