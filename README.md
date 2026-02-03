# GameForge

웹 기반 3D 게임 제작 및 멀티플레이어 플랫폼

## 프로젝트 소개

GameForge는 사용자가 3D 도형을 활용해 맵을 직접 제작하고, 기본 제공 게임 모드로 즉시 플레이할 수 있는 웹 플랫폼입니다.

### 주요 기능

- **맵 에디터**: FPS 스타일의 직관적인 맵 제작 도구
- **테스트 플레이**: 제작한 맵에서 바로 캐릭터로 테스트
- **맵 업로드/공유**: 완주 검증 후 맵 업로드, 썸네일 캡처 지원
- **게임 모드**: Race (달리기), Shooter (개발 예정)
- **멀티플레이어**: 실시간 레이스, 방 시스템, 맵 선택
- **협동 빌딩 모드**: 릴레이 레이스 - 각자 구간을 만들고 연결하여 플레이

## 기술 스택

### Frontend
- React 19 + TypeScript
- Vite 7
- Three.js + React Three Fiber
- Rapier Physics (@dimforge/rapier3d-compat)
- Zustand (상태 관리)
- TailwindCSS v4
- Supabase (인증)

### Backend
- Node.js + Express + TypeScript
- Socket.io (실시간 멀티플레이어)
- Supabase (Database, Storage, Auth)

## 시작하기

### 필수 조건

- Node.js 18+
- npm 또는 yarn

### 설치

```bash
# 저장소 클론
git clone https://github.com/your-username/GameForge.git
cd GameForge

# 클라이언트 설치 및 실행
cd client
npm install
cp .env.example .env
# .env 파일에 Supabase URL과 Key 입력
npm run dev

# 서버 설치 및 실행 (새 터미널)
cd server
npm install
npm run dev
```

### 환경 변수

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Railway 배포

1. [Railway](https://railway.app)에서 GitHub 저장소 연결
2. Variables에 환경변수 추가:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. 자동 빌드 및 배포 완료

> 클라이언트와 서버가 단일 서비스로 배포됩니다.

## 사용법

### 맵 에디터 (`/editor`)

| 키 | 동작 |
|---|---|
| 클릭 | 마우스 잠금 |
| WASD | 이동 |
| Space / C | 위 / 아래 |
| 마우스 | 시점 회전 |
| Q | 선택 모드 |
| 1-5 | 오브젝트 선택 (Box, Cylinder, Sphere, Plane, Ramp) |
| 6-9 | 마커 선택 (모드별 다름) |
| 좌클릭 | 설치 / 선택 |
| Shift+클릭 | 다중 선택 |
| 우클릭 | 편집 |
| Delete | 선택 삭제 |
| Ctrl+Z / Y | Undo / Redo |
| Ctrl+C / V | 복사 / 붙여넣기 |
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

#### Relay Race (릴레이 레이스) - 협동 빌딩 모드
- 각 플레이어가 자신만의 구간을 독립적으로 제작
- 서로의 작업물을 볼 수 없음 (격리된 뷰)
- 빌딩 시간 종료 시 랜덤 순서로 구간이 연결됨
- 구간 간 텔레포트로 이동
- 테스트 플레이로 자가 검증 필수
- 투표로 미검증 플레이어 강퇴 가능

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
│       │   ├── editor/         # 맵 에디터
│       │   │   ├── EditorCanvas.tsx
│       │   │   └── EditorUI.tsx
│       │   ├── game/           # 게임 플레이
│       │   │   ├── TestPlayCanvas.tsx
│       │   │   └── MultiplayerCanvas.tsx
│       │   └── map/            # 맵 브라우저
│       │       ├── MapBrowser.tsx
│       │       └── MapCard.tsx
│       ├── stores/             # Zustand 스토어
│       │   ├── authStore.ts
│       │   ├── editorStore.ts
│       │   ├── gameStore.ts
│       │   └── roomStore.ts
│       ├── lib/                # 유틸리티
│       │   ├── supabase.ts
│       │   ├── socket.ts
│       │   ├── physics.ts
│       │   └── mapService.ts
│       └── pages/
│           ├── Landing.tsx
│           ├── Home.tsx        # 로비/방 목록
│           ├── MapEditor.tsx
│           └── MultiplayerGame.tsx
├── server/                     # Backend
│   └── src/
│       ├── game/
│       │   ├── Room.ts
│       │   ├── RoomManager.ts
│       │   ├── GameLoop.ts
│       │   └── BuildingPhase.ts  # 협동 빌딩 모드
│       └── socket/
│           └── roomHandlers.ts
├── PROMPT.md                   # 상세 설계 문서
└── README.md
```

## 개발 현황

- [x] Phase 0: 인증 시스템 (Supabase Auth)
- [x] Phase 1: 맵 에디터 + 테스트 플레이
- [x] Phase 2: 달리기 모드 (싱글 플레이)
- [x] Phase 3: 멀티플레이어 Race
  - [x] Socket.io 서버 구축
  - [x] 방 생성/참가/나가기
  - [x] 실시간 위치/애니메이션 동기화
  - [x] 멀티플레이어 레이스 (체크포인트, 킬존, 피니시)
  - [x] 10초 유예기간 (첫 완주자 이후)
  - [x] DNF 처리 및 랭킹 시스템
  - [x] 사망 애니메이션 동기화
- [x] 맵 업로드 시스템
  - [x] 완주 검증 (테스트 플레이 완주 필수)
  - [x] 썸네일 캡처/업로드
  - [x] 맵 브라우저 (전체 맵/내 맵 필터)
  - [x] 맵 삭제, 플레이 카운트
- [x] 방 시스템
  - [x] 맵 제작 & 플레이 / 기존 맵 불러오기 모드
  - [x] 공개/비공개 방
  - [x] 방 설정 변경 (방장)
  - [x] 대기방에서 맵 변경
  - [x] 카드형 방 목록 UI
- [x] Phase 3.5: 협동 빌딩 모드 (릴레이 레이스)
  - [x] 플레이어별 독립 빌딩 영역 할당
  - [x] 실시간 빌딩 (오브젝트/마커 배치, 수정, 삭제)
  - [x] 속성 편집 (position, rotation, scale, color)
  - [x] 테스트 플레이로 자가 검증
  - [x] 검증 완료 후 읽기 전용
  - [x] 시간 연장 및 조기 시작
  - [x] 투표 강퇴 시스템 (과반수 동의)
  - [x] 랜덤 순서로 구간 연결
  - [x] 릴레이 맵 레이스 (체크포인트 텔레포트)
- [x] 플레이어 색상 시스템
  - [x] 대기방에서 8가지 색상 선택 (중복 불가)
  - [x] 3D 캐릭터 모델에 색상 적용
  - [x] 카운트다운/시네마틱/테스트 모드에서도 색상 유지
- [ ] Phase 4: 총게임 모드 (Shooter)

## 최근 업데이트

### 2026-02-04 (Update 5)
- **빌딩 모드 일시정지 메뉴**
  - ESC 키로 일시정지 메뉴 열기 (포인터 락 해제 상태에서)
  - 계속하기 / 방 나가기 옵션
- **클릭으로 붙여넣기**
  - Ctrl+V 후 원하는 위치에서 클릭하여 붙여넣기
  - 미리보기 표시 (파란색 반투명)
- **다중 선택 색상 일괄 변경**
  - 여러 오브젝트 선택 후 색상을 한 번에 변경 가능
- **안정성 개선**
  - 포인터 락 요청 시 에러 처리 개선

### 2026-02-03 (Update 4)
- **빌딩 모드 물리 경계 시스템**
  - 빌딩 영역 4면 벽 + 천장 물리 콜라이더 추가
  - 플레이어가 영역 벽을 뚫고 나가거나 위로 넘어가지 못함
  - 릴레이 레이스에서도 각 구간 경계 물리 적용
- **오브젝트 배치 제한**
  - 영역 벽과 겹치는 위치에 오브젝트 배치 불가
  - 높이 제한 추가 (최저 0, 최대 21 - 천장 4칸 아래)
- **버그 수정**
  - "기존 맵 불러오기" 방 게임 시작 버튼 동작 안함 수정 (socket 재연결 시 이벤트 재등록)
  - 빌딩 모드 후 게임 시작 시 일시정지 메뉴가 뜨던 문제 수정
  - 방 목록에 "게임중" 상태 방 표시

### 2026-02-03 (Update 3)
- **플레이어 색상 선택 시스템**
  - 대기방에서 8가지 색상 중 선택 (빨강/파랑/노랑/초록/흰색/검정/주황/보라)
  - 중복 선택 불가 (이미 사용 중인 색상 비활성화)
  - 선택한 색상이 3D 캐릭터 모델에 적용
  - 카운트다운, 시네마틱 카메라, 테스트 모드에서도 색상 유지
- **색상 선택 UI**
  - 플레이어 카드 우측에 색상 버튼 배치
  - 4x2 그리드 팝업으로 색상 선택
- **RemotePlayer 메모리 최적화**
  - material 클론 시 메모리 누수 방지

### 2026-02-03 (Update 2)
- **에디터 기능 대폭 개선**
  - 선택 모드 (Q키) - 빈 손 상태에서 좌클릭으로 선택
  - 다중 선택 (Shift+클릭) - 여러 오브젝트 동시 선택
  - Undo/Redo (Ctrl+Z/Y) - 작업 취소/다시 실행
  - 복사/붙여넣기 (Ctrl+C/V) - 선택한 오브젝트 복사
  - Delete 키로 선택된 모든 오브젝트 삭제
- **카메라 조작 개선**
  - 아래로 이동 키 Shift → C로 변경 (다중 선택과 충돌 방지)
- **빌딩 모드에도 동일 기능 적용**
  - 선택 모드, 다중 선택, Undo/Redo, 복사/붙여넣기

### 2026-02-03
- **협동 빌딩 모드 (릴레이 레이스)**
  - 각 플레이어가 자신만의 구간을 독립적으로 제작
  - 서로의 작업물을 볼 수 없음 (격리된 뷰)
  - 테스트 플레이로 자가 검증 필수
  - 검증 완료 후 읽기 전용 모드
  - 투표 강퇴 시스템 (과반수 동의)
  - 투표 현황 실시간 표시
  - 랜덤 순서로 구간 연결, 텔레포트로 이동
- **빌딩 모드 속성 편집**
  - Position, Rotation, Scale 편집 패널
  - Color 편집 (오브젝트)
  - 우클릭으로 오브젝트/마커 선택
- **버그 수정**
  - 강퇴 후 릴레이 영역 경계 위치 수정
  - 물리 엔진 cleanup 시 메모리 접근 오류 방지
  - 포인터 락 SecurityError 처리

### 2026-02-02
- **UI 개선**
  - 방 목록 카드 그리드 레이아웃
  - 대기방 좌우 분할 레이아웃 (정보 + 썸네일)
  - 맵 썸네일/이름 표시
- **대기방 기능**
  - 방장 설정 변경
  - 맵 변경 (썸네일 호버 시 버튼 표시)
- **버그 수정**
  - 게임 종료 후 방 상태 관리 수정
  - Dead 애니메이션 동기화 수정

### 2026-02-01
- **멀티플레이어 Race 완성**
  - 실시간 위치/애니메이션 동기화
  - 체크포인트, 킬존, 피니시 로직
  - 10초 유예기간, DNF 처리
  - 랭킹 및 결과 화면
- **맵 업로드 시스템**
  - 완주 검증 후 업로드
  - 맵 브라우저
  - Supabase Storage 연동

## 라이선스

MIT License
