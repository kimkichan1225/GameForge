import { create } from 'zustand';
import { socketManager } from '../lib/socket';
import type { MapObject, MapMarker } from './editorStore';

// 빌딩 페이즈 관련 타입
export interface BuildingRegion {
  startX: number;
  endX: number;
}

export interface PlayerBuildingStatus {
  playerId: string;
  nickname: string;
  isVerified: boolean;
  isTesting: boolean;
}

export interface RelaySegment {
  playerId: string;
  nickname: string;
  order: number;
  objects: MapObject[];
  markers?: MapMarker[];  // checkpoint, killzone 등 추가 마커
  spawnPosition: [number, number, number];
  finishPosition: [number, number, number];
}

export interface RelayMapData {
  segments: RelaySegment[];
  totalCheckpoints: number;
}

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
  status: 'countdown' | 'playing' | 'finished' | 'idle' | 'building';
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

  // 빌딩 페이즈 상태
  buildingPhase: boolean;
  buildingTimeRemaining: number;  // 남은 시간 (초), -1 = 무제한
  myRegion: BuildingRegion | null;
  myObjects: MapObject[];
  myMarkers: MapMarker[];
  myVerified: boolean;
  myTesting: boolean;
  allPlayersStatus: PlayerBuildingStatus[];

  // 릴레이 레이스 상태
  isRelayRace: boolean;
  relayMapData: RelayMapData | null;
  pendingTeleport: [number, number, number] | null;
}

interface MultiplayerGameStore extends GameState {
  // Actions
  initGame: () => void;
  cleanupGame: () => void;
  sendPosition: (position: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }, animation: string) => void;
  reachCheckpoint: (checkpointIndex: number, position?: [number, number, number]) => Promise<{ success: boolean; teleportTo?: [number, number, number] }>;
  finish: () => Promise<boolean>;
  notifyDeath: () => void;
  getOtherPlayers: () => PlayerState[];
  setLastCheckpointPos: (pos: [number, number, number]) => void;

  // 빌딩 페이즈 액션
  initBuilding: () => void;
  cleanupBuilding: () => void;
  placeObject: (data: Omit<MapObject, 'id'>) => Promise<MapObject | null>;
  removeObject: (objectId: string) => Promise<boolean>;
  updateObject: (objectId: string, updates: Partial<MapObject>) => Promise<MapObject | null>;
  placeMarker: (data: { type: 'spawn' | 'finish' | 'checkpoint' | 'killzone'; position: [number, number, number]; rotation: [number, number, number] }) => Promise<MapMarker | null>;
  removeMarker: (markerId: string) => Promise<boolean>;
  startTest: () => Promise<{ success: boolean; error?: string; segment?: { objects: MapObject[]; markers: MapMarker[]; region: BuildingRegion } }>;
  finishTest: (success: boolean) => Promise<void>;
  voteKick: (targetPlayerId: string) => Promise<{ success: boolean; error?: string; kicked?: boolean }>;
  clearPendingTeleport: () => void;
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

  // 빌딩 페이즈 초기 상태
  buildingPhase: false,
  buildingTimeRemaining: -1,
  myRegion: null,
  myObjects: [],
  myMarkers: [],
  myVerified: false,
  myTesting: false,
  allPlayersStatus: [],

  // 릴레이 레이스 초기 상태
  isRelayRace: false,
  relayMapData: null,
  pendingTeleport: null,

  initGame: () => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    // Countdown event
    socket.on('game:countdown', (data: { count: number }) => {
      if (typeof data?.count !== 'number') return;
      set({ countdown: data.count, status: 'countdown' });
    });

    // Game starting event (includes relay map data)
    socket.on('game:starting', (data: {
      countdown: number;
      isRelayRace?: boolean;
      relayMapData?: RelayMapData;
    }) => {
      set({
        countdown: data.countdown,
        status: 'countdown',
        isRelayRace: data.isRelayRace || false,
        relayMapData: data.relayMapData || null,
        buildingPhase: false,  // 빌딩 페이즈 종료
      });
    });

    // Game start event
    socket.on('game:start', (data: {
      startTime: number;
      isRelayRace?: boolean;
      relayMapData?: RelayMapData;
    }) => {
      if (typeof data?.startTime !== 'number') return;
      set({
        status: 'playing',
        startTime: data.startTime,
        localCheckpoint: 0,
        localFinished: false,
        localFinishTime: null,
        isRelayRace: data.isRelayRace || false,
        relayMapData: data.relayMapData || null,
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
      socket.off('game:starting');
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
      // 빌딩/릴레이 상태 초기화
      buildingPhase: false,
      buildingTimeRemaining: -1,
      myRegion: null,
      myObjects: [],
      myMarkers: [],
      myVerified: false,
      myTesting: false,
      allPlayersStatus: [],
      isRelayRace: false,
      relayMapData: null,
      pendingTeleport: null,
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
        resolve({ success: false });
        return;
      }

      socket.emit('game:checkpoint', { checkpointIndex }, (response: { success: boolean; teleportTo?: [number, number, number] }) => {
        if (response.success) {
          set({
            localCheckpoint: checkpointIndex,
            lastCheckpointPos: position || null,
            pendingTeleport: response.teleportTo || null,
          });
        }
        resolve({ success: response.success, teleportTo: response.teleportTo });
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

  clearPendingTeleport: () => {
    set({ pendingTeleport: null });
  },

  // ===== 빌딩 페이즈 액션 =====

  initBuilding: () => {
    const socket = socketManager.getSocket();
    console.log('[initBuilding] 호출됨, socket:', !!socket);
    if (!socket) return;

    // 빌딩 시작 (이벤트 수신 시)
    socket.on('build:started', (data: {
      region: BuildingRegion;
      timeLimit: number;
      playerId: string;
    }) => {
      set({
        buildingPhase: true,
        status: 'building',
        myRegion: data.region,
        buildingTimeRemaining: data.timeLimit,
        myObjects: [],
        myMarkers: [],
        myVerified: false,
        myTesting: false,
      });
    });

    // 서버에 현재 빌딩 상태 요청 (페이지 로드 후 동기화용)
    console.log('[initBuilding] 빌딩 상태 요청 중...');
    socket.emit('build:requestState', (response: {
      success: boolean;
      region?: BuildingRegion;
      timeLimit?: number;
      objects?: MapObject[];
      markers?: MapMarker[];
      isVerified?: boolean;
      isTesting?: boolean;
      allPlayersStatus?: PlayerBuildingStatus[];
      error?: string;
    }) => {
      console.log('[initBuilding] 빌딩 상태 응답:', response);
      if (response.success && response.region) {
        set({
          buildingPhase: true,
          status: 'building',
          myRegion: response.region,
          buildingTimeRemaining: response.timeLimit ?? -1,
          myObjects: response.objects ?? [],
          myMarkers: response.markers ?? [],
          myVerified: response.isVerified ?? false,
          myTesting: response.isTesting ?? false,
          allPlayersStatus: response.allPlayersStatus ?? [],
        });
      } else {
        console.error('[initBuilding] 빌딩 상태 요청 실패:', response.error);
      }
    });

    // 시간 업데이트
    socket.on('build:timeUpdate', (data: { remaining: number }) => {
      set({ buildingTimeRemaining: data.remaining });
    });

    // 오브젝트 배치 확인
    socket.on('build:objectPlaced', (data: { object: MapObject }) => {
      set(state => ({
        myObjects: [...state.myObjects, data.object],
      }));
    });

    // 오브젝트 삭제 확인
    socket.on('build:objectRemoved', (data: { objectId: string }) => {
      set(state => ({
        myObjects: state.myObjects.filter(o => o.id !== data.objectId),
      }));
    });

    // 오브젝트 업데이트 확인
    socket.on('build:objectUpdated', (data: { object: MapObject }) => {
      set(state => ({
        myObjects: state.myObjects.map(o => o.id === data.object.id ? data.object : o),
      }));
    });

    // 마커 배치 확인
    socket.on('build:markerPlaced', (data: { marker: MapMarker }) => {
      set(state => {
        // 같은 타입의 마커가 있으면 업데이트, 없으면 추가
        const existingIndex = state.myMarkers.findIndex(m => m.type === data.marker.type);
        if (existingIndex >= 0) {
          const newMarkers = [...state.myMarkers];
          newMarkers[existingIndex] = data.marker;
          return { myMarkers: newMarkers };
        }
        return { myMarkers: [...state.myMarkers, data.marker] };
      });
    });

    // 마커 삭제 확인
    socket.on('build:markerRemoved', (data: { markerId: string }) => {
      set(state => ({
        myMarkers: state.myMarkers.filter(m => m.id !== data.markerId),
      }));
    });

    // 테스트 시작
    socket.on('build:testStarted', (data: { playerId: string; nickname: string }) => {
      const myId = socket.id;
      if (data.playerId === myId) {
        set({ myTesting: true });
      }
    });

    // 플레이어 검증 완료
    socket.on('build:playerVerified', (data: { playerId: string; nickname: string }) => {
      const myId = socket.id;
      if (data.playerId === myId) {
        set({ myVerified: true, myTesting: false });
      }
    });

    // 전체 상태 업데이트
    socket.on('build:statusUpdate', (data: { players: PlayerBuildingStatus[] }) => {
      const myId = socket.id;
      const myStatus = data.players.find(p => p.playerId === myId);
      set({
        allPlayersStatus: data.players,
        myVerified: myStatus?.isVerified || false,
        myTesting: myStatus?.isTesting || false,
      });
    });

    // 시간 연장
    socket.on('build:timeExtended', (data: {
      newRemaining: number;
      unverifiedPlayers: Array<{ playerId: string; nickname: string }>;
    }) => {
      set({ buildingTimeRemaining: data.newRemaining });
      console.log('시간 연장됨. 미검증 플레이어:', data.unverifiedPlayers);
    });

    // 모든 플레이어 검증 완료
    socket.on('build:allVerified', () => {
      console.log('모든 플레이어 검증 완료!');
    });

    // 조기 시작 카운트다운
    socket.on('build:earlyStartCountdown', (data: { countdown: number }) => {
      console.log(`레이스 시작까지 ${data.countdown}초...`);
    });

    // 강퇴 투표 업데이트
    socket.on('build:voteKickUpdate', (data: {
      targetPlayerId: string;
      nickname: string;
      currentVotes: number;
      votesNeeded: number;
    }) => {
      console.log(`강퇴 투표: ${data.nickname} - ${data.currentVotes}/${data.votesNeeded}`);
    });

    // 플레이어 강퇴됨
    socket.on('build:playerKicked', (data: { playerId: string; nickname: string }) => {
      console.log(`${data.nickname}이(가) 강퇴되었습니다`);
    });

    // 내가 강퇴됨
    socket.on('build:youWereKicked', () => {
      set({
        buildingPhase: false,
        status: 'idle',
        myRegion: null,
        myObjects: [],
        myMarkers: [],
      });
      console.log('투표에 의해 강퇴되었습니다');
    });

    // 빌딩 완료 (서버에서 자동으로 레이스 시작됨)
    socket.on('build:completed', (data: {
      shuffledOrder: Array<{ playerId: string; nickname: string }>;
      relayMap: RelayMapData;
    }) => {
      set({
        relayMapData: data.relayMap,
        isRelayRace: true,
        buildingPhase: false,  // 빌딩 페이즈 종료
        status: 'countdown',   // 상태를 countdown으로 변경하여 빌딩 화면에서 벗어남
      });
      console.log('빌딩 완료! 릴레이 순서:', data.shuffledOrder.map(p => p.nickname).join(' → '));
      // 서버에서 자동으로 game:starting 이벤트가 발생함
    });
  },

  cleanupBuilding: () => {
    const socket = socketManager.getSocket();
    if (socket) {
      socket.off('build:started');
      socket.off('build:timeUpdate');
      socket.off('build:objectPlaced');
      socket.off('build:objectRemoved');
      socket.off('build:objectUpdated');
      socket.off('build:markerPlaced');
      socket.off('build:markerRemoved');
      socket.off('build:testStarted');
      socket.off('build:playerVerified');
      socket.off('build:statusUpdate');
      socket.off('build:timeExtended');
      socket.off('build:allVerified');
      socket.off('build:earlyStartCountdown');
      socket.off('build:voteKickUpdate');
      socket.off('build:playerKicked');
      socket.off('build:youWereKicked');
      socket.off('build:completed');
    }
  },

  placeObject: (data) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(null);
        return;
      }

      socket.emit('build:placeObject', data, (response: { success: boolean; object?: MapObject }) => {
        if (response.success && response.object) {
          resolve(response.object);
        } else {
          resolve(null);
        }
      });
    });
  },

  removeObject: (objectId) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('build:removeObject', { objectId }, (response: { success: boolean }) => {
        resolve(response.success);
      });
    });
  },

  updateObject: (objectId, updates) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(null);
        return;
      }

      socket.emit('build:updateObject', { objectId, updates }, (response: { success: boolean; object?: MapObject }) => {
        if (response.success && response.object) {
          resolve(response.object);
        } else {
          resolve(null);
        }
      });
    });
  },

  placeMarker: (data) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(null);
        return;
      }

      socket.emit('build:placeMarker', data, (response: { success: boolean; marker?: MapMarker }) => {
        if (response.success && response.marker) {
          resolve(response.marker);
        } else {
          resolve(null);
        }
      });
    });
  },

  removeMarker: (markerId) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(false);
        return;
      }

      socket.emit('build:removeMarker', { markerId }, (response: { success: boolean }) => {
        resolve(response.success);
      });
    });
  },

  startTest: () => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve({ success: false, error: '연결되지 않음' });
        return;
      }

      socket.emit('build:startTest', (response: {
        success: boolean;
        error?: string;
        segment?: { objects: MapObject[]; markers: MapMarker[]; region: BuildingRegion };
      }) => {
        if (response.success) {
          set({ myTesting: true });
        }
        resolve(response);
      });
    });
  },

  finishTest: (success) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve();
        return;
      }

      socket.emit('build:finishTest', { success }, () => {
        set({ myTesting: false });
        if (success) {
          set({ myVerified: true });
        }
        resolve();
      });
    });
  },

  voteKick: (targetPlayerId) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve({ success: false, error: '연결되지 않음' });
        return;
      }

      socket.emit('build:voteKick', { targetPlayerId }, (response: { success: boolean; error?: string; kicked?: boolean }) => {
        resolve(response);
      });
    });
  },
}));
