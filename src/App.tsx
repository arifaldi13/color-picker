import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { AlertTriangle, Check, Clipboard, MoveHorizontal, Pipette } from 'lucide-react'
import './App.css'
import {
  MAX_CHROMA,
  clamp,
  displayRgbCss,
  hexToSrgb,
  normalizeHue,
  oklchToSrgb,
  srgbToHex,
  srgbToOklch,
  type OklchColor,
} from './lib/color'
import {
  fallbackToGamut,
  isInGamut,
  maxChromaFor,
  type FallbackChannel,
  type GamutMode,
} from './lib/gamut'

const initialColor: OklchColor = {
  l: 0.64,
  c: 0.22,
  h: 34,
}

const GAMUT_OPTIONS: Array<{ value: GamutMode; label: string; shortLabel: string; description: string }> = [
  {
    value: 'rgb',
    label: 'RGB',
    shortLabel: 'RGB',
    description:
      'RGB adalah ruang warna layar, jadi ini paling berguna saat kamu mau warna aman untuk website, aplikasi, presentasi, atau aset digital yang dilihat di monitor.',
  },
  {
    value: 'pso-coated',
    label: 'PSO Coated V3',
    shortLabel: 'PSO Coated',
    description:
      'PSO Coated V3 dipakai untuk cetak offset di kertas coated atau art paper yang permukaannya lebih licin, cocok untuk brosur, katalog, kemasan, dan hasil cetak yang ingin warna terlihat lebih tajam.',
  },
  {
    value: 'pso-uncoated',
    label: 'PSO Uncoated V3',
    shortLabel: 'PSO Uncoated',
    description:
      'PSO Uncoated V3 dipakai untuk kertas uncoated yang lebih menyerap tinta, seperti letterhead, buku, atau stationery; mask ini membantu warna tetap realistis sebelum dicetak di kertas doff/tidak mengilap.',
  },
]

function gamutLabel(mode: GamutMode) {
  return GAMUT_OPTIONS.find((option) => option.value === mode)?.label ?? mode
}

function gamutShortLabel(mode: GamutMode) {
  return GAMUT_OPTIONS.find((option) => option.value === mode)?.shortLabel ?? mode
}

function rgbTextFromColor(color: OklchColor) {
  const rgb = oklchToSrgb(color)
  return `${Math.round(clamp(rgb.r, 0, 1) * 255)}, ${Math.round(
    clamp(rgb.g, 0, 1) * 255,
  )}, ${Math.round(clamp(rgb.b, 0, 1) * 255)}`
}

function oklchTextFromColor(color: OklchColor) {
  return `oklch(${color.l.toFixed(2)} ${color.c.toFixed(2)} ${displayHue(color.h).toFixed(2)})`
}

function parseOklchText(value: string): OklchColor | null {
  const tokens = value.match(/[-+]?\d*\.?\d+%?/g)
  if (!tokens || tokens.length < 3) {
    return null
  }

  const [lToken, cToken, hToken] = tokens
  const l = lToken.endsWith('%')
    ? Number.parseFloat(lToken) / 100
    : Number.parseFloat(lToken)
  const c = Number.parseFloat(cToken)
  const h = Number.parseFloat(hToken)

  if (![l, c, h].every(Number.isFinite)) {
    return null
  }

  return {
    l: clamp(l, 0, 1),
    c: clamp(c, 0, MAX_CHROMA),
    h: clamp(h, 0, 360),
  }
}

function displayHue(hue: number) {
  if (hue === 360) {
    return 360
  }

  return normalizeHue(hue)
}

function parseRgbText(value: string) {
  const channels = value.match(/\d{1,3}/g)?.map((channel) => Number.parseInt(channel, 10))
  if (!channels || channels.length !== 3 || channels.some((channel) => channel < 0 || channel > 255)) {
    return null
  }

  return {
    r: channels[0] / 255,
    g: channels[1] / 255,
    b: channels[2] / 255,
  }
}

function parseDecimalInput(value: string) {
  const normalized = value.trim().replace(',', '.')
  if (!normalized) {
    return null
  }

  const parsed = Number.parseFloat(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  decimals?: number
  unit?: string
  onChange: (value: number) => void
}

function SliderField({ label, value, min, max, step, decimals = 2, unit, onChange }: SliderProps) {
  const [draftValue, setDraftValue] = useState(value.toFixed(decimals))
  const [isEditing, setIsEditing] = useState(false)
  const displayValue = isEditing ? draftValue : value.toFixed(decimals)

  function commitDraft() {
    const parsed = parseDecimalInput(displayValue)
    const nextValue = parsed === null ? value : clamp(parsed, min, max)
    onChange(nextValue)
    setDraftValue(nextValue.toFixed(decimals))
    setIsEditing(false)
  }

  return (
    <label className="slider-field">
      <span>
        {label}
        <strong>
          {value.toFixed(decimals)}
          {unit}
        </strong>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        type="text"
        inputMode="decimal"
        aria-label={`${label} value`}
        value={displayValue}
        onFocus={() => {
          setDraftValue(value.toFixed(decimals))
          setIsEditing(true)
        }}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
          if (event.key === 'Escape') {
            setDraftValue(value.toFixed(decimals))
            setIsEditing(false)
            event.currentTarget.blur()
          }
        }}
      />
    </label>
  )
}

type SegmentedProps<T extends string> = {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  label: string
}

function SegmentedControl<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented-group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'selected' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

type MaskOptionsProps = {
  masks: GamutMode[]
  onChange: (masks: GamutMode[]) => void
}

function MaskOptions({ masks, onChange }: MaskOptionsProps) {
  function toggle(mode: GamutMode) {
    onChange(masks.includes(mode) ? masks.filter((item) => item !== mode) : [...masks, mode])
  }

  return (
    <div className="mask-options" aria-label="Gamut masks">
      {GAMUT_OPTIONS.map((option) => (
        <label key={option.value}>
          <input
            type="checkbox"
            checked={masks.includes(option.value)}
            onChange={() => toggle(option.value)}
          />
          <span className="mask-label">{option.label}</span>
          <span className="mask-description" aria-hidden="true">
            {option.description}
          </span>
        </label>
      ))}
    </div>
  )
}

type GamutCanvasProps = {
  color: OklchColor
  masks: GamutMode[]
  onPick: (color: OklchColor) => void
}

function GamutCanvas({ color, masks, onPick }: GamutCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const width = 720
    const height = 430
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const image = context.createImageData(width, height)
    const data = image.data
    for (let y = 0; y < height; y += 1) {
      const chroma = (1 - y / (height - 1)) * MAX_CHROMA
      for (let x = 0; x < width; x += 1) {
        const hue = (x / (width - 1)) * 360
        const swatch = { l: color.l, c: chroma, h: hue }
        const rgb = oklchToSrgb(swatch)
        const inside = isInGamut(swatch, masks)
        const index = (y * width + x) * 4
        const mix = inside ? 1 : 0.22
        const base = inside ? 0 : 26

        data[index] = Math.round(clamp(rgb.r, 0, 1) * 255 * mix + base * (1 - mix))
        data[index + 1] = Math.round(clamp(rgb.g, 0, 1) * 255 * mix + base * (1 - mix))
        data[index + 2] = Math.round(clamp(rgb.b, 0, 1) * 255 * mix + base * (1 - mix))
        data[index + 3] = 255
      }
    }

    context.putImageData(image, 0, 0)
    context.lineWidth = 2.5
    context.strokeStyle = 'rgba(237, 242, 247, 0.88)'
    context.beginPath()
    for (let x = 0; x < width; x += 1) {
      const hue = (x / (width - 1)) * 360
      const boundary = maxChromaFor(masks, color.l, hue)
      const y = height - (boundary / MAX_CHROMA) * height
      if (x === 0) {
        context.moveTo(x, y)
      } else {
        context.lineTo(x, y)
      }
    }
    context.stroke()

    const pointX = (normalizeHue(color.h) / 360) * width
    const pointY = height - (clamp(color.c, 0, MAX_CHROMA) / MAX_CHROMA) * height
    context.lineWidth = 4
    context.strokeStyle = '#f8fafc'
    context.fillStyle = displayRgbCss(color)
    context.beginPath()
    context.arc(pointX, pointY, 9, 0, Math.PI * 2)
    context.fill()
    context.stroke()
    context.lineWidth = 1.5
    context.strokeStyle = 'rgba(5, 9, 14, 0.7)'
    context.stroke()
  }, [color, masks])

  function pickFromPointer(event: PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)
    onPick({
      ...color,
      h: normalizeHue(x * 360),
      c: clamp((1 - y) * MAX_CHROMA, 0, MAX_CHROMA),
    })
  }

  return (
    <canvas
      ref={canvasRef}
      className="gamut-canvas"
      aria-label="Hue and chroma gamut canvas"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        pickFromPointer(event)
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) {
          pickFromPointer(event)
        }
      }}
    />
  )
}

function App() {
  const [color, setColor] = useState<OklchColor>(initialColor)
  const [masks, setMasks] = useState<GamutMode[]>(['rgb'])
  const [fallbackChannel, setFallbackChannel] = useState<FallbackChannel>('c')
  const [notice, setNotice] = useState('Default mask RGB aktif.')
  const oklchInputRef = useRef<HTMLInputElement | null>(null)
  const hexInputRef = useRef<HTMLInputElement | null>(null)
  const rgbInputRef = useRef<HTMLInputElement | null>(null)

  const clippedRgb = useMemo(() => oklchToSrgb(color), [color])
  const hex = useMemo(() => srgbToHex(clippedRgb).toUpperCase(), [clippedRgb])
  const rgbText = useMemo(() => rgbTextFromColor(color), [color])
  const oklchText = useMemo(() => oklchTextFromColor(color), [color])
  const inGamut = useMemo(() => isInGamut(color, masks), [color, masks])
  const limit = useMemo(() => maxChromaFor(masks, color.l, color.h), [color, masks])
  const activeMaskLabel = masks.length
    ? masks.map((mask) => gamutShortLabel(mask)).join(' + ')
    : 'No mask'

  useEffect(() => {
    if (oklchInputRef.current && document.activeElement !== oklchInputRef.current) {
      oklchInputRef.current.value = oklchText
    }
    if (hexInputRef.current && document.activeElement !== hexInputRef.current) {
      hexInputRef.current.value = hex
    }
    if (rgbInputRef.current && document.activeElement !== rgbInputRef.current) {
      rgbInputRef.current.value = rgbText
    }
  }, [hex, rgbText, oklchText])

  function updateColor(next: Partial<OklchColor>) {
    setColor((current) => ({
      l: clamp(next.l ?? current.l, 0, 1),
      c: clamp(next.c ?? current.c, 0, MAX_CHROMA),
      h: next.h === undefined ? current.h : clamp(next.h, 0, 360),
    }))
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = value
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    setNotice(`${label} disalin.`)
  }

  function commitOklch(value = oklchInputRef.current?.value ?? oklchText) {
    const nextColor = parseOklchText(value)
    if (!nextColor) {
      setNotice('OKLCH pakai format: oklch(0.64 0.22 34).')
      return
    }
    setColor(nextColor)
    setNotice('OKLCH dimuat.')
  }

  function commitHex(value = hexInputRef.current?.value ?? hex) {
    const rgb = hexToSrgb(value)
    if (!rgb) {
      setNotice('HEX belum valid.')
      return
    }
    setColor(srgbToOklch(rgb))
    setNotice('HEX dimuat ke OKLCH.')
  }

  function commitRgb(value = rgbInputRef.current?.value ?? rgbText) {
    const rgb = parseRgbText(value)
    if (!rgb) {
      setNotice('RGB pakai format: 64, 177, 185.')
      return
    }
    setColor(srgbToOklch(rgb))
    setNotice('RGB dimuat ke OKLCH.')
  }

  function applyFallback() {
    const result = fallbackToGamut(color, masks, fallbackChannel)
    setColor(result.color)
    setNotice(result.message)
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>OKLCH Gamut Picker</h1>
          <p>Dark workspace, RGB input, multi-gamut mask</p>
        </div>
        <div className={`status-chip ${inGamut ? 'ok' : 'warn'}`}>
          {inGamut ? <Check size={16} /> : <AlertTriangle size={16} />}
          {inGamut ? 'In gamut' : 'Out of gamut'}
        </div>
      </header>

      <section className="workspace">
        <aside className="panel controls-panel">
          <div className="panel-header">
            <span>Mask</span>
            <MaskOptions
              masks={masks}
              onChange={(nextMasks) => {
                setMasks(nextMasks)
                setNotice(
                  nextMasks.length
                    ? `Mask aktif: ${nextMasks.map((mask) => gamutLabel(mask)).join(' + ')}.`
                    : 'Mask dimatikan.',
                )
              }}
            />
          </div>

          <div className="input-stack">
            <SliderField
              label="L"
              min={0}
              max={1}
              step={0.01}
              value={color.l}
              onChange={(value) => updateColor({ l: value })}
            />
            <SliderField
              label="C"
              min={0}
              max={MAX_CHROMA}
              step={0.01}
              value={color.c}
              onChange={(value) => updateColor({ c: value })}
            />
            <SliderField
              label="H"
              min={0}
              max={360}
              step={0.01}
              value={displayHue(color.h)}
              onChange={(value) => updateColor({ h: value })}
            />
          </div>

          <div className="seed-row">
            <Pipette size={17} />
            <input
              aria-label="Seed color picker"
              type="color"
              value={hex}
              onChange={(event) => commitHex(event.target.value)}
            />
          </div>
        </aside>

        <section className="canvas-panel">
          <div className="canvas-header">
            <div>
              <span>Hue / Chroma</span>
              <strong>L {color.l.toFixed(2)}</strong>
            </div>
            <span className="boundary-label">Boundary line</span>
          </div>
          <GamutCanvas color={color} masks={masks} onPick={setColor} />
        </section>

        <aside className="panel output-panel">
          <div className="swatch" style={{ background: displayRgbCss(color) }}>
            <span>{activeMaskLabel}</span>
          </div>

          <div className="metric-grid">
            <div>
              <span>Current C</span>
              <strong>{color.c.toFixed(2)}</strong>
            </div>
            <div>
              <span>Max C</span>
              <strong>{limit.toFixed(2)}</strong>
            </div>
          </div>

          <div className="fallback-box">
            <div className="section-title">
              <MoveHorizontal size={17} />
              <span>Fallback</span>
            </div>
            <SegmentedControl<FallbackChannel>
              label="Fallback channel"
              value={fallbackChannel}
              options={[
                { value: 'l', label: 'L' },
                { value: 'c', label: 'C' },
                { value: 'h', label: 'H' },
              ]}
              onChange={setFallbackChannel}
            />
            <button type="button" className="primary-action" onClick={applyFallback}>
              Move to gamut edge
            </button>
          </div>

          <div className="output-stack">
            <label>
              <span>CSS OKLCH</span>
              <div>
                <input
                  ref={oklchInputRef}
                  aria-label="OKLCH"
                  defaultValue={oklchText}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitOklch()
                  }}
                />
                <button type="button" onClick={() => commitOklch()}>
                  Apply
                </button>
                <button type="button" aria-label="Copy OKLCH CSS" onClick={() => copy(oklchText, 'OKLCH')}>
                  <Clipboard size={15} />
                </button>
              </div>
            </label>
            <label>
              <span>HEX</span>
              <div>
                <input
                  ref={hexInputRef}
                  aria-label="HEX"
                  defaultValue={hex}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitHex()
                  }}
                />
                <button type="button" onClick={() => commitHex()}>
                  Apply
                </button>
                <button type="button" aria-label="Copy HEX output" onClick={() => copy(hex, 'HEX')}>
                  <Clipboard size={15} />
                </button>
              </div>
            </label>
            <label>
              <span>RGB</span>
              <div>
                <input
                  ref={rgbInputRef}
                  aria-label="RGB"
                  defaultValue={rgbText}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') commitRgb()
                  }}
                />
                <button type="button" onClick={() => commitRgb()}>
                  Apply
                </button>
                <button type="button" aria-label="Copy RGB output" onClick={() => copy(`rgb(${rgbText})`, 'RGB')}>
                  <Clipboard size={15} />
                </button>
              </div>
            </label>
          </div>

          <p className="notice">{notice}</p>
        </aside>
      </section>
    </main>
  )
}

export default App
