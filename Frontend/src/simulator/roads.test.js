import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROAD_DEFINITIONS,
  distanceToRoadCenterline,
  isInsideRoad,
  findCollidingObstacle,
  buildRoad
} from './roads.js'

test('catalog contains the selected simulator road types', () => {
  assert.deepEqual(
    ROAD_DEFINITIONS.map((road) => road.id),
    ['city', 'highway', 'curved', 'obstacle-course', 'uneven']
  )
})

test('road helpers distinguish road center, shoulder, and an obstacle', () => {
  const road = ROAD_DEFINITIONS.find((item) => item.id === 'obstacle-course')
  assert.ok(road)
  assert.equal(distanceToRoadCenterline(road.start, road), 0)
  assert.equal(isInsideRoad(road.start, 0.4, road), true)
  assert.equal(isInsideRoad({ x: 1000, z: 1000 }, 0.4, road), false)
  assert.ok(road.obstacles.length > 0)
  const obstacle = road.obstacles[0]
  assert.equal(findCollidingObstacle(obstacle, 0.2, road)?.id, obstacle.id)
})

test('duplicate centerline points do not produce invalid distance values', () => {
  const degenerateRoad = {
    width: 4,
    centerline: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 10 }]
  }
  assert.equal(distanceToRoadCenterline({ x: 2, z: 1 }, degenerateRoad), 2)
})

test('road builder returns named Three.js groups and rejects invalid geometry', () => {
  for (const road of ROAD_DEFINITIONS) {
    const group = buildRoad(road)
    assert.equal(group.isGroup, true)
    assert.equal(group.name, `road-${road.id}`)
  }
  assert.throws(
    () => buildRoad({ id: 'invalid', width: 0, centerline: [] }),
    /at least two waypoints/
  )
})
