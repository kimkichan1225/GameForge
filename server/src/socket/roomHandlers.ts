import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/RoomManager.js';
import { startGame, startGameFromBuilding, getGameLoop, stopGame } from '../game/GameLoop.js';
import type { MapObject, MapMarker } from '../game/BuildingPhase.js';
import type { PlayerColorId } from '../game/Room.js';

export function registerRoomHandlers(io: Server, socket: Socket): void {
  // Get room list
  socket.on('room:list', (callback) => {
    const rooms = roomManager.getRoomList();
    callback({ success: true, rooms });
  });

  // Create room
  socket.on('room:create', (data: {
    nickname: string;
    roomName: string;
    mapId?: string;
    mapName?: string;
    mapThumbnailUrl?: string;
    maxPlayers?: number;
    gameMode?: 'race' | 'shooter';
    roomType?: 'create_map' | 'load_map';
    isPrivate?: boolean;
    buildTimeLimit?: number;
  }, callback) => {
    const { nickname, roomName, mapId, mapName, mapThumbnailUrl, maxPlayers, gameMode, roomType, isPrivate, buildTimeLimit } = data;

    const room = roomManager.createRoom({
      hostId: socket.id,
      hostNickname: nickname,
      roomName,
      mapId,
      mapName,
      mapThumbnailUrl,
      maxPlayers,
      gameMode,
      roomType,
      isPrivate,
      buildTimeLimit,
    });

    if (!room) {
      callback({ success: false, error: '방을 생성할 수 없습니다' });
      return;
    }

    socket.join(room.id);
    callback({ success: true, room: room.toJSON() });

    // Broadcast updated room list (비공개 방 제외)
    io.emit('room:listUpdated', roomManager.getRoomList());
  });

  // Join room
  socket.on('room:join', (data: { roomId: string; nickname: string }, callback) => {
    const { roomId, nickname } = data;

    const result = roomManager.joinRoom(roomId, socket.id, nickname);

    if (!result) {
      callback({ success: false, error: '방에 참가할 수 없습니다' });
      return;
    }

    const { room, player } = result;
    socket.join(room.id);

    // Notify others in room (canStart도 함께 전송)
    socket.to(room.id).emit('room:playerJoined', {
      player,
      players: Array.from(room.players.values()),
      canStart: room.canStart(),
    });

    callback({ success: true, room: room.toJSON() });

    // Broadcast updated room list
    io.emit('room:listUpdated', roomManager.getRoomList());
  });

  // Leave room
  socket.on('room:leave', (callback) => {
    handleLeaveRoom(io, socket);
    callback?.({ success: true });
  });

  // Set ready status
  socket.on('room:ready', (data: { ready: boolean }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);

    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    room.setPlayerReady(socket.id, data.ready);

    io.to(room.id).emit('room:playerUpdated', {
      players: Array.from(room.players.values()),
      canStart: room.canStart(),
    });

    callback?.({ success: true });
  });

  // Select player color
  socket.on('room:selectColor', (data: { color: PlayerColorId }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);

    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    const success = room.setPlayerColor(socket.id, data.color);

    if (!success) {
      callback?.({ success: false, error: '이 색상은 이미 사용 중입니다' });
      return;
    }

    // Notify all players in the room
    io.to(room.id).emit('room:playerUpdated', {
      players: Array.from(room.players.values()),
      canStart: room.canStart(),
    });

    callback?.({ success: true });
  });

  // Update room settings (host only)
  socket.on('room:updateSettings', (data: {
    name?: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    buildTimeLimit?: number;
    mapId?: string;
    mapName?: string;
    mapThumbnailUrl?: string;
  }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);

    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    if (room.hostId !== socket.id) {
      callback?.({ success: false, error: '방장만 설정을 변경할 수 있습니다' });
      return;
    }

    if (room.status !== 'waiting') {
      callback?.({ success: false, error: '대기 상태에서만 설정을 변경할 수 있습니다' });
      return;
    }

    room.updateSettings(data);

    // Notify all players in the room
    io.to(room.id).emit('room:settingsUpdated', room.toJSON());

    // Update room list
    io.emit('room:listUpdated', roomManager.getRoomList());

    callback?.({ success: true, room: room.toJSON() });
  });

  // Start game (host only)
  socket.on('room:start', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);

    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    if (room.hostId !== socket.id) {
      callback?.({ success: false, error: '방장만 게임을 시작할 수 있습니다' });
      return;
    }

    if (!room.canStart()) {
      callback?.({ success: false, error: '모든 플레이어가 준비되지 않았습니다' });
      return;
    }

    // create_map 모드면 빌딩 페이즈 시작
    if (room.roomType === 'create_map') {
      room.startBuildingPhase(io, (relayMapData) => {
        // 빌딩 완료 후 자동으로 릴레이 레이스 시작
        startGameFromBuilding(io, room, relayMapData);
      });

      // 방 상태 업데이트 브로드캐스트
      io.to(room.id).emit('room:statusUpdated', {
        status: room.status,
      });

      // Broadcast updated room list (room no longer joinable)
      io.emit('room:listUpdated', roomManager.getRoomList());

      callback?.({ success: true, buildingStarted: true });
      return;
    }

    // load_map 모드면 바로 게임 시작
    startGame(io, room);

    // Broadcast updated room list (room no longer joinable)
    io.emit('room:listUpdated', roomManager.getRoomList());

    callback?.({ success: true });
  });

  // ===== 빌딩 페이즈 이벤트 핸들러 =====

  // 현재 빌딩 상태 요청 (페이지 로드 후 상태 동기화용)
  socket.on('build:requestState', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const segment = room.buildingPhase.getSegment(socket.id);
    if (!segment) {
      callback?.({ success: false, error: '세그먼트를 찾을 수 없습니다' });
      return;
    }

    // 현재 빌딩 상태 전송
    callback?.({
      success: true,
      region: segment.region,
      timeLimit: room.buildingPhase.getTimeRemaining(),
      objects: segment.objects,
      markers: segment.markers,
      isVerified: segment.isVerified,
      isTesting: segment.isTesting,
      allPlayersStatus: room.buildingPhase.getAllPlayersStatus(),
    });
  });

  // 오브젝트 배치
  socket.on('build:placeObject', (data: {
    type: MapObject['type'];
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    color: string;
    name: string;
  }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const object = room.buildingPhase.placeObject(socket.id, data);
    if (object) {
      socket.emit('build:objectPlaced', { object });
      callback?.({ success: true, object });
    } else {
      callback?.({ success: false, error: '오브젝트를 배치할 수 없습니다' });
    }
  });

  // 오브젝트 삭제
  socket.on('build:removeObject', (data: { objectId: string }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const success = room.buildingPhase.removeObject(socket.id, data.objectId);
    if (success) {
      socket.emit('build:objectRemoved', { objectId: data.objectId });
      callback?.({ success: true });
    } else {
      callback?.({ success: false, error: '오브젝트를 삭제할 수 없습니다' });
    }
  });

  // 오브젝트 수정
  socket.on('build:updateObject', (data: { objectId: string; updates: Partial<MapObject> }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const object = room.buildingPhase.updateObject(socket.id, data.objectId, data.updates);
    if (object) {
      socket.emit('build:objectUpdated', { object });
      callback?.({ success: true, object });
    } else {
      callback?.({ success: false, error: '오브젝트를 수정할 수 없습니다' });
    }
  });

  // 마커 배치
  socket.on('build:placeMarker', (data: {
    type: MapMarker['type'];
    position: [number, number, number];
    rotation: [number, number, number];
  }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const marker = room.buildingPhase.placeMarker(socket.id, data);
    if (marker) {
      socket.emit('build:markerPlaced', { marker });
      callback?.({ success: true, marker });
    } else {
      callback?.({ success: false, error: '마커를 배치할 수 없습니다' });
    }
  });

  // 마커 삭제
  socket.on('build:removeMarker', (data: { markerId: string }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const success = room.buildingPhase.removeMarker(socket.id, data.markerId);
    if (success) {
      socket.emit('build:markerRemoved', { markerId: data.markerId });
      callback?.({ success: true });
    } else {
      callback?.({ success: false, error: '마커를 삭제할 수 없습니다' });
    }
  });

  // 마커 수정
  socket.on('build:updateMarker', (data: { markerId: string; updates: Partial<MapMarker> }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const marker = room.buildingPhase.updateMarker(socket.id, data.markerId, data.updates);
    if (marker) {
      socket.emit('build:markerUpdated', { marker });
      callback?.({ success: true, marker });
    } else {
      callback?.({ success: false, error: '마커를 수정할 수 없습니다' });
    }
  });

  // 테스트 플레이 시작
  socket.on('build:startTest', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const result = room.buildingPhase.startTest(socket.id);
    if (result.success) {
      const segment = room.buildingPhase.getSegment(socket.id);
      callback?.({
        success: true,
        segment: segment ? {
          objects: segment.objects,
          markers: segment.markers,
          region: segment.region,
        } : null,
      });
    } else {
      callback?.({ success: false, error: result.error });
    }
  });

  // 테스트 플레이 종료
  socket.on('build:finishTest', (data: { success: boolean }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    room.buildingPhase.finishTest(socket.id, data.success);
    callback?.({ success: true });
  });

  // 강퇴 투표
  socket.on('build:voteKick', (data: { targetPlayerId: string }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room?.buildingPhase) {
      callback?.({ success: false, error: '빌딩 페이즈가 아닙니다' });
      return;
    }

    const result = room.buildingPhase.voteKick(socket.id, data.targetPlayerId);
    callback?.(result);
  });

  // 빌딩 완료 후 레이스 시작 처리 (build:completed 이벤트 후 자동 호출됨)
  socket.on('build:startRace', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    // 호스트만 레이스 시작 가능
    if (room.hostId !== socket.id) {
      callback?.({ success: false, error: '방장만 레이스를 시작할 수 있습니다' });
      return;
    }

    if (!room.relayMapData) {
      callback?.({ success: false, error: '릴레이 맵 데이터가 없습니다' });
      return;
    }

    // 릴레이 레이스 시작
    startGameFromBuilding(io, room, room.relayMapData);

    callback?.({ success: true });
  });

  // Player position update
  socket.on('game:position', (data: {
    position: { x: number; y: number; z: number };
    velocity: { x: number; y: number; z: number };
    animation?: string;
  }) => {
    const gameLoop = getGameLoop(roomManager.getPlayerRoom(socket.id)?.id || '');
    if (gameLoop) {
      gameLoop.updatePlayerPosition(socket.id, data.position, data.velocity, data.animation);
    }
  });

  // Player reached checkpoint
  socket.on('game:checkpoint', (data: { checkpointIndex: number; isRelayCheckpoint?: boolean }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    const gameLoop = getGameLoop(room?.id || '');
    if (gameLoop) {
      const result = gameLoop.playerReachedCheckpoint(socket.id, data.checkpointIndex, data.isRelayCheckpoint ?? false);
      callback?.({ success: result.success, teleportTo: result.teleportTo });
    } else {
      callback?.({ success: false });
    }
  });

  // Player finished race
  socket.on('game:finish', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    const gameLoop = getGameLoop(room?.id || '');
    if (gameLoop) {
      const success = gameLoop.playerFinished(socket.id);
      callback?.({ success });
    } else {
      callback?.({ success: false });
    }
  });

  // Player died (hit killzone)
  socket.on('game:died', () => {
    const room = roomManager.getPlayerRoom(socket.id);
    const gameLoop = getGameLoop(room?.id || '');
    if (gameLoop) {
      gameLoop.playerDied(socket.id);
    }
  });

  // Return to waiting room after game finished
  socket.on('room:returnToWaitingRoom', (callback) => {
    const room = roomManager.getPlayerRoom(socket.id);

    if (!room) {
      callback?.({ success: false, error: '방을 찾을 수 없습니다' });
      return;
    }

    // 게임이 끝난 상태에서만 대기방으로 돌아갈 수 있음
    if (room.status !== 'finished') {
      callback?.({ success: false, error: '게임이 아직 진행 중입니다' });
      return;
    }

    // 플레이어의 ready 상태 초기화
    const player = room.getPlayer(socket.id);
    if (player) {
      player.isReady = false;
      player.checkpoint = 0;
      player.finishTime = undefined;
      player.position = undefined;
      player.velocity = undefined;
      player.animation = undefined;
    }

    // 모든 플레이어가 대기방으로 돌아왔는지 확인
    const allPlayersReturned = Array.from(room.players.values()).every(
      (p) => p.finishTime === undefined && p.position === undefined
    );

    if (allPlayersReturned) {
      // 모든 플레이어가 돌아왔으면 방 상태를 waiting으로 변경
      room.status = 'waiting';
      stopGame(room.id);

      // 방 목록 업데이트
      io.emit('room:listUpdated', roomManager.getRoomList());
    }

    // 대기방 상태 업데이트
    io.to(room.id).emit('room:playerUpdated', {
      players: Array.from(room.players.values()),
      canStart: room.canStart(),
    });

    // 방 상태도 같이 전송
    io.to(room.id).emit('room:statusUpdated', {
      status: room.status,
    });

    callback?.({ success: true, room: room.toJSON() });
  });

  // Handle disconnect
  socket.on('disconnect', () => {
    handleLeaveRoom(io, socket);
  });
}

function handleLeaveRoom(io: Server, socket: Socket): void {
  const room = roomManager.getPlayerRoom(socket.id);
  const wasFinished = room?.status === 'finished';

  if (room && room.status === 'playing') {
    // 게임 진행 중에 나가면 게임 중지
    stopGame(room.id);
  }

  const result = roomManager.leaveRoom(socket.id);

  if (result) {
    const { room, isEmpty } = result;

    if (!isEmpty) {
      // 게임이 끝난 상태에서 플레이어가 나갔을 때,
      // 남은 플레이어들이 모두 대기 상태(상태 리셋됨)면 방 상태를 waiting으로 변경
      if (wasFinished) {
        const allPlayersReady = Array.from(room.players.values()).every(
          (p) => p.finishTime === undefined && p.position === undefined
        );
        if (allPlayersReady) {
          room.status = 'waiting';
          stopGame(room.id);
        }
      }

      // Notify remaining players (canStart도 함께 전송)
      io.to(room.id).emit('room:playerLeft', {
        playerId: socket.id,
        players: Array.from(room.players.values()),
        newHostId: room.hostId,
        canStart: room.canStart(),
      });

      // 방 상태도 같이 전송
      io.to(room.id).emit('room:statusUpdated', {
        status: room.status,
      });
    }

    // Broadcast updated room list
    io.emit('room:listUpdated', roomManager.getRoomList());
  }
}
