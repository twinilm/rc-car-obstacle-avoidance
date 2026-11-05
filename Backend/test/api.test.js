import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { loadConfig } from '../src/config.js'
import { createApp } from '../src/app.js'
import { createSimulationStore } from '../src/services/simulationStore.js'

let server
let baseUrl

before(async () => {
  const config = loadConfig({})
  server = createServer(createApp({ config, store: createSimulationStore() }))
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

after(async () => {
  if (server?.listening) await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
})

async function request(path, options) {
  return fetch(`${baseUrl}${path}`, options)
}

test('uses safe local defaults and rejects invalid server configuration', () => {
  assert.deepEqual(loadConfig({}), {
    host: '127.0.0.1',
    port: 3001,
    corsOrigins: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    jsonLimitBytes: 32768
  })
  assert.throws(() => loadConfig({ PORT: '70000' }), /PORT/)
  assert.throws(() => loadConfig({ HOST: '0.0.0.0' }), /loopback/)
  assert.throws(() => loadConfig({ CORS_ORIGINS: 'http://localhost:5173,' }), /CORS_ORIGINS/)
})

test('reports API health and returns JSON for unknown routes', async () => {
  const response = await request('/api/health')
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: 'ok', apiVersion: 1 })

  const missing = await request('/api/missing')
  assert.equal(missing.status, 404)
  assert.deepEqual((await missing.json()).error.code, 'NOT_FOUND')
})

test('handles malformed and oversized JSON with structured errors', async () => {
  const malformed = await request('/api/vehicle/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"mode":'
  })
  assert.equal(malformed.status, 400)
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON')

  const oversized = await request('/api/vehicle/mode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode: 'x'.repeat(33000) })
  })
  assert.equal(oversized.status, 413)
  assert.equal((await oversized.json()).error.code, 'PAYLOAD_TOO_LARGE')
})

test('allows configured origins and omits CORS access for unconfigured origins', async () => {
  const allowed = await request('/api/health', {
    headers: { origin: 'http://localhost:5173' }
  })
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173')

  const denied = await request('/api/health', {
    headers: { origin: 'https://example.invalid' }
  })
  assert.equal(denied.headers.get('access-control-allow-origin'), null)

  const preflight = await request('/api/vehicle/mode', {
    method: 'OPTIONS',
    headers: {
      origin: 'http://localhost:5173',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  })
  assert.equal(preflight.status, 204)
  assert.match(preflight.headers.get('access-control-allow-methods'), /POST/)
  assert.match(preflight.headers.get('access-control-allow-headers'), /content-type/i)
})

test('returns isolated defaults from the in-memory simulation store', () => {
  const store = createSimulationStore()
  assert.deepEqual(store.getVehicle(), {
    vehicle: null,
    mode: 'manual',
    updatedAt: null
  })
  assert.equal(store.getSensorFrame(), null)
  assert.deepEqual(store.getStatus(), {
    mode: 'manual',
    status: 'ready',
    emergencyStop: false,
    updatedAt: null
  })

  const control = { throttle: 0.5, steering: 0, brake: false, emergencyStop: false }
  store.setControl(control)
  const returned = store.getStatus()
  returned.mode = 'autonomous'
  assert.equal(store.getStatus().mode, 'manual')
})

test('validates modes and controls without accepting extra or out-of-range values', async () => {
  assert.deepEqual(await postJson('/api/vehicle/mode', { mode: 'autonomous' }), {
    status: 200,
    body: { mode: 'autonomous' }
  })
  const invalidMode = await postJson('/api/vehicle/mode', { mode: 'hardware' })
  assert.equal(invalidMode.status, 422)

  const validControl = await postJson('/api/vehicle/control', {
    throttle: 0.5,
    steering: -0.25,
    brake: false,
    emergencyStop: true
  })
  assert.equal(validControl.status, 200)
  assert.equal(validControl.body.control.emergencyStop, true)

  const invalidControl = await postJson('/api/vehicle/control', {
    throttle: 2,
    steering: 0,
    brake: false,
    emergencyStop: false
  })
  assert.equal(invalidControl.status, 422)
})

test('validates telemetry shape and does not mutate state on invalid input', async () => {
  const vehicle = {
    vehicleId: 'sim-vehicle-1',
    speedMps: 1,
    accelerationMps2: 0.5,
    braking: false,
    steering: 0.2,
    position: { x: 1, z: 2 },
    headingRadians: 0,
    mode: 'manual',
    status: 'moving',
    distanceMeters: 3
  }
  assert.equal((await postJson('/api/telemetry', { vehicle })).status, 200)
  const invalid = await postJson('/api/telemetry', {
    vehicle: { ...vehicle, speedMps: Number.MAX_VALUE }
  })
  assert.equal(invalid.status, 422)
  const current = await request('/api/vehicle')
  assert.equal((await current.json()).vehicle.speedMps, 1)
})

test('accepts only explicitly simulated sensor frames', async () => {
  const range = {
    distanceMeters: null,
    obstacleId: null,
    obstacleKind: null,
    status: 'clear'
  }
  const frame = {
    vehicleId: 'sim-vehicle-1',
    routeId: 'city',
    source: 'simulated',
    readings: {
      frontUltrasonic: range,
      leftDistance: range,
      rightDistance: range,
      cameraDetections: []
    }
  }
  assert.equal((await postJson('/api/sensors/data', frame)).status, 200)
  const invalid = await postJson('/api/sensors/data', { ...frame, source: 'hardware' })
  assert.equal(invalid.status, 422)
  assert.equal((await (await request('/api/sensors')).json()).frame.source, 'simulated')
})

test('replaces obstacles by route and rejects invalid obstacle sets atomically', async () => {
  const obstacle = {
    id: 'cone-1',
    kind: 'cone',
    x: 1,
    z: 2,
    radius: 0.5,
    distanceMeters: 1.7,
    status: 'active'
  }
  assert.equal((await postJson('/api/obstacles', {
    routeId: 'city',
    obstacles: [obstacle]
  })).status, 201)
  assert.equal((await postJson('/api/obstacles', {
    routeId: 'highway',
    obstacles: []
  })).status, 201)
  const invalid = await postJson('/api/obstacles', {
    routeId: 'city',
    obstacles: [{ ...obstacle, radius: -1 }]
  })
  assert.equal(invalid.status, 422)

  const city = await request('/api/obstacles?routeId=city')
  assert.deepEqual((await city.json()).obstacles, [obstacle])
  const all = await request('/api/obstacles')
  assert.deepEqual((await all.json()).routes.map((route) => route.routeId), ['city', 'highway'])
})

async function postJson(path, body) {
  const response = await request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: response.status, body: await response.json() }
}
