export const TOOLS = [
  { id: 'select', name: '选择', icon: '↖' },
  { id: 'text', name: '文字', icon: 'T' },
  { id: 'arrow', name: '箭头', icon: '→' },
  { id: 'rect', name: '矩形', icon: '▭' },
  { id: 'ellipse', name: '椭圆', icon: '○' },
  { id: 'highlight', name: '高亮', icon: '▨' },
  { id: 'freehand', name: '画笔', icon: '✎' }
]

export const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#ffffff']
export const THICKNESSES = [1, 2, 3, 5, 8]
export const OPACITIES = [0.3, 0.5, 0.7, 1.0]

export const DEFAULT_STYLES = {
  color: '#ef4444',
  thickness: 3,
  opacity: 1.0
}

export const RESIZE_HANDLES = [
  { id: 'nw', cursor: 'nwse-resize', x: 0, y: 0 },
  { id: 'n', cursor: 'ns-resize', x: 0.5, y: 0 },
  { id: 'ne', cursor: 'nesw-resize', x: 1, y: 0 },
  { id: 'w', cursor: 'ew-resize', x: 0, y: 0.5 },
  { id: 'e', cursor: 'ew-resize', x: 1, y: 0.5 },
  { id: 'sw', cursor: 'nesw-resize', x: 0, y: 1 },
  { id: 's', cursor: 'ns-resize', x: 0.5, y: 1 },
  { id: 'se', cursor: 'nwse-resize', x: 1, y: 1 }
]

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}

export function createDefaultAnnotation(type, x, y, styles) {
  const base = { x, y, ...styles }
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

export function getBoundingBox(ann, ctx = null) {
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

export function drawAnnotation(ctx, ann, isSelected = false) {
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
}

export function hitTest(ann, x, y, ctx = null) {
  const bbox = getBoundingBox(ann, ctx)
  return x >= bbox.x - 6 && x <= bbox.x + bbox.w + 6 &&
         y >= bbox.y - 6 && y <= bbox.y + bbox.h + 6
}

export function getResizeHandleAt(ann, x, y, ctx = null) {
  const bbox = getBoundingBox(ann, ctx)
  const handleSize = 8
  for (const handle of RESIZE_HANDLES) {
    const hx = bbox.x - 4 + bbox.w * handle.x + 8 * (handle.x - 0.5)
    const hy = bbox.y - 4 + bbox.h * handle.y + 8 * (handle.y - 0.5)
    if (x >= hx - handleSize && x <= hx + handleSize &&
        y >= hy - handleSize && y <= hy + handleSize) {
      return handle
    }
  }
  return null
}

export function moveAnnotation(ann, dx, dy) {
  const d = JSON.parse(JSON.stringify(ann.data))
  if (ann.type === 'ellipse') {
    d.cx += dx
    d.cy += dy
  } else if (ann.type === 'freehand') {
    d.points = d.points.map(([px, py]) => [px + dx, py + dy])
  } else if (ann.type === 'text') {
    d.x += dx
    d.y += dy
  } else {
    d.x += dx
    d.y += dy
    if (d.x2 !== undefined) d.x2 += dx
    if (d.y2 !== undefined) d.y2 += dy
  }
  return d
}

export function resizeAnnotation(ann, handleId, newX, newY, origData, ctx = null) {
  const d = JSON.parse(JSON.stringify(origData))
  const bbox = getBoundingBox({ ...ann, data: origData }, ctx)
  let left = bbox.x
  let top = bbox.y
  let right = bbox.x + bbox.w
  let bottom = bbox.y + bbox.h

  if (handleId.includes('w')) left = newX
  if (handleId.includes('e')) right = newX
  if (handleId.includes('n')) top = newY
  if (handleId.includes('s')) bottom = newY

  if (ann.type === 'rect' || ann.type === 'highlight' || ann.type === 'arrow') {
    const origLeft = Math.min(origData.x, origData.x2)
    const origTop = Math.min(origData.y, origData.y2)
    const xFlipped = origData.x !== origLeft
    const yFlipped = origData.y !== origTop
    d.x = xFlipped ? right : left
    d.y = yFlipped ? bottom : top
    d.x2 = xFlipped ? left : right
    d.y2 = yFlipped ? top : bottom
  } else if (ann.type === 'ellipse') {
    d.cx = (left + right) / 2
    d.cy = (top + bottom) / 2
    d.rx = (right - left) / 2
    d.ry = (bottom - top) / 2
  } else if (ann.type === 'text') {
    const fontSize = Math.max(8, Math.round(bottom - top - 4))
    d.fontSize = fontSize
    d.x = left
    d.y = bottom
  } else if (ann.type === 'freehand') {
    if (bbox.w > 0 && bbox.h > 0) {
      const scaleX = (right - left) / bbox.w
      const scaleY = (bottom - top) / bbox.h
      d.points = origData.points.map(([px, py]) => [
        left + (px - bbox.x) * scaleX,
        top + (py - bbox.y) * scaleY
      ])
    }
  }
  return d
}

export function extractStyles(data) {
  return {
    color: data.color || DEFAULT_STYLES.color,
    thickness: data.thickness || DEFAULT_STYLES.thickness,
    opacity: data.opacity ?? DEFAULT_STYLES.opacity
  }
}

export function applyStyles(data, styles) {
  return { ...data, ...styles }
}
