import test from 'node:test'
import assert from 'node:assert/strict'
import { ROAD_DEFINITIONS } from './roads.js'
import { AUTONOMOUS_SPEED_LIMIT_MPS, createAutopilot } from './autopilot.js'
import { createVehicleState, stepVehicle } from './vehicle.js'
import { SURFACE_CONDITIONS } from './surfaceConditions.js'

const blockedRoad = {
  id: 'blocked',
  width: 4,
  start: { x: 0, z: 0, headingRadians: 0 },
  centerline: [{ x: 0, z: 0 }, { x: 0, z: 20 }],
  obstacles: [{ id: 'wide-obstacle', x: 0, z: 10, radius: 3 }],
  intersections: [],
  markings: []
}

test('creates a safe autonomous route for each catalog road', () => {
  for (const road of ROAD_DEFINITIONS) {
    assert.equal(createAutopilot(road).status, 'ready', road.name)
  }
})

test('reports blocked when an obstacle fills a narrow road', () => {
  const autopilot = createAutopilot(blockedRoad)

  assert.equal(autopilot.status, 'blocked')
  assert.deepEqual(
    autopilot.update(createVehicleState(blockedRoad), 4, 1 / 60),
    { throttle: 0, steering: 0, brake: true, status: 'blocked' }
  )
})

test('rejoins a safe nearby point on the route and reaches completion', () => {
  const rejoinRoad = {
    id: 'rejoin',
    width: 12,
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [{ x: 0, z: 0 }, { x: 0, z: 30 }],
    obstacles: [],
    intersections: [],
    markings: []
  }
  const startState = { ...createVehicleState(rejoinRoad), x: 1, z: 5 }
  const autopilot = createAutopilot(rejoinRoad, { startState })

  assert.equal(autopilot.status, 'ready')
  assert.ok(autopilot.getProgress().currentWaypointIndex > 0)

  let state = startState
  let result
  for (let frame = 0; frame < 10000; frame += 1) {
    result = autopilot.update(state, 2, 1 / 60)
    if (result.status === 'complete') break
    state = stepVehicle(state, { ...result, maxSpeedMps: 2 }, rejoinRoad, 1 / 60)
    assert.ok(state.status !== 'collision' && state.status !== 'boundary')
  }

  assert.equal(result?.status, 'complete')
  assert.equal(state.speedMps, 0)
})

test('requires reset when no nearby route point has a safe connector', () => {
  const rejoinRoad = {
    id: 'rejoin-blocked',
    width: 20,
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [{ x: 0, z: 0 }, { x: 0, z: 30 }],
    obstacles: [{ id: 'connector-barrier', kind: 'barrier', x: 2, z: 5, radius: 0.8 }],
    intersections: [],
    markings: []
  }
  const startState = { ...createVehicleState(rejoinRoad), x: 4, z: 5 }
  const autopilot = createAutopilot(rejoinRoad, { startState })

  assert.equal(autopilot.status, 'reset-required')
  assert.deepEqual(autopilot.update(startState, 4, 1 / 60), {
    throttle: 0,
    steering: 0,
    brake: true,
    status: 'reset-required'
  })

  const tooFarState = { ...startState, x: 6, z: 5 }
  assert.equal(
    createAutopilot(rejoinRoad, { startState: tooFarState }).status,
    'reset-required'
  )
})

test('follows every road to completion without hitting obstacles or leaving the road', () => {
  const selectedSpeedMps = 48 * 0.44704
  const deltaSeconds = 1 / 60

  for (const road of ROAD_DEFINITIONS) {
    for (const surfaceCondition of SURFACE_CONDITIONS) {
      const autopilot = createAutopilot(road, { surfaceCondition })
      const maxSpeedMps = Math.min(
        selectedSpeedMps,
        AUTONOMOUS_SPEED_LIMIT_MPS
      ) * surfaceCondition.speedFactor
      let state = createVehicleState(road)
      let result

      for (let frame = 0; frame < 10000; frame += 1) {
        result = autopilot.update(state, selectedSpeedMps, deltaSeconds)
        assert.ok(result.throttle >= -1 && result.throttle <= 1, `${road.name} ${surfaceCondition.id}`)
        assert.ok(result.steering >= -1 && result.steering <= 1, `${road.name} ${surfaceCondition.id}`)
        assert.ok(
          result.status === 'driving' || result.status === 'complete',
          `${road.name} ${surfaceCondition.id}: ${result.status}`
        )
        if (result.status === 'complete') break

        state = stepVehicle(state, {
          ...result,
          maxSpeedMps,
          accelerationFactor: surfaceCondition.accelerationFactor,
          brakingFactor: surfaceCondition.brakingFactor
        }, road, deltaSeconds)
        assert.ok(
          state.status !== 'collision' && state.status !== 'boundary',
          `${road.name} ${surfaceCondition.id}: ${state.status} at ${state.x}, ${state.z}`
        )
      }

      assert.equal(result?.status, 'complete', `${road.name} ${surfaceCondition.id} did not complete`)
      assert.ok(state.distanceMeters > 0, `${road.name} ${surfaceCondition.id}`)
      assert.equal(state.speedMps, 0, `${road.name} ${surfaceCondition.id}`)
    }
  }
})
