import { useNavigate } from 'react-router-dom';
import { useEffect, useCallback } from 'react';
import { MultiplayerCanvas } from '../components/game/MultiplayerCanvas';
import { useRoomStore } from '../stores/roomStore';
import { useMultiplayerGameStore } from '../stores/multiplayerGameStore';

export default function MultiplayerGame() {
  const navigate = useNavigate();
  const currentRoom = useRoomStore((state) => state.currentRoom);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const returnToWaitingRoom = useRoomStore((state) => state.returnToWaitingRoom);
  const cleanupGame = useMultiplayerGameStore((state) => state.cleanupGame);

  // Redirect to lobby if no room
  useEffect(() => {
    if (!currentRoom) {
      navigate('/home');
    }
  }, [currentRoom, navigate]);

  // 로비로 나가기 (방에서 완전히 퇴장)
  const handleExit = useCallback(() => {
    cleanupGame();
    leaveRoom();
    navigate('/home');
  }, [cleanupGame, leaveRoom, navigate]);

  // 대기방으로 돌아가기 (방에 남아서 다시 플레이 준비)
  const handleReturnToWaitingRoom = useCallback(async () => {
    cleanupGame();
    const success = await returnToWaitingRoom();
    if (success) {
      navigate('/home');
    }
  }, [cleanupGame, returnToWaitingRoom, navigate]);

  if (!currentRoom) {
    return null;
  }

  return (
    <div className="w-screen h-screen">
      <MultiplayerCanvas
        onExit={handleExit}
        onReturnToWaitingRoom={handleReturnToWaitingRoom}
      />
    </div>
  );
}
