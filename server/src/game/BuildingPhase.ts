import { Server } from 'socket.io';
import { Room, Player } from './Room.js';

// MapObject와 MapMarker 타입 정의 (클라이언트와 동일)
export interface MapObject {
  id: string;
  type: 'box' | 'cylinder' | 'sphere' | 'plane' | 'ramp';
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  color: string;
  name: string;
}

export interface MapMarker {
  id: string;
  type: 'spawn' | 'finish' | 'checkpoint' | 'killzone';
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface BuildingSegment {
  playerId: string;
  nickname: string;
  region: { startX: number; endX: number };
  objects: MapObject[];
  markers: MapMarker[];
  isVerified: boolean;
  isTesting: boolean;
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
  markers: MapMarker[];  // checkpoint, killzone 등 추가 마커
  spawnPosition: [number, number, number];
  finishPosition: [number, number, number];
}

export interface RelayMapData {
  segments: RelaySegment[];
  totalCheckpoints: number;
}

const SEGMENT_SIZE = 50; // 각 플레이어 구간 X축 크기
const TIME_EXTENSION_SECONDS = 30;
const EARLY_START_COUNTDOWN = 3;

export class BuildingPhase {
  private io: Server;
  private room: Room;
  private segments: Map<string, BuildingSegment> = new Map();
  private timeRemaining: number;  // -1 = 무제한
  private intervalId: NodeJS.Timeout | null = null;
  private kickVotes: Map<string, Set<string>> = new Map();  // targetId -> 투표한 플레이어 ID Set
  private earlyStartCountdown: number = 0;
  private earlyStartIntervalId: NodeJS.Timeout | null = null;
  private onCompleteCallback: ((relayMapData: RelayMapData) => void) | null = null;

  constructor(io: Server, room: Room, timeLimit: number | undefined) {
    this.io = io;
    this.room = room;
    // timeLimit이 0이면 무제한, undefined도 무제한
    this.timeRemaining = timeLimit && timeLimit > 0 ? timeLimit : -1;
  }

  // 빌딩 완료 시 호출될 콜백 등록
  onComplete(callback: (relayMapData: RelayMapData) => void): void {
    this.onCompleteCallback = callback;
  }

  start(): void {
    // 각 플레이어에게 영역 할당
    this.allocateRegions();

    // 모든 플레이어에게 빌딩 시작 알림
    for (const [playerId, segment] of this.segments) {
      const socket = this.io.sockets.sockets.get(playerId);
      if (socket) {
        socket.emit('build:started', {
          region: segment.region,
          timeLimit: this.timeRemaining,
          playerId: playerId,
        });
      }
    }

    // 초기 상태 브로드캐스트
    this.broadcastStatus();

    // 타이머 시작 (무제한이 아닌 경우)
    if (this.timeRemaining > 0) {
      this.intervalId = setInterval(() => this.tick(), 1000);
    }

    console.log(`빌딩 페이즈 시작: 방 ${this.room.id}, 플레이어 ${this.segments.size}명, 시간 ${this.timeRemaining === -1 ? '무제한' : this.timeRemaining + '초'}`);
  }

  private allocateRegions(): void {
    const players = Array.from(this.room.players.values());
    let currentX = 0;

    for (const player of players) {
      const segment: BuildingSegment = {
        playerId: player.id,
        nickname: player.nickname,
        region: {
          startX: currentX,
          endX: currentX + SEGMENT_SIZE,
        },
        objects: [],
        markers: [],
        isVerified: false,
        isTesting: false,
      };

      this.segments.set(player.id, segment);
      currentX += SEGMENT_SIZE;
    }
  }

  private tick(): void {
    if (this.timeRemaining <= 0) return;

    this.timeRemaining--;

    // 남은 시간 브로드캐스트
    this.io.to(this.room.id).emit('build:timeUpdate', {
      remaining: this.timeRemaining,
    });

    // 시간 종료
    if (this.timeRemaining <= 0) {
      this.handleTimeUp();
    }
  }

  private handleTimeUp(): void {
    const unverifiedPlayers = this.getUnverifiedPlayers();

    if (unverifiedPlayers.length === 0) {
      // 모두 검증 완료 - 레이스 시작
      this.complete();
    } else {
      // 미검증자 있음 - 30초 연장
      this.extendTime(TIME_EXTENSION_SECONDS);

      this.io.to(this.room.id).emit('build:timeExtended', {
        newRemaining: this.timeRemaining,
        unverifiedPlayers: unverifiedPlayers.map(s => ({
          playerId: s.playerId,
          nickname: s.nickname,
        })),
      });
    }
  }

  private getUnverifiedPlayers(): BuildingSegment[] {
    return Array.from(this.segments.values()).filter(s => !s.isVerified);
  }

  private getVerifiedPlayers(): BuildingSegment[] {
    return Array.from(this.segments.values()).filter(s => s.isVerified);
  }

  extendTime(seconds: number): void {
    this.timeRemaining = seconds;

    // 타이머가 중지되어 있으면 다시 시작
    if (!this.intervalId) {
      this.intervalId = setInterval(() => this.tick(), 1000);
    }
  }

  // 오브젝트 배치
  placeObject(playerId: string, objectData: Omit<MapObject, 'id'>): MapObject | null {
    const segment = this.segments.get(playerId);
    if (!segment) return null;

    // 검증 완료 후에는 수정 불가
    if (segment.isVerified) return null;

    // 테스트 플레이 중에는 수정 불가
    if (segment.isTesting) return null;

    // 영역 검사 (X축)
    const x = objectData.position[0];
    if (x < segment.region.startX || x >= segment.region.endX) {
      return null;
    }

    // 영역 검사 (Z축: -50 ~ +50)
    const z = objectData.position[2];
    if (z < -50 || z > 50) {
      return null;
    }

    const id = this.generateId();
    const object: MapObject = {
      id,
      ...objectData,
    };

    segment.objects.push(object);

    return object;
  }

  // 오브젝트 삭제
  removeObject(playerId: string, objectId: string): boolean {
    const segment = this.segments.get(playerId);
    if (!segment) return false;
    if (segment.isVerified || segment.isTesting) return false;

    const index = segment.objects.findIndex(o => o.id === objectId);
    if (index === -1) return false;

    segment.objects.splice(index, 1);
    return true;
  }

  // 오브젝트 수정
  updateObject(playerId: string, objectId: string, updates: Partial<MapObject>): MapObject | null {
    const segment = this.segments.get(playerId);
    if (!segment) return null;
    if (segment.isVerified || segment.isTesting) return null;

    const object = segment.objects.find(o => o.id === objectId);
    if (!object) return null;

    // position 업데이트 시 영역 검사
    if (updates.position) {
      const x = updates.position[0];
      if (x < segment.region.startX || x >= segment.region.endX) {
        return null;
      }
    }

    Object.assign(object, updates);
    return object;
  }

  // 마커 배치
  placeMarker(playerId: string, markerData: Omit<MapMarker, 'id'>): MapMarker | null {
    const segment = this.segments.get(playerId);
    if (!segment) return null;
    if (segment.isVerified || segment.isTesting) return null;

    // 빌딩 모드에서는 spawn, finish만 허용
    if (markerData.type !== 'spawn' && markerData.type !== 'finish') {
      return null;
    }

    // 영역 검사 (X축)
    const x = markerData.position[0];
    if (x < segment.region.startX || x >= segment.region.endX) {
      return null;
    }

    // 영역 검사 (Z축: -50 ~ +50)
    const z = markerData.position[2];
    if (z < -50 || z > 50) {
      return null;
    }

    // spawn, finish는 각각 1개만 허용 (기존 마커 업데이트)
    // checkpoint, killzone은 여러 개 허용
    if (markerData.type === 'spawn' || markerData.type === 'finish') {
      const existingMarker = segment.markers.find(m => m.type === markerData.type);
      if (existingMarker) {
        // 기존 마커 업데이트
        existingMarker.position = markerData.position;
        existingMarker.rotation = markerData.rotation;
        return existingMarker;
      }
    }

    const id = this.generateId();
    const marker: MapMarker = {
      id,
      ...markerData,
    };

    segment.markers.push(marker);
    return marker;
  }

  // 마커 삭제
  removeMarker(playerId: string, markerId: string): boolean {
    const segment = this.segments.get(playerId);
    if (!segment) return false;
    if (segment.isVerified || segment.isTesting) return false;

    const index = segment.markers.findIndex(m => m.id === markerId);
    if (index === -1) return false;

    segment.markers.splice(index, 1);
    return true;
  }

  // 테스트 플레이 시작
  startTest(playerId: string): { success: boolean; error?: string } {
    const segment = this.segments.get(playerId);
    if (!segment) return { success: false, error: '플레이어를 찾을 수 없습니다' };
    if (segment.isVerified) return { success: false, error: '이미 검증이 완료되었습니다' };
    if (segment.isTesting) return { success: false, error: '이미 테스트 중입니다' };

    // spawn, finish 마커 확인
    const hasSpawn = segment.markers.some(m => m.type === 'spawn');
    const hasFinish = segment.markers.some(m => m.type === 'finish');

    if (!hasSpawn) return { success: false, error: 'Start 마커를 배치해주세요' };
    if (!hasFinish) return { success: false, error: 'Finish 마커를 배치해주세요' };

    segment.isTesting = true;

    // 브로드캐스트: 테스트 시작
    this.io.to(this.room.id).emit('build:testStarted', {
      playerId,
      nickname: segment.nickname,
    });

    this.broadcastStatus();

    return { success: true };
  }

  // 테스트 플레이 종료
  finishTest(playerId: string, success: boolean): void {
    const segment = this.segments.get(playerId);
    if (!segment) return;
    if (!segment.isTesting) return;

    segment.isTesting = false;

    if (success) {
      segment.isVerified = true;

      this.io.to(this.room.id).emit('build:playerVerified', {
        playerId,
        nickname: segment.nickname,
      });

      // 모든 플레이어 검증 완료 확인
      this.checkAllVerified();
    }

    this.broadcastStatus();
  }

  private checkAllVerified(): void {
    const allVerified = Array.from(this.segments.values()).every(s => s.isVerified);

    if (allVerified) {
      this.io.to(this.room.id).emit('build:allVerified');

      // 조기 시작 카운트다운
      this.earlyStartCountdown = EARLY_START_COUNTDOWN;

      // 타이머 정지
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      // 조기 시작 카운트다운 시작
      this.earlyStartIntervalId = setInterval(() => {
        this.earlyStartCountdown--;

        this.io.to(this.room.id).emit('build:earlyStartCountdown', {
          countdown: this.earlyStartCountdown,
        });

        if (this.earlyStartCountdown <= 0) {
          if (this.earlyStartIntervalId) {
            clearInterval(this.earlyStartIntervalId);
            this.earlyStartIntervalId = null;
          }
          this.complete();
        }
      }, 1000);
    }
  }

  // 강퇴 투표
  voteKick(voterId: string, targetPlayerId: string): { success: boolean; error?: string; kicked?: boolean } {
    const voterSegment = this.segments.get(voterId);
    const targetSegment = this.segments.get(targetPlayerId);

    if (!voterSegment) return { success: false, error: '투표 권한이 없습니다' };
    if (!targetSegment) return { success: false, error: '대상 플레이어를 찾을 수 없습니다' };

    // 검증된 플레이어만 투표 가능
    if (!voterSegment.isVerified) {
      return { success: false, error: '검증 완료 후에만 투표할 수 있습니다' };
    }

    // 검증 안 된 플레이어만 강퇴 대상
    if (targetSegment.isVerified) {
      return { success: false, error: '검증된 플레이어는 강퇴할 수 없습니다' };
    }

    // 자기 자신은 강퇴 불가
    if (voterId === targetPlayerId) {
      return { success: false, error: '자신을 강퇴할 수 없습니다' };
    }

    // 투표 기록
    if (!this.kickVotes.has(targetPlayerId)) {
      this.kickVotes.set(targetPlayerId, new Set());
    }

    const votes = this.kickVotes.get(targetPlayerId)!;
    votes.add(voterId);

    // 과반수 계산 (검증된 플레이어 중)
    const verifiedCount = this.getVerifiedPlayers().length;
    const votesNeeded = Math.floor(verifiedCount / 2) + 1;
    const currentVotes = votes.size;

    // 투표 현황 브로드캐스트
    this.io.to(this.room.id).emit('build:voteKickUpdate', {
      targetPlayerId,
      nickname: targetSegment.nickname,
      currentVotes,
      votesNeeded,
    });

    // 과반수 동의 시 강퇴
    if (currentVotes >= votesNeeded) {
      this.kickPlayer(targetPlayerId);
      return { success: true, kicked: true };
    }

    return { success: true, kicked: false };
  }

  private kickPlayer(playerId: string): void {
    const segment = this.segments.get(playerId);
    if (!segment) return;

    // 세그먼트 삭제
    this.segments.delete(playerId);
    this.kickVotes.delete(playerId);

    // 플레이어 방에서 퇴장
    const socket = this.io.sockets.sockets.get(playerId);

    // 브로드캐스트
    this.io.to(this.room.id).emit('build:playerKicked', {
      playerId,
      nickname: segment.nickname,
    });

    // 소켓에게 퇴장 알림
    if (socket) {
      socket.emit('build:youWereKicked');
      socket.leave(this.room.id);
    }

    // RoomManager에서도 제거
    this.room.removePlayer(playerId);

    this.broadcastStatus();

    // 최소 1명 확인
    if (this.segments.size === 0) {
      this.stop();
      return;
    }

    // 남은 플레이어가 모두 검증되었는지 확인
    this.checkAllVerified();
  }

  // 플레이어 퇴장 처리 (빌딩 중 자발적 퇴장)
  handlePlayerLeave(playerId: string): void {
    this.segments.delete(playerId);
    this.kickVotes.delete(playerId);

    // 다른 플레이어들의 투표에서도 제거
    for (const votes of this.kickVotes.values()) {
      votes.delete(playerId);
    }

    this.broadcastStatus();

    // 최소 1명 확인
    if (this.segments.size === 0) {
      this.stop();
      return;
    }

    // 남은 플레이어가 모두 검증되었는지 확인
    this.checkAllVerified();
  }

  private broadcastStatus(): void {
    const players: PlayerBuildingStatus[] = Array.from(this.segments.values()).map(s => ({
      playerId: s.playerId,
      nickname: s.nickname,
      isVerified: s.isVerified,
      isTesting: s.isTesting,
    }));

    this.io.to(this.room.id).emit('build:statusUpdate', { players });
  }

  // 빌딩 완료 - 레이스 맵 데이터 생성
  complete(): RelayMapData {
    this.stop();

    // 플레이어 순서 랜덤 셔플
    const playerIds = Array.from(this.segments.keys());
    this.shuffleArray(playerIds);

    const segments: RelaySegment[] = [];

    for (let i = 0; i < playerIds.length; i++) {
      const playerId = playerIds[i];
      const segment = this.segments.get(playerId)!;

      const spawnMarker = segment.markers.find(m => m.type === 'spawn');
      const finishMarker = segment.markers.find(m => m.type === 'finish');

      if (!spawnMarker || !finishMarker) continue;

      // checkpoint, killzone 마커만 추출 (spawn, finish는 별도 처리)
      const additionalMarkers = segment.markers.filter(
        m => m.type === 'checkpoint' || m.type === 'killzone'
      );

      segments.push({
        playerId,
        nickname: segment.nickname,
        order: i,
        objects: segment.objects,
        markers: additionalMarkers,
        spawnPosition: spawnMarker.position,
        finishPosition: finishMarker.position,
      });
    }

    const relayMapData: RelayMapData = {
      segments,
      totalCheckpoints: segments.length - 1,  // 마지막 구간은 finish이므로 -1
    };

    // 빌딩 완료 브로드캐스트
    this.io.to(this.room.id).emit('build:completed', {
      shuffledOrder: playerIds.map(id => ({
        playerId: id,
        nickname: this.segments.get(id)?.nickname || '',
      })),
      relayMap: relayMapData,
    });

    console.log(`빌딩 페이즈 완료: 방 ${this.room.id}, 릴레이 순서: ${playerIds.join(' → ')}`);

    // 콜백 호출 (레이스 자동 시작)
    if (this.onCompleteCallback) {
      this.onCompleteCallback(relayMapData);
    }

    return relayMapData;
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.earlyStartIntervalId) {
      clearInterval(this.earlyStartIntervalId);
      this.earlyStartIntervalId = null;
    }
  }

  // 유틸리티
  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  // 세그먼트 데이터 조회 (테스트용)
  getSegment(playerId: string): BuildingSegment | undefined {
    return this.segments.get(playerId);
  }

  getSegments(): Map<string, BuildingSegment> {
    return this.segments;
  }

  getTimeRemaining(): number {
    return this.timeRemaining;
  }

  getAllPlayersStatus(): PlayerBuildingStatus[] {
    return Array.from(this.segments.values()).map(s => ({
      playerId: s.playerId,
      nickname: s.nickname,
      isVerified: s.isVerified,
      isTesting: s.isTesting,
    }));
  }
}
