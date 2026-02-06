import { useGameStore } from '../store/gameStore';

// 탄퍼짐 설정 (BulletEffects.tsx와 동일)
const SPREAD_CONFIG = {
  baseSpread: { rifle: 1.5, shotgun: 5.0, sniper: 0.3 },
  aimMultiplier: { none: 1.0, hold: 0.5, toggle: 0.3 },
  postureMultiplier: { standing: 1.0, sitting: 0.8, crawling: 0.6 },
  moveAddition: { idle: 0, walk: 0.5, run: 1.5, jump: 3.0 },
};

// 크로스헤어 설정
const CROSSHAIR_CONFIG = {
  minGap: 4,       // 최소 간격 (px)
  maxGap: 40,      // 최대 간격 (px)
  lineLength: 8,   // 선 길이 (px)
  lineWidth: 2,    // 선 두께 (px)
  spreadScale: 8,  // 퍼짐 1도당 간격 증가량 (px)
};

export function UI() {
  const {
    posture, animation, gameMode, setGameMode, setBodyAngle, setLookDirection,
    cameraMode, setCameraMode, viewMode, setViewMode, weaponType, setWeaponType,
    aimState, moveState, spreadAccum
  } = useGameStore();

  const handleModeChange = (mode: 'running' | 'gunGame') => {
    setGameMode(mode);
    const currentAngle = useGameStore.getState().cameraAngle;
    setBodyAngle(currentAngle);
    setLookDirection(currentAngle);
    // 모드 전환 시 카메라 모드 초기화
    setCameraMode('follow');
  };

  const handleCameraModeChange = (mode: 'follow' | 'free') => {
    setCameraMode(mode);
  };

  const buttonStyle = (isActive: boolean) => ({
    padding: '8px 16px',
    margin: '0 4px',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: 'monospace',
    fontSize: 12,
    background: isActive ? '#4fc3f7' : '#555',
    color: isActive ? '#000' : '#fff',
    transition: 'all 0.2s',
  });

  return (
    <>
      {/* 동적 크로스헤어 (총게임 모드에서만) */}
      {gameMode === 'gunGame' && (() => {
        // 현재 탄퍼짐 계산
        const baseSpread = SPREAD_CONFIG.baseSpread[weaponType as keyof typeof SPREAD_CONFIG.baseSpread] || 1.5;
        const aimMult = SPREAD_CONFIG.aimMultiplier[aimState as keyof typeof SPREAD_CONFIG.aimMultiplier] || 1.0;
        const postureMult = SPREAD_CONFIG.postureMultiplier[posture as keyof typeof SPREAD_CONFIG.postureMultiplier] || 1.0;
        const moveAdd = SPREAD_CONFIG.moveAddition[moveState as keyof typeof SPREAD_CONFIG.moveAddition] || 0;
        const totalSpread = (baseSpread * aimMult * postureMult) + moveAdd + spreadAccum;

        // 퍼짐을 픽셀 간격으로 변환
        const gap = Math.min(
          CROSSHAIR_CONFIG.maxGap,
          CROSSHAIR_CONFIG.minGap + totalSpread * CROSSHAIR_CONFIG.spreadScale
        );
        const { lineLength, lineWidth } = CROSSHAIR_CONFIG;

        return (
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}>
            {/* 상단 */}
            <div style={{
              position: 'absolute',
              width: lineWidth,
              height: lineLength,
              background: 'white',
              left: '50%',
              transform: 'translateX(-50%)',
              top: -gap - lineLength,
              boxShadow: '0 0 2px black',
              transition: 'top 0.1s',
            }} />
            {/* 하단 */}
            <div style={{
              position: 'absolute',
              width: lineWidth,
              height: lineLength,
              background: 'white',
              left: '50%',
              transform: 'translateX(-50%)',
              top: gap,
              boxShadow: '0 0 2px black',
              transition: 'top 0.1s',
            }} />
            {/* 좌측 */}
            <div style={{
              position: 'absolute',
              width: lineLength,
              height: lineWidth,
              background: 'white',
              top: '50%',
              transform: 'translateY(-50%)',
              left: -gap - lineLength,
              boxShadow: '0 0 2px black',
              transition: 'left 0.1s',
            }} />
            {/* 우측 */}
            <div style={{
              position: 'absolute',
              width: lineLength,
              height: lineWidth,
              background: 'white',
              top: '50%',
              transform: 'translateY(-50%)',
              left: gap,
              boxShadow: '0 0 2px black',
              transition: 'left 0.1s',
            }} />
            {/* 중앙 점 (선택) */}
            <div style={{
              position: 'absolute',
              width: 2,
              height: 2,
              background: 'rgba(255,255,255,0.5)',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
            }} />
          </div>
        );
      })()}

      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0,0,0,0.75)',
        color: 'white',
        padding: 15,
        borderRadius: 8,
        fontFamily: 'monospace',
        fontSize: 13,
      }}>
      <h3 style={{ margin: '0 0 10px' }}>3인칭 캐릭터 컨트롤러</h3>

      {/* 모드 전환 버튼 */}
      <div style={{ marginBottom: 8 }}>
        <button
          style={buttonStyle(gameMode === 'running')}
          onClick={() => handleModeChange('running')}
        >
          달리기 모드
        </button>
        <button
          style={buttonStyle(gameMode === 'gunGame')}
          onClick={() => handleModeChange('gunGame')}
        >
          총게임 모드
        </button>
      </div>

      {/* 시점 전환 (총게임 모드에서만) */}
      {gameMode === 'gunGame' && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, marginRight: 8 }}>시점:</span>
          <button
            style={{...buttonStyle(viewMode === 'firstPerson'), padding: '4px 10px', fontSize: 11}}
            onClick={() => setViewMode('firstPerson')}
          >
            1인칭
          </button>
          <button
            style={{...buttonStyle(viewMode === 'thirdPerson'), padding: '4px 10px', fontSize: 11}}
            onClick={() => setViewMode('thirdPerson')}
          >
            3인칭
          </button>
        </div>
      )}

      {/* 카메라 모드 (총게임 모드에서만) */}
      {gameMode === 'gunGame' && (
        <div style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, marginRight: 8 }}>카메라:</span>
          <button
            style={{...buttonStyle(cameraMode === 'follow'), padding: '4px 10px', fontSize: 11}}
            onClick={() => handleCameraModeChange('follow')}
          >
            팔로우
          </button>
          <button
            style={{...buttonStyle(cameraMode === 'free'), padding: '4px 10px', fontSize: 11}}
            onClick={() => handleCameraModeChange('free')}
          >
            자유
          </button>
        </div>
      )}

      {/* 무기 선택 (총게임 모드에서만) */}
      {gameMode === 'gunGame' && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ fontSize: 11, marginRight: 8 }}>무기:</span>
          <button
            style={{...buttonStyle(weaponType === 'rifle'), padding: '4px 10px', fontSize: 11}}
            onClick={() => setWeaponType('rifle')}
          >
            Rifle
          </button>
          <button
            style={{...buttonStyle(weaponType === 'shotgun'), padding: '4px 10px', fontSize: 11}}
            onClick={() => setWeaponType('shotgun')}
          >
            Shotgun
          </button>
          <button
            style={{...buttonStyle(weaponType === 'sniper'), padding: '4px 10px', fontSize: 11}}
            onClick={() => setWeaponType('sniper')}
          >
            Sniper
          </button>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div>모드: <span style={{ color: '#ff8a65' }}>{gameMode === 'running' ? '달리기' : '총게임'}</span></div>
        <div>상태: <span style={{ color: '#4fc3f7' }}>{posture}</span></div>
        <div>애니메이션: <span style={{ color: '#81c784' }}>{animation}</span></div>
      </div>
      <table style={{ fontSize: 12 }}>
        <tbody>
          <tr><td style={{ color: '#ffd54f', paddingRight: 12 }}>WASD</td><td>걷기</td></tr>
          <tr><td style={{ color: '#ffd54f' }}>Shift + WASD</td><td>뛰기</td></tr>
          <tr><td style={{ color: '#ffd54f' }}>Space</td><td>점프</td></tr>
          <tr><td style={{ color: '#ffd54f' }}>C</td><td>앉기 토글</td></tr>
          <tr><td style={{ color: '#ffd54f' }}>Z</td><td>엎드리기 토글</td></tr>
          {gameMode === 'running' && (
            <tr><td style={{ color: '#ffd54f' }}>V</td><td>대쉬 (구르기)</td></tr>
          )}
          <tr><td style={{ color: '#ffd54f' }}>마우스</td><td>카메라 회전</td></tr>
        </tbody>
      </table>
      {gameMode === 'gunGame' && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#aaa' }}>
          {cameraMode === 'follow'
            ? '팔로우: 머리가 먼저 회전, 몸체가 따라감'
            : '자유: 마우스 상하로 시점 조절, 스크롤로 줌'}
        </div>
      )}
      </div>
    </>
  );
}
