import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRoomStore, type RoomType, type GameMode, PLAYER_COLORS, type PlayerColorId } from '../stores/roomStore'
import { socketManager } from '../lib/socket'
import { MapBrowser } from '../components/map/MapBrowser'
import type { MapRecord } from '../lib/mapService'

type AuthMode = 'login' | 'signup'

function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [isCreating, setIsCreating] = useState(false)

  // 새로운 방 생성 옵션
  const [roomType, setRoomType] = useState<RoomType>('create_map')
  const [gameMode] = useState<GameMode>('race')  // 현재는 race만 지원
  const [isPrivate, setIsPrivate] = useState(false)
  const [buildTimeLimit, setBuildTimeLimit] = useState(300)  // 5분 기본
  const [selectedMap, setSelectedMap] = useState<MapRecord | null>(null)
  const [showMapBrowser, setShowMapBrowser] = useState(false)

  // 방 코드로 참가
  const [roomCode, setRoomCode] = useState('')
  const [isJoiningByCode, setIsJoiningByCode] = useState(false)
  const [joinCodeError, setJoinCodeError] = useState('')

  // 방 설정 수정 모달
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [editRoomName, setEditRoomName] = useState('')
  const [editMaxPlayers, setEditMaxPlayers] = useState(4)
  const [editIsPrivate, setEditIsPrivate] = useState(false)
  const [editBuildTimeLimit, setEditBuildTimeLimit] = useState(300)
  const [isSavingSettings, setIsSavingSettings] = useState(false)

  // 맵 변경 (대기방에서)
  const [showEditMapBrowser, setShowEditMapBrowser] = useState(false)

  const navigate = useNavigate()

  // Auth store
  const { user, loading, error, signIn, signUp, signOut, clearError } = useAuthStore()
  const username = user?.user_metadata?.username || user?.email?.split('@')[0] || ''

  // Room store
  const {
    isConnected,
    rooms,
    currentRoom,
    canStart,
    connect,
    fetchRooms,
    createRoom,
    joinRoom,
    leaveRoom,
    setReady,
    selectColor,
    startGame,
    updateRoomSettings,
  } = useRoomStore()

  // 색상 선택 UI
  const [showColorPicker, setShowColorPicker] = useState(false)
  const colorPickerRef = useRef<HTMLDivElement>(null)

  // 색상 선택기 외부 클릭 감지
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setShowColorPicker(false)
      }
    }
    if (showColorPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showColorPicker])

  const myId = socketManager.getSocket()?.id
  const me = currentRoom?.players.find((p) => p.id === myId)
  const isHost = me?.isHost ?? false

  // 로그인 안 된 상태면 모달 표시
  const showAuthModal = !user

  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signupUsername, setSignupUsername] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [formError, setFormError] = useState('')

  // Connect to socket when logged in
  useEffect(() => {
    if (user) {
      connect()
    }
  }, [user, connect])

  // Fetch rooms when connected
  useEffect(() => {
    if (isConnected) {
      fetchRooms()
    }
  }, [isConnected, fetchRooms])

  // Navigate to game when game starts (countdown for load_map, building for create_map)
  useEffect(() => {
    if (currentRoom?.status === 'countdown' || currentRoom?.status === 'building') {
      navigate('/multiplayer-game')
    }
  }, [currentRoom?.status, navigate])

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setSignupUsername('')
    setConfirmPassword('')
    setFormError('')
    clearError()
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    const result = await signIn(email, password)
    if (result.success) {
      resetForm()
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError('')

    if (password !== confirmPassword) {
      setFormError('비밀번호가 일치하지 않습니다')
      return
    }

    if (password.length < 6) {
      setFormError('비밀번호는 최소 6자 이상이어야 합니다')
      return
    }

    if (signupUsername.length < 2) {
      setFormError('사용자 이름은 최소 2자 이상이어야 합니다')
      return
    }

    const result = await signUp(email, password, signupUsername)
    if (result.success) {
      resetForm()
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode)
    setFormError('')
    clearError()
  }

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomName.trim()) return

    // 맵 불러오기 모드인데 맵이 선택되지 않은 경우
    if (roomType === 'load_map' && !selectedMap) {
      alert('맵을 선택해주세요')
      return
    }

    setIsCreating(true)
    const success = await createRoom({
      nickname: username,
      roomName: roomName.trim(),
      mapId: roomType === 'load_map' && selectedMap ? selectedMap.id : 'default',
      mapName: roomType === 'load_map' && selectedMap ? selectedMap.name : undefined,
      mapThumbnailUrl: roomType === 'load_map' && selectedMap ? (selectedMap.thumbnail_url ?? undefined) : undefined,
      maxPlayers,
      gameMode,
      roomType,
      isPrivate,
      buildTimeLimit: roomType === 'create_map' ? buildTimeLimit : undefined,
    })
    setIsCreating(false)

    if (success) {
      setRoomName('')
      setSelectedMap(null)
      setShowCreateRoomModal(false)
    }
  }

  const handleMapSelect = (map: MapRecord) => {
    setSelectedMap(map)
    setShowMapBrowser(false)
  }

  const handleJoinRoom = async (roomId: string) => {
    await joinRoom(username, roomId)
  }

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!roomCode.trim()) {
      setJoinCodeError('방 ID를 입력해주세요')
      return
    }

    setIsJoiningByCode(true)
    setJoinCodeError('')

    const success = await joinRoom(username, roomCode.trim())
    if (!success) {
      setJoinCodeError('방을 찾을 수 없거나 참가할 수 없습니다')
    } else {
      setRoomCode('')
    }
    setIsJoiningByCode(false)
  }

  const handleReady = () => {
    if (me) {
      setReady(!me.isReady)
    }
  }

  const handleStartGame = async () => {
    await startGame()
  }

  // 방 설정 모달 열기
  const openSettingsModal = () => {
    if (currentRoom) {
      setEditRoomName(currentRoom.name)
      setEditMaxPlayers(currentRoom.maxPlayers)
      setEditIsPrivate(currentRoom.isPrivate)
      setEditBuildTimeLimit(currentRoom.buildTimeLimit || 300)
      setShowSettingsModal(true)
    }
  }

  // 대기방에서 맵 변경
  const handleEditMapSelect = async (map: MapRecord) => {
    setShowEditMapBrowser(false)
    // 바로 서버에 저장
    await updateRoomSettings({
      mapId: map.id,
      mapName: map.name,
      mapThumbnailUrl: map.thumbnail_url || undefined,
    })
  }

  // 방 설정 저장
  const handleSaveSettings = async () => {
    setIsSavingSettings(true)
    const success = await updateRoomSettings({
      name: editRoomName,
      maxPlayers: editMaxPlayers,
      isPrivate: editIsPrivate,
      buildTimeLimit: editBuildTimeLimit,
    })
    setIsSavingSettings(false)
    if (success) {
      setShowSettingsModal(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-40 bg-slate-900/80 backdrop-blur-md border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <button onClick={() => navigate('/')} className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-violet-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <span className="text-xl font-bold text-white">GameForge</span>
            </button>

            {/* Menu */}
            <div className="hidden md:flex items-center gap-6">
              <button
                onClick={() => !currentRoom && navigate('/editor')}
                disabled={!!currentRoom}
                className="text-white/70 hover:text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                맵 에디터
              </button>
            </div>

            {/* User */}
            {user ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-violet-500 rounded-full flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {username[0]?.toUpperCase()}
                    </span>
                  </div>
                  <span className="text-white font-medium hidden sm:block">
                    {username}
                  </span>
                  {/* Connection status */}
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-4 py-2 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <div className="w-20"></div>
            )}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pt-24 pb-12 px-4">
        <div className="max-w-7xl mx-auto">
          {/* Welcome Message for logged in users (not in room) */}
          {user && !currentRoom && (
            <div className="mb-8 p-6 bg-gradient-to-r from-sky-500/10 to-violet-500/10 rounded-2xl border border-white/10">
              <h1 className="text-2xl font-bold text-white mb-2">
                환영합니다, {username}님!
              </h1>
              <p className="text-white/60">게임을 시작하거나 새로운 맵을 만들어보세요.</p>
            </div>
          )}

          {/* Quick Actions (not in room) */}
          {!currentRoom && <div className="grid md:grid-cols-3 gap-6 mb-12">
            {/* Create Room */}
            <button
              onClick={() => user && setShowCreateRoomModal(true)}
              disabled={!user || !isConnected || !!currentRoom}
              className="group relative overflow-hidden bg-gradient-to-br from-sky-500 to-cyan-600 rounded-2xl p-8 text-left hover:shadow-2xl hover:shadow-sky-500/25 transition-all hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">방 만들기</h3>
                <p className="text-white/70">새로운 게임 방을 생성하세요</p>
              </div>
            </button>

            {/* Browse Maps */}
            <button
              onClick={() => user && setShowMapBrowser(true)}
              disabled={!user}
              className="group relative overflow-hidden bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-8 text-left hover:shadow-2xl hover:shadow-emerald-500/25 transition-all hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">맵 둘러보기</h3>
                <p className="text-white/70">다른 플레이어가 만든 맵을 확인하세요</p>
              </div>
            </button>

            {/* Create Map */}
            <button
              onClick={() => !currentRoom && navigate('/editor')}
              disabled={!!currentRoom}
              className="group relative overflow-hidden bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl p-8 text-left hover:shadow-2xl hover:shadow-violet-500/25 transition-all hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform"></div>
              <div className="relative">
                <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">맵 만들기</h3>
                <p className="text-white/70">나만의 3D 맵을 제작하세요</p>
              </div>
            </button>
          </div>}

          {/* Current Room (대기실) */}
          {currentRoom && (
            <div className="mb-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
              {/* 상단: 방 정보 + 썸네일 (좌우 분할) */}
              <div className="flex flex-col md:flex-row">
                {/* 왼쪽: 방 정보 */}
                <div className="flex-1 p-6">
                  {/* 방 이름 */}
                  <h2 className="text-2xl font-bold text-white mb-3">{currentRoom.name}</h2>

                  {/* 방 코드 */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-white/50 text-sm">방 코드</span>
                    <span className="px-3 py-1 bg-white/10 rounded-lg text-sky-400 font-mono font-bold tracking-widest">{currentRoom.id}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(currentRoom.id)
                        alert('방 코드가 복사되었습니다!')
                      }}
                      className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                      title="코드 복사"
                    >
                      <svg className="w-4 h-4 text-white/50 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>

                  {/* 맵 이름 (load_map 모드) */}
                  {currentRoom.roomType === 'load_map' && currentRoom.mapName && (
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-white/50 text-sm">맵</span>
                      <span className="text-sky-400 font-medium">{currentRoom.mapName}</span>
                    </div>
                  )}

                  {/* 방 설정 정보 */}
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${currentRoom.gameMode === 'race' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                      {currentRoom.gameMode === 'race' ? 'Race' : 'Shooter'}
                    </span>
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-white/10 text-white/70">
                      {currentRoom.roomType === 'create_map' ? '맵 제작' : '맵 플레이'}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${currentRoom.isPrivate ? 'bg-amber-500/20 text-amber-400' : 'bg-sky-500/20 text-sky-400'}`}>
                      {currentRoom.isPrivate ? '비공개' : '공개'}
                    </span>
                    {currentRoom.roomType === 'create_map' && currentRoom.buildTimeLimit && (
                      <span className="px-2 py-1 rounded-full text-xs font-medium bg-violet-500/20 text-violet-400">
                        제작 {Math.floor(currentRoom.buildTimeLimit / 60)}분
                      </span>
                    )}
                  </div>

                  {/* 버튼들 */}
                  <div className="flex items-center gap-2">
                    {isHost && (
                      <button
                        onClick={openSettingsModal}
                        className="px-4 py-2 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        설정
                      </button>
                    )}
                    <button
                      onClick={leaveRoom}
                      className="px-4 py-2 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-colors"
                    >
                      나가기
                    </button>
                  </div>
                </div>

                {/* 오른쪽: 맵 썸네일 */}
                <div className="md:w-80 lg:w-96 bg-slate-800 flex-shrink-0 relative group">
                  <div className="aspect-video md:aspect-auto md:h-full w-full">
                    {currentRoom.mapThumbnailUrl ? (
                      <img src={currentRoom.mapThumbnailUrl} alt={currentRoom.mapName || 'Map'} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full min-h-[180px] flex flex-col items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                        <svg className="w-16 h-16 text-white/20 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                        </svg>
                        <span className="text-white/30 text-sm">
                          {currentRoom.roomType === 'create_map' ? '맵 제작 모드' : '맵 미리보기'}
                        </span>
                      </div>
                    )}
                  </div>
                  {/* 맵 이름 표시 */}
                  {currentRoom.mapName && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                      <span className="text-white font-medium text-sm">{currentRoom.mapName}</span>
                    </div>
                  )}
                  {/* 맵 변경 버튼 (방장 + load_map 모드일 때만) */}
                  {isHost && currentRoom.roomType === 'load_map' && (
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <button
                        onClick={() => setShowEditMapBrowser(true)}
                        className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        맵 변경
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* 하단: 플레이어 목록 + 액션 */}
              <div className="border-t border-white/10 p-6">
                {/* Player List */}
                <div className="mb-6">
                  <h3 className="text-white/70 text-sm font-medium mb-3">
                    플레이어 ({currentRoom.players.length}/{currentRoom.maxPlayers})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {currentRoom.players.map((player) => {
                      const playerColor = PLAYER_COLORS.find(c => c.id === player.color) || PLAYER_COLORS[0];
                      const isMe = player.id === myId;
                      const usedColors = currentRoom.players.map(p => p.color);

                      return (
                        <div
                          key={player.id}
                          className={`flex items-center justify-between p-3 rounded-xl ${
                            isMe ? 'bg-sky-500/20 border border-sky-500/30' : 'bg-white/5'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {/* 색상 아바타 */}
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                              style={{ backgroundColor: playerColor.hex }}
                            >
                              <span className={`font-bold ${playerColor.id === 'white' || playerColor.id === 'yellow' ? 'text-slate-800' : 'text-white'}`}>
                                {player.nickname[0]?.toUpperCase()}
                              </span>
                            </div>

                            <div className="min-w-0">
                              <div className="text-white font-medium flex items-center gap-1 truncate">
                                <span className="truncate">{player.nickname}</span>
                                {player.isHost && (
                                  <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full flex-shrink-0">
                                    방장
                                  </span>
                                )}
                                {isMe && (
                                  <span className="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 text-xs rounded-full flex-shrink-0">
                                    나
                                  </span>
                                )}
                              </div>
                              <div className="text-xs">
                                {player.isHost ? (
                                  <span className="text-amber-400">방장</span>
                                ) : player.isReady ? (
                                  <span className="text-green-400">준비 완료</span>
                                ) : (
                                  <span className="text-white/50">대기 중</span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 색상 선택 버튼 (내 플레이어만) */}
                          {isMe && (
                            <div className="relative flex-shrink-0">
                              <button
                                onClick={() => setShowColorPicker(prev => !prev)}
                                className="w-6 h-6 rounded-full border-2 border-white/30 hover:border-white/60 transition-all"
                                style={{ backgroundColor: playerColor.hex }}
                                title="색상 변경"
                              />

                              {/* 색상 선택 팝업 */}
                              {showColorPicker && (
                                <div ref={colorPickerRef} className="absolute top-8 right-0 z-50 bg-slate-800 rounded-xl p-2 border border-white/10 shadow-xl">
                                  <div className="grid grid-cols-4 gap-1">
                                    {PLAYER_COLORS.map((color) => {
                                      const isUsed = usedColors.includes(color.id) && color.id !== player.color;
                                      const isSelected = color.id === player.color;
                                      return (
                                        <button
                                          key={color.id}
                                          onClick={() => {
                                            if (!isUsed) {
                                              selectColor(color.id as PlayerColorId);
                                              setShowColorPicker(false);
                                            }
                                          }}
                                          disabled={isUsed}
                                          className={`w-8 h-8 rounded-full transition-all ${
                                            isSelected ? 'ring-2 ring-white scale-110' : ''
                                          } ${isUsed ? 'opacity-30 cursor-not-allowed' : 'hover:scale-110'}`}
                                          style={{ backgroundColor: color.hex }}
                                          title={isUsed ? `${color.name} (사용 중)` : color.name}
                                        />
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {isHost ? (
                    <button
                      onClick={handleStartGame}
                      disabled={!canStart && currentRoom.players.length > 1}
                      className="flex-1 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {currentRoom.players.length === 1 ? '게임 시작 (혼자)' : canStart ? '게임 시작' : '모든 플레이어 준비 대기'}
                    </button>
                  ) : (
                    <button
                      onClick={handleReady}
                      className={`flex-1 py-3 font-bold rounded-xl transition-all ${
                        me?.isReady
                          ? 'bg-white/10 text-white hover:bg-white/20'
                          : 'bg-gradient-to-r from-sky-400 to-violet-500 text-white hover:shadow-lg hover:shadow-sky-500/25'
                      }`}
                    >
                      {me?.isReady ? '준비 취소' : '준비 완료'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Room List */}
          {!currentRoom && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-bold text-white">현재 열린 방</h2>
                  <button
                    onClick={() => fetchRooms()}
                    disabled={!isConnected}
                    className="text-sky-400 hover:text-sky-300 font-medium text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                {/* 방 ID로 참가 */}
                {user && isConnected && (
                  <form onSubmit={handleJoinByCode} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={roomCode}
                      onChange={(e) => {
                        setRoomCode(e.target.value)
                        setJoinCodeError('')
                      }}
                      placeholder="방 ID 입력"
                      className="w-64 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors font-mono text-xs"
                      disabled={isJoiningByCode}
                    />
                    <button
                      type="submit"
                      disabled={isJoiningByCode || !roomCode.trim()}
                      className="px-3 py-1.5 bg-sky-500 hover:bg-sky-400 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isJoiningByCode ? '...' : '참가'}
                    </button>
                    {joinCodeError && (
                      <span className="text-red-400 text-xs">{joinCodeError}</span>
                    )}
                  </form>
                )}
              </div>

              {/* Room Cards */}
              {!user ? (
                <div className="text-center py-12 text-white/50">
                  로그인이 필요합니다
                </div>
              ) : !isConnected ? (
                <div className="text-center py-12 text-white/50">
                  서버에 연결 중...
                </div>
              ) : rooms.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                  현재 열린 방이 없습니다
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {rooms.map((room) => {
                    const isPlaying = room.status === 'playing' || room.status === 'countdown' || room.status === 'building';
                    const isFull = room.playerCount >= room.maxPlayers;
                    const canJoin = !isPlaying && !isFull && !room.isPrivate;
                    const modeLabel = room.gameMode === 'race' ? 'Race' : 'Shooter';
                    const typeLabel = room.roomType === 'create_map' ? '맵 제작' : '맵 플레이';

                    return (
                      <div
                        key={room.id}
                        className={`bg-white/5 rounded-xl overflow-hidden border border-white/10 transition-all ${
                          canJoin ? 'hover:border-sky-500/50 hover:shadow-lg hover:shadow-sky-500/10' : 'opacity-70'
                        }`}
                      >
                        {/* 썸네일 영역 */}
                        <div className="relative aspect-video bg-slate-800">
                          {room.mapThumbnailUrl ? (
                            <img src={room.mapThumbnailUrl} alt={room.mapName || 'Map'} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                              <svg className="w-12 h-12 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                          )}
                          {/* 상태 뱃지 */}
                          <div className="absolute top-2 left-2 flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${room.gameMode === 'race' ? 'bg-green-500/90 text-white' : 'bg-red-500/90 text-white'}`}>
                              {modeLabel}
                            </span>
                            {room.isPrivate && (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-500/90 text-white flex items-center gap-1">
                                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M12 1C8.676 1 6 3.676 6 7v2H4v14h16V9h-2V7c0-3.324-2.676-6-6-6zm0 2c2.276 0 4 1.724 4 4v2H8V7c0-2.276 1.724-4 4-4z"/>
                                </svg>
                              </span>
                            )}
                          </div>
                          {/* 인원수 뱃지 */}
                          <div className="absolute top-2 right-2">
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-black/60 text-white flex items-center gap-1">
                              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                              </svg>
                              {room.playerCount}/{room.maxPlayers}
                            </span>
                          </div>
                        </div>

                        {/* 정보 영역 */}
                        <div className="p-4">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <h3 className="text-white font-medium truncate flex-1" title={room.name}>
                              {room.name}
                            </h3>
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${isPlaying ? 'bg-amber-400' : 'bg-green-400'}`}></div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-white/50 mb-3">
                            <span>{typeLabel}</span>
                            {room.mapName && (
                              <>
                                <span>•</span>
                                <span className="text-sky-400 truncate" title={room.mapName}>{room.mapName}</span>
                              </>
                            )}
                          </div>

                          <button
                            onClick={() => handleJoinRoom(room.id)}
                            disabled={!canJoin}
                            className="w-full py-2 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                          >
                            {isPlaying ? '게임 중' : isFull ? '가득 참' : room.isPrivate ? '비공개' : '참가하기'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateRoomModal(false)}></div>
          <div className="relative w-full max-w-lg bg-slate-900 rounded-2xl border border-white/10 shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">새 방 만들기</h2>
              <form onSubmit={handleCreateRoom} className="space-y-4">
                {/* 게임 모드 표시 (현재는 Race만) */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">게임 모드</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="flex-1 py-2 bg-green-500 text-white font-medium rounded-lg"
                      disabled
                    >
                      Race
                    </button>
                    <button
                      type="button"
                      className="flex-1 py-2 bg-white/5 text-white/30 font-medium rounded-lg cursor-not-allowed"
                      disabled
                    >
                      Shooter (준비 중)
                    </button>
                  </div>
                </div>

                {/* 룸 타입 선택 */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">플레이 방식</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setRoomType('create_map'); setSelectedMap(null); }}
                      disabled={isCreating}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                        roomType === 'create_map'
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        <span className="text-sm">맵 제작 & 플레이</span>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRoomType('load_map')}
                      disabled={isCreating}
                      className={`flex-1 py-3 rounded-xl font-medium transition-all ${
                        roomType === 'load_map'
                          ? 'bg-sky-500 text-white'
                          : 'bg-white/5 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="text-sm">기존 맵 불러오기</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* 맵 제작 시간 제한 (제작 모드) */}
                {roomType === 'create_map' && (
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">맵 제작 시간</label>
                    <select
                      value={buildTimeLimit}
                      onChange={(e) => setBuildTimeLimit(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sky-400 transition-colors"
                      disabled={isCreating}
                    >
                      <option value={180} className="bg-slate-800 text-white">3분</option>
                      <option value={300} className="bg-slate-800 text-white">5분</option>
                      <option value={600} className="bg-slate-800 text-white">10분</option>
                      <option value={900} className="bg-slate-800 text-white">15분</option>
                      <option value={0} className="bg-slate-800 text-white">무제한</option>
                    </select>
                  </div>
                )}

                {/* 맵 선택 (불러오기 모드) */}
                {roomType === 'load_map' && (
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">맵 선택</label>
                    {selectedMap ? (
                      <div className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/10">
                        <div className="w-16 h-10 bg-slate-800 rounded-lg overflow-hidden flex-shrink-0">
                          {selectedMap.thumbnail_url ? (
                            <img src={selectedMap.thumbnail_url} alt={selectedMap.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-white/20">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-white font-medium truncate">{selectedMap.name}</div>
                          <div className="text-white/50 text-xs truncate">{selectedMap.creator_username}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowMapBrowser(true)}
                          className="px-3 py-1.5 bg-white/10 text-white text-sm rounded-lg hover:bg-white/20 transition-colors"
                        >
                          변경
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowMapBrowser(true)}
                        disabled={isCreating}
                        className="w-full py-4 border-2 border-dashed border-white/20 rounded-xl text-white/50 hover:border-white/30 hover:text-white/70 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                        맵 선택하기
                      </button>
                    )}
                  </div>
                )}

                {/* 방 이름 */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">방 이름</label>
                  <input
                    type="text"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                    placeholder="방 이름을 입력하세요"
                    required
                    disabled={isCreating}
                    maxLength={30}
                  />
                </div>

                {/* 공개/비공개 및 최대 인원 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">공개 설정</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPrivate(false)}
                        disabled={isCreating}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          !isPrivate ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        공개
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivate(true)}
                        disabled={isCreating}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          isPrivate ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        비공개
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">최대 인원</label>
                    <select
                      value={maxPlayers}
                      onChange={(e) => setMaxPlayers(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sky-400 transition-colors"
                      disabled={isCreating}
                    >
                      <option value={2} className="bg-slate-800 text-white">2명</option>
                      <option value={4} className="bg-slate-800 text-white">4명</option>
                      <option value={6} className="bg-slate-800 text-white">6명</option>
                      <option value={8} className="bg-slate-800 text-white">8명</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => { setShowCreateRoomModal(false); setSelectedMap(null); }}
                    className="flex-1 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
                    disabled={isCreating}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !roomName.trim() || (roomType === 'load_map' && !selectedMap)}
                    className="flex-1 py-3 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-sky-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreating ? '생성 중...' : '방 만들기'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Map Browser Modal (방 생성용) */}
      {showMapBrowser && (
        <MapBrowser
          onSelect={handleMapSelect}
          onClose={() => setShowMapBrowser(false)}
          selectedMapId={selectedMap?.id}
        />
      )}

      {/* Map Browser Modal (대기방 맵 변경용) */}
      {showEditMapBrowser && (
        <MapBrowser
          onSelect={handleEditMapSelect}
          onClose={() => setShowEditMapBrowser(false)}
          selectedMapId={currentRoom?.mapId}
        />
      )}

      {/* Room Settings Modal (방장 전용) */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowSettingsModal(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">방 설정</h2>
              <div className="space-y-4">
                {/* 방 이름 */}
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">방 이름</label>
                  <input
                    type="text"
                    value={editRoomName}
                    onChange={(e) => setEditRoomName(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                    placeholder="방 이름을 입력하세요"
                    disabled={isSavingSettings}
                    maxLength={30}
                  />
                </div>

                {/* 공개/비공개 및 최대 인원 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">공개 설정</label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditIsPrivate(false)}
                        disabled={isSavingSettings}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          !editIsPrivate ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        공개
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditIsPrivate(true)}
                        disabled={isSavingSettings}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                          editIsPrivate ? 'bg-sky-500 text-white' : 'bg-white/5 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        비공개
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">최대 인원</label>
                    <select
                      value={editMaxPlayers}
                      onChange={(e) => setEditMaxPlayers(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sky-400 transition-colors"
                      disabled={isSavingSettings}
                    >
                      <option value={2} className="bg-slate-800 text-white">2명</option>
                      <option value={4} className="bg-slate-800 text-white">4명</option>
                      <option value={6} className="bg-slate-800 text-white">6명</option>
                      <option value={8} className="bg-slate-800 text-white">8명</option>
                    </select>
                  </div>
                </div>

                {/* 맵 제작 시간 (roomType이 create_map인 경우만) */}
                {currentRoom?.roomType === 'create_map' && (
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">맵 제작 시간</label>
                    <select
                      value={editBuildTimeLimit}
                      onChange={(e) => setEditBuildTimeLimit(Number(e.target.value))}
                      className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-sky-400 transition-colors"
                      disabled={isSavingSettings}
                    >
                      <option value={180} className="bg-slate-800 text-white">3분</option>
                      <option value={300} className="bg-slate-800 text-white">5분</option>
                      <option value={600} className="bg-slate-800 text-white">10분</option>
                      <option value={900} className="bg-slate-800 text-white">15분</option>
                    </select>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowSettingsModal(false)}
                    className="flex-1 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
                    disabled={isSavingSettings}
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={isSavingSettings || !editRoomName.trim()}
                    className="flex-1 py-3 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-sky-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSavingSettings ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

          {/* Modal */}
          <div className="relative w-full max-w-md bg-slate-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
            {/* Header decoration */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-br from-sky-400/20 to-violet-500/20"></div>

            <div className="relative p-8">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-gradient-to-br from-sky-400 to-violet-500 rounded-2xl flex items-center justify-center">
                  <span className="text-white font-bold text-3xl">G</span>
                </div>
              </div>

              {/* Title */}
              <h2 className="text-2xl font-bold text-white text-center mb-2">
                {authMode === 'login' ? 'GameForge에 로그인' : 'GameForge 회원가입'}
              </h2>
              <p className="text-white/50 text-center mb-8">
                {authMode === 'login' ? '계정에 로그인하여 게임을 시작하세요' : '새 계정을 만들어 게임을 시작하세요'}
              </p>

              {/* Error Message */}
              {(error || formError) && (
                <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm">
                  {formError || error}
                </div>
              )}

              {/* Form */}
              <form onSubmit={authMode === 'login' ? handleLogin : handleSignup} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">
                      사용자 이름
                    </label>
                    <input
                      type="text"
                      value={signupUsername}
                      onChange={(e) => setSignupUsername(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                      placeholder="Player123"
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    이메일
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                    placeholder="you@example.com"
                    required
                    disabled={loading}
                  />
                </div>

                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">
                    비밀번호
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                    placeholder="••••••••"
                    required
                    disabled={loading}
                  />
                </div>

                {authMode === 'signup' && (
                  <div>
                    <label className="block text-white/70 text-sm font-medium mb-2">
                      비밀번호 확인
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-white/30 focus:outline-none focus:border-sky-400 transition-colors"
                      placeholder="••••••••"
                      required
                      disabled={loading}
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-sky-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      처리 중...
                    </>
                  ) : (
                    authMode === 'login' ? '로그인' : '회원가입'
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="flex items-center gap-4 my-6">
                <div className="flex-1 h-px bg-white/10"></div>
                <span className="text-white/30 text-sm">또는</span>
                <div className="flex-1 h-px bg-white/10"></div>
              </div>

              {/* Social Login */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  disabled
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-white/50 cursor-not-allowed"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button
                  disabled
                  className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-xl text-white/50 cursor-not-allowed"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  GitHub
                </button>
              </div>
              <p className="text-center text-white/30 text-xs mt-2">소셜 로그인은 준비 중입니다</p>

              {/* Switch mode */}
              <p className="text-center text-white/50 mt-6">
                {authMode === 'login' ? (
                  <>
                    계정이 없으신가요?{' '}
                    <button
                      type="button"
                      onClick={() => switchAuthMode('signup')}
                      className="text-sky-400 hover:text-sky-300 font-medium"
                    >
                      회원가입
                    </button>
                  </>
                ) : (
                  <>
                    이미 계정이 있으신가요?{' '}
                    <button
                      type="button"
                      onClick={() => switchAuthMode('login')}
                      className="text-sky-400 hover:text-sky-300 font-medium"
                    >
                      로그인
                    </button>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Home
