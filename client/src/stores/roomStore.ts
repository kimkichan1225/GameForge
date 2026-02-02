import { create } from 'zustand';
import { socketManager } from '../lib/socket';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isReady: boolean;
}

export type RoomType = 'create_map' | 'load_map';
export type GameMode = 'race' | 'shooter';

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  mapId: string;
  gameMode: GameMode;
  roomType: RoomType;
  isPrivate: boolean;
}

export interface RoomDetail {
  id: string;
  name: string;
  hostId: string;
  players: Player[];
  maxPlayers: number;
  status: 'waiting' | 'countdown' | 'playing' | 'finished';
  mapId: string;
  gameMode: GameMode;
  roomType: RoomType;
  isPrivate: boolean;
  buildTimeLimit?: number;  // 맵 제작 시간 제한 (초, roomType='create_map'일 때)
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
  createRoom: (params: {
    nickname: string;
    roomName: string;
    mapId?: string;
    maxPlayers?: number;
    gameMode?: GameMode;
    roomType?: RoomType;
    isPrivate?: boolean;
    buildTimeLimit?: number;
  }) => Promise<boolean>;
  joinRoom: (nickname: string, roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  startGame: () => Promise<boolean>;
  returnToWaitingRoom: () => Promise<boolean>;
  updateRoomSettings: (settings: {
    name?: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    buildTimeLimit?: number;
    mapId?: string;
  }) => Promise<boolean>;
}

// 리스너 등록 여부 추적 (HMR 및 중복 호출 방지)
let listenersRegistered = false;

export const useRoomStore = create<RoomState>((set, get) => ({
  isConnected: false,
  rooms: [],
  currentRoom: null,
  canStart: false,

  connect: () => {
    const socket = socketManager.connect();

    // 이미 리스너가 등록되어 있으면 스킵
    if (listenersRegistered) {
      // 이미 연결된 상태면 상태 업데이트
      if (socket.connected) {
        set({ isConnected: true });
      }
      return;
    }
    listenersRegistered = true;

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

    // Room status updated (after game ends and players return to waiting room)
    socket.on('room:statusUpdated', (data: { status: RoomDetail['status'] }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, status: data.status },
        });
      }
    });

    // Room settings updated by host
    socket.on('room:settingsUpdated', (data: RoomDetail) => {
      set({
        currentRoom: data,
      });
    });
  },

  disconnect: () => {
    socketManager.disconnect();
    listenersRegistered = false;
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

  createRoom: (params) => {
    const {
      nickname,
      roomName,
      mapId = 'default',
      maxPlayers = 4,
      gameMode = 'race',
      roomType = 'create_map',
      isPrivate = false,
      buildTimeLimit,
    } = params;

    return new Promise((resolve) => {
      const socket = socketManager.getSocket();

      if (!socket || !nickname) {
        resolve(false);
        return;
      }

      socket.emit(
        'room:create',
        { nickname, roomName, mapId, maxPlayers, gameMode, roomType, isPrivate, buildTimeLimit },
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

  returnToWaitingRoom: () => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('room:returnToWaitingRoom', (response: { success: boolean; room?: RoomDetail; error?: string }) => {
        if (response.success && response.room) {
          set({ currentRoom: response.room, canStart: false });
          resolve(true);
        } else {
          console.error('대기방 복귀 실패:', response.error);
          resolve(false);
        }
      });
    });
  },

  updateRoomSettings: (settings) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('room:updateSettings', settings, (response: { success: boolean; room?: RoomDetail; error?: string }) => {
        if (response.success && response.room) {
          set({ currentRoom: response.room });
          resolve(true);
        } else {
          console.error('방 설정 변경 실패:', response.error);
          resolve(false);
        }
      });
    });
  },
}));
