import test from 'node:test'
import assert from 'node:assert/strict'
import { ROAD_DEFINITIONS } from './simulator/roads.js'
import { renderSimulator } from './simulator.js'
import { renderHome } from './home.js'

test('simulator markup includes all selected roads and accessible selection states', () => {
  const markup = renderSimulator()
  for (const road of ROAD_DEFINITIONS) {
    assert.match(markup, new RegExp(`data-road="${road.id}"`))
    assert.match(markup, new RegExp(road.name))
  }
  assert.match(markup, /aria-pressed="true"/)
})

test('simulator opens in map-based Autonomous mode with Manual available', () => {
  const markup = renderSimulator()
  assert.match(markup, /<option value="manual">Manual<\/option>/)
  assert.match(markup, /<option value="autonomous" selected>Autonomous<\/option>/)
  assert.match(markup, /Map-based autonomy uses the selected track layout and known obstacle locations/)
  assert.match(markup, /no machine learning, webcam access, or hardware connection/i)
})

test('simulator exposes simulated sensors and surface conditions accessibly', () => {
  const markup = renderSimulator()
  for (const id of ['dry-asphalt', 'wet-asphalt', 'uneven']) {
    assert.match(markup, new RegExp(`value="${id}"`))
  }
  for (const id of ['sensor-front-ultrasonic', 'sensor-left-distance', 'sensor-right-distance']) {
    assert.match(markup, new RegExp(`id="${id}"`))
  }
  assert.match(markup, /id="camera-detections"/)
  assert.match(markup, /id="current-surface-condition"/)
  assert.match(markup, /id="backend-sync-status" role="status"/)
  assert.match(markup, /BACKEND SYNC DISABLED/)
  assert.match(markup, /simulated sensor readings/i)

  const siteMarkup = `${renderHome()}${markup}`
  assert.doesNotMatch(siteMarkup, /week\s*[12]/i)
})

test('simulator markup includes the driving, telemetry, speed, and camera controls', () => {
  const markup = renderSimulator()
  for (const control of ['forward', 'reverse', 'left', 'right', 'brake']) {
    assert.match(markup, new RegExp(`data-control="${control}"`))
  }
  assert.match(markup, /id="speed-value"/)
  assert.match(markup, /id="distance-value"/)
  assert.match(markup, /id="max-speed"/)
  assert.match(markup, /id="simulation-toggle"/)
  assert.match(markup, /Start Autonomous Drive/)
  assert.match(markup, /id="simulation-stop"/)
  assert.match(markup, />Stop<\/button>/)
  assert.match(markup, /id="simulation-reset"/)
  assert.match(markup, /data-camera-mode="follow"/)
  assert.match(markup, /data-camera-mode="orbit"/)
  assert.match(markup, /id="camera-reset"/)
})

test('simulator markup provides an accessible renderer error and home navigation', () => {
  const markup = renderSimulator()
  assert.match(markup, /id="scene-error" role="alert"/)
  assert.match(markup, /href="#home"/)
  assert.match(markup, /no physical car connection/i)
})
