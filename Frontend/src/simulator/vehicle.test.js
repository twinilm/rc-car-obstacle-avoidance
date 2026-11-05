import test from 'node:test'
import assert from 'node:assert/strict'
import { createVehicleState, stepVehicle } from './vehicle.js'
import { getSurfaceCondition } from './surfaceConditions.js'

const road = {
  id: 'test',
  width: 20,
  centerline: [{ x: 0, z: -100 }, { x: 0, z: 100 }],
  start: { x: 0, z: 0, headingRadians: 0 },
  obstacles: []
}

const input = (overrides = {}) => ({
  throttle: 0,
  steering: 0,
  brake: false,
  maxSpeedMps: 4,
  ...overrides
})

test('forward input accelerates and respects the selected speed cap', () => {
  let state = createVehicleState(road)
  for (let frame = 0; frame < 120; frame += 1) {
    state = stepVehicle(state, input({ throttle: 1 }), road, 1 / 60)
  }
  assert.ok(state.speedMps > 0)
  assert.ok(state.speedMps <= 4)
  assert.ok(state.z > 0)
})

test('reverse input brakes before changing travel direction', () => {
  const movingForward = { ...createVehicleState(road), speedMps: 1 }
  const braking = stepVehicle(movingForward, input({ throttle: -1 }), road, 1 / 60)
  assert.ok(braking.speedMps >= 0)

  let state = braking
  for (let frame = 0; frame < 60; frame += 1) {
    state = stepVehicle(state, input({ throttle: -1 }), road, 1 / 60)
  }
  assert.ok(state.speedMps < 0)
})

test('steering changes heading while braking reduces speed and distance stays nonnegative', () => {
  const moving = { ...createVehicleState(road), speedMps: 2 }
  const turning = stepVehicle(moving, input({ steering: 1 }), road, 1 / 60)
  assert.notEqual(turning.headingRadians, moving.headingRadians)

  const braking = stepVehicle(moving, input({ brake: true }), road, 1 / 60)
  assert.ok(braking.speedMps >= 0)
  assert.ok(braking.speedMps < moving.speedMps)
  assert.ok(braking.distanceMeters >= 0)
})

test('steering rate scales with selected speed instead of increasing without a bound', () => {
  const maximumSpeed = 4
  const elapsed = 0.05
  const movingAtLimit = { ...createVehicleState(road), speedMps: maximumSpeed }
  const turning = stepVehicle(
    movingAtLimit,
    input({ steering: 1, maxSpeedMps: maximumSpeed }),
    road,
    elapsed
  )
  assert.ok(turning.headingRadians > 0)
  assert.ok(turning.headingRadians <= 1.25 * elapsed)
})

test('obstacle contact stops the vehicle and reports the obstacle id', () => {
  const blockedRoad = {
    ...road,
    obstacles: [{ id: 'cone-1', kind: 'cone', x: 0, z: 0, radius: 0.6 }]
  }
  const state = { ...createVehicleState(blockedRoad), speedMps: 2 }
  const result = stepVehicle(state, input({ throttle: 1 }), blockedRoad, 1 / 60)
  assert.equal(result.speedMps, 0)
  assert.equal(result.status, 'collision')
  assert.equal(result.collisionId, 'cone-1')
})

test('road boundary prevents the vehicle from escaping the drivable area', () => {
  const narrowRoad = { ...road, width: 2 }
  const state = {
    ...createVehicleState(narrowRoad),
    x: 0.9,
    headingRadians: Math.PI / 2,
    speedMps: 2
  }
  const result = stepVehicle(state, input({ throttle: 1 }), narrowRoad, 1 / 60)
  assert.equal(result.status, 'boundary')
  assert.equal(result.x, state.x)
  assert.equal(result.speedMps, 0)
})

test('invalid elapsed time cannot produce invalid vehicle state', () => {
  const state = createVehicleState(road)
  assert.deepEqual(stepVehicle(state, input({ throttle: 1 }), road, Number.NaN), state)
})

test('surface profiles reduce acceleration and low-grip braking response', () => {
  const dry = getSurfaceCondition('dry-asphalt')
  const wet = getSurfaceCondition('wet-asphalt')
  const uneven = getSurfaceCondition('uneven')
  const stationary = createVehicleState(road)

  for (const condition of [wet, uneven]) {
    const moving = stepVehicle(stationary, input({
      throttle: 1,
      maxSpeedMps: 4 * condition.speedFactor,
      accelerationFactor: condition.accelerationFactor
    }), road, 0.05)
    const dryMoving = stepVehicle(stationary, input({
      throttle: 1,
      maxSpeedMps: 4 * dry.speedFactor,
      accelerationFactor: dry.accelerationFactor
    }), road, 0.05)
    assert.ok(moving.speedMps < dryMoving.speedMps, condition.id)
  }

  const movingState = { ...stationary, speedMps: 1 }
  const dryBraking = stepVehicle(movingState, input({
    brake: true,
    brakingFactor: dry.brakingFactor
  }), road, 0.05)
  const wetBraking = stepVehicle(movingState, input({
    brake: true,
    brakingFactor: wet.brakingFactor
  }), road, 0.05)
  assert.ok(wetBraking.speedMps > dryBraking.speedMps)
})
