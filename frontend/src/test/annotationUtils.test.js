import { describe, it, expect } from 'vitest'
import {
  DEFAULT_STYLES,
  extractStyles,
  applyStyles,
  getBoundingBox,
  moveAnnotation,
  resizeAnnotation,
  hitTest,
  createDefaultAnnotation,
  drawAnnotation
} from '../components/annotationUtils.js'

describe('extractStyles', () => {
  it('应正确提取已有样式', () => {
    const data = { x: 10, y: 20, color: '#ff0000', thickness: 5, opacity: 0.7, x2: 30, y2: 40 }
    expect(extractStyles(data)).toEqual({
      color: '#ff0000',
      thickness: 5,
      opacity: 0.7
    })
  })

  it('缺少样式字段时应返回默认值', () => {
    const data = { x: 10, y: 20 }
    expect(extractStyles(data)).toEqual(DEFAULT_STYLES)
  })

  it('opacity 为 0 时不应回退到默认值', () => {
    const data = { x: 10, y: 20, color: '#000', thickness: 2, opacity: 0 }
    const result = extractStyles(data)
    expect(result.opacity).toBe(0)
  })
})

describe('applyStyles', () => {
  it('应合并样式并保留其他字段', () => {
    const data = { x: 10, y: 20, color: '#ff0000', thickness: 2, opacity: 1, x2: 30, y2: 40 }
    const styles = { color: '#00ff00', thickness: 5, opacity: 0.5 }
    const result = applyStyles(data, styles)
    expect(result).toEqual({
      x: 10, y: 20, x2: 30, y2: 40,
      color: '#00ff00',
      thickness: 5,
      opacity: 0.5
    })
  })

  it('原数据不应被修改', () => {
    const data = { x: 10, y: 20, color: '#ff0000' }
    const styles = { color: '#0000ff' }
    applyStyles(data, styles)
    expect(data.color).toBe('#ff0000')
  })
})

describe('getBoundingBox', () => {
  it('矩形：支持 x2<x 的反向坐标', () => {
    const ann = { type: 'rect', data: { x: 100, y: 50, x2: 20, y2: 10 } }
    expect(getBoundingBox(ann)).toEqual({ x: 20, y: 10, w: 80, h: 40 })
  })

  it('椭圆：中心+半径', () => {
    const ann = { type: 'ellipse', data: { cx: 50, cy: 40, rx: 30, ry: 20 } }
    expect(getBoundingBox(ann)).toEqual({ x: 20, y: 20, w: 60, h: 40 })
  })

  it('箭头：取两个端点的包围盒', () => {
    const ann = { type: 'arrow', data: { x: 0, y: 0, x2: 100, y2: 50 } }
    expect(getBoundingBox(ann)).toEqual({ x: 0, y: 0, w: 100, h: 50 })
  })

  it('自由画笔：取所有点的包围盒', () => {
    const ann = {
      type: 'freehand',
      data: { points: [[0, 0], [10, 20], [30, 5], [5, 40]] }
    }
    expect(getBoundingBox(ann)).toEqual({ x: 0, y: 0, w: 30, h: 40 })
  })
})

describe('moveAnnotation', () => {
  it('矩形：应正确平移两个对角点', () => {
    const ann = { type: 'rect', data: { x: 10, y: 20, x2: 30, y2: 40 } }
    const result = moveAnnotation(ann, 5, -10)
    expect(result).toEqual({ x: 15, y: 10, x2: 35, y2: 30 })
  })

  it('椭圆：应平移中心点', () => {
    const ann = { type: 'ellipse', data: { cx: 50, cy: 40, rx: 10, ry: 5 } }
    const result = moveAnnotation(ann, 10, 20)
    expect(result).toEqual({ cx: 60, cy: 60, rx: 10, ry: 5 })
  })

  it('自由画笔：应平移所有点', () => {
    const ann = { type: 'freehand', data: { points: [[0, 0], [10, 10], [20, 20]] } }
    const result = moveAnnotation(ann, 5, 5)
    expect(result.points).toEqual([[5, 5], [15, 15], [25, 25]])
  })

  it('原数据不应被修改', () => {
    const ann = { type: 'rect', data: { x: 0, y: 0, x2: 10, y2: 10 } }
    moveAnnotation(ann, 5, 5)
    expect(ann.data.x).toBe(0)
  })
})

describe('resizeAnnotation', () => {
  it('矩形：拖拽右下角手柄放大', () => {
    const ann = { type: 'rect', data: { x: 10, y: 10, x2: 50, y2: 50 } }
    const orig = JSON.parse(JSON.stringify(ann.data))
    const result = resizeAnnotation(ann, 'se', 100, 80, orig)
    expect(result.x).toBe(10)
    expect(result.y).toBe(10)
    expect(result.x2).toBe(100)
    expect(result.y2).toBe(80)
  })

  it('矩形：拖拽左上角手柄', () => {
    const ann = { type: 'rect', data: { x: 10, y: 10, x2: 50, y2: 50 } }
    const orig = JSON.parse(JSON.stringify(ann.data))
    const result = resizeAnnotation(ann, 'nw', 0, 0, orig)
    expect(result.x).toBe(0)
    expect(result.y).toBe(0)
    expect(result.x2).toBe(50)
    expect(result.y2).toBe(50)
  })

  it('椭圆：拖拽右中手柄增加宽度', () => {
    const ann = { type: 'ellipse', data: { cx: 50, cy: 50, rx: 20, ry: 15 } }
    const orig = JSON.parse(JSON.stringify(ann.data))
    const result = resizeAnnotation(ann, 'e', 90, 50, orig)
    expect(result.cx).toBe(60)
    expect(result.rx).toBe(30)
    expect(result.cy).toBe(50)
    expect(result.ry).toBe(15)
  })
})

describe('hitTest', () => {
  it('点在矩形内部应命中', () => {
    const ann = { type: 'rect', data: { x: 10, y: 10, x2: 50, y2: 50 } }
    expect(hitTest(ann, 30, 30)).toBe(true)
  })

  it('点在矩形外部不应命中', () => {
    const ann = { type: 'rect', data: { x: 10, y: 10, x2: 50, y2: 50 } }
    expect(hitTest(ann, 100, 100)).toBe(false)
  })

  it('点在边缘附近（padding 内）应命中', () => {
    const ann = { type: 'rect', data: { x: 10, y: 10, x2: 50, y2: 50 } }
    expect(hitTest(ann, 54, 30)).toBe(true)
  })
})

describe('createDefaultAnnotation', () => {
  it('应生成矩形默认结构', () => {
    const data = createDefaultAnnotation('rect', 10, 20, DEFAULT_STYLES)
    expect(data.x).toBe(10)
    expect(data.y).toBe(20)
    expect(data.x2).toBe(10)
    expect(data.y2).toBe(20)
    expect(data.color).toBe(DEFAULT_STYLES.color)
  })

  it('应生成文字默认结构并包含占位文字', () => {
    const data = createDefaultAnnotation('text', 10, 20, DEFAULT_STYLES)
    expect(data.text).toBe('输入文字')
    expect(data.fontSize).toBe(16)
  })

  it('应生成椭圆默认结构', () => {
    const data = createDefaultAnnotation('ellipse', 50, 40, DEFAULT_STYLES)
    expect(data.cx).toBe(50)
    expect(data.cy).toBe(40)
    expect(data.rx).toBe(0)
    expect(data.ry).toBe(0)
  })
})

describe('drawAnnotation', () => {
  function createMockCtx() {
    const calls = []
    const handler = {
      get: (target, prop) => {
        if (prop === 'measureText') {
          return (text) => ({ width: text.length * 10 })
        }
        return (...args) => {
          calls.push({ method: prop, args })
          return new Proxy({}, handler)
        }
      }
    }
    return { ctx: new Proxy({}, handler), calls }
  }

  it('绘制矩形时应调用 strokeRect', () => {
    const { ctx, calls } = createMockCtx()
    const ann = { type: 'rect', data: { x: 0, y: 0, x2: 100, y2: 50, color: '#f00', thickness: 2, opacity: 1 } }
    drawAnnotation(ctx, ann)
    const strokeRectCall = calls.find(c => c.method === 'strokeRect')
    expect(strokeRectCall).toBeTruthy()
    expect(strokeRectCall.args).toEqual([0, 0, 100, 50])
  })

  it('绘制箭头时应包含 moveTo 和 fill（箭头头部）', () => {
    const { ctx, calls } = createMockCtx()
    const ann = { type: 'arrow', data: { x: 0, y: 0, x2: 100, y2: 0, color: '#f00', thickness: 2, opacity: 1 } }
    drawAnnotation(ctx, ann)
    expect(calls.some(c => c.method === 'moveTo')).toBe(true)
    expect(calls.some(c => c.method === 'fill')).toBe(true)
  })

  it('绘制高亮时应调用 fillRect 而非 strokeRect', () => {
    const { ctx, calls } = createMockCtx()
    const ann = { type: 'highlight', data: { x: 0, y: 0, x2: 100, y2: 50, color: '#ff0', thickness: 2, opacity: 0.5 } }
    drawAnnotation(ctx, ann)
    expect(calls.some(c => c.method === 'fillRect')).toBe(true)
    expect(calls.some(c => c.method === 'strokeRect')).toBe(false)
  })
})
