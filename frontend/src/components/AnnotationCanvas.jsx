import { useState, useEffect, useRef, useCallback } from 'react'
import {
  getAnnotations,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
  batchCreateAnnotations,
  exportAnnotations
} from '../api.js'
import AnnotationToolbar from './AnnotationToolbar.jsx'
import {
  DEFAULT_STYLES,
  RESIZE_HANDLES,
  generateId,
  createDefaultAnnotation,
  getBoundingBox,
  drawAnnotation,
  hitTest,
  getResizeHandleAt,
  moveAnnotation,
  resizeAnnotation,
  extractStyles,
  applyStyles
} from './annotationUtils.js'

export default function AnnotationCanvas({ screenshotId, imageSrc, imageWidth, imageHeight, onClose }) {
  const canvasRef = useRef(null)
  const overlayRef = useRef(null)
  const containerRef = useRef(null)
  const fileInputRef = useRef(null)

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
  const [styles, setStyles] = useState(DEFAULT_STYLES)
  const [clipboard, setClipboard] = useState(null)
  const [interactionMode, setInteractionMode] = useState(null)
  const [activeHandle, setActiveHandle] = useState(null)

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

  const imageToScreen = useCallback((x, y) => ({
    x: x * scale + offsetX,
    y: y * scale + offsetY
  }), [scale, offsetX, offsetY])

  const allAnnotations = [...annotations, ...pendingAnnotations]
  const selectedAnnotation = selectedId
    ? allAnnotations.find(a => a.id === selectedId) || null
    : null

  useEffect(() => {
    if (selectedAnnotation) {
      const s = extractStyles(selectedAnnotation.data)
      setStyles(s)
    }
  }, [selectedId])

  const handleStylesChange = useCallback(async (newStyles) => {
    setStyles(newStyles)
    if (selectedAnnotation) {
      const newData = applyStyles(selectedAnnotation.data, newStyles)
      if (pendingAnnotations.find(a => a.id === selectedAnnotation.id)) {
        setPendingAnnotations(prev => prev.map(a =>
          a.id === selectedAnnotation.id ? { ...a, data: newData } : a
        ))
      }
      if (typeof selectedAnnotation.id === 'number') {
        try {
          await updateAnnotation(selectedAnnotation.id, { data: newData })
          setAnnotations(prev => prev.map(a =>
            a.id === selectedAnnotation.id ? { ...a, data: newData } : a
          ))
        } catch (err) {
          console.error('更新样式失败:', err)
        }
      }
    }
  }, [selectedAnnotation, pendingAnnotations])

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
    if (selectedAnnotation && activeTool === 'select' && !isDrawing) {
      const bbox = getBoundingBox(selectedAnnotation, ctx)
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 2 / scale
      ctx.setLineDash([6 / scale, 4 / scale])
      ctx.globalAlpha = 1
      ctx.strokeRect(bbox.x - 4, bbox.y - 4, bbox.w + 8, bbox.h + 8)
      for (const handle of RESIZE_HANDLES) {
        const hx = bbox.x - 4 + bbox.w * handle.x + 8 * (handle.x - 0.5)
        const hy = bbox.y - 4 + bbox.h * handle.y + 8 * (handle.y - 0.5)
        ctx.setLineDash([])
        ctx.fillStyle = '#ffffff'
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 1.5 / scale
        const hs = 8 / scale
        ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs)
        ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs)
      }
    }
    ctx.restore()
  }, [annotations, pendingAnnotations, drawingAnnotation, selectedId, selectedAnnotation,
      activeTool, isDrawing, scale, offsetX, offsetY])

  useEffect(() => {
    render()
  }, [render])

  const saveAnnotation = async (tempAnn) => {
    try {
      const res = await createAnnotation(screenshotId, { type: tempAnn.type, data: tempAnn.data })
      setAnnotations(prev => [...prev, res.data])
      setPendingAnnotations(prev => prev.filter(a => a.id !== tempAnn.id))
      if (selectedId === tempAnn.id) {
        setSelectedId(res.data.id)
      }
      return res.data
    } catch (err) {
      console.error('保存标注失败:', err)
      return null
    }
  }

  const findAnnotationAt = (x, y) => {
    const ctx = canvasRef.current?.getContext('2d') || null
    for (let i = allAnnotations.length - 1; i >= 0; i--) {
      if (hitTest(allAnnotations[i], x, y, ctx)) {
        return allAnnotations[i]
      }
    }
    return null
  }

  const handleMouseDown = (e) => {
    if (editingTextId) return
    const { x, y } = screenToImage(e.clientX, e.clientY)
    const ctx = canvasRef.current?.getContext('2d') || null

    if (activeTool === 'select' && selectedAnnotation) {
      const handle = getResizeHandleAt(selectedAnnotation, x, y, ctx)
      if (handle) {
        setIsDrawing(true)
        setInteractionMode('resize')
        setActiveHandle(handle.id)
        setDrawingAnnotation({
          ...selectedAnnotation,
          _drag: { originalData: JSON.parse(JSON.stringify(selectedAnnotation.data)) }
        })
        return
      }
    }

    if (activeTool === 'select') {
      const found = findAnnotationAt(x, y)
      setSelectedId(found ? found.id : null)
      if (found) {
        setIsDrawing(true)
        setInteractionMode('move')
        const bbox = getBoundingBox(found, ctx)
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
    setInteractionMode('create')
    setDrawingAnnotation(newAnn)
    if (activeTool === 'text') {
      setPendingAnnotations(prev => [...prev, newAnn])
      setDrawingAnnotation(null)
      setIsDrawing(false)
      setInteractionMode(null)
      setSelectedId(tempId)
      setEditingTextId(tempId)
      setActiveTool('select')
    }
  }

  const handleMouseMove = (e) => {
    if (!isDrawing || !drawingAnnotation) return
    const { x, y } = screenToImage(e.clientX, e.clientY)
    const type = drawingAnnotation.type
    const d = drawingAnnotation.data
    const ctx = canvasRef.current?.getContext('2d') || null

    if (interactionMode === 'move' && drawingAnnotation._drag) {
      const orig = drawingAnnotation._drag.originalData
      const bbox = getBoundingBox({ data: orig }, ctx)
      const dx = x - (drawingAnnotation._drag.offsetX + bbox.x)
      const dy = y - (drawingAnnotation._drag.offsetY + bbox.y)
      setDrawingAnnotation({ ...drawingAnnotation, data: moveAnnotation(drawingAnnotation, dx, dy) })
      return
    }

    if (interactionMode === 'resize' && drawingAnnotation._drag) {
      const newData = resizeAnnotation(
        drawingAnnotation,
        activeHandle,
        x,
        y,
        drawingAnnotation._drag.originalData,
        ctx
      )
      setDrawingAnnotation({ ...drawingAnnotation, data: newData })
      return
    }

    if (interactionMode === 'create') {
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
  }

  const handleMouseUp = async () => {
    if (!isDrawing || !drawingAnnotation) {
      setIsDrawing(false)
      setInteractionMode(null)
      setActiveHandle(null)
      return
    }
    setIsDrawing(false)

    if (interactionMode === 'move' || interactionMode === 'resize') {
      const ann = drawingAnnotation
      if (ann.id) {
        try {
          await updateAnnotation(ann.id, { data: ann.data })
          setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, data: ann.data } : a))
          setPendingAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, data: ann.data } : a))
        } catch (err) {
          console.error('更新标注失败:', err)
        }
      }
      setDrawingAnnotation(null)
      setInteractionMode(null)
      setActiveHandle(null)
      return
    }

    if (interactionMode === 'create') {
      const type = drawingAnnotation.type
      let valid = true
      const ctx = canvasRef.current?.getContext('2d') || null
      if (['rect', 'highlight', 'ellipse', 'arrow'].includes(type)) {
        const bbox = getBoundingBox(drawingAnnotation, ctx)
        valid = bbox.w > 3 || bbox.h > 3
      } else if (type === 'freehand') {
        valid = drawingAnnotation.data.points && drawingAnnotation.data.points.length > 2
      }
      if (valid) {
        await saveAnnotation(drawingAnnotation)
      }
      setDrawingAnnotation(null)
      setInteractionMode(null)
      setActiveHandle(null)
      setPendingAnnotations(prev => prev.filter(a => a.id !== drawingAnnotation.id))
      setActiveTool('select')
    }
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
      || pendingAnnotations.find(a => a.id === selectedId)
    if (ann) {
      setClipboard(JSON.parse(JSON.stringify(ann)))
    }
  }

  const handlePaste = async () => {
    if (!clipboard) return
    const offset = 20
    const newData = moveAnnotation(clipboard, offset, offset)
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

  const handleToolChange = (toolId) => {
    setActiveTool(toolId)
    if (toolId !== 'select') {
      setSelectedId(null)
      setEditingTextId(null)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (editingTextId) return
      const target = e.target
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        handleCopy()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        handlePaste()
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && activeTool === 'select') {
        handleDeleteSelected()
      } else if (e.key === 'Escape') {
        setSelectedId(null)
        setActiveTool('select')
        setEditingTextId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, clipboard, activeTool, editingTextId, annotations, screenshotId])

  const getCanvasCursor = () => {
    if (activeTool !== 'select') return 'crosshair'
    if (selectedAnnotation && interactionMode === 'resize' && activeHandle) {
      const h = RESIZE_HANDLES.find(r => r.id === activeHandle)
      return h?.cursor || 'default'
    }
    if (selectedId) return 'move'
    return 'default'
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <AnnotationToolbar
        activeTool={activeTool}
        onToolChange={handleToolChange}
        styles={styles}
        onStylesChange={handleStylesChange}
        hasSelection={!!selectedId}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onDelete={handleDeleteSelected}
        onExport={handleExport}
        onImportClick={handleImportClick}
        onClose={onClose}
        hasClipboard={!!clipboard}
      />

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
              cursor: getCanvasCursor()
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
                if (e.key === 'Escape') {
                  e.preventDefault()
                  e.target.blur()
                }
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

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleImportFile}
      />
    </div>
  )
}
