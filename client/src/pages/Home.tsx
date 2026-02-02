import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { useRoomStore } from '../stores/roomStore'
import { socketManager } from '../lib/socket'

type AuthMode = 'login' | 'signup'

function Home() {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [isCreating, setIsCreating] = useState(false)
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
    startGame,
  } = useRoomStore()

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

  // Navigate to game when game starts
  useEffect(() => {
    if (currentRoom?.status === 'countdown') {
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

    setIsCreating(true)
    const success = await createRoom(username, roomName.trim(), 'default', maxPlayers)
    setIsCreating(false)

    if (success) {
      setRoomName('')
      setShowCreateRoomModal(false)
    }
  }

  const handleJoinRoom = async (roomId: string) => {
    await joinRoom(username, roomId)
  }

  const handleReady = () => {
    if (me) {
      setReady(!me.isReady)
    }
  }

  const handleStartGame = async () => {
    await startGame()
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
          {!currentRoom && <div className="grid md:grid-cols-2 gap-6 mb-12">
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
            <div className="mb-8 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-white">{currentRoom.name}</h2>
                  <p className="text-white/50 text-sm">방 코드: {currentRoom.id}</p>
                </div>
                <button
                  onClick={leaveRoom}
                  className="px-4 py-2 bg-red-500/20 text-red-400 font-medium rounded-lg hover:bg-red-500/30 transition-colors"
                >
                  나가기
                </button>
              </div>

              {/* Player List */}
              <div className="mb-6">
                <h3 className="text-white/70 text-sm font-medium mb-3">
                  플레이어 ({currentRoom.players.length}/{currentRoom.maxPlayers})
                </h3>
                <div className="space-y-2">
                  {currentRoom.players.map((player) => (
                    <div
                      key={player.id}
                      className={`flex items-center justify-between p-3 rounded-xl ${
                        player.id === myId ? 'bg-sky-500/20 border border-sky-500/30' : 'bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-violet-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold">
                            {player.nickname[0]?.toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="text-white font-medium flex items-center gap-2">
                            {player.nickname}
                            {player.isHost && (
                              <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 text-xs rounded-full">
                                방장
                              </span>
                            )}
                            {player.id === myId && (
                              <span className="px-2 py-0.5 bg-sky-500/20 text-sky-400 text-xs rounded-full">
                                나
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div>
                        {player.isHost ? (
                          <span className="text-amber-400 text-sm">방장</span>
                        ) : player.isReady ? (
                          <span className="text-green-400 text-sm">준비 완료</span>
                        ) : (
                          <span className="text-white/50 text-sm">대기 중</span>
                        )}
                      </div>
                    </div>
                  ))}
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
          )}

          {/* Room List */}
          {!currentRoom && (
            <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">현재 열린 방</h2>
                <button
                  onClick={() => fetchRooms()}
                  disabled={!isConnected}
                  className="text-sky-400 hover:text-sky-300 font-medium text-sm flex items-center gap-1 disabled:opacity-50"
                >
                  새로고침
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>

              {/* Room Items */}
              <div className="space-y-3">
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
                  rooms.map((room) => {
                    const isPlaying = room.status === 'playing' || room.status === 'countdown';
                    const isFull = room.playerCount >= room.maxPlayers;
                    const canJoin = !isPlaying && !isFull;

                    return (
                      <div
                        key={room.id}
                        className={`flex items-center justify-between p-4 bg-white/5 rounded-xl transition-colors ${
                          canJoin ? 'hover:bg-white/10' : 'opacity-70'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className={`w-3 h-3 rounded-full ${isPlaying ? 'bg-amber-400' : 'bg-green-400'}`}></div>
                          <div>
                            <div className="text-white font-medium">{room.name}</div>
                            <div className={`text-sm ${isPlaying ? 'text-amber-400' : 'text-white/50'}`}>
                              {isPlaying ? '게임 중' : '레이스 모드'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-white/70 text-sm">{room.playerCount}/{room.maxPlayers}</span>
                          <button
                            onClick={() => handleJoinRoom(room.id)}
                            disabled={!canJoin}
                            className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isPlaying ? '게임 중' : isFull ? '가득 참' : '참가'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Create Room Modal */}
      {showCreateRoomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateRoomModal(false)}></div>
          <div className="relative w-full max-w-md bg-slate-900 rounded-2xl border border-white/10 shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-6">새 방 만들기</h2>
              <form onSubmit={handleCreateRoom} className="space-y-4">
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
                <div>
                  <label className="block text-white/70 text-sm font-medium mb-2">최대 인원</label>
                  <select
                    value={maxPlayers}
                    onChange={(e) => setMaxPlayers(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white focus:outline-none focus:border-sky-400 transition-colors"
                    disabled={isCreating}
                  >
                    <option value={2} className="bg-slate-800 text-white">2명</option>
                    <option value={4} className="bg-slate-800 text-white">4명</option>
                    <option value={6} className="bg-slate-800 text-white">6명</option>
                    <option value={8} className="bg-slate-800 text-white">8명</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCreateRoomModal(false)}
                    className="flex-1 py-3 bg-white/10 text-white font-medium rounded-xl hover:bg-white/20 transition-colors"
                    disabled={isCreating}
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={isCreating || !roomName.trim()}
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
