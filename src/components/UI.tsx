import { useGameStore } from '../store/gameStore';

export function UI() {
  const { posture, animation, gameMode, setGameMode, setBodyAngle, setLookDirection, cameraMode, setCameraMode, weaponType, setWeaponType } = useGameStore();

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
            style={{...buttonStyle(false), padding: '4px 10px', fontSize: 11}}
            onClick={() => {}}
          >
            1인칭
          </button>
          <button
            style={{...buttonStyle(true), padding: '4px 10px', fontSize: 11}}
            onClick={() => {}}
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
  );
}
