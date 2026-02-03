import { create } from 'zustand';
import { socketManager } from '../lib/socket';
import type { MapObject, MapMarker } from './editorStore';

// 빌딩 모드 히스토리 엔트리
export interface BuildingHistoryEntry {
  type: 'add' | 'remove' | 'update'
  target: 'object' | 'marker'
  data: MapObject | MapMarker
  previousData?: MapObject | MapMarker
}

// 빌딩 모드 클립보드 아이템
export type BuildingClipboardItem = { kind: 'object'; data: MapObject } | { kind: 'marker'; data: MapMarker }

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
  region?: { startX: number; endX: number };  // 실제 빌딩 영역 정보
}

export interface RelayMapData {
  segments: RelaySegment[];
  totalCheckpoints: number;
}

interface PlayerState {
  id: string;
  nickname: string;
  color?: string;  // 플레이어 색상 ID
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

  // 빌딩 모드 로컬 히스토리 (서버 동기화 X)
  buildingSelectedIds: string[];
  buildingUndoStack: BuildingHistoryEntry[];
  buildingRedoStack: BuildingHistoryEntry[];
  buildingClipboard: BuildingClipboardItem[];
  isBuildingPasteMode: boolean;  // 붙여넣기 모드
}

interface MultiplayerGameStore extends GameState {
  // Actions
  initGame: () => void;
  cleanupGame: () => void;
  sendPosition: (position: { x: number; y: number; z: number }, velocity: { x: number; y: number; z: number }, animation: string) => void;
  reachCheckpoint: (checkpointIndex: number, position?: [number, number, number], isRelayCheckpoint?: boolean) => Promise<{ success: boolean; teleportTo?: [number, number, number] }>;
  finish: () => Promise<boolean>;
  notifyDeath: () => void;
  getOtherPlayers: () => PlayerState[];
  setLastCheckpointPos: (pos: [number, number, number]) => void;
  incrementLocalCheckpoint: (pos: [number, number, number]) => void;  // 일반 체크포인트용 (UI 카운트만 증가)

  // 빌딩 페이즈 액션
  initBuilding: () => void;
  cleanupBuilding: () => void;
  placeObject: (data: Omit<MapObject, 'id'>) => Promise<MapObject | null>;
  removeObject: (objectId: string) => Promise<boolean>;
  updateObject: (objectId: string, updates: Partial<MapObject>) => Promise<MapObject | null>;
  placeMarker: (data: { type: 'spawn' | 'finish' | 'checkpoint' | 'killzone'; position: [number, number, number]; rotation: [number, number, number] }) => Promise<MapMarker | null>;
  removeMarker: (markerId: string) => Promise<boolean>;
  updateMarker: (markerId: string, updates: Partial<MapMarker>) => Promise<MapMarker | null>;
  startTest: () => Promise<{ success: boolean; error?: string; segment?: { objects: MapObject[]; markers: MapMarker[]; region: BuildingRegion } }>;
  finishTest: (success: boolean) => Promise<void>;
  voteKick: (targetPlayerId: string) => Promise<{ success: boolean; error?: string; kicked?: boolean }>;
  clearPendingTeleport: () => void;

  // 빌딩 모드 로컬 기능
  setBuildingSelectedIds: (ids: string[]) => void;
  toggleBuildingSelection: (id: string) => void;
  clearBuildingSelection: () => void;
  moveBuildingSelectedObjects: (offset: [number, number, number]) => Promise<void>;
  buildingUndo: () => Promise<void>;
  buildingRedo: () => Promise<void>;
  buildingCopy: () => void;  // 복사 + 붙여넣기 모드 진입
  exitBuildingPasteMode: () => void;  // 붙여넣기 모드 종료
  buildingPasteAtPosition: (position: [number, number, number]) => Promise<void>;  // 특정 위치에 붙여넣기
  buildingDeleteSelected: () => Promise<void>;
  setBuildingSelectedObjectsColor: (color: string) => Promise<void>;
  pushBuildingHistory: (entry: BuildingHistoryEntry) => void;
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

  // 빌딩 모드 로컬 히스토리 초기 상태
  buildingSelectedIds: [],
  buildingUndoStack: [],
  buildingRedoStack: [],
  buildingClipboard: [],
  isBuildingPasteMode: false,

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
    socket.on('game:checkpoint', (_data: { playerId: string; nickname: string; checkpoint: number }) => {
      // 체크포인트 통과 이벤트 (UI 알림 등에 활용 가능)
    });

    // Grace period started (first player finished)
    socket.on('game:gracePeriodStart', (data: {
      firstFinisherId: string;
      nickname: string;
      time: number;
      duration: number;
    }) => {
      if (!data?.firstFinisherId) return;
      set({
        firstFinisherId: data.firstFinisherId,
        gracePeriod: Math.max(0, data.duration ?? 0),
      });
    });

    // Player finished
    socket.on('game:playerFinished', (_data: {
      playerId: string;
      nickname: string;
      time: number;
      isFirstFinisher: boolean;
    }) => {
      // 완주 이벤트 (UI 알림 등에 활용 가능)
    });

    // Player died
    socket.on('game:playerDied', (_data: { playerId: string; nickname: string }) => {
      // 사망 이벤트 (UI 알림 등에 활용 가능)
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
      // 빌딩 로컬 히스토리 초기화
      buildingSelectedIds: [],
      buildingUndoStack: [],
      buildingRedoStack: [],
      buildingClipboard: [],
      isBuildingPasteMode: false,
    });
  },

  sendPosition: (position, velocity, animation) => {
    const socket = socketManager.getSocket();
    if (socket && get().status === 'playing') {
      socket.emit('game:position', { position, velocity, animation });
    }
  },

  reachCheckpoint: (checkpointIndex, position, isRelayCheckpoint = false) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve({ success: false });
        return;
      }

      socket.emit('game:checkpoint', { checkpointIndex, isRelayCheckpoint }, (response: { success: boolean; teleportTo?: [number, number, number] }) => {
        if (response.success) {
          set(state => ({
            localCheckpoint: state.localCheckpoint + 1,  // 기존 값에서 +1 증가
            lastCheckpointPos: position || null,
            pendingTeleport: response.teleportTo || null,
          }));
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

  incrementLocalCheckpoint: (pos) => {
    set(state => ({
      localCheckpoint: state.localCheckpoint + 1,
      lastCheckpointPos: pos,
    }));
  },

  clearPendingTeleport: () => {
    set({ pendingTeleport: null });
  },

  // ===== 빌딩 페이즈 액션 =====

  initBuilding: () => {
    const socket = socketManager.getSocket();
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
        // spawn, finish는 1개만 허용 (같은 타입이 있으면 업데이트)
        // checkpoint, killzone은 여러 개 허용 (같은 ID가 있으면 업데이트, 없으면 추가)
        if (data.marker.type === 'spawn' || data.marker.type === 'finish') {
          const existingIndex = state.myMarkers.findIndex(m => m.type === data.marker.type);
          if (existingIndex >= 0) {
            const newMarkers = [...state.myMarkers];
            newMarkers[existingIndex] = data.marker;
            return { myMarkers: newMarkers };
          }
        } else {
          // checkpoint, killzone: ID로 확인
          const existingIndex = state.myMarkers.findIndex(m => m.id === data.marker.id);
          if (existingIndex >= 0) {
            const newMarkers = [...state.myMarkers];
            newMarkers[existingIndex] = data.marker;
            return { myMarkers: newMarkers };
          }
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

    // 마커 수정 확인
    socket.on('build:markerUpdated', (data: { marker: MapMarker }) => {
      set(state => {
        const index = state.myMarkers.findIndex(m => m.id === data.marker.id);
        if (index >= 0) {
          const newMarkers = [...state.myMarkers];
          newMarkers[index] = data.marker;
          return { myMarkers: newMarkers };
        }
        return {};
      });
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
    });

    // 모든 플레이어 검증 완료
    socket.on('build:allVerified', () => {
      // UI 알림 등에 활용 가능
    });

    // 조기 시작 카운트다운
    socket.on('build:earlyStartCountdown', (_data: { countdown: number }) => {
      // UI 알림 등에 활용 가능
    });

    // 강퇴 투표 업데이트
    socket.on('build:voteKickUpdate', (_data: {
      targetPlayerId: string;
      nickname: string;
      currentVotes: number;
      votesNeeded: number;
    }) => {
      // UI 알림 등에 활용 가능
    });

    // 플레이어 강퇴됨
    socket.on('build:playerKicked', (_data: { playerId: string; nickname: string }) => {
      // UI 알림 등에 활용 가능
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
      socket.off('build:markerUpdated');
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

  updateMarker: (markerId, updates) => {
    return new Promise((resolve) => {
      const socket = socketManager.getSocket();
      if (!socket) {
        resolve(null);
        return;
      }

      socket.emit('build:updateMarker', { markerId, updates }, (response: { success: boolean; marker?: MapMarker }) => {
        if (response.success && response.marker) {
          resolve(response.marker);
        } else {
          resolve(null);
        }
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

  // ===== 빌딩 모드 로컬 기능 =====

  setBuildingSelectedIds: (ids) => set({ buildingSelectedIds: ids }),

  toggleBuildingSelection: (id) => set(state => {
    if (state.buildingSelectedIds.includes(id)) {
      return { buildingSelectedIds: state.buildingSelectedIds.filter(sId => sId !== id) }
    } else {
      return { buildingSelectedIds: [...state.buildingSelectedIds, id] }
    }
  }),

  clearBuildingSelection: () => set({ buildingSelectedIds: [] }),

  // 다중 선택 이동 (선택된 오브젝트들을 오프셋만큼 이동)
  moveBuildingSelectedObjects: async (offset: [number, number, number]) => {
    const state = get()
    if (state.buildingSelectedIds.length === 0) return
    if (state.myVerified) return  // 검증 완료 후 수정 불가

    const socket = socketManager.getSocket()
    if (!socket) return

    const snap = (val: number) => Math.round(val * 2) / 2

    // 이동할 양이 없으면 무시
    if (offset[0] === 0 && offset[1] === 0 && offset[2] === 0) return

    // 선택된 오브젝트/마커 분류
    const selectedObjects = state.myObjects.filter(o => state.buildingSelectedIds.includes(o.id))
    const selectedMarkerIds = state.buildingSelectedIds
      .filter(id => id.startsWith('marker_'))
      .map(id => id.replace('marker_', ''))
    const selectedMarkers = state.myMarkers.filter(m => selectedMarkerIds.includes(m.id))

    if (selectedObjects.length === 0 && selectedMarkers.length === 0) return

    // 히스토리 배치 저장
    const historyEntries: BuildingHistoryEntry[] = []

    // 오브젝트 이동 (서버에 업데이트 요청)
    for (const obj of selectedObjects) {
      const previousData = { ...obj }
      const newPosition: [number, number, number] = [
        snap(obj.position[0] + offset[0]),
        snap(obj.position[1] + offset[1]),
        snap(obj.position[2] + offset[2]),
      ]

      await new Promise<void>((resolve) => {
        socket.emit('build:updateObject', { objectId: obj.id, updates: { position: newPosition } }, () => {
          resolve()
        })
      })

      const newObj = { ...obj, position: newPosition }
      historyEntries.push({ type: 'update', target: 'object', data: newObj, previousData })
    }

    // 마커 이동 (서버에 업데이트 요청)
    for (const marker of selectedMarkers) {
      const previousData = { ...marker }
      const newPosition: [number, number, number] = [
        snap(marker.position[0] + offset[0]),
        snap(marker.position[1] + offset[1]),
        snap(marker.position[2] + offset[2]),
      ]

      await new Promise<void>((resolve) => {
        socket.emit('build:updateMarker', { markerId: marker.id, updates: { position: newPosition } }, () => {
          resolve()
        })
      })

      const newMarker = { ...marker, position: newPosition }
      historyEntries.push({ type: 'update', target: 'marker', data: newMarker, previousData })
    }

    // 히스토리 저장
    set(state => ({
      buildingUndoStack: [...state.buildingUndoStack, ...historyEntries],
      buildingRedoStack: [],
    }))
  },

  pushBuildingHistory: (entry) => set(state => ({
    buildingUndoStack: [...state.buildingUndoStack, entry],
    buildingRedoStack: [],
  })),

  buildingUndo: async () => {
    const state = get()
    if (state.buildingUndoStack.length === 0) return
    if (state.myVerified) return  // 검증 완료 후 수정 불가

    const entry = state.buildingUndoStack[state.buildingUndoStack.length - 1]
    const newUndoStack = state.buildingUndoStack.slice(0, -1)

    const socket = socketManager.getSocket()
    if (!socket) return

    if (entry.type === 'add') {
      // add를 취소 -> 삭제
      if (entry.target === 'object') {
        const objectId = (entry.data as MapObject).id
        await new Promise<void>((resolve) => {
          socket.emit('build:removeObject', { objectId }, () => resolve())
        })
      } else {
        const markerId = (entry.data as MapMarker).id
        await new Promise<void>((resolve) => {
          socket.emit('build:removeMarker', { markerId }, () => resolve())
        })
      }
    } else if (entry.type === 'remove') {
      // remove를 취소 -> 다시 추가
      if (entry.target === 'object') {
        const obj = entry.data as MapObject
        await new Promise<void>((resolve) => {
          socket.emit('build:placeObject', {
            type: obj.type,
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale,
            color: obj.color,
            name: obj.name,
          }, () => resolve())
        })
      } else {
        const marker = entry.data as MapMarker
        await new Promise<void>((resolve) => {
          socket.emit('build:placeMarker', {
            type: marker.type,
            position: marker.position,
            rotation: marker.rotation,
          }, () => resolve())
        })
      }
    } else if (entry.type === 'update' && entry.previousData) {
      // update를 취소 -> 이전 상태로
      if (entry.target === 'object') {
        const obj = entry.previousData as MapObject
        await new Promise<void>((resolve) => {
          socket.emit('build:updateObject', {
            objectId: obj.id,
            updates: { position: obj.position, rotation: obj.rotation, scale: obj.scale, color: obj.color },
          }, () => resolve())
        })
      } else {
        const marker = entry.previousData as MapMarker
        await new Promise<void>((resolve) => {
          socket.emit('build:updateMarker', {
            markerId: marker.id,
            updates: { position: marker.position, rotation: marker.rotation },
          }, () => resolve())
        })
      }
    }

    set({
      buildingUndoStack: newUndoStack,
      buildingRedoStack: [...state.buildingRedoStack, entry],
    })
  },

  buildingRedo: async () => {
    const state = get()
    if (state.buildingRedoStack.length === 0) return
    if (state.myVerified) return  // 검증 완료 후 수정 불가

    const entry = state.buildingRedoStack[state.buildingRedoStack.length - 1]
    const newRedoStack = state.buildingRedoStack.slice(0, -1)

    const socket = socketManager.getSocket()
    if (!socket) return

    if (entry.type === 'add') {
      // add를 다시 실행 -> 추가
      if (entry.target === 'object') {
        const obj = entry.data as MapObject
        await new Promise<void>((resolve) => {
          socket.emit('build:placeObject', {
            type: obj.type,
            position: obj.position,
            rotation: obj.rotation,
            scale: obj.scale,
            color: obj.color,
            name: obj.name,
          }, () => resolve())
        })
      } else {
        const marker = entry.data as MapMarker
        await new Promise<void>((resolve) => {
          socket.emit('build:placeMarker', {
            type: marker.type,
            position: marker.position,
            rotation: marker.rotation,
          }, () => resolve())
        })
      }
    } else if (entry.type === 'remove') {
      // remove를 다시 실행 -> 삭제
      if (entry.target === 'object') {
        const objectId = (entry.data as MapObject).id
        await new Promise<void>((resolve) => {
          socket.emit('build:removeObject', { objectId }, () => resolve())
        })
      } else {
        const markerId = (entry.data as MapMarker).id
        await new Promise<void>((resolve) => {
          socket.emit('build:removeMarker', { markerId }, () => resolve())
        })
      }
    } else if (entry.type === 'update') {
      // update를 다시 실행 -> 새 상태로
      if (entry.target === 'object') {
        const obj = entry.data as MapObject
        await new Promise<void>((resolve) => {
          socket.emit('build:updateObject', {
            objectId: obj.id,
            updates: { position: obj.position, rotation: obj.rotation, scale: obj.scale, color: obj.color },
          }, () => resolve())
        })
      } else {
        const marker = entry.data as MapMarker
        await new Promise<void>((resolve) => {
          socket.emit('build:updateMarker', {
            markerId: marker.id,
            updates: { position: marker.position, rotation: marker.rotation },
          }, () => resolve())
        })
      }
    }

    set({
      buildingUndoStack: [...state.buildingUndoStack, entry],
      buildingRedoStack: newRedoStack,
    })
  },

  // 복사 + 붙여넣기 모드 진입
  buildingCopy: () => {
    const state = get()
    if (state.buildingSelectedIds.length === 0) return

    const clipboardItems: BuildingClipboardItem[] = []

    for (const id of state.buildingSelectedIds) {
      if (id.startsWith('marker_')) {
        const markerId = id.replace('marker_', '')
        const marker = state.myMarkers.find(m => m.id === markerId)
        if (marker) {
          clipboardItems.push({ kind: 'marker', data: { ...marker } })
        }
      } else {
        const obj = state.myObjects.find(o => o.id === id)
        if (obj) {
          clipboardItems.push({ kind: 'object', data: { ...obj } })
        }
      }
    }

    // 붙여넣기 모드 진입 (선택 해제)
    set({
      buildingClipboard: clipboardItems,
      isBuildingPasteMode: true,
      buildingSelectedIds: [],
    })
  },

  // 붙여넣기 모드 종료
  exitBuildingPasteMode: () => {
    set({ isBuildingPasteMode: false })
  },

  // 특정 위치에 붙여넣기 (좌클릭 시 호출)
  buildingPasteAtPosition: async (position: [number, number, number]) => {
    const state = get()
    if (state.buildingClipboard.length === 0 || !state.isBuildingPasteMode) return
    if (state.myVerified) return  // 검증 완료 후 배치 불가
    if (!state.myRegion) return

    const socket = socketManager.getSocket()
    if (!socket) return

    // 클립보드 아이템들의 중심점 계산
    let centerX = 0, centerY = 0, centerZ = 0
    let count = 0
    for (const item of state.buildingClipboard) {
      const pos = item.data.position
      centerX += pos[0]
      centerY += pos[1]
      centerZ += pos[2]
      count++
    }
    centerX /= count
    centerY /= count
    centerZ /= count

    const region = state.myRegion
    const historyEntries: BuildingHistoryEntry[] = []

    for (const item of state.buildingClipboard) {
      const offsetX = item.data.position[0] - centerX
      const offsetY = item.data.position[1] - centerY
      const offsetZ = item.data.position[2] - centerZ

      const newX = position[0] + offsetX
      const newY = position[1] + offsetY
      const newZ = position[2] + offsetZ

      // 영역 제한 체크
      if (newX < region.startX || newX >= region.endX || newZ < -50 || newZ > 50) {
        continue  // 영역 밖이면 스킵
      }

      if (item.kind === 'object') {
        const result = await new Promise<MapObject | null>((resolve) => {
          socket.emit('build:placeObject', {
            type: item.data.type,
            position: [newX, newY, newZ] as [number, number, number],
            rotation: item.data.rotation,
            scale: item.data.scale,
            color: item.data.color,
            name: `${item.data.type}_${Math.random().toString(36).substr(2, 4)}`,
          }, (response: { success: boolean; object?: MapObject }) => {
            resolve(response.success && response.object ? response.object : null)
          })
        })
        if (result) {
          historyEntries.push({ type: 'add', target: 'object', data: result })
        }
      } else {
        const result = await new Promise<MapMarker | null>((resolve) => {
          socket.emit('build:placeMarker', {
            type: item.data.type,
            position: [newX, newY, newZ] as [number, number, number],
            rotation: item.data.rotation,
          }, (response: { success: boolean; marker?: MapMarker }) => {
            resolve(response.success && response.marker ? response.marker : null)
          })
        })
        if (result) {
          historyEntries.push({ type: 'add', target: 'marker', data: result })
        }
      }
    }

    if (historyEntries.length > 0) {
      set(state => ({
        buildingUndoStack: [...state.buildingUndoStack, ...historyEntries],
        buildingRedoStack: [],
        // 붙여넣기 모드 유지 (여러 번 붙여넣기 가능)
      }))
    }
  },

  buildingDeleteSelected: async () => {
    const state = get()
    if (state.buildingSelectedIds.length === 0) return
    if (state.myVerified) return  // 검증 완료 후 삭제 불가

    const socket = socketManager.getSocket()
    if (!socket) return

    const historyEntries: BuildingHistoryEntry[] = []

    for (const selectedId of state.buildingSelectedIds) {
      if (selectedId.startsWith('marker_')) {
        const markerId = selectedId.replace('marker_', '')
        const marker = state.myMarkers.find(m => m.id === markerId)
        if (marker) {
          await new Promise<void>((resolve) => {
            socket.emit('build:removeMarker', { markerId }, () => resolve())
          })
          historyEntries.push({ type: 'remove', target: 'marker', data: marker })
        }
      } else {
        const obj = state.myObjects.find(o => o.id === selectedId)
        if (obj) {
          await new Promise<void>((resolve) => {
            socket.emit('build:removeObject', { objectId: selectedId }, () => resolve())
          })
          historyEntries.push({ type: 'remove', target: 'object', data: obj })
        }
      }
    }

    set(state => ({
      buildingSelectedIds: [],
      buildingUndoStack: [...state.buildingUndoStack, ...historyEntries],
      buildingRedoStack: [],
    }))
  },

  // 다중 선택 색상 일괄 변경
  setBuildingSelectedObjectsColor: async (color: string) => {
    const state = get()
    if (state.buildingSelectedIds.length === 0) return
    if (state.myVerified) return  // 검증 완료 후 수정 불가

    const socket = socketManager.getSocket()
    if (!socket) return

    // 선택된 오브젝트만 필터 (마커는 색상 없음)
    const selectedObjectIds = state.buildingSelectedIds.filter(id => !id.startsWith('marker_'))
    if (selectedObjectIds.length === 0) return

    const historyEntries: BuildingHistoryEntry[] = []

    for (const objectId of selectedObjectIds) {
      const obj = state.myObjects.find(o => o.id === objectId)
      if (!obj) continue

      const previousData = { ...obj }

      await new Promise<void>((resolve) => {
        socket.emit('build:updateObject', { objectId, updates: { color } }, () => {
          resolve()
        })
      })

      const newObj = { ...obj, color }
      historyEntries.push({ type: 'update', target: 'object', data: newObj, previousData })
    }

    if (historyEntries.length > 0) {
      set(state => ({
        buildingUndoStack: [...state.buildingUndoStack, ...historyEntries],
        buildingRedoStack: [],
      }))
    }
  },
}));
