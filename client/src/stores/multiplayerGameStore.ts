import { create } from 'zustand';
import { socketManager } from '../lib/socket';

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
  dnf?: boolean;
}

interface GameState {
  roomId: string;
  status: 'countdown' | 'playing' | 'finished' | 'idle';
  countdown: number;
  startTime: number | null;
  players: PlayerState[];
  rankings: RankingEntry[];
  localCheckpoint: number;
  localFinished: boolean;
  localFinishTime: number | null;
  gracePeriod: number; // 유예 시간 남은 초
  firstFinisherId: string | null;
  lastCheckpointPos: [number, number, number] | null;
}

interface MultiplayerGameStore extends GameState {
  // Actions
  initGame: () => void;
  cleanupGame: () => void;
  sendPosition: (position: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }, animation: string) => void;
  reachCheckpoint: (checkpointIndex: number, position?: [number, number, number]) => Promise<boolean>;
  finish: () => Promise<boolean>;
  notifyDeath: () => void;
  getOtherPlayers: () => PlayerState[];
  setLastCheckpointPos: (pos: [number, number, number]) => void;
}

export const useMultiplayerGameStore = create<MultiplayerGameStore>((set, get) => ({
  roomId: '',
  status: 'idle',
  countdown: 0,
  startTime: null,
  players: [],
  rankings: [],
  localCheckpoint: 0,
  localFinished: false,
  localFinishTime: null,
  gracePeriod: 0,
  firstFinisherId: null,
  lastCheckpointPos: null,

  initGame: () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Countdown event
    socket.on('game:countdown', (data: { count: number }) => {
      if (typeof data?.count !== 'number') return;
      set({ countdown: data.count, status: 'countdown' });
    });

    // Game start event
    socket.on('game:start', (data: { startTime: number }) => {
      if (typeof data?.startTime !== 'number') return;
      set({
        status: 'playing',
        startTime: data.startTime,
        localCheckpoint: 0,
        localFinished: false,
        localFinishTime: null,
      });
    });

    // Game state update (20Hz)
    socket.on('game:state', (data: {
      roomId: string;
      status: 'countdown' | 'playing' | 'finished';
      players: PlayerState[];
      rankings: RankingEntry[];
      gracePeriod: number;
      firstFinisherId?: string;
    }) => {
      // 데이터 유효성 검사
      if (!data || !Array.isArray(data.players)) return;

      // gracePeriod 음수 방지
      const gracePeriod = Math.max(0, data.gracePeriod ?? 0);

      set({
        roomId: data.roomId || '',
        status: data.status || 'idle',
        players: data.players,
        rankings: Array.isArray(data.rankings) ? data.rankings : [],
        gracePeriod,
        firstFinisherId: data.firstFinisherId || null,
      });
    });

    // Checkpoint reached by another player
    socket.on('game:checkpoint', (data: { playerId: string; nickname: string; checkpoint: number }) => {
      if (!data?.nickname) return;
      console.log(`${data.nickname}이(가) 체크포인트 ${data.checkpoint} 통과`);
    });

    // Grace period started (first player finished)
    socket.on('game:gracePeriodStart', (data: {
      firstFinisherId: string;
      nickname: string;
      time: number;
      duration: number;
    }) => {
      if (!data?.firstFinisherId) return;
      console.log(`${data.nickname}이(가) 1등으로 완주! ${data.duration}초 카운트다운 시작`);
      set({
        firstFinisherId: data.firstFinisherId,
        gracePeriod: Math.max(0, data.duration ?? 0),
      });
    });

    // Player finished
    socket.on('game:playerFinished', (data: {
      playerId: string;
      nickname: string;
      time: number;
      isFirstFinisher: boolean;
    }) => {
      if (!data?.nickname) return;
      console.log(`${data.nickname}이(가) ${(data.time / 1000).toFixed(2)}초로 완주!`);
    });

    // Player died
    socket.on('game:playerDied', (data: { playerId: string; nickname: string }) => {
      if (!data?.nickname) return;
      console.log(`${data.nickname}이(가) 사망`);
    });

    // Game finished
    socket.on('game:finished', (data: { rankings: RankingEntry[] }) => {
      if (!Array.isArray(data?.rankings)) return;
      set({
        status: 'finished',
        rankings: data.rankings,
      });
    });
  },

  cleanupGame: () => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.off('game:countdown');
      socket.off('game:start');
      socket.off('game:state');
      socket.off('game:checkpoint');
      socket.off('game:playerFinished');
      socket.off('game:playerDied');
      socket.off('game:finished');
      socket.off('game:gracePeriodStart');
    }

    set({
      roomId: '',
      status: 'idle',
      countdown: 0,
      startTime: null,
      players: [],
      rankings: [],
      localCheckpoint: 0,
      localFinished: false,
      localFinishTime: null,
      gracePeriod: 0,
      firstFinisherId: null,
      lastCheckpointPos: null,
    });
  },

  sendPosition: (position, velocity, animation) => {
    const socket = socketManager.getSocket();
    if (socket && get().status === 'playing') {
      socket.emit('game:position', { position, velocity, animation });
    }
  },

  reachCheckpoint: (checkpointIndex, position) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('game:checkpoint', { checkpointIndex }, (response: { success: boolean }) => {
        if (response.success) {
          set({
            localCheckpoint: checkpointIndex,
            lastCheckpointPos: position || null,
          });
        }
        resolve(response.success);
      });
    });
  },

  finish: () => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('game:finish', (response: { success: boolean }) => {
        if (response.success) {
          set({ localFinished: true, localFinishTime: Date.now() });
        }
        resolve(response.success);
      });
    });
  },

  notifyDeath: () => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.emit('game:died');
    }
  },

  getOtherPlayers: () => {
    const myId = socketManager.getSocket()?.id;
    return get().players.filter((p) => p.id !== myId);
  },

  setLastCheckpointPos: (pos) => {
    set({ lastCheckpointPos: pos });
  },
}));
