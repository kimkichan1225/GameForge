import { Server, Socket } from 'socket.io';
import { roomManager } from '../game/RoomManager.js';
import { startGame, getGameLoop, stopGame } from '../game/GameLoop.js';

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
    maxPlayers?: number;
    gameMode?: 'race' | 'shooter';
    roomType?: 'create_map' | 'load_map';
    isPrivate?: boolean;
    buildTimeLimit?: number;
  }, callback) => {
    const { nickname, roomName, mapId, maxPlayers, gameMode, roomType, isPrivate, buildTimeLimit } = data;

    const room = roomManager.createRoom({
      hostId: socket.id,
      hostNickname: nickname,
      roomName,
      mapId,
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

    // Notify others in room
    socket.to(room.id).emit('room:playerJoined', {
      player,
      players: Array.from(room.players.values()),
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

  // Update room settings (host only)
  socket.on('room:updateSettings', (data: {
    name?: string;
    maxPlayers?: number;
    isPrivate?: boolean;
    buildTimeLimit?: number;
    mapId?: string;
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

    // Start the game loop
    startGame(io, room);

    // Broadcast updated room list (room no longer joinable)
    io.emit('room:listUpdated', roomManager.getRoomList());

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
  socket.on('game:checkpoint', (data: { checkpointIndex: number }, callback) => {
    const room = roomManager.getPlayerRoom(socket.id);
    const gameLoop = getGameLoop(room?.id || '');
    if (gameLoop) {
      const success = gameLoop.playerReachedCheckpoint(socket.id, data.checkpointIndex);
      callback?.({ success });
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

      // Notify remaining players
      io.to(room.id).emit('room:playerLeft', {
        playerId: socket.id,
        players: Array.from(room.players.values()),
        newHostId: room.hostId,
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
