import test from 'node:test'
import assert from 'node:assert/strict'
import { createBackendClient } from './backendClient.js'

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => body }
}

test('disabled clients issue no requests', async () => {
  let calls = 0
  const client = createBackendClient({
    baseUrl: '',
    fetchImpl: async () => {
      calls += 1
      return jsonResponse({})
    }
  })

  assert.equal(client.enabled, false)
  assert.deepEqual(client.getStatus(), {
    state: 'disabled',
    message: 'Backend sync is disabled.'
  })
  assert.equal(await client.checkHealth(), false)
  assert.equal(await client.sendMode('manual'), false)
  assert.equal(await client.sendControl({
    throttle: 0, steering: 0, brake: false, emergencyStop: false
  }), false)
  assert.equal(await client.publishSnapshot({}), false)
  assert.equal(calls, 0)
})

test('sends mode and control JSON to the configured API', async () => {
  const calls = []
  const client = createBackendClient({
    baseUrl: 'http://127.0.0.1:3001/',
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return jsonResponse({})
    }
  })

  assert.equal(await client.sendMode('autonomous'), true)
  assert.equal(await client.sendControl({
    throttle: 1, steering: -0.5, brake: false, emergencyStop: false
  }), true)
  assert.deepEqual(calls.map(({ url }) => url), [
    'http://127.0.0.1:3001/api/vehicle/mode',
    'http://127.0.0.1:3001/api/vehicle/control'
  ])
  assert.deepEqual(JSON.parse(calls[0].options.body), { mode: 'autonomous' })
  assert.equal(calls[0].options.method, 'POST')
  assert.equal(client.getStatus().state, 'connected')
})

test('reports HTTP and network failures without rejecting callers', async () => {
  const failedResponse = createBackendClient({
    baseUrl: 'http://localhost:3001',
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 422 })
  })
  assert.equal(await failedResponse.sendMode('manual'), false)
  assert.equal(failedResponse.getStatus().state, 'unavailable')
  assert.match(failedResponse.getStatus().message, /422/)

  const networkFailure = createBackendClient({
    baseUrl: 'http://localhost:3001',
    fetchImpl: async () => {
      throw new Error('connection refused')
    }
  })
  assert.equal(await networkFailure.checkHealth(), false)
  assert.equal(networkFailure.getStatus().state, 'unavailable')
  assert.match(networkFailure.getStatus().message, /connection refused/)
})

test('publishes the three snapshots at most once per second', async () => {
  const calls = []
  let now = 1000
  const client = createBackendClient({
    baseUrl: 'http://localhost:3001',
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      return jsonResponse({})
    }
  })
  const snapshot = {
    vehicle: { vehicleId: 'sim-vehicle-1' },
    sensorFrame: {
      vehicleId: 'sim-vehicle-1',
      routeId: 'city',
      source: 'simulated',
      readings: {}
    },
    routeId: 'city',
    obstacles: [{ id: 'cone-1' }]
  }

  assert.equal(await client.publishSnapshot(snapshot), true)
  assert.equal(await client.publishSnapshot(snapshot), false)
  assert.equal(calls.length, 3)
  assert.deepEqual(calls.map(({ url }) => url), [
    'http://localhost:3001/api/telemetry',
    'http://localhost:3001/api/sensors/data',
    'http://localhost:3001/api/obstacles'
  ])
  assert.deepEqual(calls[0].body, { vehicle: snapshot.vehicle })
  assert.deepEqual(calls[1].body, snapshot.sensorFrame)
  assert.deepEqual(calls[2].body, {
    routeId: 'city',
    obstacles: snapshot.obstacles
  })
  assert.deepEqual(client.getLatestVehicle(), null)

  now += 1000
  assert.equal(await client.publishSnapshot(snapshot), true)
  assert.equal(calls.length, 6)
})

test('exposes an isolated copy of the backend-acknowledged vehicle', async () => {
  const backendVehicle = {
    vehicleId: 'sim-vehicle-1',
    speedMps: 2,
    mode: 'manual'
  }
  const client = createBackendClient({
    baseUrl: 'http://localhost:3001',
    fetchImpl: async (url) => jsonResponse(
      url.endsWith('/api/telemetry')
        ? { vehicle: backendVehicle, mode: 'manual', updatedAt: '2026-11-04T00:00:00.000Z' }
        : {}
    )
  })

  await client.publishSnapshot({
    vehicle: backendVehicle,
    sensorFrame: {
      vehicleId: 'sim-vehicle-1',
      routeId: 'city',
      source: 'simulated',
      readings: {}
    },
    routeId: 'city',
    obstacles: []
  })
  const received = client.getLatestVehicle()
  assert.deepEqual(received, backendVehicle)
  received.speedMps = 0
  assert.equal(client.getLatestVehicle().speedMps, 2)
})

test('skips overlapping snapshots and reports partial failures', async () => {
  let release
  let callCount = 0
  const client = createBackendClient({
    baseUrl: 'http://localhost:3001',
    fetchImpl: async () => {
      callCount += 1
      if (callCount === 1) {
        await new Promise((resolve) => { release = resolve })
      }
      return jsonResponse({}, { ok: callCount !== 2, status: 503 })
    }
  })
  const snapshot = {
    vehicle: {},
    sensorFrame: { vehicleId: 'sim-vehicle-1', routeId: 'city', source: 'simulated', readings: {} },
    routeId: 'city',
    obstacles: []
  }

  const firstPublish = client.publishSnapshot(snapshot)
  assert.equal(await client.publishSnapshot(snapshot), false)
  assert.equal(callCount, 3)
  release()
  assert.equal(await firstPublish, false)
  assert.equal(client.getStatus().state, 'unavailable')
})
