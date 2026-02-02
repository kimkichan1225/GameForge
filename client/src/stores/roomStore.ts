import { create } from 'zustand';
import { socketManager } from '../lib/socket';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  mapId: string;
}

export interface RoomDetail {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  mapId: string;
}

interface RoomState {
  // Connection
  isConnected: boolean;

  // Room list
  rooms: RoomInfo[];

  // Current room
  currentRoom: RoomDetail | null;
  canStart: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  fetchRooms: () => Promise<void>;
  createRoom: (nickname: string, roomName: string, mapId?: string, maxPlayers?: number) => Promise<boolean>;
  joinRoom: (nickname: string, roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<boolean>;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  isConnected: false,
  rooms: [],
  currentRoom: null,
  canStart: false,

  connect: () => {
    const socket = socketManager.connect();

    socket.on('connect', () => {
      set({ isConnected: true });
    });

    socket.on('disconnect', () => {
      set({ isConnected: false, currentRoom: null });
    });

    // Room list updates
    socket.on('room:listUpdated', (rooms: RoomInfo[]) => {
      set({ rooms });
    });

    // Player joined current room
    socket.on('room:playerJoined', (data: { player: Player; players: Player[] }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: {
            ...room,
            players: data.players,
          },
        });
      }
    });

    // Player left current room
    socket.on('room:playerLeft', (data: { playerId: string; players: Player[]; newHostId: string }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: {
            ...room,
            players: data.players,
            hostId: data.newHostId,
          },
        });
      }
    });

    // Player status updated
    socket.on('room:playerUpdated', (data: { players: Player[]; canStart: boolean }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, players: data.players },
          canStart: data.canStart,
        });
      }
    });

    // Game starting
    socket.on('game:starting', () => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, status: 'countdown' },
        });
      }
    });
  },

  disconnect: () => {
    socketManager.disconnect();
    set({ isConnected: false, currentRoom: null, rooms: [] });
  },

  fetchRooms: () => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve();
        return;
      }

      socket.emit('room:list', (response: { success: boolean; rooms: RoomInfo[] }) => {
        if (response.success) {
          set({ rooms: response.rooms });
        }
        resolve();
      });
    });
  },

  createRoom: (nickname, roomName, mapId = 'default', maxPlayers = 4) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();

      if (!socket || !nickname) {
        resolve(false);
        return;
      }

      socket.emit(
        'room:create',
        { nickname, roomName, mapId, maxPlayers },
        (response: { success: boolean; room?: RoomDetail; error?: string }) => {
          if (response.success && response.room) {
            set({ currentRoom: response.room, canStart: false });
            resolve(true);
          } else {
            console.error('방 생성 실패:', response.error);
            resolve(false);
          }
        }
      );
    });
  },

  joinRoom: (nickname, roomId) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();

      if (!socket || !nickname) {
        resolve(false);
        return;
      }

      socket.emit(
        'room:join',
        { roomId, nickname },
        (response: { success: boolean; room?: RoomDetail; error?: string }) => {
          if (response.success && response.room) {
            set({ currentRoom: response.room, canStart: false });
            resolve(true);
          } else {
            console.error('방 참가 실패:', response.error);
            resolve(false);
          }
        }
      );
    });
  },

  leaveRoom: () => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.emit('room:leave', () => {
        set({ currentRoom: null, canStart: false });
      });
    }
  },

  setReady: (ready) => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.emit('room:ready', { ready });
    }
  },

  startGame: () => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('room:start', (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.error('게임 시작 실패:', response.error);
        }
        resolve(response.success);
      });
    });
  },
}));
