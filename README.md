# GameForge

웹 기반 3D 게임 제작 및 플레이 플랫폼

## 프로젝트 소개

GameForge는 사용자가 3D 도형을 활용해 맵을 직접 제작하고, 기본 제공 게임 모드로 즉시 플레이할 수 있는 웹 플랫폼입니다.

### 주요 기능

- **맵 에디터**: 마인크래프트 스타일의 직관적인 맵 제작 도구
- **게임 모드**: Race (달리기), Shooter (팀전/점령전/개인전)
- **멀티플레이어**: 실시간 협동 빌딩 및 게임 플레이 (개발 예정)

## 기술 스택

### Frontend
- React 18 + TypeScript
- Vite
- Three.js + React Three Fiber
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

### 게임 모드

#### Race (달리기)
- Spawn: 시작 위치 (1개)
- Checkpoint: 체크포인트 (여러 개)
- Finish: 결승선 (1개)

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
│   └── src/
│       ├── components/
│       │   └── editor/         # 맵 에디터 컴포넌트
│       ├── stores/             # Zustand 스토어
│       ├── pages/              # 페이지 컴포넌트
│       └── lib/                # 유틸리티
├── server/                     # Backend (개발 예정)
├── Prompt.md                   # 상세 설계 문서
└── README.md
```

## 개발 현황

- [x] Phase 0: 인증 시스템
- [x] Phase 1: 맵 에디터 (진행 중)
- [ ] Phase 2: 달리기 모드
- [ ] Phase 3: 멀티플레이어
- [ ] Phase 4: 총게임 모드

## 라이선스

MIT License
