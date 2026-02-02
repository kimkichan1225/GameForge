import { useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { MultiplayerCanvas } from '../components/game/MultiplayerCanvas';
import { useRoomStore } from '../stores/roomStore';

export default function MultiplayerGame() {
  const navigate = useNavigate();
  const currentRoom = useRoomStore((state) => state.currentRoom);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);

  // Redirect to lobby if no room
  useEffect(() => {
    if (!currentRoom) {
      navigate('/home');
    }
  }, [currentRoom, navigate]);

  const handleExit = () => {
    leaveRoom();
    navigate('/home');
  };

  if (!currentRoom) {
    return null;
  }

  return (
    <div className="w-screen h-screen">
      <MultiplayerCanvas onExit={handleExit} />
    </div>
  );
}
