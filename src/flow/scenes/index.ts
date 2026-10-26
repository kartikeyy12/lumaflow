import type { SceneId } from '../../core/types'
import type { Scene, SceneMeta } from '../scene'
import { createAurora } from './aurora'
import { createDrift } from './drift'
import { createNebula } from './nebula'
import { createRibbon } from './ribbon'
import { createRipples } from './ripples'

const createStill = (): Scene => ({ resize() {}, draw() {} })

export const SCENES: SceneMeta[] = [
  { id: 'ribbon', label: 'Ribbon', note: 'Slow luminous strands', dpr: 1.5, animated: true, create: createRibbon },
  { id: 'nebula', label: 'Nebula', note: 'Drifting stars and colour', dpr: 1, animated: true, create: createNebula },
  { id: 'aurora', label: 'Aurora', note: 'Soft shifting light', dpr: 0.5, animated: true, create: createAurora },
  { id: 'ripples', label: 'Ripples', note: 'Rings that breathe', dpr: 1.25, animated: true, create: createRipples },
  { id: 'drift', label: 'Drift', note: 'Warm dust in lamplight', dpr: 1.25, animated: true, create: createDrift },
  { id: 'still', label: 'Still', note: 'No motion at all', dpr: 1, animated: false, create: createStill },
]

export const SCENE_BY_ID = Object.fromEntries(SCENES.map((s) => [s.id, s])) as Record<SceneId, SceneMeta>

export function nextScene(id: SceneId): SceneId {
  const i = SCENES.findIndex((s) => s.id === id)
  return SCENES[(i + 1) % SCENES.length].id
}
