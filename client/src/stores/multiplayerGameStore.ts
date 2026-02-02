import { create } from 'zustand';
import { socketManager } from '../lib/socket';

interface PlayerState {
  id: string;
  nickname: string;
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  checkpoint: number;
  finished: boolean;
  finishTime?: number;
}

interface RankingEntry {
  playerId: string;
  nickname: string;
  time: number;
  rank: number;
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
}

interface MultiplayerGameStore extends GameState {
  // Actions
  initGame: () => void;
  cleanupGame: () => void;
  sendPosition: (position: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }) => void;
  reachCheckpoint: (checkpointIndex: number) => Promise<boolean>;
  finish: () => Promise<boolean>;
  notifyDeath: () => void;
  getOtherPlayers: () => PlayerState[];
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

  initGame: () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Countdown event
    socket.on('game:countdown', (data: { count: number }) => {
      set({ countdown: data.count, status: 'countdown' });
    });

    // Game start event
    socket.on('game:start', (data: { startTime: number }) => {
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
    }) => {
      set({
        roomId: data.roomId,
        players: data.players,
        rankings: data.rankings,
      });
    });

    // Checkpoint reached by another player
    socket.on('game:checkpoint', (data: { playerId: string; nickname: string; checkpoint: number }) => {
      console.log(`${data.nickname}이(가) 체크포인트 ${data.checkpoint} 통과`);
    });

    // Player finished
    socket.on('game:playerFinished', (data: { playerId: string; nickname: string; time: number }) => {
      console.log(`${data.nickname}이(가) ${(data.time / 1000).toFixed(2)}초로 완주!`);
    });

    // Player died
    socket.on('game:playerDied', (data: { playerId: string; nickname: string }) => {
      console.log(`${data.nickname}이(가) 사망`);
    });

    // Game finished
    socket.on('game:finished', (data: { rankings: RankingEntry[] }) => {
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
    });
  },

  sendPosition: (position, velocity) => {
    const socket = socketManager.getSocket();
    if (socket && get().status === 'playing') {
      socket.emit('game:position', { position, velocity });
    }
  },

  reachCheckpoint: (checkpointIndex) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('game:checkpoint', { checkpointIndex }, (response: { success: boolean }) => {
        if (response.success) {
          set({ localCheckpoint: checkpointIndex });
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
}));
