import { useRef, useEffect } from 'react';
import { Grid } from '@react-three/drei';
import * as THREE from 'three';

export function Ground() {
  const groupRef = useRef<THREE.Group>(null);

  // Grid의 모든 자식 메쉬를 레이캐스트에서 제외
  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.traverse((obj) => {
        obj.userData.isEffect = true;  // 레이캐스트 제외용
      });
    }
  }, []);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#4a7c4e" />
      </mesh>
      <group ref={groupRef}>
        <Grid
          position={[0, 0.01, 0]}
          args={[100, 100]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#5a8c5e"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3a6c3e"
          fadeDistance={50}
        />
      </group>
    </>
  );
}
