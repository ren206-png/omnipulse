'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface TextLayer {
  id: string
  text: string
  x: number
  y: number
  fontSize: number
  color: string
  fontWeight: 'normal' | 'bold'
  align: 'left' | 'center' | 'right'
}

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

const ASPECT_RATIOS = [
  { label: 'Free',      ratio: null },
  { label: '1:1',       ratio: 1 },
  { label: '4:5',       ratio: 4 / 5 },
  { label: '16:9',      ratio: 16 / 9 },
  { label: '9:16',      ratio: 9 / 16 },
  { label: '1.91:1',    ratio: 1.91 },
]

const FILTERS = [
  { id: 'none',        label: 'Original',  css: 'none' },
  { id: 'grayscale',   label: 'B&W',       css: 'grayscale(100%)' },
  { id: 'sepia',       label: 'Sepia',     css: 'sepia(80%)' },
  { id: 'warm',        label: 'Warm',      css: 'saturate(150%) hue-rotate(-20deg)' },
  { id: 'cool',        label: 'Cool',      css: 'saturate(120%) hue-rotate(20deg)' },
  { id: 'vivid',       label: 'Vivid',     css: 'saturate(200%) contrast(110%)' },
  { id: 'fade',        label: 'Fade',      css: 'brightness(120%) contrast(80%) saturate(80%)' },
]

export function ImageEditorClient({ token: _token }: { token: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewRef = useRef<HTMLCanvasElement>(null)

  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null)

  // Adjustments
  const [brightness, setBrightness] = useState(100)
  const [contrast, setContrast] = useState(100)
  const [saturation, setSaturation] = useState(100)
  const [selectedFilter, setSelectedFilter] = useState('none')

  // Crop
  const [cropActive, setCropActive] = useState(false)
  const [aspectRatio, setAspectRatio] = useState<number | null>(null)
  const [crop, setCrop] = useState<CropRect | null>(null)
  const cropStart = useRef<{ x: number; y: number } | null>(null)
  const isDragging = useRef(false)

  // Text layers
  const [textLayers, setTextLayers] = useState<TextLayer[]>([])
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [newText, setNewText] = useState('')
  const [newFontSize, setNewFontSize] = useState(32)
  const [newColor, setNewColor] = useState('#ffffff')
  const [newFontWeight, setNewFontWeight] = useState<'normal' | 'bold'>('bold')

  const [tab, setTab] = useState<'adjust' | 'crop' | 'text' | 'filter'>('adjust')
  const [exportedUrl, setExportedUrl] = useState<string | null>(null)

  function loadImage(file: File) {
    const url = URL.createObjectURL(file)
    const img = new window.Image()
    img.onload = () => {
      setImageEl(img)
      setImageSrc(url)
      setCrop(null)
      setTextLayers([])
      setExportedUrl(null)
    }
    img.src = url
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) loadImage(file)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) loadImage(file)
  }

  // Build CSS filter string
  const filterString = `${FILTERS.find((f) => f.id === selectedFilter)?.css ?? 'none'} brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`

  // Render the preview canvas whenever inputs change
  const renderCanvas = useCallback(() => {
    const canvas = previewRef.current
    if (!canvas || !imageEl) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const srcW = imageEl.naturalWidth
    const srcH = imageEl.naturalHeight

    // Apply crop if set
    const srcX = crop ? Math.round(crop.x * srcW) : 0
    const srcY = crop ? Math.round(crop.y * srcH) : 0
    const srcCW = crop ? Math.round(crop.w * srcW) : srcW
    const srcCH = crop ? Math.round(crop.h * srcH) : srcH

    canvas.width = srcCW
    canvas.height = srcCH

    // Apply filter via offscreen canvas
    const offscreen = document.createElement('canvas')
    offscreen.width = srcCW
    offscreen.height = srcCH
    const off = offscreen.getContext('2d')!
    off.filter = filterString
    off.drawImage(imageEl, srcX, srcY, srcCW, srcCH, 0, 0, srcCW, srcCH)

    ctx.drawImage(offscreen, 0, 0)

    // Draw text layers
    textLayers.forEach((layer) => {
      ctx.save()
      ctx.font = `${layer.fontWeight} ${layer.fontSize}px sans-serif`
      ctx.fillStyle = layer.color
      ctx.textAlign = layer.align
      ctx.shadowColor = 'rgba(0,0,0,0.5)'
      ctx.shadowBlur = 4
      const px = layer.x * srcCW
      const py = layer.y * srcCH
      ctx.fillText(layer.text, px, py)
      ctx.restore()
    })
  }, [imageEl, crop, filterString, textLayers])

  useEffect(() => {
    renderCanvas()
  }, [renderCanvas])

  function addTextLayer() {
    if (!newText.trim()) return
    const layer: TextLayer = {
      id: crypto.randomUUID(),
      text: newText.trim(),
      x: 0.5,
      y: 0.5,
      fontSize: newFontSize,
      color: newColor,
      fontWeight: newFontWeight,
      align: 'center',
    }
    setTextLayers((prev) => [...prev, layer])
    setSelectedTextId(layer.id)
    setNewText('')
  }

  function removeTextLayer(id: string) {
    setTextLayers((prev) => prev.filter((l) => l.id !== id))
    if (selectedTextId === id) setSelectedTextId(null)
  }

  function updateTextLayer(id: string, patch: Partial<TextLayer>) {
    setTextLayers((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l))
  }

  // Crop pointer handling on the preview img overlay
  const overlayRef = useRef<HTMLDivElement>(null)

  function getRelativePos(e: React.PointerEvent): { x: number; y: number } {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    }
  }

  function onCropPointerDown(e: React.PointerEvent) {
    if (!cropActive) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const pos = getRelativePos(e)
    cropStart.current = pos
    isDragging.current = true
    setCrop(null)
  }

  function onCropPointerMove(e: React.PointerEvent) {
    if (!isDragging.current || !cropStart.current || !cropActive) return
    const pos = getRelativePos(e)
    let x = Math.min(cropStart.current.x, pos.x)
    let y = Math.min(cropStart.current.y, pos.y)
    let w = Math.abs(pos.x - cropStart.current.x)
    let h = Math.abs(pos.y - cropStart.current.y)

    if (aspectRatio && imageEl) {
      const imgAspect = imageEl.naturalWidth / imageEl.naturalHeight
      const targetAspect = aspectRatio * imgAspect  // in pixel space
      const newH = w / targetAspect
      if (y + newH <= 1) {
        h = newH
      } else {
        h = 1 - y
        w = h * targetAspect
      }
    }

    if (w > 0.02 && h > 0.02) {
      setCrop({ x, y, w, h })
    }
  }

  function onCropPointerUp(e: React.PointerEvent) {
    isDragging.current = false
    cropStart.current = null
    setCropActive(false)
  }

  function applyCrop() {
    if (!crop) return
    setCropActive(false)
  }

  function resetCrop() {
    setCrop(null)
    setCropActive(false)
  }

  function exportImage() {
    const canvas = previewRef.current
    if (!canvas) return
    const url = canvas.toDataURL('image/jpeg', 0.92)
    setExportedUrl(url)
  }

  function downloadImage() {
    if (!exportedUrl) return
    const a = document.createElement('a')
    a.href = exportedUrl
    a.download = 'omnipulse-edited.jpg'
    a.click()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Image Editor</h1>
        <p className="text-sm text-muted-foreground mt-1">Adjust, crop, add text overlays, and apply filters to your images before posting.</p>
      </div>

      {!imageSrc ? (
        /* Drop zone */
        <div
          className="rounded-2xl border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center py-20 gap-4 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-all"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="text-5xl opacity-40">🖼️</div>
          <div className="text-center">
            <p className="font-medium text-muted-foreground">Drop an image here</p>
            <p className="text-sm text-muted-foreground/60 mt-1">or click to browse — JPG, PNG, WebP, GIF</p>
          </div>
          <Button variant="outline" size="sm">Browse Files</Button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Canvas preview */}
          <div className="lg:col-span-2 space-y-3">
            <div
              ref={overlayRef}
              className="relative rounded-xl overflow-hidden border bg-muted/20 select-none"
              onPointerDown={onCropPointerDown}
              onPointerMove={onCropPointerMove}
              onPointerUp={onCropPointerUp}
              style={{ cursor: cropActive ? 'crosshair' : 'default' }}
            >
              <canvas
                ref={previewRef}
                className="w-full h-auto block max-h-[60vh] object-contain"
                style={{ imageRendering: 'auto' }}
              />
              {/* Crop overlay */}
              {crop && (
                <div
                  className="absolute border-2 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] pointer-events-none"
                  style={{
                    left: `${crop.x * 100}%`,
                    top: `${crop.y * 100}%`,
                    width: `${crop.w * 100}%`,
                    height: `${crop.h * 100}%`,
                  }}
                >
                  {/* Rule-of-thirds grid */}
                  {[33, 66].map((v) => (
                    <div key={`h${v}`} className="absolute left-0 right-0 border-t border-white/30" style={{ top: `${v}%` }} />
                  ))}
                  {[33, 66].map((v) => (
                    <div key={`v${v}`} className="absolute top-0 bottom-0 border-l border-white/30" style={{ left: `${v}%` }} />
                  ))}
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                📁 Change Image
              </Button>
              {crop && (
                <>
                  <Button size="sm" onClick={applyCrop}>✓ Apply Crop</Button>
                  <Button variant="outline" size="sm" onClick={resetCrop}>Reset Crop</Button>
                </>
              )}
              <Button size="sm" onClick={exportImage} className="ml-auto">
                🎨 Preview Export
              </Button>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />

            {/* Export preview */}
            {exportedUrl && (
              <div className="rounded-xl border overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={exportedUrl} alt="Export preview" className="w-full h-auto block" />
                <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                  <span className="text-xs text-muted-foreground">Export preview (JPEG 92%)</span>
                  <Button size="sm" onClick={downloadImage}>⬇️ Download</Button>
                </div>
              </div>
            )}
          </div>

          {/* Controls panel */}
          <div className="space-y-1">
            {/* Tab bar */}
            <div className="flex rounded-xl border overflow-hidden bg-muted/30">
              {(['adjust', 'crop', 'filter', 'text'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 text-xs font-medium transition-colors capitalize',
                    tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {{ adjust: '✨ Adjust', crop: '✂️ Crop', filter: '🎨 Filter', text: '📝 Text' }[t]}
                </button>
              ))}
            </div>

            {/* Adjust tab */}
            {tab === 'adjust' && (
              <div className="rounded-xl border bg-card p-4 space-y-5">
                {([
                  { label: 'Brightness', value: brightness, set: setBrightness, min: 0, max: 200 },
                  { label: 'Contrast',   value: contrast,   set: setContrast,   min: 0, max: 200 },
                  { label: 'Saturation', value: saturation, set: setSaturation, min: 0, max: 200 },
                ] as const).map(({ label, value, set, min, max }) => (
                  <div key={label} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">{label}</Label>
                      <span className="text-xs tabular-nums text-muted-foreground">{value}%</span>
                    </div>
                    <input
                      type="range"
                      min={min}
                      max={max}
                      value={value}
                      onChange={(e) => (set as (v: number) => void)(Number(e.target.value))}
                      className="w-full h-1.5 accent-primary cursor-pointer"
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => { setBrightness(100); setContrast(100); setSaturation(100) }}
                >
                  Reset Adjustments
                </Button>
              </div>
            )}

            {/* Crop tab */}
            {tab === 'crop' && (
              <div className="rounded-xl border bg-card p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Aspect Ratio</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ASPECT_RATIOS.map((ar) => (
                      <button
                        key={ar.label}
                        type="button"
                        onClick={() => setAspectRatio(ar.ratio)}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border transition-colors',
                          aspectRatio === ar.ratio
                            ? 'bg-primary text-primary-foreground border-primary'
                            : 'border-border hover:border-muted-foreground',
                        )}
                      >
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => { setCropActive(true) }}
                >
                  {cropActive ? '✏️ Drawing crop…' : '✂️ Draw Crop Area'}
                </Button>
                {cropActive && (
                  <p className="text-xs text-muted-foreground text-center">Drag on the image to set the crop area</p>
                )}
                {crop && (
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1" onClick={applyCrop}>Apply</Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={resetCrop}>Reset</Button>
                  </div>
                )}
              </div>
            )}

            {/* Filter tab */}
            {tab === 'filter' && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <Label className="text-xs">Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FILTERS.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setSelectedFilter(f.id)}
                      className={cn(
                        'rounded-lg border p-2 text-xs text-center transition-all',
                        selectedFilter === f.id
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border hover:border-muted-foreground',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Text tab */}
            {tab === 'text' && (
              <div className="rounded-xl border bg-card p-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs">Add Text</Label>
                  <Input
                    placeholder="Your text here…"
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTextLayer() } }}
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-[11px]">Size</Label>
                      <input
                        type="range"
                        min={12}
                        max={120}
                        value={newFontSize}
                        onChange={(e) => setNewFontSize(Number(e.target.value))}
                        className="w-full h-1.5 accent-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Color</Label>
                      <input
                        type="color"
                        value={newColor}
                        onChange={(e) => setNewColor(e.target.value)}
                        className="h-8 w-8 rounded border cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {(['normal', 'bold'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setNewFontWeight(w)}
                        className={cn(
                          'text-xs px-2.5 py-1 rounded-full border flex-1 capitalize',
                          newFontWeight === w ? 'bg-primary text-primary-foreground border-primary' : 'border-border',
                        )}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                  <Button size="sm" className="w-full" onClick={addTextLayer} disabled={!newText.trim()}>
                    + Add to Image
                  </Button>
                </div>

                {textLayers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Text Layers</Label>
                    {textLayers.map((layer) => (
                      <div
                        key={layer.id}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer transition-colors',
                          selectedTextId === layer.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40',
                        )}
                        onClick={() => setSelectedTextId(layer.id === selectedTextId ? null : layer.id)}
                      >
                        <span
                          className="w-3 h-3 rounded-full border flex-shrink-0"
                          style={{ background: layer.color }}
                        />
                        <span className="flex-1 truncate font-medium">{layer.text}</span>
                        <span className="text-muted-foreground">{layer.fontSize}px</span>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeTextLayer(layer.id) }}
                          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                        >
                          ×
                        </button>
                      </div>
                    ))}

                    {selectedTextId && (() => {
                      const layer = textLayers.find((l) => l.id === selectedTextId)
                      if (!layer) return null
                      return (
                        <div className="rounded-lg border bg-muted/20 p-3 space-y-3 mt-2">
                          <Label className="text-xs font-semibold">Position (selected layer)</Label>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>X: {Math.round(layer.x * 100)}%</span>
                              <span>Y: {Math.round(layer.y * 100)}%</span>
                            </div>
                            <input
                              type="range" min={0} max={100} value={Math.round(layer.x * 100)}
                              onChange={(e) => updateTextLayer(layer.id, { x: Number(e.target.value) / 100 })}
                              className="w-full h-1.5 accent-primary"
                            />
                            <input
                              type="range" min={0} max={100} value={Math.round(layer.y * 100)}
                              onChange={(e) => updateTextLayer(layer.id, { y: Number(e.target.value) / 100 })}
                              className="w-full h-1.5 accent-primary"
                            />
                          </div>
                          <div className="flex gap-1.5">
                            {(['left', 'center', 'right'] as const).map((a) => (
                              <button
                                key={a}
                                type="button"
                                onClick={() => updateTextLayer(layer.id, { align: a })}
                                className={cn(
                                  'text-xs px-2 py-0.5 rounded-full border flex-1 capitalize',
                                  layer.align === a ? 'bg-primary text-primary-foreground border-primary' : 'border-border',
                                )}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
