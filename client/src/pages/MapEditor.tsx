import { useNavigate } from 'react-router-dom'
import { useEditorStore } from '../stores/editorStore'
import { EditorCanvas } from '../components/editor/EditorCanvas'
import { EditorUI } from '../components/editor/EditorUI'

function MapEditor() {
  const navigate = useNavigate()
  const isTestPlaying = useEditorStore(state => state.isTestPlaying)
  const setTestPlaying = useEditorStore(state => state.setTestPlaying)

  // Test play overlay
  if (isTestPlaying) {
    return (
      <div className="w-screen h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Test Play Mode</h2>
          <p className="text-white/60 mb-6">Test play will be implemented with character controllers.</p>
          <button
            onClick={() => setTestPlaying(false)}
            className="px-6 py-3 bg-red-500 hover:bg-red-400 text-white font-medium rounded-xl transition-colors"
          >
            Exit Test Play (ESC)
          </button>
        </div>
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
