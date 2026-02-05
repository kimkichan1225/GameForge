import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 트레이서 라인 풀 크기
const POOL_SIZE = 20;
const TRACER_LIFETIME = 0.05;  // 빠른 페이드 (초)
const TRACER_WIDTH = 0.02;

// GC 방지 재사용 객체
const _direction = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();

interface TracerInstance {
  active: boolean;
  age: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

// 트레이서 라인 컴포넌트
export function TracerLine({ tracerRef }: { tracerRef: React.MutableRefObject<{ spawn: (start: THREE.Vector3, end: THREE.Vector3) => void } | null> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // 풀 상태
  const poolRef = useRef<TracerInstance[]>([]);

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      age: 0,
      start: new THREE.Vector3(),
      end: new THREE.Vector3(),
    }));
  }, []);

  // 트레이서 생성 함수 노출
  useMemo(() => {
    tracerRef.current = {
      spawn: (start: THREE.Vector3, end: THREE.Vector3) => {
        const pool = poolRef.current;
        const tracer = pool.find(t => !t.active);
        if (!tracer) return;

        tracer.active = true;
        tracer.age = 0;
        tracer.start.copy(start);
        tracer.end.copy(end);
      }
    };
  }, [tracerRef]);

  // Geometry: 긴 사각형 (1x1 단위, 인스턴스에서 스케일)
  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(1, TRACER_WIDTH);
    return geo;
  }, []);

  // Material: Additive 블렌딩
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xffffaa,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
  }, []);

  // 매 프레임 업데이트
  useFrame((state, dt) => {
    if (!meshRef.current) return;

    const pool = poolRef.current;
    const mesh = meshRef.current;
    const camera = state.camera;
    const matrix = new THREE.Matrix4();

    let visibleCount = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const tracer = pool[i];

      if (tracer.active) {
        tracer.age += dt;

        if (tracer.age >= TRACER_LIFETIME) {
          tracer.active = false;
          // 숨김 처리
          matrix.makeScale(0, 0, 0);
          mesh.setMatrixAt(i, matrix);
        } else {
          // 트레이서 위치 및 방향 계산
          _direction.subVectors(tracer.end, tracer.start);
          const length = _direction.length();
          _direction.normalize();

          // 중앙 위치
          const center = new THREE.Vector3()
            .addVectors(tracer.start, tracer.end)
            .multiplyScalar(0.5);

          // Billboard: 카메라를 향하도록 회전
          const cameraDir = new THREE.Vector3()
            .subVectors(camera.position, center)
            .normalize();
          _right.crossVectors(_direction, cameraDir).normalize();
          _up.crossVectors(_right, _direction).normalize();

          // 회전 행렬 구성
          const rotationMatrix = new THREE.Matrix4().makeBasis(_direction, _up, _right);

          // 페이드 아웃 (opacity 대신 스케일 축소로 구현)
          const fadeProgress = tracer.age / TRACER_LIFETIME;
          const scale = 1 - fadeProgress * 0.5;

          // 변환 행렬 구성
          matrix.identity();
          matrix.makeTranslation(center.x, center.y, center.z);
          matrix.multiply(rotationMatrix);
          matrix.scale(new THREE.Vector3(length, TRACER_WIDTH * scale, 1));

          mesh.setMatrixAt(i, matrix);
          visibleCount++;
        }
      } else {
        // 비활성: 숨김
        matrix.makeScale(0, 0, 0);
        mesh.setMatrixAt(i, matrix);
      }
    }

    mesh.instanceMatrix.needsUpdate = true;

    // Material opacity 업데이트 (전체 페이드)
    if (material.opacity !== undefined) {
      material.opacity = 0.8;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, POOL_SIZE]}
      frustumCulled={false}
      userData={{ isEffect: true }}
    />
  );
}
