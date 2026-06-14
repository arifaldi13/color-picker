import { psoCoatedV3Gamut } from '../data/psoCoatedV3Gamut'
import { psoUncoatedV3Gamut } from '../data/psoUncoatedV3Gamut'
import {
  MAX_CHROMA,
  clamp,
  isInRgbGamut,
  normalizeHue,
  shortestHueDelta,
  type OklchColor,
} from './color'

export type GamutMode = 'rgb' | 'pso-coated' | 'pso-uncoated'
export type GamutMask = GamutMode | readonly GamutMode[]
export type FallbackChannel = 'l' | 'c' | 'h'

const EPSILON = 0.0005

type GamutProfile = {
  readonly rows: readonly (readonly number[])[]
  readonly lSteps: number
  readonly hSteps: number
}

function profileMaxChroma(profile: GamutProfile, l: number, h: number) {
  const rows = profile.rows
  const lMax = profile.lSteps - 1
  const hSteps = profile.hSteps
  const lPos = clamp(l, 0, 1) * lMax
  const l0 = Math.floor(lPos)
  const l1 = Math.min(lMax, l0 + 1)
  const lMix = lPos - l0

  const hPos = (normalizeHue(h) / 360) * hSteps
  const h0 = Math.floor(hPos) % hSteps
  const h1 = (h0 + 1) % hSteps
  const hMix = hPos - Math.floor(hPos)

  const lowHue = rows[l0][h0] * (1 - hMix) + rows[l0][h1] * hMix
  const highHue = rows[l1][h0] * (1 - hMix) + rows[l1][h1] * hMix

  return lowHue * (1 - lMix) + highHue * lMix
}

export function psoCoatedMaxChroma(l: number, h: number) {
  return profileMaxChroma(psoCoatedV3Gamut, l, h)
}

export function psoUncoatedMaxChroma(l: number, h: number) {
  return profileMaxChroma(psoUncoatedV3Gamut, l, h)
}

export function isInPsoCoatedGamut(color: OklchColor) {
  return (
    color.l >= 0 &&
    color.l <= 1 &&
    color.c >= 0 &&
    color.c <= psoCoatedMaxChroma(color.l, color.h) + EPSILON
  )
}

export function isInPsoUncoatedGamut(color: OklchColor) {
  return (
    color.l >= 0 &&
    color.l <= 1 &&
    color.c >= 0 &&
    color.c <= psoUncoatedMaxChroma(color.l, color.h) + EPSILON
  )
}

function activeMasks(mask: GamutMask): readonly GamutMode[] {
  return typeof mask === 'string' ? [mask] : mask
}

export function isInGamut(color: OklchColor, mask: GamutMask) {
  const masks = activeMasks(mask)
  if (masks.length === 0) {
    return true
  }

  return masks.every((mode) => isInSingleGamut(color, mode))
}

function isInSingleGamut(color: OklchColor, mode: GamutMode) {
  if (mode === 'rgb') {
    return isInRgbGamut(color)
  }

  if (mode === 'pso-coated') {
    return isInPsoCoatedGamut(color)
  }

  return isInPsoUncoatedGamut(color)
}

export function maxChromaFor(mask: GamutMask, l: number, h: number) {
  const masks = activeMasks(mask)
  if (masks.length === 0) {
    return MAX_CHROMA
  }

  return Math.min(...masks.map((mode) => maxChromaForSingle(mode, l, h)))
}

function maxChromaForSingle(mode: GamutMode, l: number, h: number) {
  if (mode === 'pso-coated') {
    return psoCoatedMaxChroma(l, h)
  }

  if (mode === 'pso-uncoated') {
    return psoUncoatedMaxChroma(l, h)
  }

  let low = 0
  let high = MAX_CHROMA
  for (let i = 0; i < 22; i += 1) {
    const mid = (low + high) / 2
    if (isInRgbGamut({ l, c: mid, h })) {
      low = mid
    } else {
      high = mid
    }
  }

  return low
}

function projectChroma(color: OklchColor, mask: GamutMask) {
  let low = 0
  let high = clamp(color.c, 0, MAX_CHROMA)

  for (let i = 0; i < 32; i += 1) {
    const mid = (low + high) / 2
    if (isInGamut({ ...color, c: mid }, mask)) {
      low = mid
    } else {
      high = mid
    }
  }

  return { ...color, c: Math.min(low, maxChromaFor(mask, color.l, color.h)) }
}

function projectLightness(color: OklchColor, mask: GamutMask) {
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i <= 600; i += 1) {
    const l = i / 600
    if (isInGamut({ ...color, l }, mask)) {
      const distance = Math.abs(l - color.l)
      if (distance < bestDistance) {
        best = l
        bestDistance = distance
      }
    }
  }

  if (best === null) {
    return null
  }

  let invalid = color.l
  let valid = best
  for (let i = 0; i < 32; i += 1) {
    const mid = (invalid + valid) / 2
    if (isInGamut({ ...color, l: mid }, mask)) {
      valid = mid
    } else {
      invalid = mid
    }
  }

  return { ...color, l: valid }
}

function projectHue(color: OklchColor, mask: GamutMask) {
  const origin = normalizeHue(color.h)
  let best: number | null = null
  let bestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < 720; i += 1) {
    const h = i / 2
    if (isInGamut({ ...color, h }, mask)) {
      const distance = Math.abs(shortestHueDelta(origin, h))
      if (distance < bestDistance) {
        best = h
        bestDistance = distance
      }
    }
  }

  if (best === null) {
    return null
  }

  const delta = shortestHueDelta(origin, best)
  let invalidT = 0
  let validT = 1

  for (let i = 0; i < 32; i += 1) {
    const midT = (invalidT + validT) / 2
    const h = normalizeHue(origin + delta * midT)
    if (isInGamut({ ...color, h }, mask)) {
      validT = midT
    } else {
      invalidT = midT
    }
  }

  return { ...color, h: normalizeHue(origin + delta * validT) }
}

export function fallbackToGamut(
  color: OklchColor,
  mask: GamutMask,
  channel: FallbackChannel,
) {
  if (isInGamut(color, mask)) {
    return {
      color,
      message: 'Warna sudah berada di dalam semua gamut aktif.',
      usedChannel: channel,
    }
  }

  if (channel === 'c') {
    return {
      color: projectChroma(color, mask),
      message: 'Chroma dikurangi sampai menyentuh batas gamut.',
      usedChannel: channel,
    }
  }

  const projected = channel === 'l' ? projectLightness(color, mask) : projectHue(color, mask)
  if (projected) {
    return {
      color: projected,
      message:
        channel === 'l'
          ? 'Lightness digeser ke titik terdekat yang masih masuk gamut.'
          : 'Hue diputar ke titik terdekat yang masih masuk gamut.',
      usedChannel: channel,
    }
  }

  return {
    color: projectChroma(color, mask),
    message: 'Tidak ada titik valid dengan channel itu saja; fallback otomatis mengurangi Chroma.',
    usedChannel: 'c' as const,
  }
}
