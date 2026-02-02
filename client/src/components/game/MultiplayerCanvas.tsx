import { useRef, useEffect, useState, useMemo, useCallback, memo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, useAnimations, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { useInput } from '../../hooks/useInput';
import { useGameStore } from '../../stores/gameStore';
import { useMultiplayerGameStore } from '../../stores/multiplayerGameStore';
import { useRoomStore } from '../../stores/roomStore';
import { socketManager } from '../../lib/socket';
import { RemotePlayer } from './RemotePlayer';
import {
  initRapier,
  createWorld,
  createGround,
  createPlayer,
  checkGrounded,
  updatePlayerCollider,
  COLLIDER_CONFIG,
  RAPIER,
} from '../../lib/physics';
import type { Posture } from '../../stores/gameStore';

// Constants
const WALK_SPEED = 4;
const RUN_SPEED = 8;
const SIT_SPEED = 2;
const CRAWL_SPEED = 1;
const JUMP_POWER = 8;
const POSITION_SEND_RATE = 50; // Send position every 50ms

const GROUND_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const GROUND_POSITION: [number, number, number] = [0, 0, 0];
const GRID_POSITION: [number, number, number] = [0, 0.01, 0];
const HEAD_OFFSET = new THREE.Vector3(0, 1.5, 0);

const _move = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _targetQuat = new THREE.Quaternion();

// Physics context type
interface PhysicsContext {
  world: RAPIER.World;
  playerBody: RAPIER.RigidBody;
  playerColliderRef: React.MutableRefObject<RAPIER.Collider>;
}

// Local player component
const LocalPlayer = memo(function LocalPlayer({
  startPosition,
  physics,
}: {
  startPosition: [number, number, number];
  physics: PhysicsContext;
}) {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF('/Runtest.glb');
  const { actions, names } = useAnimations(animations, scene);

  const animMapRef = useRef<Record<string, string>>({});
  const grounded = useRef(true);
  const jumping = useRef(false);
  const currentAnim = useRef('');
  const currentPosture = useRef<Posture>('standing');
  const prev = useRef({ space: false, c: false, z: false });
  const lastPositionSent = useRef(0);

  const input = useInput();
  const sendPosition = useMultiplayerGameStore((state) => state.sendPosition);
  const status = useMultiplayerGameStore((state) => state.status);

  // Build animation map
  useEffect(() => {
    const map: Record<string, string> = {};
    const targets = ['Idle', 'Walk', 'Run', 'Jump', 'SitPose', 'SitWalk', 'CrawlPose', 'Crawl', 'Roll', 'Dead'];

    for (const target of targets) {
      const found = names.find((n) => {
        const parts = n.split('|');
        return parts[parts.length - 1].toLowerCase() === target.toLowerCase();
      });
      if (found) map[target] = found;
    }

    animMapRef.current = map;
    playAnim('Idle');
  }, [names]);

  const playAnim = useCallback(
    (name: string) => {
      const animMap = animMapRef.current;
      if (currentAnim.current === name || !animMap[name]) return;

      const clipName = animMap[name];
      const action = actions[clipName];
      if (!action) return;

      const prevClip = animMap[currentAnim.current];
      if (prevClip) actions[prevClip]?.fadeOut(0.2);

      action.reset().fadeIn(0.2).play();

      // One-shot animations
      if (name === 'Jump' || name === 'Roll' || name === 'Dead') {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
        if (name === 'Roll') action.timeScale = 2.3;
      } else {
        action.setLoop(THREE.LoopRepeat, Infinity);
      }

      currentAnim.current = name;
    },
    [actions]
  );

  const getAnim = useCallback((moving: boolean, running: boolean, posture: string): string => {
    if (posture === 'sitting') return moving ? 'SitWalk' : 'SitPose';
    if (posture === 'crawling') return moving ? 'Crawl' : 'CrawlPose';
    if (moving) return running ? 'Run' : 'Walk';
    return 'Idle';
  }, []);

  useFrame((_, dt) => {
    if (!group.current || status !== 'playing') return;

    const keys = input.current;
    const store = useGameStore.getState();
    const { posture, cameraAngle } = store;
    const { world, playerBody, playerColliderRef } = physics;

    if (!playerColliderRef.current) return;

    let vel: { x: number; y: number; z: number };
    try {
      vel = playerBody.linvel();
    } catch {
      return;
    }

    const centerY = COLLIDER_CONFIG[posture].centerY;

    // Update collider on posture change
    if (posture !== currentPosture.current) {
      const newCollider = updatePlayerCollider(
        world,
        playerBody,
        playerColliderRef.current,
        currentPosture.current,
        posture
      );
      playerColliderRef.current = newCollider;
      currentPosture.current = posture;
    }

    const isGrounded = checkGrounded(world, playerBody, playerColliderRef.current, posture);
    grounded.current = isGrounded;

    // Posture toggle
    if (keys.c && !prev.current.c && isGrounded) {
      store.setPosture(posture === 'sitting' ? 'standing' : 'sitting');
    }
    if (keys.z && !prev.current.z && isGrounded) {
      store.setPosture(posture === 'crawling' ? 'standing' : 'crawling');
    }

    // Jump
    let shouldJump = false;
    if (keys.space && !prev.current.space && isGrounded && !jumping.current && posture === 'standing') {
      shouldJump = true;
      jumping.current = true;
      playAnim('Jump');
    }

    // Land detection
    if (jumping.current && isGrounded && vel.y <= 0 && !shouldJump) {
      jumping.current = false;
      const moving = keys.forward || keys.backward || keys.left || keys.right;
      playAnim(getAnim(moving, keys.shift && posture === 'standing', posture));
    }

    prev.current = { space: keys.space, c: keys.c, z: keys.z };

    // Movement
    _move.set(0, 0, 0);
    if (keys.forward) _move.z -= 1;
    if (keys.backward) _move.z += 1;
    if (keys.left) _move.x -= 1;
    if (keys.right) _move.x += 1;

    if (_move.lengthSq() > 0) {
      _move.normalize().applyAxisAngle(_yAxis, cameraAngle);
      const angle = Math.atan2(_move.x, _move.z);
      _targetQuat.setFromAxisAngle(_yAxis, angle);
      scene.quaternion.slerp(_targetQuat, 0.15);
    }

    // Speed
    let speed = WALK_SPEED;
    if (posture === 'sitting') speed = SIT_SPEED;
    else if (posture === 'crawling') speed = CRAWL_SPEED;
    else if (keys.shift && posture === 'standing') speed = RUN_SPEED;

    // Apply physics
    playerBody.setLinvel(
      { x: _move.x * speed, y: shouldJump ? JUMP_POWER : vel.y, z: _move.z * speed },
      true
    );
    world.step();

    // Sync position
    const pos = playerBody.translation();
    group.current.position.set(pos.x, pos.y - centerY, pos.z);

    // Animation
    if (isGrounded && !jumping.current) {
      playAnim(getAnim(_move.lengthSq() > 0, keys.shift && posture === 'standing', posture));
    }

    // Update store
    store.setPlayerPos([pos.x, pos.y - centerY, pos.z]);

    // Send position to server at limited rate
    const now = Date.now();
    if (now - lastPositionSent.current >= POSITION_SEND_RATE) {
      lastPositionSent.current = now;
      sendPosition(
        { x: pos.x, y: pos.y - centerY, z: pos.z },
        { x: _move.x * speed, y: vel.y, z: _move.z * speed },
        currentAnim.current
      );
    }
  });

  return (
    <group ref={group} position={startPosition}>
      <primitive object={scene} />
    </group>
  );
});

// Camera component
const FollowCamera = memo(function FollowCamera() {
  const { camera, gl } = useThree();

  const angleRef = useRef(0);
  const pitchRef = useRef(0.3);
  const distanceRef = useRef(8);
  const currentCamPos = useRef(new THREE.Vector3());
  const initialized = useRef(false);
  const isLocked = useRef(false);
  const skipNextMove = useRef(false);

  const _targetPos = useRef(new THREE.Vector3());
  const _offset = useRef(new THREE.Vector3());
  const _targetCamPos = useRef(new THREE.Vector3());
  const _headPos = useRef(new THREE.Vector3());

  useEffect(() => {
    const canvas = gl.domElement;

    const onClick = () => canvas.requestPointerLock();

    const onMouseMove = (e: MouseEvent) => {
      if (!isLocked.current) return;
      if (skipNextMove.current) {
        skipNextMove.current = false;
        return;
      }

      const maxMove = 50;
      const moveX = Math.max(-maxMove, Math.min(maxMove, e.movementX));
      const moveY = Math.max(-maxMove, Math.min(maxMove, e.movementY));

      let angle = angleRef.current - moveX * 0.002;
      angle = angle % (Math.PI * 2);
      if (angle < 0) angle += Math.PI * 2;
      angleRef.current = angle;

      let pitch = pitchRef.current + moveY * 0.002;
      pitchRef.current = Math.max(-0.5, Math.min(1.2, pitch));

      const store = useGameStore.getState();
      store.setCameraAngle(angle);
      store.setCameraPitch(pitchRef.current);
    };

    const onWheel = (e: WheelEvent) => {
      distanceRef.current = Math.max(3, Math.min(20, distanceRef.current + e.deltaY * 0.01));
      useGameStore.getState().setCameraDistance(distanceRef.current);
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === canvas;
      if (locked && !isLocked.current) skipNextMove.current = true;
      isLocked.current = locked;
    };

    canvas.addEventListener('click', onClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('wheel', onWheel);

    return () => {
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      document.removeEventListener('wheel', onWheel);
    };
  }, [gl]);

  useFrame(() => {
    const playerPos = useGameStore.getState().playerPos;
    _targetPos.current.set(playerPos[0], playerPos[1], playerPos[2]);

    const { current: distance } = distanceRef;
    const { current: pitch } = pitchRef;
    const { current: angle } = angleRef;

    _offset.current.set(
      Math.sin(angle) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance + 2,
      Math.cos(angle) * Math.cos(pitch) * distance
    );

    _targetCamPos.current.copy(_targetPos.current).add(_offset.current);

    if (!initialized.current) {
      initialized.current = true;
      currentCamPos.current.copy(_targetCamPos.current);
    }

    currentCamPos.current.lerp(_targetCamPos.current, 0.1);
    camera.position.copy(currentCamPos.current);

    _headPos.current.copy(_targetPos.current).add(HEAD_OFFSET);
    camera.lookAt(_headPos.current);
  });

  return null;
});

// Ground component
const Ground = memo(function Ground() {
  return (
    <mesh rotation={GROUND_ROTATION} position={GROUND_POSITION}>
      <planeGeometry args={[200, 200]} />
      <meshStandardMaterial color="#3a5a40" side={THREE.DoubleSide} />
    </mesh>
  );
});

// Remote players component
const RemotePlayers = memo(function RemotePlayers() {
  const players = useMultiplayerGameStore((state) => state.players);
  const myId = socketManager.getSocket()?.id;

  const otherPlayers = useMemo(() => {
    return players.filter((p) => p.id !== myId);
  }, [players, myId]);

  return (
    <>
      {otherPlayers.map((player) => (
        <RemotePlayer
          key={player.id}
          id={player.id}
          nickname={player.nickname}
          position={player.position}
          velocity={player.velocity}
          animation={player.animation}
          checkpoint={player.checkpoint}
          finished={player.finished}
        />
      ))}
    </>
  );
});

// Scene content
const SceneContent = memo(function SceneContent({
  startPosition,
  physics,
}: {
  startPosition: [number, number, number];
  physics: PhysicsContext | null;
}) {
  if (!physics) return null;

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[20, 30, 10]} intensity={1} castShadow />
      <hemisphereLight args={['#87ceeb', '#3a5a40', 0.4]} />

      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 50, 150]} />

      <Grid
        args={[200, 200]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#2d4a30"
        sectionSize={5}
        sectionThickness={1}
        sectionColor="#1a3a1d"
        position={GRID_POSITION}
        fadeDistance={80}
      />

      <Ground />
      <LocalPlayer startPosition={startPosition} physics={physics} />
      <RemotePlayers />
      <FollowCamera />
    </>
  );
});

// UI component
const MultiplayerUI = memo(function MultiplayerUI({ onExit }: { onExit: () => void }) {
  const status = useMultiplayerGameStore((state) => state.status);
  const countdown = useMultiplayerGameStore((state) => state.countdown);
  const rankings = useMultiplayerGameStore((state) => state.rankings);
  const players = useMultiplayerGameStore((state) => state.players);
  const currentRoom = useRoomStore((state) => state.currentRoom);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        document.exitPointerLock();
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onExit]);

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const milliseconds = Math.floor((ms % 1000) / 10);
    return `${seconds}.${milliseconds.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Countdown */}
      {status === 'countdown' && countdown > 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-9xl font-bold text-white drop-shadow-lg">{countdown}</div>
        </div>
      )}

      {/* GO! */}
      {status === 'countdown' && countdown === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="text-9xl font-bold text-green-400 drop-shadow-lg">GO!</div>
        </div>
      )}

      {/* Finished screen */}
      {status === 'finished' && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/50">
          <div className="bg-slate-800/95 backdrop-blur-sm rounded-2xl p-8 text-center border border-white/20 min-w-80">
            <div className="text-4xl mb-4">Race Complete!</div>
            <div className="space-y-2 mb-6">
              {rankings.map((entry) => (
                <div
                  key={entry.playerId}
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    entry.rank === 1
                      ? 'bg-yellow-500/20'
                      : entry.rank === 2
                      ? 'bg-gray-400/20'
                      : entry.rank === 3
                      ? 'bg-orange-600/20'
                      : 'bg-white/10'
                  }`}
                >
                  <span className="text-white font-bold">#{entry.rank}</span>
                  <span className="text-white">{entry.nickname}</span>
                  <span className="text-white/70">{formatTime(entry.time)}s</span>
                </div>
              ))}
            </div>
            <button
              onClick={onExit}
              className="px-6 py-2 bg-sky-500 hover:bg-sky-400 text-white rounded-lg font-medium"
            >
              Back to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Room info */}
      <div className="absolute top-4 right-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        <div>{currentRoom?.name}</div>
        <div className="text-white/60">Players: {players.length}</div>
        <div className="text-white/40 text-xs mt-1">ESC - Exit</div>
      </div>

      {/* Player list */}
      <div className="absolute top-4 left-4 z-10 bg-slate-800/80 backdrop-blur-sm rounded-lg px-4 py-2 text-white text-sm">
        <div className="font-bold mb-2">Players</div>
        {players.map((p) => (
          <div key={p.id} className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${p.finished ? 'bg-green-400' : 'bg-sky-400'}`} />
            <span>{p.nickname}</span>
            {p.finished && <span className="text-green-400">Finished</span>}
          </div>
        ))}
      </div>

      {/* Controls hint */}
      <div className="absolute bottom-6 left-4 z-10 bg-slate-800/70 backdrop-blur-sm rounded-xl p-3 border border-white/10 text-white/60 text-xs">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          <span>Click</span>
          <span>Lock Mouse</span>
          <span>WASD</span>
          <span>Move</span>
          <span>Shift</span>
          <span>Run</span>
          <span>Space</span>
          <span>Jump</span>
        </div>
      </div>

      {/* Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
        <div className="w-2 h-2 bg-white/50 rounded-full" />
      </div>
    </>
  );
});

// Loading screen
const LoadingScreen = memo(function LoadingScreen() {
  return (
    <div className="w-full h-full bg-slate-900 flex items-center justify-center">
      <div className="text-white text-xl">Loading...</div>
    </div>
  );
});

// Main component
export function MultiplayerCanvas({ onExit }: { onExit: () => void }) {
  const [loading, setLoading] = useState(true);
  const physicsRef = useRef<{
    world: RAPIER.World;
    playerBody: RAPIER.RigidBody;
  } | null>(null);
  const playerColliderRef = useRef<RAPIER.Collider | null>(null);
  const [physicsReady, setPhysicsReady] = useState(false);

  const initGame = useMultiplayerGameStore((state) => state.initGame);
  const cleanupGame = useMultiplayerGameStore((state) => state.cleanupGame);

  const startPosition: [number, number, number] = [0, 0, 0];

  const physics = useMemo((): PhysicsContext | null => {
    if (!physicsRef.current || !playerColliderRef.current || !physicsReady) return null;
    return {
      world: physicsRef.current.world,
      playerBody: physicsRef.current.playerBody,
      playerColliderRef: playerColliderRef as React.MutableRefObject<RAPIER.Collider>,
    };
  }, [physicsReady]);

  useEffect(() => {
    initGame();

    let mounted = true;

    async function init() {
      try {
        await initRapier();
        if (!mounted) return;

        const world = createWorld();
        createGround(world);
        const { rigidBody, collider } = createPlayer(world, startPosition);

        physicsRef.current = { world, playerBody: rigidBody };
        playerColliderRef.current = collider;
        setPhysicsReady(true);
        setLoading(false);
      } catch (error) {
        console.error('Failed to initialize physics:', error);
      }
    }

    init();

    return () => {
      mounted = false;
      cleanupGame();
      setPhysicsReady(false);
      playerColliderRef.current = null;
      if (physicsRef.current) {
        physicsRef.current.world.free();
        physicsRef.current = null;
      }
    };
  }, [initGame, cleanupGame]);

  useEffect(() => {
    useGameStore.getState().reset();
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ fov: 60, near: 0.1, far: 1000 }} shadows>
        <SceneContent startPosition={startPosition} physics={physics} />
      </Canvas>
      <MultiplayerUI onExit={onExit} />
    </div>
  );
}

useGLTF.preload('/Runtest.glb');
