import { Grid } from '@react-three/drei';

export function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#4a7c4e" />
      </mesh>
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
    </>
  );
}
