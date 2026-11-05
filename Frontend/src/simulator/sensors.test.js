import test from 'node:test'
import assert from 'node:assert/strict'
import { readSimulatedSensors } from './sensors.js'

const state = { x: 0, z: 0, headingRadians: 0 }

test('reports nearest front and side obstacle surface distances', () => {
  const road = {
    obstacles: [
      { id: 'front-cone', kind: 'cone', x: 0, z: 3, radius: 0.5 },
      { id: 'left-barrel', kind: 'barrel', x: -2, z: 0, radius: 0.5 },
      { id: 'right-barrier', kind: 'barrier', x: 2, z: 0, radius: 0.5 }
    ]
  }

  const readings = readSimulatedSensors(state, road)

  assert.equal(readings.frontUltrasonic.distanceMeters, 2.5)
  assert.equal(readings.frontUltrasonic.obstacleId, 'front-cone')
  assert.equal(readings.leftDistance.distanceMeters, 1.5)
  assert.equal(readings.leftDistance.obstacleId, 'left-barrel')
  assert.equal(readings.rightDistance.distanceMeters, 1.5)
  assert.equal(readings.rightDistance.obstacleId, 'right-barrier')
})

test('reports clear/no-return values for an empty road', () => {
  const readings = readSimulatedSensors(state, { obstacles: [] })

  for (const range of [
    readings.frontUltrasonic,
    readings.leftDistance,
    readings.rightDistance
  ]) {
    assert.deepEqual(range, {
      distanceMeters: null,
      obstacleId: null,
      obstacleKind: null,
      status: 'clear'
    })
  }
  assert.deepEqual(readings.cameraDetections, [])
})

test('excludes objects behind the vehicle and beyond range limits', () => {
  const readings = readSimulatedSensors(state, {
    obstacles: [
      { id: 'behind', kind: 'cone', x: 0, z: -2, radius: 0.5 },
      { id: 'too-far', kind: 'barrel', x: 0, z: 5, radius: 0.5 }
    ]
  })

  assert.equal(readings.frontUltrasonic.status, 'clear')
  assert.deepEqual(
    readings.cameraDetections.map(({ obstacleId }) => obstacleId),
    ['too-far']
  )
})

test('rotates the forward beam with vehicle heading', () => {
  const readings = readSimulatedSensors(
    { ...state, headingRadians: Math.PI / 2 },
    {
      obstacles: [
        { id: 'ahead-east', kind: 'cone', x: 3, z: 0, radius: 0.5 },
        { id: 'ahead-north', kind: 'barrel', x: 0, z: 3, radius: 0.5 }
      ]
    }
  )

  assert.equal(readings.frontUltrasonic.obstacleId, 'ahead-east')
  assert.equal(readings.frontUltrasonic.distanceMeters, 2.5)
  assert.equal(readings.leftDistance.obstacleId, 'ahead-north')
})

test('returns camera detections inside the field of view, nearest first', () => {
  const readings = readSimulatedSensors(state, {
    obstacles: [
      { id: 'far-visible', kind: 'barrel', x: 2, z: 8, radius: 0.5 },
      { id: 'near-visible', kind: 'cone', x: 0, z: 4, radius: 0.5 },
      { id: 'outside-angle', kind: 'pylon', x: 8, z: 4, radius: 0.5 },
      { id: 'outside-range', kind: 'barrier', x: 0, z: 16, radius: 0.5 }
    ]
  })

  assert.deepEqual(
    readings.cameraDetections.map(({ obstacleId }) => obstacleId),
    ['near-visible', 'far-visible']
  )
})

test('rejects invalid vehicle and obstacle geometry', () => {
  assert.throws(
    () => readSimulatedSensors({ ...state, x: Number.NaN }, { obstacles: [] }),
    TypeError
  )
  assert.throws(
    () => readSimulatedSensors(state, {
      obstacles: [{ id: 'invalid', kind: 'cone', x: 0, z: 1, radius: Number.NaN }]
    }),
    TypeError
  )
})
