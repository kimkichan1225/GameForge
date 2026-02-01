import RAPIER from '@dimforge/rapier3d-compat'
import type { MapObject } from '../stores/editorStore'
import type { Posture } from '../stores/gameStore'

let rapierInstance: typeof RAPIER | null = null

// 자세별 콜라이더 설정
export const COLLIDER_CONFIG = {
  standing: {
    halfHeight: 0.95,   // 캡슐 반높이
    radius: 0.4,       // 캡슐 반지름
    centerY: 1.4,      // 바닥에서 콜라이더 중심까지 높이
  },
  sitting: {
    halfHeight: 0.6,
    radius: 0.4,
    centerY: 1,
  },
  crawling: {
    halfHeight: 0.2,
    radius: 0.3,
    centerY: 0.5,
  },
} as const

// Rapier 초기화 (WASM 로드)
export async function initRapier(): Promise<typeof RAPIER> {
  if (rapierInstance) return rapierInstance
  await RAPIER.init()
  rapierInstance = RAPIER
  return RAPIER
}

// 물리 월드 생성
export function createWorld(): RAPIER.World {
  if (!rapierInstance) throw new Error('Rapier not initialized')
  return new rapierInstance.World({ x: 0, y: -20, z: 0 })
}

// 바닥 Collider 생성
export function createGround(world: RAPIER.World): RAPIER.Collider {
  if (!rapierInstance) throw new Error('Rapier not initialized')

  const groundDesc = rapierInstance.ColliderDesc.cuboid(100, 0.1, 100)
    .setTranslation(0, -0.1, 0)
  return world.createCollider(groundDesc)
}

// 플레이어 RigidBody + Collider 생성 (캡슐)
export function createPlayer(
  world: RAPIER.World,
  position: [number, number, number],
  posture: Posture = 'standing'
): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
  if (!rapierInstance) throw new Error('Rapier not initialized')

  const config = COLLIDER_CONFIG[posture]

  // Dynamic RigidBody
  const bodyDesc = rapierInstance.RigidBodyDesc.dynamic()
    .setTranslation(position[0], position[1] + config.centerY, position[2])
    .setLinearDamping(0.5)
    .lockRotations()

  const rigidBody = world.createRigidBody(bodyDesc)

  // 캡슐 Collider
  const colliderDesc = rapierInstance.ColliderDesc.capsule(config.halfHeight, config.radius)
    .setFriction(0.0)
    .setRestitution(0.0)

  const collider = world.createCollider(colliderDesc, rigidBody)

  return { rigidBody, collider }
}

// 플레이어 콜라이더 변경 (자세 변경 시)
export function updatePlayerCollider(
  world: RAPIER.World,
  rigidBody: RAPIER.RigidBody,
  oldCollider: RAPIER.Collider,
  oldPosture: Posture,
  newPosture: Posture
): RAPIER.Collider {
  if (!rapierInstance) throw new Error('Rapier not initialized')

  const oldConfig = COLLIDER_CONFIG[oldPosture]
  const newConfig = COLLIDER_CONFIG[newPosture]
  const pos = rigidBody.translation()

  // 기존 콜라이더 제거
  world.removeCollider(oldCollider, false)

  // 새 콜라이더 생성
  const colliderDesc = rapierInstance.ColliderDesc.capsule(newConfig.halfHeight, newConfig.radius)
    .setFriction(0.0)
    .setRestitution(0.0)

  const newCollider = world.createCollider(colliderDesc, rigidBody)

  // 리지드바디 Y 위치 조정 (콜라이더 중심 변경에 따라)
  // 바닥 기준으로 위치 유지 - 이전 자세의 centerY를 사용해야 정확함
  const groundY = pos.y - oldConfig.centerY  // 현재 바닥 위치 추정
  rigidBody.setTranslation({ x: pos.x, y: groundY + newConfig.centerY, z: pos.z }, true)

  return newCollider
}

// 맵 오브젝트를 Collider로 변환
export function createObjectCollider(
  world: RAPIER.World,
  obj: MapObject
): RAPIER.Collider | null {
  if (!rapierInstance) throw new Error('Rapier not initialized')

  const pos = obj.position
  const scale = obj.scale
  const rot = obj.rotation

  let colliderDesc: RAPIER.ColliderDesc | null = null

  switch (obj.type) {
    case 'box':
      colliderDesc = rapierInstance.ColliderDesc.cuboid(
        scale[0] / 2,
        scale[1] / 2,
        scale[2] / 2
      )
      break

    case 'plane':
      // 얇은 박스로 처리
      colliderDesc = rapierInstance.ColliderDesc.cuboid(
        scale[0] / 2,
        0.05 * scale[1],
        scale[2] / 2
      )
      break

    case 'cylinder':
      // cylinderGeometry args=[0.5, 0.5, 1] -> 반지름 0.5, 높이 1
      // scale 적용 후: 반지름 = 0.5 * max(scaleX, scaleZ), 높이 = scaleY
      colliderDesc = rapierInstance.ColliderDesc.cylinder(
        scale[1] / 2,  // halfHeight
        Math.max(scale[0], scale[2]) * 0.5  // radius = 0.5 * scale
      )
      break

    case 'sphere':
      // sphereGeometry args=[0.5] -> 반지름 0.5
      // scale 적용 후: 반지름 = 0.5 * max(scale)
      colliderDesc = rapierInstance.ColliderDesc.ball(
        Math.max(scale[0], scale[1], scale[2]) * 0.5  // radius = 0.5 * scale
      )
      break

    case 'ramp':
      // Ramp는 ConvexHull로 처리
      const vertices = new Float32Array([
        // 바닥
        -0.5 * scale[0], 0, -0.5 * scale[2],
        0.5 * scale[0], 0, -0.5 * scale[2],
        0.5 * scale[0], 0, 0.5 * scale[2],
        -0.5 * scale[0], 0, 0.5 * scale[2],
        // 앞면 상단
        -0.5 * scale[0], scale[1], 0.5 * scale[2],
        0.5 * scale[0], scale[1], 0.5 * scale[2],
      ])
      colliderDesc = rapierInstance.ColliderDesc.convexHull(vertices)
      break
  }

  if (!colliderDesc) return null

  // 위치 설정
  colliderDesc.setTranslation(pos[0], pos[1], pos[2])

  // 회전 설정 (Y축 회전만 적용, 라디안)
  if (rot[1] !== 0) {
    const quat = new rapierInstance.Quaternion(0, 0, 0, 1)
    const halfAngle = rot[1] / 2
    quat.x = 0
    quat.y = Math.sin(halfAngle)
    quat.z = 0
    quat.w = Math.cos(halfAngle)
    colliderDesc.setRotation(quat)
  }

  return world.createCollider(colliderDesc)
}

// 맵 전체 오브젝트 로드
export function loadMapObjects(world: RAPIER.World, objects: MapObject[]): RAPIER.Collider[] {
  const colliders: RAPIER.Collider[] = []

  for (const obj of objects) {
    const collider = createObjectCollider(world, obj)
    if (collider) {
      colliders.push(collider)
    }
  }

  return colliders
}

// 플레이어 이동 적용
export function applyPlayerMovement(
  rigidBody: RAPIER.RigidBody,
  moveDir: { x: number; z: number },
  speed: number,
  jump: boolean,
  isGrounded: boolean
) {
  if (!rapierInstance) return

  const vel = rigidBody.linvel()

  // 수평 이동
  const newVelX = moveDir.x * speed
  const newVelZ = moveDir.z * speed

  // 점프
  let newVelY = vel.y
  if (jump && isGrounded) {
    newVelY = 8 // 점프 속도
  }

  rigidBody.setLinvel({ x: newVelX, y: newVelY, z: newVelZ }, true)
}

// 바닥 체크용 캐시된 객체 (매 프레임 생성 방지)
const groundCheckOffsets = [
  { x: 0, z: 0 },
  { x: 0.15, z: 0 },
  { x: -0.15, z: 0 },
  { x: 0, z: 0.15 },
  { x: 0, z: -0.15 },
] as const

const rayOrigin = { x: 0, y: 0, z: 0 }
const rayDir = { x: 0, y: -1, z: 0 }
let cachedRay: RAPIER.Ray | null = null

// 바닥 체크 (레이캐스트 - 플레이어 콜라이더 제외)
// 경사면에서도 감지되도록 여러 지점에서 레이캐스트
export function checkGrounded(
  world: RAPIER.World,
  rigidBody: RAPIER.RigidBody,
  playerCollider: RAPIER.Collider,
  posture: Posture = 'standing'
): boolean {
  if (!rapierInstance) return false

  // Ray 인스턴스 캐싱
  if (!cachedRay) {
    cachedRay = new rapierInstance.Ray(rayOrigin, rayDir)
  }

  const config = COLLIDER_CONFIG[posture]
  const pos = rigidBody.translation()

  // 캡슐 바닥 = 중심Y - halfHeight - radius
  const capsuleBottom = config.centerY - config.halfHeight - config.radius
  const rayOriginY = pos.y - config.centerY + capsuleBottom + 0.1  // 바닥보다 살짝 위
  const rayDistance = 0.25

  for (let i = 0; i < groundCheckOffsets.length; i++) {
    const offset = groundCheckOffsets[i]

    // Ray origin 업데이트 (새 객체 생성 대신 기존 객체 수정)
    cachedRay.origin.x = pos.x + offset.x
    cachedRay.origin.y = rayOriginY
    cachedRay.origin.z = pos.z + offset.z

    const hit = world.castRay(
      cachedRay,
      rayDistance,
      true,
      undefined,
      undefined,
      playerCollider,
      rigidBody
    )

    if (hit !== null) {
      return true
    }
  }

  return false
}

export { RAPIER }
