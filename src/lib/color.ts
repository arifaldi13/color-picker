export type OklchColor = {
  l: number
  c: number
  h: number
}

export type RgbColor = {
  r: number
  g: number
  b: number
}

export const MAX_CHROMA = 0.45

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function normalizeHue(hue: number) {
  return ((hue % 360) + 360) % 360
}

export function shortestHueDelta(from: number, to: number) {
  return ((normalizeHue(to) - normalizeHue(from) + 540) % 360) - 180
}

export function oklchToLinearSrgb({ l, c, h }: OklchColor): RgbColor {
  const hue = (normalizeHue(h) * Math.PI) / 180
  const a = Math.cos(hue) * c
  const b = Math.sin(hue) * c

  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b

  const lCubed = lPrime ** 3
  const mCubed = mPrime ** 3
  const sCubed = sPrime ** 3

  return {
    r: 4.0767416621 * lCubed - 3.3077115913 * mCubed + 0.2309699292 * sCubed,
    g: -1.2684380046 * lCubed + 2.6097574011 * mCubed - 0.3413193965 * sCubed,
    b: -0.0041960863 * lCubed - 0.7034186147 * mCubed + 1.707614701 * sCubed,
  }
}

function encodeSrgbChannel(value: number) {
  if (value <= 0.0031308) {
    return 12.92 * value
  }

  return 1.055 * value ** (1 / 2.4) - 0.055
}

function decodeSrgbChannel(value: number) {
  if (value <= 0.04045) {
    return value / 12.92
  }

  return ((value + 0.055) / 1.055) ** 2.4
}

export function oklchToSrgb(color: OklchColor): RgbColor {
  const linear = oklchToLinearSrgb(color)
  return {
    r: encodeSrgbChannel(linear.r),
    g: encodeSrgbChannel(linear.g),
    b: encodeSrgbChannel(linear.b),
  }
}

export function isInRgbGamut(color: OklchColor) {
  const linear = oklchToLinearSrgb(color)
  return (
    Number.isFinite(linear.r) &&
    Number.isFinite(linear.g) &&
    Number.isFinite(linear.b) &&
    linear.r >= -0.000001 &&
    linear.r <= 1.000001 &&
    linear.g >= -0.000001 &&
    linear.g <= 1.000001 &&
    linear.b >= -0.000001 &&
    linear.b <= 1.000001
  )
}

export function srgbToOklch({ r, g, b }: RgbColor): OklchColor {
  const linearR = decodeSrgbChannel(clamp(r, 0, 1))
  const linearG = decodeSrgbChannel(clamp(g, 0, 1))
  const linearB = decodeSrgbChannel(clamp(b, 0, 1))

  const l = Math.cbrt(0.4122214708 * linearR + 0.5363325363 * linearG + 0.0514459929 * linearB)
  const m = Math.cbrt(0.2119034982 * linearR + 0.6806995451 * linearG + 0.1073969566 * linearB)
  const s = Math.cbrt(0.0883024619 * linearR + 0.2817188376 * linearG + 0.6299787005 * linearB)

  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bLab = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s

  return {
    l: clamp(lightness, 0, 1),
    c: clamp(Math.sqrt(a * a + bLab * bLab), 0, MAX_CHROMA),
    h: normalizeHue((Math.atan2(bLab, a) * 180) / Math.PI),
  }
}

export function srgbToHex(rgb: RgbColor) {
  const toHex = (channel: number) =>
    Math.round(clamp(channel, 0, 1) * 255)
      .toString(16)
      .padStart(2, '0')

  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`
}

export function hexToSrgb(hex: string): RgbColor | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) {
    return null
  }

  const value = match[1]
  return {
    r: Number.parseInt(value.slice(0, 2), 16) / 255,
    g: Number.parseInt(value.slice(2, 4), 16) / 255,
    b: Number.parseInt(value.slice(4, 6), 16) / 255,
  }
}

export function displayRgbCss(color: OklchColor) {
  const rgb = oklchToSrgb(color)
  return `rgb(${Math.round(clamp(rgb.r, 0, 1) * 255)} ${Math.round(
    clamp(rgb.g, 0, 1) * 255,
  )} ${Math.round(clamp(rgb.b, 0, 1) * 255)})`
}

export function oklchCss({ l, c, h }: OklchColor) {
  return `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(4)} ${normalizeHue(h).toFixed(1)})`
}
