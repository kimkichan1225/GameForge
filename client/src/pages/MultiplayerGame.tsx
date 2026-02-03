import { useNavigate } from 'react-router-dom';
import { useEffect, useCallback, useState, useRef } from 'react';
import { MultiplayerCanvas } from '../components/game/MultiplayerCanvas';
import { BuildingCanvas } from '../components/game/BuildingCanvas';
import { BuildingUI } from '../components/game/BuildingUI';
import { BuildingTestPlay } from '../components/game/BuildingTestPlay';
import { useRoomStore } from '../stores/roomStore';
import { useMultiplayerGameStore } from '../stores/multiplayerGameStore';
import { socketManager } from '../lib/socket';
import type { PlaceableType } from '../stores/editorStore';

export default function MultiplayerGame() {
  const navigate = useNavigate();
  const currentRoom = useRoomStore((state) => state.currentRoom);
  const leaveRoom = useRoomStore((state) => state.leaveRoom);
  const returnToWaitingRoom = useRoomStore((state) => state.returnToWaitingRoom);
  const initGame = useMultiplayerGameStore((state) => state.initGame);
  const cleanupGame = useMultiplayerGameStore((state) => state.cleanupGame);
  const cleanupBuilding = useMultiplayerGameStore((state) => state.cleanupBuilding);
  const initBuilding = useMultiplayerGameStore((state) => state.initBuilding);
  const buildingPhase = useMultiplayerGameStore((state) => state.buildingPhase);
  const status = useMultiplayerGameStore((state) => state.status);
  const myTesting = useMultiplayerGameStore((state) => state.myTesting);
  const myObjects = useMultiplayerGameStore((state) => state.myObjects);
  const myMarkers = useMultiplayerGameStore((state) => state.myMarkers);
  const myRegion = useMultiplayerGameStore((state) => state.myRegion);
  const startTest = useMultiplayerGameStore((state) => state.startTest);
  const finishTest = useMultiplayerGameStore((state) => state.finishTest);

  // 빌딩 UI 상태 (null이면 선택 모드)
  const [currentPlaceable, setCurrentPlaceable] = useState<PlaceableType | null>('box');
  const [currentMarker, setCurrentMarker] = useState<'spawn' | 'finish' | 'checkpoint' | 'killzone' | null>(null);

  // 선택 모드 설정
  const handleSetSelectMode = useCallback(() => {
    setCurrentPlaceable(null);
    setCurrentMarker(null);
  }, []);

  // 게임 이벤트 리스너 초기화 여부 추적
  const gameInitializedRef = useRef(false);

  // Redirect to lobby if no room
  useEffect(() => {
    if (!currentRoom) {
      navigate('/home');
    }
  }, [currentRoom, navigate]);

  // 게임 이벤트 리스너 조기 초기화 (빌딩 모드에서도 game:starting, game:start 이벤트 수신 가능하도록)
  // 빌딩 페이즈가 완료되면 서버에서 바로 game:starting 이벤트가 오기 때문에 미리 등록해야 함
  useEffect(() => {
    if (currentRoom?.roomType === 'create_map' && !gameInitializedRef.current) {
      initGame();
      gameInitializedRef.current = true;
    }
    return () => {
      if (gameInitializedRef.current) {
        cleanupGame();
        gameInitializedRef.current = false;
      }
    };
  }, [currentRoom?.roomType, initGame, cleanupGame]);

  // 빌딩 페이즈 이벤트 리스너 초기화 (roomStore의 status 기준으로 먼저 리스너 등록)
  useEffect(() => {
    if (currentRoom?.roomType === 'create_map' && currentRoom?.status === 'building') {
      initBuilding();
      return () => {
        cleanupBuilding();
      };
    }
  }, [currentRoom?.roomType, currentRoom?.status, initBuilding, cleanupBuilding]);

  // 강퇴 이벤트 리스너 - home으로 리다이렉트
  useEffect(() => {
    const socket = socketManager.getSocket();
    if (!socket) return;

    const handleKicked = () => {
      cleanupGame();
      cleanupBuilding();
      leaveRoom();
      navigate('/home');
    };

    socket.on('build:youWereKicked', handleKicked);
    return () => {
      socket.off('build:youWereKicked', handleKicked);
    };
  }, [cleanupGame, cleanupBuilding, leaveRoom, navigate]);

  // 로비로 나가기 (방에서 완전히 퇴장)
  const handleExit = useCallback(() => {
    cleanupGame();
    cleanupBuilding();
    leaveRoom();
    navigate('/home');
  }, [cleanupGame, cleanupBuilding, leaveRoom, navigate]);

  // 대기방으로 돌아가기 (방에 남아서 다시 플레이 준비)
  const handleReturnToWaitingRoom = useCallback(async () => {
    cleanupGame();
    cleanupBuilding();
    const success = await returnToWaitingRoom();
    if (success) {
      navigate('/home');
    }
  }, [cleanupGame, cleanupBuilding, returnToWaitingRoom, navigate]);

  // 테스트 플레이 시작
  const handleStartTest = useCallback(async () => {
    await startTest();
  }, [startTest]);

  // 테스트 플레이 종료
  const handleTestExit = useCallback(async (success: boolean) => {
    await finishTest(success);
  }, [finishTest]);

  if (!currentRoom) {
    return null;
  }

  // 빌딩 페이즈 여부 판단 (roomStore 또는 multiplayerGameStore 기준)
  const isBuildingPhase = buildingPhase || status === 'building' ||
    (currentRoom?.roomType === 'create_map' && currentRoom?.status === 'building');

  // 빌딩 페이즈 - 테스트 플레이 중
  if (isBuildingPhase && myTesting && myRegion) {
    return (
      <div className="w-screen h-screen">
        <BuildingTestPlay
          objects={myObjects}
          markers={myMarkers}
          region={myRegion}
          onExit={handleTestExit}
        />
      </div>
    );
  }

  // 빌딩 페이즈
  if (isBuildingPhase) {
    return (
      <div className="w-screen h-screen relative">
        <BuildingCanvas
          currentPlaceable={currentPlaceable}
          currentMarker={currentMarker}
          onSetSelectMode={handleSetSelectMode}
        />
        <BuildingUI
          currentPlaceable={currentPlaceable}
          currentMarker={currentMarker}
          onSelectPlaceable={setCurrentPlaceable}
          onSelectMarker={setCurrentMarker}
          onStartTest={handleStartTest}
          onSetSelectMode={handleSetSelectMode}
        />
      </div>
    );
  }

  // 레이스 페이즈 (또는 load_map 모드)
  return (
    <div className="w-screen h-screen">
      <MultiplayerCanvas
        onExit={handleExit}
        onReturnToWaitingRoom={handleReturnToWaitingRoom}
      />
    </div>
  );
}
