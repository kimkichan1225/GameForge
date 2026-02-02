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
  socket.on('room:create', (data: { nickname: string; roomName: string; mapId?: string; maxPlayers?: number }, callback) => {
    const { nickname, roomName, mapId = 'default', maxPlayers = 4 } = data;

    const room = roomManager.createRoom(socket.id, nickname, roomName, mapId, maxPlayers);

    if (!room) {
      callback({ success: false, error: '방을 생성할 수 없습니다' });
      return;
    }

    socket.join(room.id);
    callback({ success: true, room: room.toJSON() });

    // Broadcast updated room list
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
  }) => {
    const gameLoop = getGameLoop(roomManager.getPlayerRoom(socket.id)?.id || '');
    if (gameLoop) {
      gameLoop.updatePlayerPosition(socket.id, data.position, data.velocity);
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

  // Handle disconnect
  socket.on('disconnect', () => {
    handleLeaveRoom(io, socket);
  });
}

function handleLeaveRoom(io: Server, socket: Socket): void {
  const room = roomManager.getPlayerRoom(socket.id);
  if (room) {
    // Stop game if room is playing
    stopGame(room.id);
  }

  const result = roomManager.leaveRoom(socket.id);

  if (result) {
    const { room, isEmpty } = result;

    if (!isEmpty) {
      // Notify remaining players
      io.to(room.id).emit('room:playerLeft', {
        playerId: socket.id,
        players: Array.from(room.players.values()),
        newHostId: room.hostId,
      });
    }

    // Broadcast updated room list
    io.emit('room:listUpdated', roomManager.getRoomList());
  }
}
