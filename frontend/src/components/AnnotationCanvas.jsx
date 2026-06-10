import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  batchCreateAnnotations,
  exportAnnotations
} from '../api.js'

const TOOLS = [
  { id: 'select', name: '选择', icon: '↖' },
  { id: 'text', name: '文字', icon: 'T' },
  { id: 'arrow', name: '箭头', icon: '→' },
  { id: 'rect', name: '矩形', icon: '▭' },
  { id: 'ellipse', name: '椭圆', icon: '○' },
  { id: 'highlight', name: '高亮', icon: '▨' },
  { id: 'freehand', name: '画笔', icon: '✎' }
]

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#ffffff']
const THICKNESSES = [1, 2, 3, 5, 8]
const OPACITIES = [0.3, 0.5, 0.7, 1.0]

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

function createDefaultAnnotation(type, x, y, styles) {
  const base = {
    x,
    y,
    ...styles
  }
  switch (type) {
    case 'text':
      return { ...base, text: '输入文字', fontSize: 16 }
    case 'arrow':
    case 'rect':
    case 'highlight':
      return { ...base, x2: x, y2: y }
    case 'ellipse':
      return { ...base, rx: 0, ry: 0, cx: x, cy: y }
    case 'freehand':
      return { ...base, points: [[x, y]] }
    default:
      return base
  }
}

export default function AnnotationCanvas({ screenshotId, imageSrc, imageWidth, imageHeight, onClose }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)
  const [scale, setScale] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [annotations, setAnnotations] = useState([])
  const [pendingAnnotations, setPendingAnnotations] = useState([])
  const [activeTool, setActiveTool] = useState('select')
  const [selectedId, setSelectedId] = useState(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingAnnotation, setDrawingAnnotation] = useState(null)
  const [editingTextId, setEditingTextId] = useState(null)
  const [styles, setStyles] = useState({
    color: '#ef4444',
    thickness: 3,
    opacity: 1.0
  })
  const [clipboard, setClipboard] = useState(null)
  const fileInputRef = useRef(null)

  const updateTransform = useCallback(() => {
    if (!containerRef.current) return
    const container = containerRef.current
    const cw = container.clientWidth
    const ch = container.clientHeight
    const s = Math.min(cw / imageWidth, ch / imageHeight, 1)
    const ox = (cw - imageWidth * s) / 2
    const oy = (ch - imageHeight * s) / 2
    setScale(s)
    setOffsetX(ox)
    setOffsetY(oy)
  }, [imageWidth, imageHeight])

  useEffect(() => {
    updateTransform()
    window.addEventListener('resize', updateTransform)
    return () => window.removeEventListener('resize', updateTransform)
  }, [updateTransform])

  useEffect(() => {
    if (!screenshotId) return
    getAnnotations(screenshotId).then(res => {
      setAnnotations(res.data)
    }).catch(err => {
      console.error('加载标注失败:', err)
    })
  }, [screenshotId])

  const screenToImage = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - offsetX) / scale
    const y = (clientY - rect.top - offsetY) / scale
    return { x, y }
  }, [scale, offsetX, offsetY])

  const imageToScreen = useCallback((x, y) => {
    return {
      x: x * scale + offsetX,
      y: y * scale + offsetY
    }
  }, [scale, offsetX, offsetY])

  const drawAnnotation = useCallback((ctx, ann, isSelected = false) => {
    const d = ann.data
    ctx.save()
    ctx.globalAlpha = d.opacity ?? 1.0
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    switch (ann.type) {
      case 'rect':
        ctx.strokeStyle = d.color
        ctx.lineWidth = d.thickness
        ctx.strokeRect(
          Math.min(d.x, d.x2),
          Math.min(d.y, d.y2),
          Math.abs(d.x2 - d.x),
          Math.abs(d.y2 - d.y)
        )
        break
      case 'highlight':
        ctx.fillStyle = d.color
        ctx.globalAlpha = (d.opacity ?? 1.0) * 0.4
        ctx.fillRect(
          Math.min(d.x, d.x2),
          Math.min(d.y, d.y2),
          Math.abs(d.x2 - d.x),
          Math.abs(d.y2 - d.y)
        )
        break
      case 'ellipse':
        ctx.strokeStyle = d.color
        ctx.lineWidth = d.thickness
        ctx.beginPath()
        ctx.ellipse(d.cx, d.cy, Math.abs(d.rx), Math.abs(d.ry), 0, 0, Math.PI * 2)
        ctx.stroke()
        break
      case 'arrow': {
        const angle = Math.atan2(d.y2 - d.y, d.x2 - d.x)
        const headLen = 10 + d.thickness * 2
        ctx.strokeStyle = d.color
        ctx.fillStyle = d.color
        ctx.lineWidth = d.thickness
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x2, d.y2)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(d.x2, d.y2)
        ctx.lineTo(d.x2 - headLen * Math.cos(angle - Math.PI / 6), d.y2 - headLen * Math.sin(angle - Math.PI / 6))
        ctx.lineTo(d.x2 - headLen * Math.cos(angle + Math.PI / 6), d.y2 - headLen * Math.sin(angle + Math.PI / 6))
        ctx.closePath()
        ctx.fill()
        break
      }
      case 'text':
        ctx.fillStyle = d.color
        ctx.font = `${d.fontSize || 16}px sans-serif`
        ctx.fillText(d.text, d.x, d.y)
        if (isSelected) {
          const metrics = ctx.measureText(d.text)
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 1
          ctx.setLineDash([4, 4])
          ctx.globalAlpha = 1
          ctx.strokeRect(d.x - 2, d.y - (d.fontSize || 16), metrics.width + 4, (d.fontSize || 16) + 6)
        }
        break
      case 'freehand':
        if (d.points && d.points.length > 1) {
          ctx.strokeStyle = d.color
          ctx.lineWidth = d.thickness
          ctx.beginPath()
          ctx.moveTo(d.points[0][0], d.points[0][1])
          for (let i = 1; i < d.points.length; i++) {
            ctx.lineTo(d.points[i][0], d.points[i][1])
          }
          ctx.stroke()
        }
        break
    }

    if (isSelected && ann.type !== 'text') {
      ctx.restore()
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.globalAlpha = 1
      const bbox = getBoundingBox(ann)
      ctx.strokeRect(bbox.x - 4, bbox.y - 4, bbox.w + 8, bbox.h + 8)
    }
    ctx.restore()
  }, [])

  const getBoundingBox = (ann) => {
    const d = ann.data
    switch (ann.type) {
      case 'rect':
      case 'highlight':
        return {
          x: Math.min(d.x, d.x2),
          y: Math.min(d.y, d.y2),
          w: Math.abs(d.x2 - d.x),
          h: Math.abs(d.y2 - d.y)
        }
      case 'ellipse':
        return {
          x: d.cx - Math.abs(d.rx),
          y: d.cy - Math.abs(d.ry),
          w: Math.abs(d.rx) * 2,
          h: Math.abs(d.ry) * 2
        }
      case 'arrow':
        return {
          x: Math.min(d.x, d.x2),
          y: Math.min(d.y, d.y2),
          w: Math.abs(d.x2 - d.x),
          h: Math.abs(d.y2 - d.y)
        }
      case 'text': {
        const canvas = canvasRef.current
        const ctx = canvas?.getContext('2d')
        const metrics = ctx ? ctx.measureText(d.text) : { width: 100 }
        return {
          x: d.x,
          y: d.y - (d.fontSize || 16),
          w: metrics.width || 100,
          h: (d.fontSize || 16) + 4
        }
      }
      case 'freehand': {
        if (!d.points || d.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const [px, py] of d.points) {
          minX = Math.min(minX, px)
          minY = Math.min(minY, py)
          maxX = Math.max(maxX, px)
          maxY = Math.max(maxY, py)
        }
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
      }
      default:
        return { x: 0, y: 0, w: 0, h: 0 }
    }
  }

  const hitTest = useCallback((ann, x, y) => {
    const bbox = getBoundingBox(ann)
    return x >= bbox.x - 6 && x <= bbox.x + bbox.w + 6 &&
           y >= bbox.y - 6 && y <= bbox.y + bbox.h + 6
  }, [])

  const render = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.clientWidth * dpr
    canvas.height = canvas.clientHeight * dpr
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    ctx.save()
    ctx.translate(offsetX, offsetY)
    ctx.scale(scale, scale)
    for (const ann of annotations) {
      drawAnnotation(ctx, ann, ann.id === selectedId)
    }
    for (const ann of pendingAnnotations) {
      drawAnnotation(ctx, ann, ann.id === selectedId)
    }
    if (drawingAnnotation) {
      drawAnnotation(ctx, drawingAnnotation, true)
    }
    ctx.restore()
  }, [annotations, pendingAnnotations, drawingAnnotation, selectedId, scale, offsetX, offsetY, drawAnnotation])

  useEffect(() => {
    render()
  }, [render])

  const saveAnnotation = async (tempAnn) => {
    try {
      const res = await createAnnotation(screenshotId, { type: tempAnn.type, data: tempAnn.data })
      setAnnotations(prev => [...prev, res.data])
      setPendingAnnotations(prev => prev.filter(a => a.id !== tempAnn.id))
      return res.data
    } catch (err) {
      console.error('保存标注失败:', err)
      return null
    }
  }

  const handleMouseDown = (e) => {
    if (editingTextId) return
    const { x, y } = screenToImage(e.clientX, e.clientY)

    if (activeTool === 'select') {
      let found = null
      for (let i = annotations.length - 1; i >= 0; i--) {
        if (hitTest(annotations[i], x, y)) {
          found = annotations[i]
          break
        }
      }
      setSelectedId(found ? found.id : null)
      if (found) {
        setIsDrawing(true)
        const bbox = getBoundingBox(found)
        setDrawingAnnotation({
          ...found,
          _drag: {
            offsetX: x - bbox.x,
            offsetY: y - bbox.y,
            originalData: JSON.parse(JSON.stringify(found.data))
          }
        })
      }
      return
    }

    const tempId = generateId()
    const newAnn = {
      id: tempId,
      type: activeTool,
      data: createDefaultAnnotation(activeTool, x, y, styles)
    }
    setIsDrawing(true)
    setDrawingAnnotation(newAnn)
    if (activeTool === 'text') {
      setPendingAnnotations(prev => [...prev, newAnn])
      setDrawingAnnotation(null)
      setIsDrawing(false)
      setSelectedId(tempId)
      setEditingTextId(tempId)
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing || !drawingAnnotation) return
    const { x, y } = screenToImage(e.clientX, e.clientY)
    const d = drawingAnnotation.data
    const type = drawingAnnotation.type

    if (activeTool === 'select' && drawingAnnotation._drag) {
      const orig = drawingAnnotation._drag.originalData
      const dx = x - (drawingAnnotation._drag.offsetX + getBoundingBox({ data: orig }).x)
      const dy = y - (drawingAnnotation._drag.offsetY + getBoundingBox({ data: orig }).y)
      const newData = JSON.parse(JSON.stringify(orig))
      if (type === 'ellipse') {
        newData.cx = orig.cx + dx
        newData.cy = orig.cy + dy
      } else if (type === 'freehand') {
        newData.points = orig.points.map(([px, py]) => [px + dx, py + dy])
      } else if (type === 'text') {
        newData.x = orig.x + dx
        newData.y = orig.y + dy
      } else {
        newData.x = orig.x + dx
        newData.y = orig.y + dy
        if (orig.x2 !== undefined) newData.x2 = orig.x2 + dx
        if (orig.y2 !== undefined) newData.y2 = orig.y2 + dy
      }
      setDrawingAnnotation({ ...drawingAnnotation, data: newData })
      return
    }

    if (type === 'rect' || type === 'highlight' || type === 'arrow') {
      setDrawingAnnotation({ ...drawingAnnotation, data: { ...d, x2: x, y2: y } })
    } else if (type === 'ellipse') {
      setDrawingAnnotation({
        ...drawingAnnotation,
        data: { ...d, rx: x - d.cx, ry: y - d.cy }
      })
    } else if (type === 'freehand') {
      setDrawingAnnotation({
        ...drawingAnnotation,
        data: { ...d, points: [...d.points, [x, y]] }
      })
    }
  }

  const handleMouseUp = async () => {
    if (!isDrawing || !drawingAnnotation) {
      setIsDrawing(false)
      return
    }
    setIsDrawing(false)

    if (activeTool === 'select') {
      const ann = drawingAnnotation
      if (ann.id && ann.id !== ann._drag?.originalData) {
        try {
          await updateAnnotation(ann.id, { data: ann.data })
          setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, data: ann.data } : a))
        } catch (err) {
          console.error('更新标注失败:', err)
        }
      }
      setDrawingAnnotation(null)
      return
    }

    const type = drawingAnnotation.type
    const d = drawingAnnotation.data
    let valid = true
    if (['rect', 'highlight', 'ellipse', 'arrow'].includes(type)) {
      const bbox = getBoundingBox(drawingAnnotation)
      valid = bbox.w > 3 || bbox.h > 3
    } else if (type === 'freehand') {
      valid = d.points && d.points.length > 2
    }

    if (valid) {
      await saveAnnotation(drawingAnnotation)
    }
    setDrawingAnnotation(null)
    setPendingAnnotations(prev => prev.filter(a => a.id !== drawingAnnotation.id))
  }

  const handleTextChange = async (id, newText) => {
    const ann = pendingAnnotations.find(a => a.id === id) || annotations.find(a => a.id === id)
    if (!ann) return
    const newData = { ...ann.data, text: newText }
    if (pendingAnnotations.find(a => a.id === id)) {
      setPendingAnnotations(prev => prev.map(a => a.id === id ? { ...a, data: newData } : a))
    }
    if (annotations.find(a => a.id === id) && typeof id === 'number') {
      try {
        await updateAnnotation(id, { data: newData })
        setAnnotations(prev => prev.map(a => a.id === id ? { ...a, data: newData } : a))
      } catch (err) {
        console.error('更新文字失败:', err)
      }
    }
  }

  const handleTextBlur = async (id) => {
    const tempAnn = pendingAnnotations.find(a => a.id === id)
    if (tempAnn) {
      await saveAnnotation(tempAnn)
    }
    setEditingTextId(null)
  }

  const handleDeleteSelected = async () => {
    if (!selectedId) return
    if (pendingAnnotations.find(a => a.id === selectedId)) {
      setPendingAnnotations(prev => prev.filter(a => a.id !== selectedId))
      setSelectedId(null)
      return
    }
    try {
      await deleteAnnotation(selectedId)
      setAnnotations(prev => prev.filter(a => a.id !== selectedId))
      setSelectedId(null)
    } catch (err) {
      console.error('删除标注失败:', err)
    }
  }

  const handleCopy = () => {
    const ann = annotations.find(a => a.id === selectedId)
    if (ann) {
      setClipboard(JSON.parse(JSON.stringify(ann)))
    }
  }

  const handlePaste = async () => {
    if (!clipboard) return
    const offset = 20
    const newData = JSON.parse(JSON.stringify(clipboard.data))
    if (newData.x2 !== undefined) {
      newData.x += offset
      newData.y += offset
      newData.x2 += offset
      newData.y2 += offset
    } else if (newData.cx !== undefined) {
      newData.cx += offset
      newData.cy += offset
    } else if (newData.points) {
      newData.points = newData.points.map(([x, y]) => [x + offset, y + offset])
    } else {
      newData.x += offset
      newData.y += offset
    }
    try {
      const res = await createAnnotation(screenshotId, { type: clipboard.type, data: newData })
      setAnnotations(prev => [...prev, res.data])
      setSelectedId(res.data.id)
    } catch (err) {
      console.error('粘贴失败:', err)
    }
  }

  const handleExport = async () => {
    try {
      const res = await exportAnnotations(screenshotId)
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `annotations-${screenshotId}.json`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('导出失败:', err)
      alert('导出失败: ' + err.message)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const imported = JSON.parse(text)
      if (!imported.annotations || !Array.isArray(imported.annotations)) {
        throw new Error('无效的导入格式')
      }
      const scaleRatioX = imageWidth && imported.screenshot?.width ? imageWidth / imported.screenshot.width : 1
      const scaleRatioY = imageHeight && imported.screenshot?.height ? imageHeight / imported.screenshot.height : 1
      const scaledAnns = imported.annotations.map(ann => {
        const d = JSON.parse(JSON.stringify(ann.data))
        const scaleCoord = (val, ratio) => Math.round(val * ratio)
        if (d.x !== undefined) d.x = scaleCoord(d.x, scaleRatioX)
        if (d.y !== undefined) d.y = scaleCoord(d.y, scaleRatioY)
        if (d.x2 !== undefined) d.x2 = scaleCoord(d.x2, scaleRatioX)
        if (d.y2 !== undefined) d.y2 = scaleCoord(d.y2, scaleRatioY)
        if (d.cx !== undefined) d.cx = scaleCoord(d.cx, scaleRatioX)
        if (d.cy !== undefined) d.cy = scaleCoord(d.cy, scaleRatioY)
        if (d.rx !== undefined) d.rx = scaleCoord(d.rx, scaleRatioX)
        if (d.ry !== undefined) d.ry = scaleCoord(d.ry, scaleRatioY)
        if (d.points) d.points = d.points.map(([x, y]) => [scaleCoord(x, scaleRatioX), scaleCoord(y, scaleRatioY)])
        return { type: ann.type, data: d }
      })
      const res = await batchCreateAnnotations(screenshotId, scaledAnns)
      setAnnotations(prev => [...prev, ...res.data])
      alert(`成功导入 ${res.data.length} 个标注`)
    } catch (err) {
      console.error('导入失败:', err)
      alert('导入失败: ' + err.message)
    }
    e.target.value = ''
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingTextId) return
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        handleCopy()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        handlePaste()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && activeTool === 'select') {
        handleDeleteSelected()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        setActiveTool('select')
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, clipboard, activeTool, editingTextId, annotations, screenshotId])

  const selectedAnnotation = annotations.find(a => a.id === selectedId) || pendingAnnotations.find(a => a.id === selectedId)

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="bg-gray-900 px-4 py-3 flex justify-between items-center gap-4 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="text-white hover:text-gray-300 text-xl px-2">←</button>
          <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1">
            {TOOLS.map(tool => (
              <button
                key={tool.id}
                onClick={() => setActiveTool(tool.id)}
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
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">颜色:</span>
            <div className="flex gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setStyles(s => ({ ...s, color: c }))}
                  className={`w-6 h-6 rounded border-2 transition-transform hover:scale-110 ${
                    styles.color === c ? 'border-white scale-110' : 'border-gray-600'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">粗细:</span>
            <select
              value={styles.thickness}
              onChange={(e) => setStyles(s => ({ ...s, thickness: Number(e.target.value) }))}
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
              onChange={(e) => setStyles(s => ({ ...s, opacity: Number(e.target.value) }))}
              className="bg-gray-800 text-white text-sm px-2 py-1 rounded border border-gray-600"
            >
              {OPACITIES.map(o => (
                <option key={o} value={o}>{Math.round(o * 100)}%</option>
              ))}
            </select>
          </div>
          <div className="h-6 w-px bg-gray-700" />
          <button
            onClick={handleCopy}
            disabled={!selectedId}
            className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded hover:bg-gray-600 disabled:opacity-40"
          >
            复制
          </button>
          <button
            onClick={handlePaste}
            disabled={!clipboard}
            className="text-sm bg-gray-700 text-white px-3 py-1.5 rounded hover:bg-gray-600 disabled:opacity-40"
          >
            粘贴
          </button>
          <button
            onClick={handleDeleteSelected}
            disabled={!selectedId}
            className="text-sm bg-red-600 text-white px-3 py-1.5 rounded hover:bg-red-700 disabled:opacity-40"
          >
            删除
          </button>
          <div className="h-6 w-px bg-gray-700" />
          <button
            onClick={handleExport}
            className="text-sm bg-green-600 text-white px-3 py-1.5 rounded hover:bg-green-700"
          >
            导出
          </button>
          <button
            onClick={handleImportClick}
            className="text-sm bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700"
          >
            导入
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportFile}
          />
        </div>
      </div>
      <div ref={containerRef} className="flex-1 overflow-auto relative">
        <div
          ref={overlayRef}
          className="relative"
          style={{
            width: imageWidth * scale,
            height: imageHeight * scale,
            marginLeft: offsetX,
            marginTop: offsetY
          }}
        >
          <img
            src={imageSrc}
            alt="screenshot"
            style={{ width: '100%', height: '100%', display: 'block', pointerEvents: 'none' }}
            draggable={false}
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              cursor: activeTool === 'select' ? (selectedId ? 'move' : 'default') : 'crosshair'
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
          {editingTextId && selectedAnnotation && selectedAnnotation.type === 'text' && (
            <input
              type="text"
              autoFocus
              defaultValue={selectedAnnotation.data.text}
              onChange={(e) => handleTextChange(editingTextId, e.target.value)}
              onBlur={() => handleTextBlur(editingTextId)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
                if (e.key === 'Escape') e.target.blur()
              }}
              className="absolute border-none outline-none bg-transparent"
              style={{
                left: imageToScreen(selectedAnnotation.data.x, selectedAnnotation.data.y).x,
                top: imageToScreen(selectedAnnotation.data.x, selectedAnnotation.data.y).y - (selectedAnnotation.data.fontSize || 16),
                fontSize: (selectedAnnotation.data.fontSize || 16) * scale,
                color: selectedAnnotation.data.color,
                minWidth: 100 * scale,
                transformOrigin: 'top left'
              }}
            />
          )}
        </div>
      </div>
      <div className="bg-gray-900 px-4 py-2 flex justify-between items-center text-xs text-gray-400 border-t border-gray-700">
        <div>
          标注数量: <span className="text-white font-medium">{annotations.length}</span>
          {selectedId && <span className="ml-4">已选中 ID: <span className="text-white font-medium">{selectedId}</span></span>}
        </div>
        <div>
          缩放: <span className="text-white font-medium">{Math.round(scale * 100)}%</span>
          <span className="mx-3">|</span>
          快捷键: Ctrl+C 复制 | Ctrl+V 粘贴 | Delete 删除 | Esc 取消
        </div>
      </div>
    </div>
  )
}
