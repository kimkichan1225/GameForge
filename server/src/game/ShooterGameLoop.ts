import { Server } from 'socket.io';
import { Room, Player, ShooterSubMode } from './Room.js';

// ============ 타입 정의 ============

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface Rotation {
  yaw: number;
  pitch: number;
}

interface MapConfig {
  spawns: Vec3[];       // FFA 스폰 포인트
  spawnsA: Vec3[];      // 팀 A 스폰 포인트
  spawnsB: Vec3[];      // 팀 B 스폰 포인트
}

interface MatchConfig {
  timeLimit: number;        // 초
  scoreLimit: number;       // 킬 수 (FFA) 또는 팀 점수 (Team)
  respawnDelay: number;     // 초
  invincibilityTime: number; // ms
  friendlyFire: boolean;
}

interface ShootEvent {
  origin: Vec3;
  direction: Vec3;
  weaponType: string;
  timestamp: number;
}

interface ScoreboardEntry {
  playerId: string;
  nickname: string;
  kills: number;
  deaths: number;
  team: 'a' | 'b' | null;
}

interface ShooterPlayerState {
  id: string;
  nickname: string;
  color: string;
  position: Vec3;
  velocity: Vec3;
  rotation: Rotation;
  animation: string;
  weaponType: string;
  health: number;
  kills: number;
  deaths: number;
  isAlive: boolean;
  team: 'a' | 'b' | null;
}

interface ShooterGameState {
  roomId: string;
  status: string;
  timeRemaining: number;
  players: ShooterPlayerState[];
  scoreboard: ScoreboardEntry[];
  teamScores?: { a: number; b: number };
}

// ============ 무기 설정 ============

const WEAPON_DAMAGE: Record<string, number> = {
  rifle: 25,
  shotgun: 15,   // per pellet
  sniper: 100,
};

const WEAPON_PELLETS: Record<string, number> = {
  rifle: 1,
  shotgun: 8,
  sniper: 1,
};

// 발사 속도 제한 (ms) - 클라이언트 fireRate와 일치
const WEAPON_FIRE_INTERVAL: Record<string, number> = {
  rifle: 100,
  shotgun: 800,
  sniper: 1500,
};

// 샷건 스프레드 (라디안)
const SHOTGUN_SPREAD = 0.06;

// ============ 상수 ============

const DEFAULT_MATCH_CONFIG: MatchConfig = {
  timeLimit: 300,          // 5분
  scoreLimit: 30,          // FFA 기본
  respawnDelay: 3,         // 3초
  invincibilityTime: 2000, // 2초
  friendlyFire: false,
};

const TEAM_SCORE_LIMIT = 50;
const MAX_HEALTH = 100;
const CAPSULE_RADIUS = 0.4;    // 플레이어 캡슐 반지름
const CAPSULE_HEIGHT = 1.8;    // 플레이어 캡슐 높이
const MAX_RANGE = 200;         // 최대 사거리
const POSITION_TOLERANCE = 5;  // 발사 위치 검증 허용 오차
const KILL_TRADE_WINDOW = 100; // 킬 트레이딩 허용 시간 (ms)

// ============ 레이캐스트 수학 ============

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len === 0) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * 레이 vs 캡슐 충돌 검사
 * 캡슐 = 두 반구 + 실린더
 * @returns 충돌 거리 (없으면 -1)
 */
function rayCapsuleIntersect(
  rayOrigin: Vec3,
  rayDir: Vec3,
  capsuleBase: Vec3,     // 캡슐 바닥 중심
  capsuleHeight: number,
  capsuleRadius: number,
): number {
  // 캡슐 축: Y축 방향 (base에서 top으로)
  const capsuleTop: Vec3 = { x: capsuleBase.x, y: capsuleBase.y + capsuleHeight, z: capsuleBase.z };
  const capsuleCenter: Vec3 = { x: capsuleBase.x, y: capsuleBase.y + capsuleHeight / 2, z: capsuleBase.z };

  // 실린더 부분 (양끝 반구 제외한 중간 부분)
  const cylinderBottom = capsuleBase.y + capsuleRadius;
  const cylinderTop = capsuleTop.y - capsuleRadius;

  // 레이 vs 무한 실린더 (Y축 정렬)
  // (ox + t*dx - cx)^2 + (oz + t*dz - cz)^2 = r^2
  const dx = rayDir.x;
  const dz = rayDir.z;
  const ox = rayOrigin.x - capsuleCenter.x;
  const oz = rayOrigin.z - capsuleCenter.z;

  const a = dx * dx + dz * dz;
  const b = 2 * (ox * dx + oz * dz);
  const c = ox * ox + oz * oz - capsuleRadius * capsuleRadius;

  let tMin = Infinity;

  if (a > 1e-8) {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtD = Math.sqrt(discriminant);
      const t1 = (-b - sqrtD) / (2 * a);
      const t2 = (-b + sqrtD) / (2 * a);

      // 두 교차점에서 Y 좌표 확인 (실린더 범위 내인지)
      for (const t of [t1, t2]) {
        if (t > 0 && t < MAX_RANGE) {
          const hitY = rayOrigin.y + t * rayDir.y;
          if (hitY >= cylinderBottom && hitY <= cylinderTop) {
            tMin = Math.min(tMin, t);
          }
        }
      }
    }
  }

  // 레이 vs 하단 반구
  const bottomSphereCenter: Vec3 = { x: capsuleBase.x, y: cylinderBottom, z: capsuleBase.z };
  const tSphereBottom = raySphereIntersect(rayOrigin, rayDir, bottomSphereCenter, capsuleRadius);
  if (tSphereBottom > 0 && tSphereBottom < MAX_RANGE) {
    // 반구 범위 확인 (Y가 실린더 아래쪽)
    const hitY = rayOrigin.y + tSphereBottom * rayDir.y;
    if (hitY <= cylinderBottom) {
      tMin = Math.min(tMin, tSphereBottom);
    }
  }

  // 레이 vs 상단 반구
  const topSphereCenter: Vec3 = { x: capsuleBase.x, y: cylinderTop, z: capsuleBase.z };
  const tSphereTop = raySphereIntersect(rayOrigin, rayDir, topSphereCenter, capsuleRadius);
  if (tSphereTop > 0 && tSphereTop < MAX_RANGE) {
    const hitY = rayOrigin.y + tSphereTop * rayDir.y;
    if (hitY >= cylinderTop) {
      tMin = Math.min(tMin, tSphereTop);
    }
  }

  return tMin === Infinity ? -1 : tMin;
}

/**
 * 레이 vs 구 충돌
 */
function raySphereIntersect(
  rayOrigin: Vec3,
  rayDir: Vec3,
  sphereCenter: Vec3,
  sphereRadius: number,
): number {
  const oc = vec3Sub(rayOrigin, sphereCenter);
  const a = vec3Dot(rayDir, rayDir);
  const b = 2 * vec3Dot(oc, rayDir);
  const c = vec3Dot(oc, oc) - sphereRadius * sphereRadius;
  const discriminant = b * b - 4 * a * c;

  if (discriminant < 0) return -1;

  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  if (t1 > 0) return t1;
  if (t2 > 0) return t2;
  return -1;
}

// ============ ShooterGameLoop 클래스 ============

export class ShooterGameLoop {
  private io: Server;
  private room: Room;
  private mapConfig: MapConfig;
  private matchConfig: MatchConfig;
  private subMode: ShooterSubMode;

  private intervalId: NodeJS.Timeout | null = null;
  private tickRate: number = 20; // 20Hz
  private matchStartTime: number = 0;
  private countdown: number = 5;

  // 팀 점수
  private teamScores: { a: number; b: number } = { a: 0, b: 0 };

  // 발사 속도 제한 추적
  private lastFireTime: Map<string, number> = new Map();

  // 스폰 인덱스 (라운드 로빈)
  private spawnIndex: number = 0;
  private spawnIndexA: number = 0;
  private spawnIndexB: number = 0;

  constructor(io: Server, room: Room, mapConfig: MapConfig, matchConfig?: Partial<MatchConfig>) {
    this.io = io;
    this.room = room;
    this.mapConfig = mapConfig;
    this.subMode = room.shooterSubMode;

    // 매치 설정 병합
    this.matchConfig = {
      ...DEFAULT_MATCH_CONFIG,
      ...matchConfig,
    };

    // 팀 모드일 때 스코어 리밋 조정
    if (this.subMode === 'team' && !matchConfig?.scoreLimit) {
      this.matchConfig.scoreLimit = TEAM_SCORE_LIMIT;
    }
  }

  // ============ 게임 시작 흐름 ============

  start(): void {
    this.room.status = 'countdown';
    this.countdown = 5;

    // 플레이어 초기화 + 팀 배정
    this.initializePlayers();

    // 팀 배정 정보 준비
    const teamAssignments = this.subMode === 'team'
      ? Array.from(this.room.players.values()).map(p => ({
          playerId: p.id,
          team: p.team!,
        }))
      : undefined;

    // 클라이언트에 시작 알림
    this.io.to(this.room.id).emit('game:shooterStarting', {
      countdown: this.countdown,
      subMode: this.subMode,
      matchConfig: {
        timeLimit: this.matchConfig.timeLimit,
        scoreLimit: this.matchConfig.scoreLimit,
        respawnDelay: this.matchConfig.respawnDelay,
      },
      teamAssignments,
    });

    // 카운트다운
    const countdownInterval = setInterval(() => {
      this.io.to(this.room.id).emit('game:countdown', { count: this.countdown });

      if (this.countdown <= 0) {
        clearInterval(countdownInterval);
        this.startMatch();
      }
      this.countdown--;
    }, 1000);
  }

  private initializePlayers(): void {
    const players = Array.from(this.room.players.values());

    if (this.subMode === 'team' || this.subMode === 'domination') {
      // 팀전/점령전: 대기방에서 배정된 팀 유지 (없으면 번갈아가며 배정)
      players.forEach((player, i) => {
        if (!player.team) {
          player.team = i % 2 === 0 ? 'a' : 'b';
        }
        this.initPlayerStats(player);
      });
    } else {
      // FFA
      players.forEach(player => {
        player.team = undefined;
        this.initPlayerStats(player);
      });
    }
  }

  private initPlayerStats(player: Player): void {
    player.health = MAX_HEALTH;
    player.kills = 0;
    player.deaths = 0;
    player.isAlive = true;
    player.weaponType = 'rifle';
    player.respawnTimer = undefined;
    player.invincibleUntil = undefined;
    player.rotation = { yaw: 0, pitch: 0 };
  }

  private startMatch(): void {
    this.room.status = 'playing';
    this.matchStartTime = Date.now();
    this.teamScores = { a: 0, b: 0 };

    // 초기 스폰 위치 배정
    for (const player of this.room.players.values()) {
      const spawn = this.getSpawnPoint(player.team ?? null);
      player.position = { ...spawn };
      player.isAlive = true;
    }

    this.io.to(this.room.id).emit('game:start', {
      startTime: this.matchStartTime,
    });

    // 20Hz 게임 루프 시작
    this.intervalId = setInterval(() => this.tick(), 1000 / this.tickRate);
  }

  // ============ 게임 루프 ============

  private tick(): void {
    if (this.room.status !== 'playing') {
      this.stop();
      return;
    }

    const now = Date.now();

    // 시간 제한 체크
    const elapsed = (now - this.matchStartTime) / 1000;
    if (elapsed >= this.matchConfig.timeLimit) {
      this.endMatch('timeLimit');
      return;
    }

    // 리스폰 처리
    for (const player of this.room.players.values()) {
      if (!player.isAlive && player.respawnTimer && now >= player.respawnTimer) {
        this.respawnPlayer(player);
      }
    }

    // 상태 브로드캐스트
    const state = this.buildGameState();
    this.io.to(this.room.id).emit('game:shooterState', state);
  }

  private buildGameState(): ShooterGameState {
    const now = Date.now();
    const elapsed = (now - this.matchStartTime) / 1000;
    const timeRemaining = Math.max(0, this.matchConfig.timeLimit - elapsed);

    const players: ShooterPlayerState[] = [];
    const scoreboard: ScoreboardEntry[] = [];

    for (const player of this.room.players.values()) {
      players.push({
        id: player.id,
        nickname: player.nickname,
        color: player.color,
        position: player.position || { x: 0, y: 0, z: 0 },
        velocity: player.velocity || { x: 0, y: 0, z: 0 },
        rotation: player.rotation || { yaw: 0, pitch: 0 },
        animation: player.animation || 'Idle',
        weaponType: player.weaponType || 'rifle',
        health: player.health ?? MAX_HEALTH,
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        isAlive: player.isAlive ?? true,
        team: player.team ?? null,
      });

      scoreboard.push({
        playerId: player.id,
        nickname: player.nickname,
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        team: player.team ?? null,
      });
    }

    // 스코어보드 정렬: 킬 수 내림차순
    scoreboard.sort((a, b) => b.kills - a.kills);

    const state: ShooterGameState = {
      roomId: this.room.id,
      status: this.room.status,
      timeRemaining,
      players,
      scoreboard,
    };

    if (this.subMode === 'team') {
      state.teamScores = { ...this.teamScores };
    }

    return state;
  }

  // ============ 발사 & 히트 판정 ============

  handleShoot(shooterId: string, event: ShootEvent): void {
    const shooter = this.room.getPlayer(shooterId);
    if (!shooter) return;

    // 살아있는지 체크 (킬 트레이딩 허용)
    if (!shooter.isAlive) {
      const deathTime = shooter.respawnTimer
        ? shooter.respawnTimer - this.matchConfig.respawnDelay * 1000
        : 0;
      if (Date.now() - deathTime > KILL_TRADE_WINDOW) {
        return;
      }
    }

    // 발사 속도 제한
    const now = Date.now();
    const lastFire = this.lastFireTime.get(shooterId) || 0;
    const fireInterval = WEAPON_FIRE_INTERVAL[event.weaponType] || 100;
    if (now - lastFire < fireInterval * 0.8) { // 20% 허용 오차
      return;
    }
    this.lastFireTime.set(shooterId, now);

    // 발사 위치 검증
    if (shooter.position) {
      const dist = vec3Length(vec3Sub(event.origin, shooter.position));
      if (dist > POSITION_TOLERANCE) {
        // 위치가 너무 다르면 서버 위치 사용
        event.origin = { ...shooter.position };
        event.origin.y += CAPSULE_HEIGHT * 0.8; // 눈 높이
      }
    }

    const weaponType = event.weaponType || 'rifle';
    const pelletCount = WEAPON_PELLETS[weaponType] || 1;
    const damagePerPellet = WEAPON_DAMAGE[weaponType] || 25;

    // 히트된 플레이어별 데미지 합산
    const hitMap: Map<string, { damage: number; player: Player }> = new Map();
    const hitPlayerIds: string[] = [];

    for (let i = 0; i < pelletCount; i++) {
      let dir = vec3Normalize(event.direction);

      // 샷건 스프레드
      if (weaponType === 'shotgun' && pelletCount > 1) {
        dir = applySpread(dir, SHOTGUN_SPREAD);
      }

      // 레이캐스트: 모든 플레이어에 대해 검사
      const hit = this.raycastPlayers(shooterId, event.origin, dir);
      if (hit) {
        const existing = hitMap.get(hit.playerId);
        if (existing) {
          existing.damage += damagePerPellet;
        } else {
          hitMap.set(hit.playerId, { damage: damagePerPellet, player: hit.player });
          hitPlayerIds.push(hit.playerId);
        }
      }
    }

    // 발사 확인 이벤트 (이펙트 재생용)
    this.io.to(shooterId).emit('game:shotConfirmed', {
      hits: hitMap.size,
      hitPlayerIds,
    });

    // 데미지 적용
    for (const [victimId, { damage, player: victim }] of hitMap) {
      this.applyDamage(shooterId, shooter, victimId, victim, damage, weaponType);
    }
  }

  private raycastPlayers(
    shooterId: string,
    origin: Vec3,
    direction: Vec3,
  ): { playerId: string; player: Player; distance: number } | null {
    let closest: { playerId: string; player: Player; distance: number } | null = null;

    for (const player of this.room.players.values()) {
      // 자기 자신 제외
      if (player.id === shooterId) continue;

      // 죽은 플레이어 제외
      if (!player.isAlive) continue;

      // 무적 상태 체크
      if (player.invincibleUntil && Date.now() < player.invincibleUntil) continue;

      // 팀 모드에서 같은 팀 제외 (friendlyFire가 아닐 때)
      const shooter = this.room.getPlayer(shooterId);
      if (this.subMode === 'team' && !this.matchConfig.friendlyFire) {
        if (shooter?.team && shooter.team === player.team) continue;
      }

      if (!player.position) continue;

      // 캡슐 바닥 = 플레이어 위치 (발 위치)
      const capsuleBase = player.position;

      const t = rayCapsuleIntersect(
        origin,
        direction,
        capsuleBase,
        CAPSULE_HEIGHT,
        CAPSULE_RADIUS,
      );

      if (t > 0 && t < MAX_RANGE) {
        if (!closest || t < closest.distance) {
          closest = { playerId: player.id, player, distance: t };
        }
      }
    }

    return closest;
  }

  // ============ 데미지 & 킬 ============

  private applyDamage(
    attackerId: string,
    attacker: Player,
    victimId: string,
    victim: Player,
    damage: number,
    weaponType: string,
  ): void {
    if (!victim.isAlive) return;
    if (victim.health === undefined) return;

    victim.health = Math.max(0, victim.health - damage);

    // 히트 알림 → 공격자
    this.io.to(attackerId).emit('game:hit', {
      victimId,
      damage,
      victimHealth: victim.health,
    });

    // 데미지 알림 → 피해자
    const attackerPos = attacker.position || { x: 0, y: 0, z: 0 };
    const victimPos = victim.position || { x: 0, y: 0, z: 0 };
    const direction = vec3Normalize(vec3Sub(attackerPos, victimPos));

    this.io.to(victimId).emit('game:damage', {
      attackerId,
      damage,
      remainingHealth: victim.health,
      direction,
    });

    // 킬 체크
    if (victim.health <= 0) {
      this.handleKill(attackerId, attacker, victimId, victim, weaponType);
    }
  }

  private handleKill(
    killerId: string,
    killer: Player,
    victimId: string,
    victim: Player,
    weaponType: string,
  ): void {
    // 킬/데스 기록
    killer.kills = (killer.kills ?? 0) + 1;
    victim.deaths = (victim.deaths ?? 0) + 1;
    victim.isAlive = false;
    victim.health = 0;

    // 리스폰 타이머 설정
    victim.respawnTimer = Date.now() + this.matchConfig.respawnDelay * 1000;

    // 팀 점수 업데이트
    if (this.subMode === 'team' && killer.team) {
      this.teamScores[killer.team]++;
    }

    // 킬 피드 → 방 전체
    this.io.to(this.room.id).emit('game:kill', {
      killerId,
      killerNickname: killer.nickname,
      victimId,
      victimNickname: victim.nickname,
      weaponType,
      timestamp: Date.now(),
    });

    // 사망 알림 → 피해자
    this.io.to(victimId).emit('game:death', {
      killerId,
      killerNickname: killer.nickname,
      weaponType,
      respawnDelay: this.matchConfig.respawnDelay,
    });

    // 점수 제한 체크
    this.checkScoreLimit(killer);
  }

  private checkScoreLimit(killer: Player): void {
    if (this.subMode === 'ffa') {
      if ((killer.kills ?? 0) >= this.matchConfig.scoreLimit) {
        this.endMatch('scoreLimit');
      }
    } else {
      // 팀 모드
      if (this.teamScores.a >= this.matchConfig.scoreLimit ||
          this.teamScores.b >= this.matchConfig.scoreLimit) {
        this.endMatch('scoreLimit');
      }
    }
  }

  // ============ 리스폰 ============

  private respawnPlayer(player: Player): void {
    const spawn = this.getSpawnPoint(player.team ?? null);

    player.health = MAX_HEALTH;
    player.isAlive = true;
    player.respawnTimer = undefined;
    player.invincibleUntil = Date.now() + this.matchConfig.invincibilityTime;
    player.position = { ...spawn };

    // 리스폰 알림 → 해당 플레이어
    this.io.to(player.id).emit('game:respawn', {
      position: spawn,
      rotation: { yaw: 0, pitch: 0 },
      invincibilityDuration: this.matchConfig.invincibilityTime,
    });

    // 리스폰 알림 → 방 전체 (다른 플레이어에게 표시)
    this.io.to(this.room.id).emit('game:playerRespawned', {
      playerId: player.id,
      position: spawn,
    });
  }

  private getSpawnPoint(team: 'a' | 'b' | null): Vec3 {
    if (this.subMode === 'team' && team) {
      const spawns = team === 'a' ? this.mapConfig.spawnsA : this.mapConfig.spawnsB;
      if (spawns.length > 0) {
        const idx = team === 'a' ? this.spawnIndexA++ : this.spawnIndexB++;
        const spawnIdx = team === 'a'
          ? this.spawnIndexA - 1
          : this.spawnIndexB - 1;
        return spawns[spawnIdx % spawns.length];
      }
    }

    // FFA 또는 팀 스폰이 없는 경우
    const spawns = this.mapConfig.spawns;
    if (spawns.length > 0) {
      const idx = this.spawnIndex++;
      return spawns[idx % spawns.length];
    }

    // 기본 스폰 (스폰 포인트가 없는 경우)
    return { x: 0, y: 2, z: 0 };
  }

  // ============ 무기 변경 ============

  handleWeaponSwitch(playerId: string, weaponType: string): void {
    const player = this.room.getPlayer(playerId);
    if (!player) return;

    const validWeapons = ['rifle', 'shotgun', 'sniper'];
    if (!validWeapons.includes(weaponType)) return;

    player.weaponType = weaponType;
  }

  // ============ 위치/회전 업데이트 ============

  updatePlayerPosition(
    playerId: string,
    position: Vec3,
    velocity: Vec3,
    rotation?: Rotation,
    animation?: string,
    weaponType?: string,
  ): void {
    // 위치 값 유효성 검사
    if (!position || !isFinite(position.x) || !isFinite(position.y) || !isFinite(position.z)) {
      return;
    }

    const clamp = (v: number) => Math.max(-1000, Math.min(1000, v));
    const clampedPosition = {
      x: clamp(position.x),
      y: clamp(position.y),
      z: clamp(position.z),
    };

    const clampedVelocity = velocity && isFinite(velocity.x) && isFinite(velocity.y) && isFinite(velocity.z)
      ? { x: clamp(velocity.x), y: clamp(velocity.y), z: clamp(velocity.z) }
      : { x: 0, y: 0, z: 0 };

    const player = this.room.getPlayer(playerId);
    if (!player) return;

    player.position = clampedPosition;
    player.velocity = clampedVelocity;

    if (rotation && isFinite(rotation.yaw) && isFinite(rotation.pitch)) {
      player.rotation = rotation;
    }
    if (animation) {
      player.animation = animation;
    }
    if (weaponType) {
      player.weaponType = weaponType;
    }
  }

  // ============ 매치 종료 ============

  private endMatch(reason: 'timeLimit' | 'scoreLimit' | 'allLeft'): void {
    this.room.status = 'finished';
    this.stop();

    const scoreboard = this.buildScoreboard();

    let winner: string | undefined;
    if (this.subMode === 'ffa') {
      // FFA: 킬 수가 가장 많은 플레이어
      if (scoreboard.length > 0) {
        winner = scoreboard[0].playerId;
      }
    }

    const result: Record<string, unknown> = {
      reason,
      scoreboard,
    };

    if (this.subMode === 'team') {
      result.teamScores = { ...this.teamScores };
      result.winner = this.teamScores.a > this.teamScores.b ? 'a'
        : this.teamScores.b > this.teamScores.a ? 'b'
        : 'draw';
    } else {
      result.winner = winner;
    }

    this.io.to(this.room.id).emit('game:shooterFinished', result);
  }

  private buildScoreboard(): ScoreboardEntry[] {
    const scoreboard: ScoreboardEntry[] = [];

    for (const player of this.room.players.values()) {
      scoreboard.push({
        playerId: player.id,
        nickname: player.nickname,
        kills: player.kills ?? 0,
        deaths: player.deaths ?? 0,
        team: player.team ?? null,
      });
    }

    scoreboard.sort((a, b) => b.kills - a.kills);
    return scoreboard;
  }

  // ============ 플레이어 이탈 ============

  handlePlayerLeave(playerId: string): void {
    // 남은 플레이어 확인
    const remainingPlayers = Array.from(this.room.players.values())
      .filter(p => p.id !== playerId);

    if (remainingPlayers.length === 0) {
      this.endMatch('allLeft');
    }
    // 1명이라도 남아있으면 게임 계속
  }

  // ============ 정리 ============

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.lastFireTime.clear();
  }
}

// ============ 유틸리티 ============

function applySpread(dir: Vec3, spreadAngle: number): Vec3 {
  // 랜덤 스프레드 적용
  const angle = Math.random() * Math.PI * 2;
  const spread = Math.random() * spreadAngle;

  // 원뿔형 스프레드
  const cosSpread = Math.cos(spread);
  const sinSpread = Math.sin(spread);

  // dir에 수직인 두 벡터 생성
  const up: Vec3 = Math.abs(dir.y) < 0.99
    ? { x: 0, y: 1, z: 0 }
    : { x: 1, y: 0, z: 0 };

  const right = vec3Normalize({
    x: dir.y * up.z - dir.z * up.y,
    y: dir.z * up.x - dir.x * up.z,
    z: dir.x * up.y - dir.y * up.x,
  });

  const actualUp = vec3Normalize({
    x: right.y * dir.z - right.z * dir.y,
    y: right.z * dir.x - right.x * dir.z,
    z: right.x * dir.y - right.y * dir.x,
  });

  return vec3Normalize({
    x: dir.x * cosSpread + right.x * sinSpread * Math.cos(angle) + actualUp.x * sinSpread * Math.sin(angle),
    y: dir.y * cosSpread + right.y * sinSpread * Math.cos(angle) + actualUp.y * sinSpread * Math.sin(angle),
    z: dir.z * cosSpread + right.z * sinSpread * Math.cos(angle) + actualUp.z * sinSpread * Math.sin(angle),
  });
}

// ============ 모듈 레벨 exports ============

const activeShooterGames: Map<string, ShooterGameLoop> = new Map();

export function startShooterGame(
  io: Server,
  room: Room,
  mapConfig: MapConfig,
  matchConfig?: Partial<MatchConfig>,
): ShooterGameLoop {
  // 기존 게임 정리
  const existing = activeShooterGames.get(room.id);
  if (existing) {
    existing.stop();
  }

  const gameLoop = new ShooterGameLoop(io, room, mapConfig, matchConfig);
  activeShooterGames.set(room.id, gameLoop);
  gameLoop.start();

  // 방 상태 업데이트
  io.to(room.id).emit('room:statusUpdated', {
    status: room.status,
  });

  return gameLoop;
}

export function getShooterGameLoop(roomId: string): ShooterGameLoop | undefined {
  return activeShooterGames.get(roomId);
}

export function stopShooterGame(roomId: string): void {
  const game = activeShooterGames.get(roomId);
  if (game) {
    game.stop();
    activeShooterGames.delete(roomId);
  }
}
