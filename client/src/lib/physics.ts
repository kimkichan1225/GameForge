import RAPIER from '@dimforge/rapier3d-compat'
import type { MapObject } from '../stores/editorStore'

let rapierInstance: typeof RAPIER | null = null

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
  position: [number, number, number]
): { rigidBody: RAPIER.RigidBody; collider: RAPIER.Collider } {
  if (!rapierInstance) throw new Error('Rapier not initialized')

  // Dynamic RigidBody
  const bodyDesc = rapierInstance.RigidBodyDesc.dynamic()
    .setTranslation(position[0], position[1] + 0.9, position[2])
    .setLinearDamping(0.5)
    .lockRotations() // 회전 잠금 (캐릭터가 넘어지지 않게)

  const rigidBody = world.createRigidBody(bodyDesc)

  // 캡슐 Collider (반지름 0.3, 높이 1.2 -> 전체 높이 약 1.8)
  const colliderDesc = rapierInstance.ColliderDesc.capsule(0.6, 0.3)
    .setFriction(0.0)
    .setRestitution(0.0)

  const collider = world.createCollider(colliderDesc, rigidBody)

  return { rigidBody, collider }
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

// 바닥 체크 (레이캐스트 - 플레이어 콜라이더 제외)
// 경사면에서도 감지되도록 여러 지점에서 레이캐스트
export function checkGrounded(
  world: RAPIER.World,
  rigidBody: RAPIER.RigidBody,
  playerCollider: RAPIER.Collider
): boolean {
  if (!rapierInstance) return false

  const pos = rigidBody.translation()
  const rayOriginY = pos.y - 0.8  // 캡슐 바닥 근처에서 시작
  const rayDistance = 0.25  // 경사면을 위해 더 긴 거리

  // 여러 지점에서 레이캐스트 (중앙 + 사방)
  const offsets = [
    { x: 0, z: 0 },       // 중앙
    { x: 0.15, z: 0 },    // 앞
    { x: -0.15, z: 0 },   // 뒤
    { x: 0, z: 0.15 },    // 좌
    { x: 0, z: -0.15 },   // 우
  ]

  for (const offset of offsets) {
    const ray = new rapierInstance.Ray(
      { x: pos.x + offset.x, y: rayOriginY, z: pos.z + offset.z },
      { x: 0, y: -1, z: 0 }
    )

    const hit = world.castRay(
      ray,
      rayDistance,
      true,
      undefined,
      undefined,
      playerCollider,
      rigidBody
    )

    if (hit !== null) {
      return true  // 하나라도 맞으면 바닥에 있음
    }
  }

  return false
}

export { RAPIER }
