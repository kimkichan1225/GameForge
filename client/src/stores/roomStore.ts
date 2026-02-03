import { create } from 'zustand';
import { socketManager } from '../lib/socket';

// 8가지 플레이어 색상 (서버와 동일)
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
  color: PlayerColorId;
}

export type RoomType = 'create_map' | 'load_map';
export type GameMode = 'race' | 'shooter';

export interface RoomInfo {
  id: string;
  name: string;
  playerCount: number;
  maxPlayers: number;
  status: 'waiting' | 'building' | 'countdown' | 'playing' | 'finished';
  mapId: string;
  mapName?: string;
  mapThumbnailUrl?: string;
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
  status: 'waiting' | 'building' | 'countdown' | 'playing' | 'finished';
  mapId: string;
  mapName?: string;
  mapThumbnailUrl?: string;
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
    mapName?: string;
    mapThumbnailUrl?: string;
    maxPlayers?: number;
    gameMode?: GameMode;
    roomType?: RoomType;
    isPrivate?: boolean;
    buildTimeLimit?: number;
  }) => Promise<boolean>;
  joinRoom: (nickname: string, roomId: string) => Promise<boolean>;
  leaveRoom: () => void;
  setReady: (ready: boolean) => void;
  selectColor: (color: PlayerColorId) => Promise<boolean>;
  startGame: () => Promise<boolean>;
  returnToWaitingRoom: () => Promise<boolean>;
  updateRoomSettings: (settings: {
    name?: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    buildTimeLimit?: number;
    mapId?: string;
    mapName?: string;
    mapThumbnailUrl?: string;
  }) => Promise<boolean>;
}

// 등록된 리스너 이벤트명 추적 (HMR 및 중복 호출 방지)
const registeredEvents = new Set<string>();

// 리스너 등록 헬퍼 (중복 방지)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function registerEvent(socket: ReturnType<typeof socketManager.getSocket>, event: string, handler: (...args: any[]) => void) {
  if (!socket || registeredEvents.has(event)) return;
  registeredEvents.add(event);
  socket.on(event, handler);
}

export const useRoomStore = create<RoomState>((set, get) => ({
  isConnected: false,
  rooms: [],
  currentRoom: null,
  canStart: false,

  connect: () => {
    const socket = socketManager.connect();

    // 이미 연결된 상태면 상태 업데이트
    if (socket.connected) {
      set({ isConnected: true });
    }

    registerEvent(socket, 'connect', () => {
      set({ isConnected: true });
    });

    registerEvent(socket, 'disconnect', () => {
      set({ isConnected: false, currentRoom: null });
    });

    // Room list updates
    registerEvent(socket, 'room:listUpdated', (rooms: RoomInfo[]) => {
      set({ rooms });
    });

    // Player joined current room
    registerEvent(socket, 'room:playerJoined', (data: { player: Player; players: Player[] }) => {
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
    registerEvent(socket, 'room:playerLeft', (data: { playerId: string; players: Player[]; newHostId: string }) => {
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
    registerEvent(socket, 'room:playerUpdated', (data: { players: Player[]; canStart: boolean }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, players: data.players },
          canStart: data.canStart,
        });
      }
    });

    // Game starting
    registerEvent(socket, 'game:starting', () => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, status: 'countdown' },
        });
      }
    });

    // Room status updated (after game ends and players return to waiting room)
    registerEvent(socket, 'room:statusUpdated', (data: { status: RoomDetail['status'] }) => {
      const room = get().currentRoom;
      if (room) {
        set({
          currentRoom: { ...room, status: data.status },
        });
      }
    });

    // Room settings updated by host
    registerEvent(socket, 'room:settingsUpdated', (data: RoomDetail) => {
      set({
        currentRoom: data,
      });
    });
  },

  disconnect: () => {
    socketManager.disconnect();
    registeredEvents.clear();
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
      mapName,
      mapThumbnailUrl,
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
        { nickname, roomName, mapId, mapName, mapThumbnailUrl, maxPlayers, gameMode, roomType, isPrivate, buildTimeLimit },
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

  selectColor: (color) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('room:selectColor', { color }, (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.error('색상 선택 실패:', response.error);
        }
        resolve(response.success);
      });
    });
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
