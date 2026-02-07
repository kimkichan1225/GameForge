import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// 히트 스파크 풀 크기
const POOL_SIZE = 30
const SPARK_LIFETIME = 0.15
const PARTICLES_PER_SPARK = 8
const SPARK_SPEED = 3
const GRAVITY = 9.8

// GC 방지 재사용 객체
const _velocity = new THREE.Vector3()
const _color = new THREE.Color()

interface SparkParticle {
  position: THREE.Vector3
  velocity: THREE.Vector3
}

interface SparkInstance {
  active: boolean
  age: number
  particles: SparkParticle[]
}

export interface HitSparkHandle {
  spawn: (position: THREE.Vector3, normal: THREE.Vector3) => void
}

// 스파크 텍스처 생성
const createSparkTexture = () => {
  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
  gradient.addColorStop(0, 'rgba(255, 255, 200, 1)')
  gradient.addColorStop(0.3, 'rgba(255, 200, 100, 1)')
  gradient.addColorStop(0.7, 'rgba(255, 150, 50, 0.5)')
  gradient.addColorStop(1, 'rgba(255, 100, 0, 0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 32, 32)

  return new THREE.CanvasTexture(canvas)
}

const SPARK_TEXTURE = createSparkTexture()
const TOTAL_PARTICLES = POOL_SIZE * PARTICLES_PER_SPARK

export function HitSpark({ sparkRef }: { sparkRef: React.MutableRefObject<HitSparkHandle | null> }) {
  const pointsRef = useRef<THREE.Points>(null)
  const poolRef = useRef<SparkInstance[]>([])

  // 버퍼
  const buffers = useRef({
    positions: new Float32Array(TOTAL_PARTICLES * 3),
    colors: new Float32Array(TOTAL_PARTICLES * 3),
    sizes: new Float32Array(TOTAL_PARTICLES),
  })

  const stateRef = useRef({
    hasActiveSparks: false,
  })

  // 풀 초기화
  useMemo(() => {
    poolRef.current = Array.from({ length: POOL_SIZE }, () => ({
      active: false,
      age: 0,
      particles: Array.from({ length: PARTICLES_PER_SPARK }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
      })),
    }))
  }, [])

  // 스파크 생성 함수
  useMemo(() => {
    sparkRef.current = {
      spawn: (position: THREE.Vector3, normal: THREE.Vector3) => {
        const pool = poolRef.current
        const spark = pool.find(s => !s.active)
        if (!spark) return

        spark.active = true
        spark.age = 0

        for (const particle of spark.particles) {
          particle.position.copy(position)

          _velocity.copy(normal)
          _velocity.x += (Math.random() - 0.5) * 2
          _velocity.y += (Math.random() - 0.5) * 2 + 0.5
          _velocity.z += (Math.random() - 0.5) * 2
          _velocity.normalize().multiplyScalar(SPARK_SPEED * (0.5 + Math.random() * 0.5))

          particle.velocity.copy(_velocity)
        }

        stateRef.current.hasActiveSparks = true
      }
    }
  }, [sparkRef])

  // Geometry
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    const { positions, colors, sizes } = buffers.current

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))

    return geo
  }, [])

  // Material
  const material = useMemo(() => new THREE.PointsMaterial({
    map: SPARK_TEXTURE,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    vertexColors: true,
    sizeAttenuation: true,
    size: 0.1,
  }), [])

  // 매 프레임 업데이트
  useFrame((_, dt) => {
    const points = pointsRef.current
    if (!points) return

    const state = stateRef.current
    if (!state.hasActiveSparks) return

    const pool = poolRef.current
    const { positions, colors, sizes } = buffers.current

    let particleIndex = 0
    let hasActive = false
    const gravityDt = GRAVITY * dt

    for (let i = 0; i < POOL_SIZE; i++) {
      const spark = pool[i]

      if (spark.active) {
        spark.age += dt

        if (spark.age >= SPARK_LIFETIME) {
          spark.active = false
          for (let j = 0; j < PARTICLES_PER_SPARK; j++) {
            const idx = particleIndex * 3
            positions[idx] = 0
            positions[idx + 1] = -1000
            positions[idx + 2] = 0
            colors[idx] = 0
            colors[idx + 1] = 0
            colors[idx + 2] = 0
            sizes[particleIndex] = 0
            particleIndex++
          }
        } else {
          hasActive = true

          const fadeProgress = spark.age / SPARK_LIFETIME
          const opacity = 1 - fadeProgress
          const size = 0.1 * (1 - fadeProgress * 0.5)

          _color.setHSL(0.1 - fadeProgress * 0.1, 1, 0.5 + opacity * 0.3)

          for (const particle of spark.particles) {
            particle.velocity.y -= gravityDt
            particle.position.addScaledVector(particle.velocity, dt)

            const idx = particleIndex * 3
            positions[idx] = particle.position.x
            positions[idx + 1] = particle.position.y
            positions[idx + 2] = particle.position.z

            colors[idx] = _color.r * opacity
            colors[idx + 1] = _color.g * opacity
            colors[idx + 2] = _color.b * opacity

            sizes[particleIndex] = size
            particleIndex++
          }
        }
      } else {
        particleIndex += PARTICLES_PER_SPARK
      }
    }

    state.hasActiveSparks = hasActive

    const geo = points.geometry
    geo.attributes.position.needsUpdate = true
    geo.attributes.color.needsUpdate = true
    geo.attributes.size.needsUpdate = true
  })

  return (
    <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} />
  )
}
