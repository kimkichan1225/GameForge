import { Room, Player } from './Room.js';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private playerRooms: Map<string, string> = new Map(); // playerId -> roomId

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  createRoom(hostId: string, hostNickname: string, roomName: string, mapId: string = 'default', maxPlayers: number = 4): Room | null {
    // Check if player is already in a room
    if (this.playerRooms.has(hostId)) {
      return null;
    }

    const roomId = this.generateRoomId();
    const room = new Room(roomId, roomName, hostId, mapId, maxPlayers);

    const player = room.addPlayer(hostId, hostNickname);
    if (!player) {
      return null;
    }

    this.rooms.set(roomId, room);
    this.playerRooms.set(hostId, roomId);

    console.log(`방 생성됨: ${roomId} (${roomName}) by ${hostNickname}`);
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

  getRoomList(): object[] {
    const list: object[] = [];
    for (const room of this.rooms.values()) {
      list.push(room.toListItem());
    }
    return list;
  }

  getRoomCount(): number {
    return this.rooms.size;
  }
}

export const roomManager = new RoomManager();
