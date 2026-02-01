# GameForge

웹 기반 3D 게임 제작 및 플레이 플랫폼

## 프로젝트 소개

GameForge는 사용자가 3D 도형을 활용해 맵을 직접 제작하고, 기본 제공 게임 모드로 즉시 플레이할 수 있는 웹 플랫폼입니다.

### 주요 기능

- **맵 에디터**: FPS 스타일의 직관적인 맵 제작 도구
- **테스트 플레이**: 제작한 맵에서 바로 캐릭터로 테스트
- **게임 모드**: Race (달리기), Shooter (팀전/점령전/개인전)
- **멀티플레이어**: 실시간 협동 빌딩 및 게임 플레이 (개발 예정)

## 기술 스택

### Frontend
- React 19 + TypeScript
- Vite 7
- Three.js + React Three Fiber
- Rapier Physics (@dimforge/rapier3d-compat)
- Zustand (상태 관리)
- TailwindCSS v4
- Supabase (인증)

### Backend (개발 예정)
- Node.js + Express
- Socket.io
- Supabase (Database, Storage)

## 시작하기

### 필수 조건

- Node.js 18+
- npm 또는 yarn

### 설치

```bash
# 저장소 클론
git clone https://github.com/your-username/GameForge.git
cd GameForge

# 클라이언트 의존성 설치
cd client
npm install

# 환경 변수 설정
cp .env.example .env
# .env 파일에 Supabase URL과 Key 입력

# 개발 서버 실행
npm run dev
```

### 환경 변수

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 사용법

### 맵 에디터 (`/editor`)

| 키 | 동작 |
|---|---|
| 클릭 | 마우스 잠금 |
| WASD | 이동 |
| Space / Shift | 위 / 아래 |
| 마우스 | 시점 회전 |
| 1-5 | 오브젝트 선택 (Box, Cylinder, Sphere, Plane, Ramp) |
| 6-9 | 마커 선택 (모드별 다름) |
| 좌클릭 | 설치 |
| 우클릭 | 편집 |
| Delete | 삭제 |
| Ctrl+D | 복제 |
| ESC | 마우스 잠금 해제 |

### 테스트 플레이 모드

에디터에서 **Play** 버튼을 클릭하여 테스트 플레이 시작 (Spawn 마커 필요)

| 키 | 동작 |
|---|---|
| 클릭 | 마우스 잠금 |
| WASD | 이동 |
| Shift | 달리기 (서있을 때) |
| Space | 점프 (서있을 때) |
| C | 앉기/일어서기 |
| Z | 엎드리기/일어서기 |
| V | 구르기/대쉬 |
| 마우스 휠 | 카메라 줌 |
| F1 | 디버그 콜라이더 표시 |
| ESC | 에디터로 돌아가기 |

#### 자세별 특성

| 자세 | 이동 속도 | 점프 | 특징 |
|---|---|---|---|
| Standing (서기) | 보통/빠름 | 가능 | 기본 자세, 달리기 가능 |
| Sitting (앉기) | 느림 | 불가 | 낮은 자세, C 키로 전환 |
| Crawling (엎드리기) | 매우 느림 | 불가 | 가장 낮은 자세, Z 키로 전환 |

### 게임 모드

#### Race (달리기)
- Spawn: 시작 위치 (1개)
- Checkpoint: 체크포인트 (여러 개)
- Finish: 결승선 (1개)
- Killzone: 즉사 구역 (여러 개) - 밟으면 사망 후 리스폰

#### Shooter - 팀전
- Team A: 팀 A 스폰 (1개)
- Team B: 팀 B 스폰 (1개)

#### Shooter - 점령전
- Team A: 팀 A 스폰 (1개)
- Team B: 팀 B 스폰 (1개)
- Capture: 점령 포인트 (1개)

#### Shooter - 개인전
- Spawn: 스폰 위치 (여러 개)

## 프로젝트 구조

```
GameForge/
├── client/                     # Frontend
│   ├── public/
│   │   └── Runtest.glb         # 플레이어 3D 모델
│   └── src/
│       ├── components/
│       │   ├── editor/         # 맵 에디터 컴포넌트
│       │   │   ├── EditorCanvas.tsx
│       │   │   └── EditorUI.tsx
│       │   └── game/           # 게임 플레이 컴포넌트
│       │       └── TestPlayCanvas.tsx
│       ├── stores/             # Zustand 스토어
│       │   ├── authStore.ts
│       │   ├── editorStore.ts
│       │   └── gameStore.ts
│       ├── hooks/              # 커스텀 훅
│       │   └── useInput.ts
│       ├── lib/                # 유틸리티
│       │   ├── supabase.ts
│       │   └── physics.ts      # Rapier 물리 엔진
│       └── pages/              # 페이지 컴포넌트
│           ├── Landing.tsx
│           ├── Home.tsx
│           └── MapEditor.tsx
├── server/                     # Backend (개발 예정)
├── Prompt.md                   # 상세 설계 문서
└── README.md
```

## 개발 현황

- [x] Phase 0: 인증 시스템
- [x] Phase 1: 맵 에디터 + 테스트 플레이
  - [x] FPS 스타일 맵 에디터
  - [x] 오브젝트/마커 배치
  - [x] Rapier 물리 엔진 통합
  - [x] 플레이어 캐릭터 (캡슐 콜라이더, 애니메이션)
  - [x] 자세 시스템 (서기/앉기/엎드리기)
  - [x] 점프/구르기 메카닉
  - [x] 디버그 콜라이더 표시
- [x] Phase 2: 달리기 모드 (싱글 플레이)
  - [x] 타이머 시스템 (첫 이동 시 자동 시작)
  - [x] 체크포인트 시스템 (통과 시 리스폰 지점 저장)
  - [x] 완주 판정 및 결과 화면
  - [x] 킬존 마커 (즉사 구역, 사망 애니메이션 + 리스폰)
  - [x] 낙사 시스템 (Y < -10 낙사)
  - [x] 게임 재시작 (페이지 리로드 없이)
- [ ] Phase 3: 멀티플레이어
- [ ] Phase 4: 총게임 모드

## 최근 업데이트

### 2026-02-01 (Phase 2 완료)
- **Race 모드 완성**
  - 타이머 시스템 (첫 이동 시 자동 시작)
  - 체크포인트 시스템 (통과 시 리스폰 지점 저장)
  - 완주 판정 및 결과 화면
  - 킬존 마커 (즉사 구역, 원판 형태)
    - 사망 애니메이션 (2.5초) 후 리스폰
    - 에디터/플레이 모드에서 링 형태로 표시
  - 낙사 시스템 (Y < -10 낙사 시 마지막 체크포인트로 리스폰)
  - 게임 재시작 (페이지 리로드 없이 플레이어 위치/상태 초기화)
- **성능 최적화**
  - React.memo 적용
  - 지오메트리/머티리얼 캐싱
  - useCallback/useMemo 최적화
  - 조건부 스토어 업데이트 (변경 시에만)
- 자세 변경 시 콜라이더 버그 수정
- 물리 엔진 메모리 접근 에러 수정

## 라이선스

MIT License
