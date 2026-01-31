import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

function Landing() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const navigate = useNavigate()

  const goToHome = () => {
    navigate('/home')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 via-white to-violet-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-violet-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-sky-500 to-violet-500 bg-clip-text text-transparent">
                GameForge
              </span>
            </div>

            {/* Desktop Menu */}
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-gray-600 hover:text-sky-500 font-medium transition-colors">
                기능 소개
              </a>
              <a href="#modes" className="text-gray-600 hover:text-sky-500 font-medium transition-colors">
                게임 모드
              </a>
              <a href="#" className="text-gray-600 hover:text-sky-500 font-medium transition-colors">
                커뮤니티
              </a>
            </div>

            {/* CTA Button */}
            <div className="hidden md:flex items-center">
              <button
                onClick={goToHome}
                className="px-5 py-2.5 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-semibold rounded-full hover:shadow-lg hover:shadow-sky-200 transition-all hover:-translate-y-0.5"
              >
                시작하기
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden p-2"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-100">
              <div className="flex flex-col gap-4">
                <a href="#features" className="text-gray-600 hover:text-sky-500 font-medium">기능 소개</a>
                <a href="#modes" className="text-gray-600 hover:text-sky-500 font-medium">게임 모드</a>
                <a href="#" className="text-gray-600 hover:text-sky-500 font-medium">커뮤니티</a>
                <hr className="border-gray-100" />
                <button
                  onClick={goToHome}
                  className="w-full py-2.5 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-semibold rounded-full"
                >
                  시작하기
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-600 rounded-full text-sm font-medium mb-8">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
            지금 1,234명이 플레이 중
          </div>

          {/* Title */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-6 leading-tight">
            상상하는 모든 게임을
            <br />
            <span className="bg-gradient-to-r from-sky-400 via-violet-500 to-orange-400 bg-clip-text text-transparent">
              직접 만들고 플레이하세요
            </span>
          </h1>

          {/* Description */}
          <p className="text-lg sm:text-xl text-gray-500 max-w-2xl mx-auto mb-10">
            코딩 없이 3D 맵을 만들고, 친구들과 함께 달리기 경주부터
            치열한 총싸움까지 다양한 게임을 즐겨보세요!
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={goToHome}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-sky-400 to-violet-500 text-white font-bold text-lg rounded-2xl hover:shadow-xl hover:shadow-sky-200 transition-all hover:-translate-y-1 flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              지금 바로 플레이
            </button>
            <button
              onClick={goToHome}
              className="w-full sm:w-auto px-8 py-4 bg-white text-gray-700 font-bold text-lg rounded-2xl border-2 border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              맵 에디터 열기
            </button>
          </div>

          {/* Stats */}
          <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16 mt-16 text-center">
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-gray-900">10K+</div>
              <div className="text-gray-500">플레이어</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-gray-900">5K+</div>
              <div className="text-gray-500">제작된 맵</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold text-gray-900">100K+</div>
              <div className="text-gray-500">게임 플레이</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              이런 것들을 할 수 있어요
            </h2>
            <p className="text-gray-500 text-lg">
              누구나 쉽게, 코딩 없이 게임을 만들 수 있습니다
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <div className="group p-8 bg-gradient-to-br from-sky-50 to-sky-100 rounded-3xl hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="w-16 h-16 bg-sky-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">3D 맵 에디터</h3>
              <p className="text-gray-600">
                드래그 앤 드롭으로 블록을 배치하고, 클릭 몇 번으로
                멋진 3D 맵을 완성하세요. 코딩 지식이 필요 없어요!
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group p-8 bg-gradient-to-br from-violet-50 to-violet-100 rounded-3xl hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="w-16 h-16 bg-violet-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">다양한 게임 모드</h3>
              <p className="text-gray-600">
                달리기 경주, 데스매치, 팀전, 점령전까지!
                원하는 모드를 선택하고 바로 게임을 시작하세요.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group p-8 bg-gradient-to-br from-orange-50 to-orange-100 rounded-3xl hover:shadow-xl transition-all hover:-translate-y-2">
              <div className="w-16 h-16 bg-orange-400 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">실시간 멀티플레이</h3>
              <p className="text-gray-600">
                친구들을 초대해서 함께 플레이하세요.
                방을 만들고, 링크 하나로 바로 참가!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Game Modes Section */}
      <section id="modes" className="py-20 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              다양한 게임 모드
            </h2>
            <p className="text-gray-500 text-lg">
              기본 제공되는 모드로 바로 플레이하거나, 나만의 규칙을 만들어보세요
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Race Mode */}
            <div className="relative overflow-hidden bg-gradient-to-br from-green-400 to-emerald-500 rounded-3xl p-6 text-white hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="text-4xl mb-4">🏃</div>
              <h3 className="text-xl font-bold mb-2">달리기</h3>
              <p className="text-white/80 text-sm">
                장애물을 피해 결승선까지 달려라!
              </p>
            </div>

            {/* Deathmatch Mode */}
            <div className="relative overflow-hidden bg-gradient-to-br from-red-400 to-rose-500 rounded-3xl p-6 text-white hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="text-4xl mb-4">🔫</div>
              <h3 className="text-xl font-bold mb-2">데스매치</h3>
              <p className="text-white/80 text-sm">
                모두가 적! 최후의 1인이 되어라
              </p>
            </div>

            {/* Team Deathmatch Mode */}
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-400 to-indigo-500 rounded-3xl p-6 text-white hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="text-4xl mb-4">⚔️</div>
              <h3 className="text-xl font-bold mb-2">팀 데스매치</h3>
              <p className="text-white/80 text-sm">
                팀원과 협력해서 상대팀을 제압해라
              </p>
            </div>

            {/* Domination Mode */}
            <div className="relative overflow-hidden bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl p-6 text-white hover:shadow-xl transition-all hover:-translate-y-1 cursor-pointer">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"></div>
              <div className="text-4xl mb-4">🚩</div>
              <h3 className="text-xl font-bold mb-2">점령전</h3>
              <p className="text-white/80 text-sm">
                거점을 점령하고 팀 점수를 올려라
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="relative overflow-hidden bg-gradient-to-r from-sky-400 via-violet-500 to-purple-500 rounded-3xl p-12 text-center text-white">
            {/* Decorative circles */}
            <div className="absolute top-0 left-0 w-64 h-64 bg-white/10 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 right-0 w-48 h-48 bg-white/10 rounded-full translate-x-1/4 translate-y-1/4"></div>

            <div className="relative">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                지금 바로 시작하세요!
              </h2>
              <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto">
                무료로 가입하고, 5분 안에 첫 번째 맵을 만들어보세요.
                생각보다 훨씬 쉬워요!
              </p>
              <button
                onClick={goToHome}
                className="px-8 py-4 bg-white text-violet-600 font-bold text-lg rounded-2xl hover:shadow-xl transition-all hover:-translate-y-1"
              >
                무료로 시작하기 →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-sky-400 to-violet-500 rounded-xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <span className="text-xl font-bold">GameForge</span>
            </div>

            {/* Links */}
            <div className="flex flex-wrap items-center justify-center gap-6 text-gray-400">
              <a href="#" className="hover:text-white transition-colors">이용약관</a>
              <a href="#" className="hover:text-white transition-colors">개인정보처리방침</a>
              <a href="#" className="hover:text-white transition-colors">고객센터</a>
              <a href="#" className="hover:text-white transition-colors">문의하기</a>
            </div>

            {/* Social */}
            <div className="flex items-center gap-4">
              <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
              </a>
              <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/>
                </svg>
              </a>
              <a href="#" className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z"/>
                </svg>
              </a>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-gray-800 text-center text-gray-500 text-sm">
            © 2025 GameForge. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Landing
