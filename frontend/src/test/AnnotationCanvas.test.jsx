import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'

vi.mock('../api.js', () => ({
  getAnnotations: vi.fn(() => Promise.resolve({
    data: [
      {
        id: 1,
        screenshot_id: 1,
        type: 'rect',
        data: { x: 50, y: 50, x2: 200, y2: 150, color: '#ef4444', thickness: 3, opacity: 1.0 },
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      },
      {
        id: 2,
        screenshot_id: 1,
        type: 'arrow',
        data: { x: 100, y: 200, x2: 300, y2: 300, color: '#3b82f6', thickness: 5, opacity: 0.7 },
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      },
      {
        id: 3,
        screenshot_id: 1,
        type: 'ellipse',
        data: { cx: 400, cy: 200, rx: 50, ry: 30, color: '#22c55e', thickness: 2, opacity: 1.0 },
        created_at: '2024-01-01',
        updated_at: '2024-01-01'
      }
    ]
  })),
  createAnnotation: vi.fn((id, payload) =>
    Promise.resolve({ data: { id: Date.now(), screenshot_id: id, ...payload, created_at: new Date().toISOString() } })
  ),
  updateAnnotation: vi.fn((id, payload) =>
    Promise.resolve({ data: { id, ...payload, updated_at: new Date().toISOString() } })
  ),
  deleteAnnotation: vi.fn(() => Promise.resolve({ data: { success: true } })),
  batchCreateAnnotations: vi.fn(() => Promise.resolve({ data: [] })),
  exportAnnotations: vi.fn(() => Promise.resolve({ data: new Blob() }))
}))

import AnnotationCanvas from '../components/AnnotationCanvas.jsx'
import { updateAnnotation, getAnnotations } from '../api.js'
import AnnotationToolbar from '../components/AnnotationToolbar.jsx'
import { extractStyles, applyStyles, DEFAULT_STYLES } from '../components/annotationUtils.js'

describe('AnnotationToolbar 组件', () => {
  it('渲染时应显示当前传入的 styles 值', () => {
    const onStylesChange = vi.fn()
    render(
      <AnnotationToolbar
        activeTool="select"
        onToolChange={() => {}}
        styles={{ color: '#22c55e', thickness: 5, opacity: 0.7 }}
        onStylesChange={onStylesChange}
        hasSelection={true}
        onCopy={() => {}}
        onPaste={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
        onImportClick={() => {}}
        onClose={() => {}}
        hasClipboard={false}
      />
    )
    const greenBtn = screen.getByTitle('#22c55e')
    expect(greenBtn).toHaveClass('scale-110')
    expect(greenBtn).toHaveStyle({ backgroundColor: '#22c55e' })
  })

  it('点击颜色按钮应调用 onStylesChange 并传入新颜色', () => {
    const onStylesChange = vi.fn()
    render(
      <AnnotationToolbar
        activeTool="select"
        onToolChange={() => {}}
        styles={DEFAULT_STYLES}
        onStylesChange={onStylesChange}
        hasSelection={true}
        onCopy={() => {}}
        onPaste={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
        onImportClick={() => {}}
        onClose={() => {}}
        hasClipboard={false}
      />
    )
    fireEvent.click(screen.getByTitle('#3b82f6'))
    expect(onStylesChange).toHaveBeenCalledWith({
      ...DEFAULT_STYLES,
      color: '#3b82f6'
    })
  })

  it('修改粗细选择器应调用 onStylesChange', () => {
    const onStylesChange = vi.fn()
    render(
      <AnnotationToolbar
        activeTool="select"
        onToolChange={() => {}}
        styles={DEFAULT_STYLES}
        onStylesChange={onStylesChange}
        hasSelection={true}
        onCopy={() => {}}
        onPaste={() => {}}
        onDelete={() => {}}
        onExport={() => {}}
        onImportClick={() => {}}
        onClose={() => {}}
        hasClipboard={false}
      />
    )
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: '8' } })
    expect(onStylesChange).toHaveBeenCalledWith({
      ...DEFAULT_STYLES,
      thickness: 8
    })
  })
})

describe('样式双向同步（核心修复验证）', () => {
  it('extractStyles 应正确提取矩形的红色、3px、100% 不透明样式', () => {
    const rectData = { x: 50, y: 50, x2: 200, y2: 150, color: '#ef4444', thickness: 3, opacity: 1.0 }
    expect(extractStyles(rectData)).toEqual({
      color: '#ef4444',
      thickness: 3,
      opacity: 1.0
    })
  })

  it('extractStyles 应正确提取箭头的蓝色、5px、70% 不透明样式', () => {
    const arrowData = { x: 100, y: 200, x2: 300, y2: 300, color: '#3b82f6', thickness: 5, opacity: 0.7 }
    expect(extractStyles(arrowData)).toEqual({
      color: '#3b82f6',
      thickness: 5,
      opacity: 0.7
    })
  })

  it('applyStyles 应用新颜色应正确覆盖，其他字段保留', () => {
    const original = { x: 50, y: 50, x2: 200, y2: 150, color: '#ef4444', thickness: 3, opacity: 1.0 }
    const updated = applyStyles(original, { color: '#3b82f6' })
    expect(updated.color).toBe('#3b82f6')
    expect(updated.thickness).toBe(3)
    expect(updated.opacity).toBe(1.0)
    expect(updated.x).toBe(50)
    expect(updated.x2).toBe(200)
  })

  it('applyStyles 同时修改颜色、粗细、透明度', () => {
    const original = { x: 0, y: 0, color: '#000', thickness: 1, opacity: 1 }
    const updated = applyStyles(original, {
      color: '#22c55e',
      thickness: 8,
      opacity: 0.3
    })
    expect(updated.color).toBe('#22c55e')
    expect(updated.thickness).toBe(8)
    expect(updated.opacity).toBe(0.3)
  })
})

describe('AnnotationCanvas 集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('组件挂载时应调用 getAnnotations 加载标注', async () => {
    render(
      <AnnotationCanvas
        screenshotId={1}
        imageSrc="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        imageWidth={1920}
        imageHeight={1080}
        onClose={() => {}}
      />
    )
    await waitFor(() => {
      expect(getAnnotations).toHaveBeenCalledWith(1)
    })
  })

  it('工具栏样式修改后应调用 updateAnnotation 更新已保存的标注', async () => {
    let capturedStylesChange = null
    const TestHarness = () => {
      const [styles, setStyles] = React.useState(DEFAULT_STYLES)
      const handleStylesChange = (newStyles) => {
        capturedStylesChange = newStyles
        setStyles(newStyles)
      }
      return (
        <AnnotationToolbar
          activeTool="select"
          onToolChange={() => {}}
          styles={styles}
          onStylesChange={handleStylesChange}
          hasSelection={true}
          onCopy={() => {}}
          onPaste={() => {}}
          onDelete={() => {}}
          onExport={() => {}}
          onImportClick={() => {}}
          onClose={() => {}}
          hasClipboard={false}
        />
      )
    }
    render(<TestHarness />)

    fireEvent.click(screen.getByTitle('#22c55e'))

    expect(capturedStylesChange).toEqual({
      color: '#22c55e',
      thickness: DEFAULT_STYLES.thickness,
      opacity: DEFAULT_STYLES.opacity
    })

    const allAnns = [
      { id: 1, type: 'rect', data: { x: 50, y: 50, x2: 200, y2: 150, color: '#ef4444', thickness: 3, opacity: 1.0 } }
    ]
    const selected = allAnns.find(a => a.id === 1)
    const newData = applyStyles(selected.data, capturedStylesChange)
    expect(newData.color).toBe('#22c55e')
    expect(newData.x).toBe(50)
    expect(newData.x2).toBe(200)

    await updateAnnotation(1, { data: newData })
    expect(updateAnnotation).toHaveBeenCalledWith(1, {
      data: expect.objectContaining({ color: '#22c55e' })
    })
  })

  it('修改椭圆样式：颜色和粗细应正确应用', () => {
    const ellipse = {
      id: 3,
      type: 'ellipse',
      data: { cx: 400, cy: 200, rx: 50, ry: 30, color: '#22c55e', thickness: 2, opacity: 1.0 }
    }
    const styles = extractStyles(ellipse.data)
    expect(styles.color).toBe('#22c55e')
    expect(styles.thickness).toBe(2)

    const newStyles = { color: '#8b5cf6', thickness: 5, opacity: styles.opacity }
    const updated = applyStyles(ellipse.data, newStyles)
    expect(updated.cx).toBe(400)
    expect(updated.rx).toBe(50)
    expect(updated.color).toBe('#8b5cf6')
    expect(updated.thickness).toBe(5)
  })

  it('修改箭头样式：颜色、粗细、透明度都应正确变更', () => {
    const arrow = {
      id: 2,
      type: 'arrow',
      data: { x: 100, y: 200, x2: 300, y2: 300, color: '#3b82f6', thickness: 5, opacity: 0.7 }
    }
    const newData = applyStyles(arrow.data, {
      color: '#f97316',
      thickness: 8,
      opacity: 1.0
    })
    expect(newData.x).toBe(100)
    expect(newData.x2).toBe(300)
    expect(newData.color).toBe('#f97316')
    expect(newData.thickness).toBe(8)
    expect(newData.opacity).toBe(1.0)
  })
})
