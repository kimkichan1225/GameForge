import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '../stores/editorStore'
import { EditorCanvas } from '../components/editor/EditorCanvas'
import { EditorUI } from '../components/editor/EditorUI'
import { TestPlayCanvas } from '../components/game/TestPlayCanvas'

function MapEditor() {
  const navigate = useNavigate()
  const isTestPlaying = useEditorStore(state => state.isTestPlaying)
  const setTestPlaying = useEditorStore(state => state.setTestPlaying)

  // 테스트 플레이 모드
  if (isTestPlaying) {
    return (
      <div className="w-screen h-screen bg-slate-900 overflow-hidden">
        <TestPlayCanvas onExit={() => setTestPlaying(false)} />
      </div>
    )
  }

  return (
    <div className="w-screen h-screen bg-slate-900 overflow-hidden relative">
      {/* 3D Canvas */}
      <EditorCanvas />

      {/* UI Overlay */}
      <EditorUI onExit={() => navigate('/home')} />
    </div>
  )
}

export default MapEditor
