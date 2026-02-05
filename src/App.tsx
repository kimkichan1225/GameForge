import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Player } from './components/Player';
import { GunPlayer } from './components/GunPlayer';
import { Camera } from './components/Camera';
import { Ground } from './components/Ground';
import { UI } from './components/UI';
import { BulletEffects } from './components/effects/BulletEffects';
import { useGameStore } from './store/gameStore';
import './index.css';

function PlayerSelector() {
  const gameMode = useGameStore((state) => state.gameMode);
  return gameMode === 'running' ? <Player /> : <GunPlayer />;
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 20, 10]}
        intensity={1}
      />
      <hemisphereLight args={['#87ceeb', '#4a7c4e', 0.3]} />

      <color attach="background" args={['#87ceeb']} />
      <fog attach="fog" args={['#87ceeb', 30, 100]} />

      <Ground />

      <Suspense fallback={null}>
        <PlayerSelector />
        <Camera />
        <BulletEffects />
      </Suspense>
    </>
  );
}

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas camera={{ fov: 60 }}>
        <Scene />
      </Canvas>
      <UI />
    </div>
  );
}
