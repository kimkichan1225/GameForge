import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// 히트 스파크 풀 크기
const POOL_SIZE = 30;
const SPARK_LIFETIME = 0.15;  // 빠른 페이드 (초)
const PARTICLES_PER_SPARK = 8;  // 스파크당 파티클 수
const SPARK_SPEED = 3;  // 파티클 속도

// GC 방지 재사용 객체
const _velocity = new THREE.Vector3();
const _color = new THREE.Color();

interface SparkParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

interface SparkInstance {
  active: boolean;
  age: number;
  particles: SparkParticle[];
}

// 스파크 텍스처 생성 (밝은 점)
const createSparkTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d')!;

  // 방사형 그라데이션 (밝은 중심)
  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  gradient.addColorStop(0, 'rgba(255, 255, 200, 1)');
  gradient.addColorStop(0.3, 'rgba(255, 200, 100, 1)');
  gradient.addColorStop(0.7, 'rgba(255, 150, 50, 0.5)');
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 32, 32);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
};

const SPARK_TEXTURE = createSparkTexture();

// 히트 스파크 컴포넌트
export function HitSpark({ sparkRef }: { sparkRef: React.MutableRefObject<{ spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void } | null> }) {
  const pointsRef = useRef<THREE.Points>(null);

  // 풀 상태
  const poolRef = useRef<SparkInstance[]>([]);

  // 버퍼 속성
  const positionBuffer = useRef<Float32Array | null>(null);
  const colorBuffer = useRef<Float32Array | null>(null);
  const sizeBuffer = useRef<Float32Array | null>(null);

  // 풀 및 버퍼 초기화
  useMemo(() => {
    const totalParticles = POOL_SIZE * PARTICLES_PER_SPARK;

    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      age: 0,
      particles: Array.from({ length: PARTICLES_PER_SPARK }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
      })),
    }));

    positionBuffer.current = new Float32Array(totalParticles * 3);
    colorBuffer.current = new Float32Array(totalParticles * 3);
    sizeBuffer.current = new Float32Array(totalParticles);
  }, []);

  // 스파크 생성 함수 노출
  useMemo(() => {
    sparkRef.current = {
      spawn: (position: THREE.Vector3, normal: THREE.Vector3) => {
        const pool = poolRef.current;
        const spark = pool.find(s => !s.active);
        if (!spark) return;

        spark.active = true;
        spark.age = 0;

        // 파티클 초기화 (법선 방향 + 랜덤 분산)
        for (const particle of spark.particles) {
          particle.position.copy(position);

          // 법선 방향 기반 + 랜덤 분산
          _velocity.copy(normal);
          _velocity.x += (Math.random() - 0.5) * 2;
          _velocity.y += (Math.random() - 0.5) * 2 + 0.5;  // 약간 위로
          _velocity.z += (Math.random() - 0.5) * 2;
          _velocity.normalize().multiplyScalar(SPARK_SPEED * (0.5 + Math.random() * 0.5));

          particle.velocity.copy(_velocity);
        }
      }
    };
  }, [sparkRef]);

  // Geometry
  const geometry = useMemo(() => {
    const totalParticles = POOL_SIZE * PARTICLES_PER_SPARK;
    const geo = new THREE.BufferGeometry();

    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(totalParticles * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(totalParticles * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(totalParticles), 1));

    return geo;
  }, []);

  // Material
  const material = useMemo(() => {
    return new THREE.PointsMaterial({
      map: SPARK_TEXTURE,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      vertexColors: true,
      sizeAttenuation: true,
      size: 0.1,
    });
  }, []);

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    if (!pointsRef.current || !positionBuffer.current || !colorBuffer.current || !sizeBuffer.current) return;

    const pool = poolRef.current;
    const positions = positionBuffer.current;
    const colors = colorBuffer.current;
    const sizes = sizeBuffer.current;

    let particleIndex = 0;

    for (let i = 0; i < POOL_SIZE; i++) {
      const spark = pool[i];

      if (spark.active) {
        spark.age += dt;

        if (spark.age >= SPARK_LIFETIME) {
          spark.active = false;
        }

        // 페이드 진행도
        const fadeProgress = spark.age / SPARK_LIFETIME;
        const opacity = 1 - fadeProgress;
        const size = 0.1 * (1 - fadeProgress * 0.5);

        // 색상 (노란색 → 주황색 → 빨간색)
        _color.setHSL(0.1 - fadeProgress * 0.1, 1, 0.5 + opacity * 0.3);

        for (const particle of spark.particles) {
          // 중력 적용
          particle.velocity.y -= 9.8 * dt;

          // 위치 업데이트
          particle.position.addScaledVector(particle.velocity, dt);

          // 버퍼 업데이트
          positions[particleIndex * 3] = spark.active ? particle.position.x : 0;
          positions[particleIndex * 3 + 1] = spark.active ? particle.position.y : -1000;
          positions[particleIndex * 3 + 2] = spark.active ? particle.position.z : 0;

          colors[particleIndex * 3] = _color.r * opacity;
          colors[particleIndex * 3 + 1] = _color.g * opacity;
          colors[particleIndex * 3 + 2] = _color.b * opacity;

          sizes[particleIndex] = spark.active ? size : 0;

          particleIndex++;
        }
      } else {
        // 비활성: 숨김
        for (let j = 0; j < PARTICLES_PER_SPARK; j++) {
          positions[particleIndex * 3] = 0;
          positions[particleIndex * 3 + 1] = -1000;
          positions[particleIndex * 3 + 2] = 0;
          colors[particleIndex * 3] = 0;
          colors[particleIndex * 3 + 1] = 0;
          colors[particleIndex * 3 + 2] = 0;
          sizes[particleIndex] = 0;
          particleIndex++;
        }
      }
    }

    // 버퍼 업데이트
    const geo = pointsRef.current.geometry;
    (geo.attributes.position as THREE.BufferAttribute).array = positions;
    (geo.attributes.color as THREE.BufferAttribute).array = colors;
    (geo.attributes.size as THREE.BufferAttribute).array = sizes;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
  );
}
