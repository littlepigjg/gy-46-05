import { TOOLS, COLORS, THICKNESSES, OPACITIES } from './annotationUtils.js'

export default function AnnotationToolbar({
  activeTool,
  onToolChange,
  styles,
  onStylesChange,
  hasSelection,
  onCopy,
  onPaste,
  onDelete,
  onExport,
  onImportClick,
  onClose,
  hasClipboard
}) {
  const updateStyle = (key, value) => {
    onStylesChange({ ...styles, [key]: value })
  }

  return (
    <div className="bg-gray-900 px-4 py-3 flex justify-between items-center gap-4 border-b border-gray-700 flex-wrap">
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="text-white hover:text-gray-300 text-xl px-2"
          title="关闭"
        >
          ←
        </button>
        <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
          {TOOLS.map(tool => (
            <button
              key={tool.id}
              onClick={() => onToolChange(tool.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTool === tool.id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-gray-700'
              }`}
              title={tool.name}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">颜色:</span>
          <div className="flex gap-1">
            {COLORS.map(c => (
              <button
                key={c}
                onClick={() => updateStyle('color', c)}
                className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                  styles.color === c ? 'border-white scale-110' : 'border-gray-600'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">粗细:</span>
          <select
            value={styles.thickness}
            onChange={(e) => updateStyle('thickness', Number(e.target.value))}
            className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
          >
            {THICKNESSES.map(t => (
              <option key={t} value={t}>{t}px</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">透明度:</span>
          <select
            value={styles.opacity}
            onChange={(e) => updateStyle('opacity', Number(e.target.value))}
            className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
          >
            {OPACITIES.map(o => (
              <option key={o} value={o}>{Math.round(o * 100)}%</option>
            ))}
          </select>
        </div>

        <div className="h-6 w-px bg-gray-700" />

        <button
          onClick={onCopy}
          disabled={!hasSelection}
          className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Ctrl+C"
        >
          复制
        </button>
        <button
          onClick={onPaste}
          disabled={!hasClipboard}
          className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Ctrl+V"
        >
          粘贴
        </button>
        <button
          onClick={onDelete}
          disabled={!hasSelection}
          className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Delete"
        >
          删除
        </button>

        <div className="h-6 w-px bg-gray-700" />

        <button
          onClick={onExport}
          className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
        >
          导出
        </button>
        <button
          onClick={onImportClick}
          className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
        >
          导入
        </button>
      </div>
    </div>
  )
}
