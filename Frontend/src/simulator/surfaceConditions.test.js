import test from 'node:test'
import assert from 'node:assert/strict'
import { getSurfaceCondition, SURFACE_CONDITIONS } from './surfaceConditions.js'

test('defines finite deterministic factors for each surface condition', () => {
  assert.deepEqual(
    SURFACE_CONDITIONS.map(({ id }) => id),
    ['dry-asphalt', 'wet-asphalt', 'uneven']
  )

  for (const condition of SURFACE_CONDITIONS) {
    for (const factor of [
      condition.speedFactor,
      condition.accelerationFactor,
      condition.brakingFactor
    ]) {
      assert.ok(Number.isFinite(factor) && factor > 0 && factor <= 1, condition.id)
    }
  }
})

test('returns neutral dry settings and rejects unknown conditions', () => {
  assert.deepEqual(getSurfaceCondition('dry-asphalt'), {
    id: 'dry-asphalt',
    label: 'Dry asphalt',
    speedFactor: 1,
    accelerationFactor: 1,
    brakingFactor: 1,
    roadColor: 0x1e242b,
    roughness: 0.88
  })
  assert.throws(() => getSurfaceCondition('ice'), TypeError)
})
