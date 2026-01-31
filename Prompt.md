# 웹 게임 개발 플랫폼 - 프로젝트 설계 프롬프트

## 프로젝트 개요

### 프로젝트명
**GameForge** (가칭) - 웹 기반 3D 게임 제작 및 플레이 플랫폼

### 핵심 컨셉
사용자가 3D 도형을 활용해 맵을 직접 제작하고, 기본 제공 게임 모드로 즉시 플레이하거나 커스텀 로직을 개발하여 자신만의 게임을 만들 수 있는 웹 플랫폼

### 플레이 방식
1. **커뮤니티 맵 플레이**: 다른 유저가 맵 에디터로 만들어서 공개한 맵을 선택해서 게임
2. **실시간 협동 빌딩**: 일정 시간(빌딩 타임) 동안 참가자들이 함께 맵 제작 → 시간 종료 후 그 맵으로 게임 시작

> 모든 맵은 유저가 "맵 만들기" 에디터로 제작 → 웹에 공개/등록하는 방식

### 타겟 유저
- 게임 개발에 관심 있는 비개발자 (노코드 맵 에디터)
- 간단한 멀티플레이어 게임을 빠르게 만들고 싶은 개발자
- 친구들과 커스텀 맵에서 플레이하고 싶은 일반 유저

---

## 핵심 기능 정의

### 0. 인증 시스템

#### 회원가입
```typescript
interface SignUpRequest {
  username: string;       // 3-20자, 영문/숫자/언더스코어
  email: string;          // 이메일 형식 검증
  password: string;       // 최소 8자, 영문+숫자 조합
  confirmPassword: string;
}

interface SignUpResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    username: string;
    email: string;
  };
}
```

#### 로그인
```typescript
interface LoginRequest {
  email: string;
  password: string;
}

interface LoginResponse {
  success: boolean;
  message: string;
  session?: Session;  // Supabase 세션
  user?: {
    id: string;
    username: string;
    email: string;
    avatarUrl?: string;
  };
}
```

#### 로그아웃
```typescript
interface LogoutResponse {
  success: boolean;
  message: string;
}
```

#### 인증 플로우 (Supabase Auth 기반)
1. **회원가입**: 이메일 중복 확인 → Supabase Auth 회원가입 → profiles 테이블 자동 생성 (트리거)
2. **로그인**: Supabase Auth 로그인 → 세션 토큰 자동 관리
3. **로그아웃**: Supabase Auth 로그아웃 → 세션 무효화
4. **소셜 로그인**: Google, GitHub 등 OAuth 지원 (Supabase 내장)

```typescript
// Supabase Auth 사용 예시
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 회원가입
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'password123',
  options: {
    data: { username: 'player1' }
  }
});

// 로그인
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password123'
});

// 소셜 로그인 (Google)
const { data, error } = await supabase.auth.signInWithOAuth({
  provider: 'google'
});

// 로그아웃
const { error } = await supabase.auth.signOut();

// 현재 세션 확인
const { data: { session } } = await supabase.auth.getSession();
```

---

### 1. 맵 에디터 (노코드)

#### 기본 도형 제공
- **Box** (박스/큐브) - 벽, 바닥, 장애물
- **Cylinder** (실린더) - 기둥, 파이프
- **Sphere** (구) - 장식, 특수 오브젝트
- **Plane** (평면) - 바닥, 천장
- **Ramp** (경사로) - 슬로프, 계단 대체

#### 도형 속성
```typescript
interface GameObject {
  id: string;
  type: 'box' | 'cylinder' | 'sphere' | 'plane' | 'ramp';
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
  color: string;
  material: 'solid' | 'transparent' | 'emissive';
  collision: boolean;  // 충돌 여부
  properties: {
    climbable?: boolean;    // 올라갈 수 있는지
    slippery?: boolean;     // 미끄러운지
    damage?: number;        // 접촉 시 데미지
    bouncy?: boolean;       // 튕기는지
  };
}
```

#### 게임 오브젝트 (특수 마커)
```typescript
interface GameMarker {
  id: string;
  type: 'spawn_point' | 'start_point' | 'end_point' | 'team_zone' | 'capture_point' | 'item_spawn';
  position: { x: number; y: number; z: number };
  team?: 'red' | 'blue' | 'neutral';
  radius?: number;  // 영역 크기
}
```

#### 에디터 카메라 (자유 비행 모드)

캐릭터 없이 카메라만 자유롭게 이동하며 맵 제작 (Unity/Blender 씬 뷰 느낌)

| 키 입력 | 동작 |
|--------|------|
| 마우스 우클릭 + WASD | 카메라 앞/뒤/좌/우 이동 |
| 마우스 우클릭 + Space | 카메라 위로 이동 |
| 마우스 우클릭 + Shift | 카메라 아래로 이동 |
| 마우스 우클릭 + 드래그 | 카메라 회전 (시점 변경) |
| 마우스 휠 | 줌 인/아웃 |
| F | 선택한 오브젝트로 포커스 이동 |

> 마우스 우클릭을 누르고 있을 때만 카메라 이동 (단축키 충돌 방지)

```typescript
interface EditorCamera {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number };  // pitch, yaw
  moveSpeed: number;      // 이동 속도 (휠로 조절)
  lookSensitivity: number; // 마우스 감도
}
```

#### 에디터 기능
- **오브젝트 배치**: 원하는 위치에서 클릭하여 도형 배치
- **기즈모 조작**: 이동(W) / 회전(E) / 스케일(R) 모드 전환
- 복사(Ctrl+C) / 붙여넣기(Ctrl+V) / 삭제(Delete)
- Undo(Ctrl+Z) / Redo(Ctrl+Y)
- 그리드 스냅 (G 토글)
- 테스트 플레이 모드 (P - 에디터 내에서 캐릭터로 테스트)

#### 맵 모드 선택

맵 생성 시 게임 모드를 먼저 선택 → 해당 모드에 맞는 마커/설정만 표시

```typescript
type MapMode = 'race' | 'shooter';

// 모드별 사용 가능한 마커
const MODE_MARKERS = {
  race: [
    'start_point',      // 시작점 (필수)
    'end_point',        // 끝점 (필수)
    'checkpoint',       // 체크포인트
    'spawn_point',      // 스폰 위치
  ],
  shooter: [
    'spawn_point',      // 스폰 위치 (필수)
    'team_spawn_red',   // 레드팀 스폰 (팀전용)
    'team_spawn_blue',  // 블루팀 스폰 (팀전용)
    'capture_point',    // 점령 포인트 (점령전용)
    'item_spawn',       // 아이템/무기 스폰
  ],
};

// 모드별 필수 마커 검증
const REQUIRED_MARKERS = {
  race: ['start_point', 'end_point'],
  shooter: ['spawn_point'],  // 팀전이면 team_spawn_red, team_spawn_blue도 필수
};
```

**맵 생성 플로우**
```
1. "맵 만들기" 클릭
2. 모드 선택: 달리기 / 총게임
3. 에디터 진입 (선택한 모드에 맞는 마커만 표시)
4. 맵 제작
5. 저장 시 필수 마커 검증
   - 달리기: 시작점, 끝점 있어야 저장 가능
   - 총게임: 스폰 포인트 있어야 저장 가능
```

#### 맵 데이터 구조
```typescript
interface MapData {
  id: string;
  name: string;
  author: string;
  createdAt: Date;
  updatedAt: Date;
  thumbnail?: string;

  // 맵 모드 (달리기 / 총게임)
  mode: MapMode;

  settings: {
    skybox: string;
    ambientLight: { color: string; intensity: number };
    gravity: number;
    bounds: { x: number; y: number; z: number };  // 맵 경계
  };

  objects: GameObject[];
  markers: GameMarker[];

  // 총게임 맵 추가 설정
  shooterSettings?: {
    availableWeapons: WeaponType[];  // 사용 가능한 무기
    defaultWeapon: WeaponType;       // 기본 무기
  };

  // 달리기 맵 추가 설정
  raceSettings?: {
    laps: number;           // 랩 수 (기본 1)
    timeLimit?: number;     // 제한 시간
  };

  // 커스텀 스크립트 (Phase 5)
  customScripts?: string[];
}
```

---

### 2. 기본 제공 게임 모드

#### 2.1 달리기 (Race)
```typescript
interface RaceMode {
  type: 'race';
  settings: {
    startPoints: string[];      // 시작점 마커 ID들
    endPoint: string;           // 끝점 마커 ID
    maxPlayers: number;         // 최대 인원 (1-10)
    timeLimit?: number;         // 제한 시간 (초)
    laps?: number;              // 랩 수 (기본 1)
    checkpoints?: string[];     // 체크포인트 마커 ID들
  };
}
```

**게임 흐름:**
1. 모든 플레이어가 시작점에 스폰
2. 카운트다운 후 동시 출발
3. 끝점에 먼저 도착하면 순위 확정
4. 모든 플레이어 도착 or 제한 시간 종료 시 게임 종료

#### 2.2 총게임 - 개인전 (Deathmatch)
```typescript
interface DeathmatchMode {
  type: 'deathmatch';
  settings: {
    spawnPoints: string[];      // 스폰 포인트 마커 ID들
    maxPlayers: number;         // 최대 인원 (2-10)
    scoreLimit: number;         // 목표 킬 수
    timeLimit: number;          // 제한 시간 (초)
    respawnTime: number;        // 리스폰 대기 시간 (초)
    weapons: WeaponType[];      // 사용 가능 무기
  };
}
```

**게임 흐름:**
1. 랜덤 스폰 포인트에 플레이어 배치
2. 다른 플레이어를 처치하면 점수 획득
3. 목표 킬 수 달성 or 제한 시간 종료 시 게임 종료

#### 2.3 총게임 - 팀전 킬 (Team Deathmatch)
```typescript
interface TeamDeathmatchMode {
  type: 'team_deathmatch';
  settings: {
    redSpawnPoints: string[];   // 레드팀 스폰 포인트
    blueSpawnPoints: string[];  // 블루팀 스폰 포인트
    maxPlayersPerTeam: number;  // 팀당 최대 인원 (1-5)
    scoreLimit: number;         // 팀 목표 킬 수
    timeLimit: number;          // 제한 시간 (초)
    respawnTime: number;        // 리스폰 대기 시간 (초)
    weapons: WeaponType[];      // 사용 가능 무기
  };
}
```

#### 2.4 총게임 - 점령전 (Domination)
```typescript
interface DominationMode {
  type: 'domination';
  settings: {
    redSpawnPoints: string[];   // 레드팀 스폰 포인트
    blueSpawnPoints: string[];  // 블루팀 스폰 포인트
    capturePoints: string[];    // 점령 포인트 마커 ID들
    maxPlayersPerTeam: number;  // 팀당 최대 인원 (1-5)
    scoreLimit: number;         // 목표 점수
    timeLimit: number;          // 제한 시간 (초)
    captureTime: number;        // 점령에 필요한 시간 (초)
    pointsPerSecond: number;    // 점령 시 초당 점수
    respawnTime: number;        // 리스폰 대기 시간 (초)
    weapons: WeaponType[];      // 사용 가능 무기
  };
}

type GameMode = RaceMode | DeathmatchMode | TeamDeathmatchMode | DominationMode;
```

---

### 3. 플레이어 시스템

#### 캐릭터 컨트롤
```typescript
interface PlayerState {
  id: string;
  username: string;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  
  health: number;
  maxHealth: number;
  isAlive: boolean;
  
  team?: 'red' | 'blue';
  score: number;
  kills: number;
  deaths: number;
  
  currentWeapon?: WeaponType;
  ammo?: { [key in WeaponType]?: number };
  
  // 자세 상태 (달리기 모드용)
  pose?: 'stand' | 'sit' | 'crawl';
}
```

#### 이동 시스템 - 달리기 모드 (3인칭)

| 키 입력 | 동작 | 애니메이션 |
|--------|------|-----------|
| WASD | 걷기 | Walk |
| Shift + WASD | 뛰기 | Run |
| Space | 점프 | Jump |
| Ctrl | 앉기 | SitPose |
| Ctrl + WASD | 앉아서 걷기 | SitWalk |
| C | 엎드리기 | CrawlPose |
| C + WASD | 엎드려 걷기 | Crawl |
| V | 대쉬 (구르기) | Roll |

```typescript
type RaceAnimationType = 'Walk' | 'Run' | 'Jump' | 'Roll' | 'SitPose' | 'SitWalk' | 'CrawlPose' | 'Crawl';

interface RacePlayerControls {
  movement: {
    forward: boolean;   // W
    backward: boolean;  // S
    left: boolean;      // A
    right: boolean;     // D
  };
  actions: {
    sprint: boolean;    // Shift (뛰기)
    jump: boolean;      // Space (점프)
    sit: boolean;       // Ctrl (앉기)
    crawl: boolean;     // C (엎드리기)
    dash: boolean;      // V (대쉬/구르기)
  };
}
```

#### 이동 시스템 - 총게임 모드 (1인칭 / 3인칭 선택 가능)

| 키 입력 | 동작 |
|--------|------|
| WASD | 8방향 이동 (정면 유지) |
| Space | 점프 |
| Shift | 달리기 (조준 불가) |
| Ctrl | 앉기 |
| C | 엎드리기 |
| 마우스 이동 | 시점/조준 회전 |
| 우클릭 | 조준 (걷기/서기 상태만 가능) |
| 좌클릭 | 발사 |
| R | 재장전 |
| 숫자키 | 무기 교체 |
| V | 시점 전환 (1인칭 ↔ 3인칭) |

#### 총게임 애니메이션 목록 (3인칭용)

```typescript
type ShooterAnimationType =
  // 기본 상태
  | 'Idle-Rifle'           // 가만히 있을 때
  | 'IdleAiming-Rifle'     // 가만히 조준 중
  | 'IdleFiring-Rifle'     // Idle 상태에서 서서 쏘기
  | 'Jump'                 // 점프
  | 'Dead'                 // 사망

  // 걷기 (8방향) - 정면 유지
  | 'WalkFront-Rifle'      // 앞으로 걷기
  | 'WalkBack-Rifle'       // 뒤로 걷기
  | 'WalkLeft-Rifle'       // 왼쪽으로 걷기
  | 'WalkRight-Rifle'      // 오른쪽으로 걷기
  | 'WalkFrontLeft-Rifle'  // 왼쪽 대각선 앞으로 걷기
  | 'WalkFrontRight-Rifle' // 오른쪽 대각선 앞으로 걷기
  | 'WalkBackLeft-Rifle'   // 왼쪽 대각선 뒤로 걷기
  | 'WalkBackRight-Rifle'  // 오른쪽 대각선 뒤로 걷기

  // 걷기 + 조준/발사
  | 'WalkAiming-Rifle'     // 앞으로 걸으면서 조준 중
  | 'WalkFiring-Rifle'     // 앞으로 걸으면서 쏘기

  // 뛰기 (8방향) - 정면 유지, 조준 불가
  | 'RunFront-Rifle'       // 앞으로 뛰기
  | 'RunBack-Rifle'        // 뒤로 뛰기
  | 'RunLeft-Rifle'        // 왼쪽으로 뛰기
  | 'RunRight-Rifle'       // 오른쪽으로 뛰기
  | 'RunFrontLeft-Rifle'   // 왼쪽 대각선 앞으로 뛰기
  | 'RunFrontRight-Rifle'  // 오른쪽 대각선 앞으로 뛰기
  | 'RunBackLeft-Rifle'    // 왼쪽 대각선 뒤로 뛰기
  | 'RunBackRight-Rifle'   // 오른쪽 대각선 뒤로 뛰기
  | 'RunFiring-Rifle'      // 앞으로 뛰면서 쏘기

  // 앉기 (8방향) - 정면 유지
  | 'SitIdle-Rifle'        // 앉은 상태
  | 'SitWalkFront-Rifle'   // 앉아서 앞으로 걷기
  | 'SitWalkBack-Rifle'    // 앉아서 뒤로 걷기
  | 'SitWalkLeft-Rifle'    // 앉아서 왼쪽으로 걷기
  | 'SitWalkRight-Rifle'   // 앉아서 오른쪽으로 걷기
  | 'SitWalkFrontLeft-Rifle'  // 앉아서 왼쪽 대각선 앞으로 걷기
  | 'SitWalkFrontRight-Rifle' // 앉아서 오른쪽 대각선 앞으로 걷기
  | 'SitWalkBackLeft-Rifle'   // 앉아서 왼쪽 대각선 뒤로 걷기
  | 'SitWalkBackRight-Rifle'  // 앉아서 오른쪽 대각선 뒤로 걷기

  // 엎드리기
  | 'CrawlIdle-Rifle';     // 엎드린 상태
  // TODO: 엎드려 이동 애니메이션 추가 예정
```

> 뛸 때는 조준 불가 (Shift 누르면 조준 해제)

#### 사운드 시스템 (3D Spatial Audio)

게임 내 모든 사운드는 3D 공간 오디오로 처리하여 방향과 거리감을 표현

```typescript
interface SoundConfig {
  // 거리 기반 감쇠
  refDistance: number;     // 이 거리까지는 최대 볼륨 (기본: 1)
  maxDistance: number;     // 이 거리 이상이면 안 들림 (기본: 100)
  rolloffFactor: number;   // 거리에 따른 감쇠 정도 (기본: 1)

  // 방향 기반 패닝
  // Web Audio API PannerNode 또는 Three.js PositionalAudio 사용
}

// 사운드 종류별 설정
const SOUND_CONFIGS = {
  // 총소리 - 멀리까지 들림
  gunshot: { refDistance: 5, maxDistance: 150, rolloffFactor: 1 },

  // 발자국 - 가까이서만 들림
  footstep: { refDistance: 1, maxDistance: 20, rolloffFactor: 2 },

  // 재장전 - 본인 주변만
  reload: { refDistance: 1, maxDistance: 10, rolloffFactor: 2 },

  // 폭발 - 아주 멀리까지
  explosion: { refDistance: 10, maxDistance: 200, rolloffFactor: 0.5 },
};
```

**사운드 목록**

| 카테고리 | 사운드 | 설명 | 모드 |
|---------|--------|------|------|
| **공통 - 이동** |
| 이동 | footstep_walk | 걷기 발자국 | 전체 |
| 이동 | footstep_run | 뛰기 발자국 | 전체 |
| 이동 | footstep_crouch | 앉아서 이동 | 전체 |
| 이동 | footstep_crawl | 엎드려 이동 | 전체 |
| 이동 | jump | 점프 | 전체 |
| 이동 | land | 착지 | 전체 |
| 이동 | roll | 구르기/대쉬 | 달리기 |
| **달리기 모드** |
| 달리기 | countdown | 카운트다운 (3, 2, 1) | 달리기 |
| 달리기 | race_start | 출발 신호 | 달리기 |
| 달리기 | checkpoint | 체크포인트 통과 | 달리기 |
| 달리기 | finish | 결승선 통과 | 달리기 |
| 달리기 | obstacle_hit | 장애물 충돌 | 달리기 |
| **총게임 모드** |
| 무기 | gunshot_rifle | 라이플 발사음 | 총게임 |
| 무기 | gunshot_pistol | 권총 발사음 | 총게임 |
| 무기 | gunshot_shotgun | 샷건 발사음 | 총게임 |
| 무기 | gunshot_sniper | 스나이퍼 발사음 | 총게임 |
| 무기 | reload | 재장전 | 총게임 |
| 무기 | empty_clip | 탄창 비었을 때 | 총게임 |
| 무기 | weapon_switch | 무기 교체 | 총게임 |
| 피격 | hit_body | 몸통 피격 | 총게임 |
| 피격 | hit_head | 헤드샷 | 총게임 |
| 피격 | death | 사망 | 총게임 |
| 피격 | respawn | 리스폰 | 총게임 |
| **공통 - 환경/UI** |
| 환경 | ambient | 배경음 (맵별) | 전체 |
| UI | button_click | 버튼 클릭 | 전체 |
| UI | game_win | 승리 | 전체 |
| UI | game_lose | 패배 | 전체 |

> Three.js `PositionalAudio` + `AudioListener` 사용하여 구현
> 이동/전투 사운드는 3D 공간 오디오, UI 사운드는 2D 오디오

#### 무기 시스템 (총게임용)
```typescript
type WeaponType = 'pistol' | 'rifle' | 'shotgun' | 'sniper';

interface WeaponConfig {
  type: WeaponType;
  damage: number;
  fireRate: number;        // 초당 발사 수
  range: number;           // 사거리
  spread: number;          // 탄퍼짐
  magazineSize: number;    // 탄창 크기
  reloadTime: number;      // 재장전 시간 (초)
  headshotMultiplier: number;
}

const WEAPON_CONFIGS: { [key in WeaponType]: WeaponConfig } = {
  pistol: {
    type: 'pistol',
    damage: 20,
    fireRate: 3,
    range: 50,
    spread: 0.02,
    magazineSize: 12,
    reloadTime: 1.5,
    headshotMultiplier: 2
  },
  rifle: {
    type: 'rifle',
    damage: 25,
    fireRate: 8,
    range: 80,
    spread: 0.04,
    magazineSize: 30,
    reloadTime: 2.5,
    headshotMultiplier: 1.5
  },
  shotgun: {
    type: 'shotgun',
    damage: 15,  // per pellet, 8 pellets
    fireRate: 1,
    range: 20,
    spread: 0.15,
    magazineSize: 6,
    reloadTime: 3,
    headshotMultiplier: 1.5
  },
  sniper: {
    type: 'sniper',
    damage: 80,
    fireRate: 0.5,
    range: 200,
    spread: 0.005,
    magazineSize: 5,
    reloadTime: 3,
    headshotMultiplier: 2.5
  }
};
```

---

### 4. 멀티플레이어 시스템

#### 방 시스템
```typescript
interface Room {
  id: string;
  name: string;
  host: string;           // 방장 플레이어 ID
  mapId?: string;         // 사용 중인 맵 ID (커뮤니티 맵 선택 시)
  gameMode: GameMode;     // 게임 모드 설정

  // 방 모드
  roomMode: 'community_map' | 'collaborative_build';
  // community_map: 유저가 공개한 커뮤니티 맵을 불러와서 플레이
  // collaborative_build: 빈 맵에서 참가자들과 실시간으로 함께 맵 제작 후 플레이

  status: 'waiting' | 'building' | 'starting' | 'playing' | 'finished';
  // building: 협동 빌딩 모드에서 맵 제작 중인 상태

  // 협동 빌딩 모드 설정
  buildSettings?: {
    buildTime: number;        // 빌딩 타임 (초) - 예: 180(3분), 300(5분), 600(10분)
    allowAllEdit: boolean;    // 모든 참가자가 편집 가능 (false면 방장만)
    showOthersCursor: boolean; // 다른 사람 커서 표시
  };
  buildTimeRemaining?: number;  // 남은 빌딩 시간 (초)

  currentMapData?: MapData;   // 협동 빌딩 중인 맵 데이터 (실시간 동기화)

  players: PlayerState[];
  maxPlayers: number;

  isPrivate: boolean;
  password?: string;

  createdAt: Date;
}
```

#### 방 생성 플로우
```
1. 방 만들기 클릭
   │
   ├── "커뮤니티 맵 선택"
   │     → 맵 브라우저에서 선택 → 게임 모드 설정 → 대기실 → 게임 시작
   │
   └── "협동 빌딩"
         → 빌딩 시간 설정 (3분/5분/10분)
         → 게임 모드 설정
         → 대기실 (참가자 입장)
         → 빌딩 시작 (타이머 시작)
         → 빌딩 타임 종료
         → 자동으로 게임 시작
```

#### 협동 빌딩 모드
```
[빌딩 타임] ─────────────────────> [플레이 타임]
  5분/10분 등 설정 가능              만든 맵으로 게임
  참가자 모두 맵 제작                 선택한 게임 모드로 플레이
```

- 방장이 빌딩 시간 설정 (예: 3분, 5분, 10분)
- 참가자들이 실시간으로 같은 맵을 함께 편집
- 각자의 편집 내용이 즉시 다른 참가자에게 동기화
- 다른 사람의 커서/선택 오브젝트 표시 (선택적)
- 빌딩 타임 종료 → 자동으로 게임 시작
- 빌딩 중에도 맵 안에서 돌아다니며 확인 가능
```

#### 서버-클라이언트 통신 (Socket.io Events)

**클라이언트 → 서버**
```typescript
// 방 관련
'room:create' -> { mapId?, gameMode, roomName, roomMode, isPrivate, password? }
'room:join' -> { roomId, password? }
'room:leave' -> { roomId }
'room:start' -> { roomId }  // 방장만

// 협동 빌딩 모드
'build:add_object' -> { object: GameObject }
'build:update_object' -> { objectId, changes }
'build:delete_object' -> { objectId }
'build:add_marker' -> { marker: GameMarker }
'build:cursor_move' -> { position, selectedObjectId? }  // 내 커서 위치 공유

// 게임 중
'player:input' -> {
  movement: { forward, backward, left, right, jump, sprint },
  rotation: { x, y },
  actions: { fire, reload, weapon_switch }
}
'player:chat' -> { message }
```

**서버 → 클라이언트**
```typescript
// 방 관련
'room:created' -> { room }
'room:joined' -> { room }
'room:player_joined' -> { player }
'room:player_left' -> { playerId }
'room:state_update' -> { room }

// 협동 빌딩 모드
'build:object_added' -> { playerId, object }
'build:object_updated' -> { playerId, objectId, changes }
'build:object_deleted' -> { playerId, objectId }
'build:marker_added' -> { playerId, marker }
'build:cursor_updated' -> { playerId, position, selectedObjectId? }  // 다른 사람 커서
'build:map_sync' -> { mapData }  // 전체 맵 동기화 (입장 시)

// 게임 중
'game:start' -> { initialState }
'game:state' -> { players, gameState, timestamp }  // 틱마다 전송
'game:player_hit' -> { shooterId, targetId, damage, position }
'game:player_died' -> { playerId, killerId }
'game:player_respawn' -> { playerId, position }
'game:score_update' -> { scores }
'game:end' -> { results }
```

#### 서버 권위 (Server Authority) 구현

**틱 레이트**: 20Hz (50ms 간격)

**서버 게임 루프**
```typescript
class GameServer {
  private tickRate = 20;  // 20 ticks per second
  private tickInterval = 1000 / this.tickRate;  // 50ms
  
  gameLoop() {
    setInterval(() => {
      // 1. 모든 플레이어 입력 처리
      this.processInputs();
      
      // 2. 물리/충돌 계산
      this.updatePhysics();
      
      // 3. 히트 판정 (서버에서 수행)
      this.processHits();
      
      // 4. 게임 로직 업데이트
      this.updateGameLogic();
      
      // 5. 상태 브로드캐스트
      this.broadcastState();
    }, this.tickInterval);
  }
}
```

**히트 판정 (레이캐스트 기반)**
```typescript
interface HitRequest {
  playerId: string;
  origin: Vector3;      // 발사 위치
  direction: Vector3;   // 발사 방향
  weaponType: WeaponType;
  timestamp: number;
}

processHit(request: HitRequest): HitResult | null {
  const weapon = WEAPON_CONFIGS[request.weaponType];
  
  // 서버에서 레이캐스트 수행
  const ray = new Ray(request.origin, request.direction);
  
  for (const player of this.players) {
    if (player.id === request.playerId) continue;  // 자기 자신 제외
    if (!player.isAlive) continue;
    
    const hit = this.checkRayPlayerCollision(ray, player, weapon.range);
    if (hit) {
      const isHeadshot = hit.part === 'head';
      const damage = weapon.damage * (isHeadshot ? weapon.headshotMultiplier : 1);
      
      return {
        targetId: player.id,
        damage,
        isHeadshot,
        hitPosition: hit.point
      };
    }
  }
  
  return null;
}
```

---

### 5. 커스텀 스크립팅 (Phase 5 - 선택적)

#### 스크립팅 환경
- 인게임 Monaco 에디터 (VS Code 기반)
- TypeScript 지원
- 샌드박스 실행 (보안을 위해 제한된 API만 노출)

#### 제공 API
```typescript
// 게임 이벤트 훅
GameEvents.on('playerJoin', (player: Player) => void);
GameEvents.on('playerLeave', (player: Player) => void);
GameEvents.on('playerDeath', (player: Player, killer: Player) => void);
GameEvents.on('objectCollision', (player: Player, object: GameObject) => void);
GameEvents.on('zoneEnter', (player: Player, zone: GameMarker) => void);
GameEvents.on('zoneLeave', (player: Player, zone: GameMarker) => void);

// 게임 제어
Game.setScore(playerId: string, score: number);
Game.teleport(playerId: string, position: Vector3);
Game.heal(playerId: string, amount: number);
Game.damage(playerId: string, amount: number);
Game.setTeam(playerId: string, team: 'red' | 'blue');
Game.endGame(winnerId?: string);
Game.showMessage(message: string, duration?: number);

// 오브젝트 제어
Objects.spawn(type: string, position: Vector3): GameObject;
Objects.destroy(objectId: string);
Objects.move(objectId: string, position: Vector3);
Objects.setProperty(objectId: string, property: string, value: any);

// 타이머
Timer.after(seconds: number, callback: () => void);
Timer.every(seconds: number, callback: () => void): TimerId;
Timer.cancel(timerId: TimerId);
```

#### 예시: 좀비 모드
```typescript
// zombie-mode.ts
let zombieId: string | null = null;
let survivors: Set<string> = new Set();

GameEvents.on('gameStart', () => {
  const players = Game.getPlayers();
  
  // 랜덤으로 한 명을 좀비로 선정
  const zombieIndex = Math.floor(Math.random() * players.length);
  zombieId = players[zombieIndex].id;
  
  // 나머지는 생존자
  players.forEach((p, i) => {
    if (i !== zombieIndex) {
      survivors.add(p.id);
    }
  });
  
  Game.setTeam(zombieId, 'red');
  survivors.forEach(id => Game.setTeam(id, 'blue'));
  
  Game.showMessage(`${players[zombieIndex].name}이(가) 좀비가 되었습니다!`, 5);
});

GameEvents.on('playerDeath', (player, killer) => {
  if (survivors.has(player.id) && killer.id === zombieId) {
    // 생존자가 좀비에게 죽으면 좀비가 됨
    survivors.delete(player.id);
    Game.setTeam(player.id, 'red');
    Game.showMessage(`${player.name}이(가) 좀비가 되었습니다!`, 3);
    
    // 모든 생존자가 감염되면 좀비 승리
    if (survivors.size === 0) {
      Game.showMessage('좀비 승리!', 5);
      Game.endGame();
    }
  }
});

// 3분 후 생존자 승리
Timer.after(180, () => {
  if (survivors.size > 0) {
    Game.showMessage('생존자 승리!', 5);
    Game.endGame();
  }
});
```

---

## 기술 스택

### Frontend
```
- React 18+ (TypeScript)
- Three.js + React Three Fiber (@react-three/fiber)
- @react-three/drei (Three.js 헬퍼)
- Zustand (전역 상태 관리)
- Socket.io-client (실시간 게임 통신)
- @supabase/supabase-js (DB, 인증, 스토리지)
- Monaco Editor (커스텀 스크립팅용)
- TailwindCSS (스타일링)
```

### Backend
```
- Node.js + Express (TypeScript)
- Socket.io (실시간 게임 통신 - 위치 동기화, 히트 판정)
```

### Supabase (BaaS)
```
- Supabase Database (PostgreSQL) - 유저, 맵, 게임 기록 저장
- Supabase Auth - 회원가입/로그인, 소셜 로그인 (Google, GitHub 등)
- Supabase Storage - 맵 썸네일, 유저 아바타 저장
- Supabase Realtime - 방 목록 실시간 업데이트, 로비 채팅
```

### Infrastructure (추후)
```
- Docker (게임 서버 컨테이너화)
- Vercel (프론트엔드 배포)
- Railway / Render (게임 서버 배포)
- CloudFlare (CDN)
```

### 역할 분담
```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│  (React + Three.js)                                         │
└──────────────┬───────────────────────┬──────────────────────┘
               │                       │
               ▼                       ▼
┌──────────────────────┐    ┌─────────────────────────────────┐
│    Game Server       │    │         Supabase                │
│  (Node.js+Socket.io) │    │                                 │
│                      │    │  - Auth (로그인/회원가입)        │
│  - 실시간 위치 동기화  │    │  - Database (맵, 유저, 기록)    │
│  - 서버 권위 히트 판정 │    │  - Storage (이미지 파일)        │
│  - 게임 로직 처리     │    │  - Realtime (로비, 방 목록)     │
│  - 방 상태 관리       │    │                                 │
└──────────────────────┘    └─────────────────────────────────┘
```

---

## 프로젝트 구조

### 현재 구현된 구조 (Phase 1 진행 중)
```
GameForge/
├── .env                        # 환경 변수 (Supabase)
├── .env.example                # 환경 변수 예시
├── .gitignore
├── Prompt.md                   # 프로젝트 설계 문서
├── README.md                   # 프로젝트 소개
│
└── client/                     # Frontend (React + Vite)
    ├── .env                    # 클라이언트 환경 변수
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── App.tsx             # 라우팅 설정
        ├── main.tsx
        ├── index.css           # TailwindCSS 설정
        ├── lib/
        │   └── supabase.ts     # Supabase 클라이언트
        ├── stores/
        │   ├── authStore.ts    # 인증 상태 관리 (Zustand)
        │   └── editorStore.ts  # 맵 에디터 상태 관리 (Zustand)
        ├── components/
        │   └── editor/
        │       ├── EditorCanvas.tsx  # 3D 캔버스 (Three.js)
        │       └── EditorUI.tsx      # 에디터 UI (툴바, 핫바, 속성패널)
        └── pages/
            ├── Landing.tsx     # 랜딩 페이지 (/)
            ├── Home.tsx        # 게임 메인/로비 (/home)
            └── MapEditor.tsx   # 맵 에디터 (/editor)
```

### 최종 목표 구조
```
gameforge/
├── client/                     # Frontend (React)
│   ├── src/
│   │   ├── components/
│   │   │   ├── editor/         # 맵 에디터 컴포넌트
│   │   │   │   ├── Canvas3D.tsx
│   │   │   │   ├── ObjectPalette.tsx
│   │   │   │   ├── PropertyPanel.tsx
│   │   │   │   ├── Toolbar.tsx
│   │   │   │   └── Gizmo.tsx
│   │   │   ├── game/           # 게임 플레이 컴포넌트
│   │   │   │   ├── GameCanvas.tsx
│   │   │   │   ├── PlayerController.tsx
│   │   │   │   ├── HUD.tsx
│   │   │   │   ├── Scoreboard.tsx
│   │   │   │   └── Crosshair.tsx
│   │   │   ├── lobby/          # 로비/방 컴포넌트
│   │   │   │   ├── RoomList.tsx
│   │   │   │   ├── RoomCreate.tsx
│   │   │   │   └── RoomLobby.tsx
│   │   │   └── ui/             # 공통 UI 컴포넌트
│   │   ├── stores/             # Zustand 스토어
│   │   │   ├── authStore.ts    # ✅ 구현 완료
│   │   │   ├── editorStore.ts
│   │   │   ├── gameStore.ts
│   │   │   └── roomStore.ts
│   │   ├── hooks/              # 커스텀 훅
│   │   │   ├── useSocket.ts
│   │   │   ├── usePlayerControls.ts
│   │   │   └── useGameLoop.ts
│   │   ├── lib/                # 유틸리티
│   │   │   ├── supabase.ts     # ✅ 구현 완료
│   │   │   ├── socket.ts
│   │   │   ├── physics.ts
│   │   │   └── mapLoader.ts
│   │   ├── types/              # TypeScript 타입 정의
│   │   │   ├── game.ts
│   │   │   ├── editor.ts
│   │   │   └── network.ts
│   │   └── pages/              # 페이지 컴포넌트
│   │       ├── Landing.tsx     # ✅ 구현 완료
│   │       ├── Home.tsx        # ✅ 구현 완료
│   │       ├── Editor.tsx
│   │       ├── Play.tsx
│   │       └── Browse.tsx
│   └── package.json
│
├── server/                     # Backend (Node.js)
│   ├── src/
│   │   ├── game/               # 게임 로직
│   │   │   ├── GameRoom.ts
│   │   │   ├── GameLoop.ts
│   │   │   ├── Physics.ts
│   │   │   ├── HitDetection.ts
│   │   │   └── modes/
│   │   │       ├── RaceMode.ts
│   │   │       ├── DeathmatchMode.ts
│   │   │       ├── TeamDeathmatchMode.ts
│   │   │       └── DominationMode.ts
│   │   ├── socket/             # Socket.io 핸들러
│   │   │   ├── roomHandlers.ts
│   │   │   ├── gameHandlers.ts
│   │   │   └── chatHandlers.ts
│   │   ├── api/                # REST API
│   │   │   ├── auth.ts
│   │   │   ├── maps.ts
│   │   │   └── users.ts
│   │   ├── supabase/           # Supabase 클라이언트
│   │   │   ├── client.ts
│   │   │   ├── auth.ts
│   │   │   └── storage.ts
│   │   └── utils/
│   │       └── vector.ts
│   └── package.json
│
├── shared/                     # 공유 타입/상수
│   ├── types.ts
│   ├── constants.ts
│   └── weapons.ts
│
└── README.md
```

---

## 데이터베이스 스키마 (Supabase)

> Supabase Auth를 사용하므로 `auth.users` 테이블은 자동 생성됨.
> 아래는 `public` 스키마에 생성할 추가 테이블들.

```sql
-- 유저 프로필 테이블 (auth.users 확장)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR(50) UNIQUE NOT NULL,
  avatar_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 새 유저 가입 시 프로필 자동 생성 트리거
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'username');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 맵 테이블
CREATE TABLE maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  thumbnail_url VARCHAR(500),
  map_data JSONB NOT NULL,  -- 맵 JSON 데이터
  is_public BOOLEAN DEFAULT true,
  play_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 맵 좋아요 테이블
CREATE TABLE map_likes (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  map_id UUID REFERENCES maps(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (user_id, map_id)
);

-- 게임 기록 테이블
CREATE TABLE game_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id UUID REFERENCES maps(id) ON DELETE SET NULL,
  game_mode VARCHAR(50) NOT NULL,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  duration_seconds INTEGER,
  player_count INTEGER,
  results JSONB,  -- 상세 결과 (킬/데스, 점수 등)
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) 정책
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE map_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

-- 프로필: 누구나 읽기 가능, 본인만 수정
CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT USING (true);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- 맵: 공개 맵은 누구나 읽기, 본인 맵만 수정/삭제
CREATE POLICY "Public maps are viewable by everyone"
  ON maps FOR SELECT USING (is_public = true OR author_id = auth.uid());

CREATE POLICY "Users can create maps"
  ON maps FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can update own maps"
  ON maps FOR UPDATE USING (auth.uid() = author_id);

CREATE POLICY "Users can delete own maps"
  ON maps FOR DELETE USING (auth.uid() = author_id);

-- 좋아요: 로그인 유저만 가능
CREATE POLICY "Users can manage own likes"
  ON map_likes FOR ALL USING (auth.uid() = user_id);

-- 게임 기록: 누구나 읽기 가능, 서버에서만 생성 (service_role 사용)
CREATE POLICY "Game records are viewable by everyone"
  ON game_records FOR SELECT USING (true);
```

### Supabase Storage 버킷 설정
```
버킷명: avatars
  - 유저 아바타 이미지
  - 공개 읽기, 본인만 업로드/삭제

버킷명: map-thumbnails
  - 맵 썸네일 이미지
  - 공개 읽기, 맵 작성자만 업로드/삭제
```

### Supabase Realtime 구독 활용
```typescript
// 방 목록 실시간 업데이트 예시 (로비)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 게임 서버가 활성 방 정보를 별도 테이블에 저장한다면
supabase
  .channel('lobby')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'active_rooms' },
    (payload) => {
      console.log('방 목록 변경:', payload);
      // UI 업데이트
    }
  )
  .subscribe();
```

---

## 개발 현황

### 완료된 기능 (Phase 1 진행 중)

#### 프론트엔드 기본 설정
- [x] Vite + React + TypeScript 프로젝트 생성
- [x] TailwindCSS v4 설정
- [x] React Router 설정
- [x] 환경 변수 설정 (.env)

#### 페이지 구현
- [x] **랜딩 페이지** (`/`) - 밝고 캐주얼한 디자인
  - 네비게이션 바
  - 히어로 섹션 (CTA 버튼)
  - 기능 소개 섹션
  - 게임 모드 카드
  - 푸터
- [x] **게임 메인 페이지** (`/home`) - 다크 게이밍 테마
  - 로그인/회원가입 모달
  - 빠른 시작/맵 만들기/맵 탐색 카드
  - 방 목록 (더미 데이터)
  - 로그인 상태에 따른 UI 변경
- [x] **맵 에디터** (`/editor`) - FPS 스타일 맵 에디터
  - FPS 스타일 카메라 (WASD + Space/Shift + 마우스)
  - 오브젝트 배치 (Box, Cylinder, Sphere, Plane, Ramp)
  - 마커 배치 (Race: Spawn/Checkpoint/Finish, Shooter: Team A/B/Capture)
  - 속성 편집 (위치/회전/크기/색상)
  - 맵 저장/불러오기 (JSON)

#### 인증 시스템
- [x] Supabase 클라이언트 설정 (`lib/supabase.ts`)
- [x] Zustand 인증 스토어 (`stores/authStore.ts`)
- [x] 이메일/비밀번호 회원가입
- [x] 이메일/비밀번호 로그인
- [x] 로그아웃
- [x] 에러 메시지 표시
- [x] 로딩 상태 표시
- [ ] 소셜 로그인 (Google, GitHub) - 추후 개발
- [ ] 보호된 라우트

#### 맵 에디터 (Phase 1)
- [x] Zustand 에디터 스토어 (`stores/editorStore.ts`)
- [x] 3D 캔버스 (Three.js + React Three Fiber)
- [x] FPS 스타일 카메라 컨트롤
  - 클릭으로 포인터 잠금, ESC로 해제
  - WASD 이동, Space/Shift 위/아래
  - 마우스로 시점 회전
- [x] 오브젝트 배치 시스템
  - 1-5 키로 오브젝트 타입 선택
  - 좌클릭으로 설치 (바닥 또는 인접 배치)
  - 0.5 단위 스냅
  - 겹침 방지
  - 방향성 오브젝트 카메라 방향 적용 (Plane, Ramp)
  - 설치 미리보기 (반투명 고스트)
- [x] 마커 배치 시스템
  - 6-9 키로 마커 타입 선택
  - 모드별 다른 마커 (Race/Shooter 팀전/점령전/개인전)
  - 1개 제한 마커 (Spawn, Finish, Team A/B, Capture)
- [x] 속성 편집 (우클릭으로 선택)
  - 위치/회전/크기/색상 편집
  - 삭제 (Delete/Backspace)
  - 복제 (Ctrl+D)
- [x] 맵 관리
  - 모드 전환 (Race/Shooter)
  - 슈터 서브모드 (팀전/점령전/개인전)
  - 모드 변경 시 마커 초기화
  - JSON 내보내기/불러오기
- [x] UI 컴포넌트
  - 상단 툴바 (맵 이름, 모드, 파일 작업)
  - 하단 핫바 (오브젝트 + 마커)
  - 속성 패널 (좌측)
  - 도움말 오버레이 (좌측 하단)
  - 크로스헤어

---

## 개발 로드맵

### Phase 0: 인증 시스템 (1주)
**목표**: 회원가입/로그인/로그아웃 구현

- [x] Supabase 프로젝트 설정
- [x] Supabase Auth 연동
- [x] 회원가입 UI (이메일/비밀번호 + 유저네임)
- [x] 로그인 UI
- [ ] 소셜 로그인 (Google, GitHub) - 추후 개발
- [x] 로그아웃 기능
- [x] 인증 상태 전역 관리 (Zustand)
- [ ] 보호된 라우트 설정 (로그인 필요 페이지)

### Phase 1: 맵 에디터 + 싱글 테스트 (2-3주)
**목표**: 기본적인 맵 제작 및 1인 테스트 가능

- [x] 프로젝트 초기 설정 (React + Vite + TypeScript + TailwindCSS)
- [x] 3D 캔버스 기본 설정 (조명, 카메라, 그리드)
- [x] 도형 팔레트 UI (하단 핫바)
- [x] 도형 생성 및 배치 (FPS 스타일)
- [x] 속성 패널 (위치/회전/크기/색상)
- [x] 게임 마커 배치 (Race: Spawn/Checkpoint/Finish, Shooter: Team A/B/Capture)
- [x] 맵 저장/불러오기 (JSON 파일)
- [ ] 맵 저장/불러오기 (Supabase Database)
- [ ] 테스트 플레이 모드 (3인칭 이동, 달리기 모드 컨트롤)

### Phase 2: 달리기 모드 (1주)
**목표**: 싱글 플레이어 달리기 모드 완성

- [ ] 시작점/끝점 로직
- [ ] 타이머 시스템
- [ ] 체크포인트 시스템 (선택)
- [ ] 완주 판정 및 결과 화면

### Phase 3: 멀티플레이어 기반 (2-3주)
**목표**: 실시간 멀티플레이어 인프라 구축

- [ ] Socket.io 서버 설정
- [ ] 방 생성/참가/나가기
- [ ] 로비 UI
- [ ] 실시간 위치 동기화
- [ ] 클라이언트 예측 + 서버 보정
- [ ] 멀티플레이어 달리기 모드
- [ ] **협동 빌딩 모드**
  - [ ] 실시간 맵 편집 동기화
  - [ ] 다른 참가자 커서 표시
  - [ ] 빌딩 → 플레이 전환

### Phase 4: 총게임 모드 (2-3주)
**목표**: 서버 권위 기반 슈팅 게임 구현

- [ ] 무기 시스템 구현
- [ ] 서버 측 히트 판정 (레이캐스트)
- [ ] 체력/데미지 시스템
- [ ] 킬/데스/리스폰 로직
- [ ] 개인전 모드
- [ ] 팀전 모드 (팀 킬, 점령전)
- [ ] HUD (크로스헤어, 체력, 탄약)
- [ ] 킬 피드, 스코어보드

### Phase 5: 커스텀 스크립팅 (선택, 2-3주)
**목표**: 유저가 커스텀 게임 모드 제작 가능

- [ ] Monaco 에디터 통합
- [ ] 스크립팅 API 설계
- [ ] 샌드박스 실행 환경
- [ ] 예제 스크립트 제공

### Phase 6: 커뮤니티 기능 (선택, 1-2주)
**목표**: 맵 공유 및 탐색

- [ ] Supabase Auth 연동 (이메일, Google, GitHub 로그인)
- [ ] 맵 업로드 (Supabase Storage + Database)
- [ ] 맵 브라우저 (검색, 정렬, 필터)
- [ ] 좋아요/플레이 카운트 (Supabase Realtime으로 실시간 반영)
- [ ] 유저 프로필 페이지

---

## 핵심 기술적 과제

### 1. 네트워크 지연 보상
- 클라이언트 측 예측 (Client-side Prediction)
- 서버 상태 보간 (Interpolation)
- 지연 보상 (Lag Compensation) for 히트 판정

### 2. 서버 성능 최적화
- 효율적인 브로드캐스팅 (변경된 상태만 전송)
- 공간 분할로 충돌 검사 최적화
- 게임 루프 최적화

### 3. 맵 에디터 UX
- 직관적인 3D 조작
- Undo/Redo 구현
- 대규모 맵에서의 성능

### 4. 보안
- 서버 권위 철저히 유지
- 커스텀 스크립트 샌드박싱
- 악성 맵 데이터 검증

---

## 참고 자료

### 유사 서비스
- Roblox Studio
- Fortnite Creative
- Garry's Mod
- KoGaMa

### 기술 참고
- Three.js 문서: https://threejs.org/docs/
- React Three Fiber: https://docs.pmnd.rs/react-three-fiber
- Socket.io 문서: https://socket.io/docs/
- Gabriel Gambetta - Fast-Paced Multiplayer: https://www.gabrielgambetta.com/client-server-game-architecture.html
- Valve Source Multiplayer Networking: https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking

---

## 개발 시 유의사항

1. **서버 권위 원칙 유지**: 모든 중요한 게임 로직(히트 판정, 점수 계산 등)은 반드시 서버에서 처리

2. **점진적 개발**: 각 Phase를 완전히 완료한 후 다음으로 진행. MVP 먼저 완성 후 기능 추가

3. **성능 고려**: Three.js 렌더링 최적화, 네트워크 대역폭 최소화

4. **테스트**: 멀티플레이어 동기화 테스트, 지연 환경 시뮬레이션

5. **코드 품질**: TypeScript 적극 활용, 공유 타입으로 클라이언트-서버 일관성 유지