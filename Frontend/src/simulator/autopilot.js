import { isInsideRoad } from './roads.js'
import { getSurfaceCondition } from './surfaceConditions.js'

const VEHICLE_RADIUS = 0.55
const EXTRA_CLEARANCE = 0.5
const SAMPLE_SPACING = 0.5
const CONNECTOR_SAMPLE_SPACING = 0.25
const MAX_REJOIN_DISTANCE = 4
const MAX_STEERING_RATE = 1.25
const BRAKING_RATE = 8.5
export const AUTONOMOUS_SPEED_LIMIT_MPS = 4
const COMPLETE_DISTANCE = 0.35
const COMPLETE_SPEED = 0.03
const STOPPING_DISTANCE_MARGIN = 0.2

function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function distanceToSegment(point, start, end) {
  const deltaX = end.x - start.x
  const deltaZ = end.z - start.z
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ
  const ratio = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      (point.x - start.x) * deltaX + (point.z - start.z) * deltaZ
    ) / lengthSquared))
  return distanceBetween(point, {
    x: start.x + deltaX * ratio,
    z: start.z + deltaZ * ratio
  })
}

function getRoadLength(centerline) {
  let length = 0
  for (let index = 1; index < centerline.length; index += 1) {
    length += distanceBetween(centerline[index - 1], centerline[index])
  }
  return length
}

function pointOnRoad(centerline, distance) {
  let distanceAlong = 0

  for (let index = 1; index < centerline.length; index += 1) {
    const start = centerline[index - 1]
    const end = centerline[index]
    const length = distanceBetween(start, end)
    if (length === 0) continue

    if (distance <= distanceAlong + length || index === centerline.length - 1) {
      const ratio = Math.max(0, Math.min(1, (distance - distanceAlong) / length))
      const tangent = {
        x: (end.x - start.x) / length,
        z: (end.z - start.z) / length
      }
      return {
        point: {
          x: start.x + (end.x - start.x) * ratio,
          z: start.z + (end.z - start.z) * ratio
        },
        tangent
      }
    }

    distanceAlong += length
  }

  return null
}

function findClosestPointOnRoad(point, centerline) {
  let closest = null
  let distanceAlong = 0

  for (let index = 1; index < centerline.length; index += 1) {
    const start = centerline[index - 1]
    const end = centerline[index]
    const deltaX = end.x - start.x
    const deltaZ = end.z - start.z
    const length = Math.hypot(deltaX, deltaZ)
    if (length === 0) continue

    const ratio = Math.max(0, Math.min(1, (
      (point.x - start.x) * deltaX + (point.z - start.z) * deltaZ
    ) / (length * length)))
    const projected = {
      x: start.x + deltaX * ratio,
      z: start.z + deltaZ * ratio
    }
    const distance = distanceBetween(point, projected)

    if (!closest || distance < closest.distance) {
      closest = {
        distance,
        distanceAlong: distanceAlong + length * ratio
      }
    }
    distanceAlong += length
  }

  return closest
}

function isSafeConnector(start, end, road) {
  const length = distanceBetween(start, end)
  const sampleCount = Math.ceil(length / CONNECTOR_SAMPLE_SPACING)

  for (let index = 0; index <= sampleCount; index += 1) {
    const ratio = sampleCount === 0 ? 0 : index / sampleCount
    const point = {
      x: start.x + (end.x - start.x) * ratio,
      z: start.z + (end.z - start.z) * ratio
    }

    if (!isInsideRoad(point, VEHICLE_RADIUS, road)) return false
    for (const obstacle of road.obstacles) {
      if (distanceBetween(point, obstacle) < obstacle.radius + VEHICLE_RADIUS + EXTRA_CLEARANCE) {
        return false
      }
    }
  }

  return road.obstacles.every((obstacle) => (
    distanceToSegment(obstacle, start, end)
      >= obstacle.radius + VEHICLE_RADIUS + EXTRA_CLEARANCE
  ))
}

function findSafeRejoinIndex(startState, route, road) {
  if (!startState) return 0
  if (!Number.isFinite(startState.x) || !Number.isFinite(startState.z)) {
    throw new TypeError('startState must include finite x and z coordinates')
  }
  if (
    !isInsideRoad(startState, VEHICLE_RADIUS, road)
    || road.obstacles.some((obstacle) => (
      distanceBetween(startState, obstacle) <= obstacle.radius + VEHICLE_RADIUS
    ))
  ) {
    return null
  }

  const candidates = route
    .map((point, index) => ({
      index,
      point,
      distance: distanceBetween(startState, point)
    }))
    .filter((candidate) => candidate.distance <= MAX_REJOIN_DISTANCE)
    .sort((a, b) => a.distance - b.distance || a.index - b.index)

  return candidates.find((candidate) => (
    isSafeConnector(startState, candidate.point, road)
  ))?.index ?? null
}

function sampleRoad(centerline, length) {
  const samples = []
  for (let distance = 0; distance < length; distance += SAMPLE_SPACING) {
    samples.push({ distance, ...pointOnRoad(centerline, distance) })
  }
  samples.push({ distance: length, ...pointOnRoad(centerline, length) })
  return samples
}

function findObstaclesOnRoad(road, roadLength) {
  const obstacles = []

  for (const obstacle of road.obstacles) {
    if (!Number.isFinite(obstacle.radius) || obstacle.radius < 0) return null
    const closest = findClosestPointOnRoad(obstacle, road.centerline)
    if (!closest) return null

    const clearance = obstacle.radius + VEHICLE_RADIUS + EXTRA_CLEARANCE
    if (closest.distance < clearance) {
      const detourLength = clearance * 2.5
      if (
        closest.distanceAlong < detourLength
        || roadLength - closest.distanceAlong < detourLength
      ) {
        return null
      }
      obstacles.push({ ...obstacle, distanceAlong: closest.distanceAlong, clearance, detourLength })
    }
  }

  return obstacles
}

function createCandidateRoute(samples, obstacles, sides, road) {
  const points = samples.map((sample) => {
    let offset = 0
    for (let index = 0; index < obstacles.length; index += 1) {
      const obstacle = obstacles[index]
      const start = obstacle.distanceAlong - obstacle.detourLength
      const end = obstacle.distanceAlong + obstacle.detourLength
      if (sample.distance <= start || sample.distance >= end) continue

      const progress = (sample.distance - start) / (end - start)
      offset += sides[index] * obstacle.clearance * Math.sin(Math.PI * progress)
    }

    return {
      x: sample.point.x - sample.tangent.z * offset,
      z: sample.point.z + sample.tangent.x * offset
    }
  })

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (!isInsideRoad(point, VEHICLE_RADIUS, road)) return null

    for (const obstacle of road.obstacles) {
      const minimumDistance = obstacle.radius + VEHICLE_RADIUS + EXTRA_CLEARANCE
      if (distanceBetween(point, obstacle) < minimumDistance) return null
    }

    if (index === 0) continue
    const previous = points[index - 1]
    const middle = { x: (previous.x + point.x) / 2, z: (previous.z + point.z) / 2 }
    if (!isInsideRoad(middle, VEHICLE_RADIUS, road)) return null

    for (const obstacle of road.obstacles) {
      const minimumDistance = obstacle.radius + VEHICLE_RADIUS + EXTRA_CLEARANCE
      if (distanceToSegment(obstacle, previous, point) < minimumDistance) return null
    }
  }

  return points
}

function buildRoute(road) {
  if (
    !road
    || !Array.isArray(road.centerline)
    || road.centerline.length < 2
    || !Array.isArray(road.obstacles)
    || !Number.isFinite(road.width)
    || road.width <= VEHICLE_RADIUS * 2
  ) {
    return null
  }

  const length = getRoadLength(road.centerline)
  if (!Number.isFinite(length) || length <= 0) return null

  const obstacles = findObstaclesOnRoad(road, length)
  if (!obstacles) return null

  const samples = sampleRoad(road.centerline, length)
  let candidates = [[]]
  for (let index = 0; index < obstacles.length; index += 1) {
    candidates = candidates.flatMap((sides) => [
      [...sides, -1],
      [...sides, 1]
    ])
  }

  for (const sides of candidates) {
    const route = createCandidateRoute(samples, obstacles, sides, road)
    if (route) return route
  }

  return null
}

function makeCommand(throttle, steering, brake, status) {
  return { throttle, steering, brake, status }
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2
  while (angle < -Math.PI) angle += Math.PI * 2
  return angle
}

function getRouteTarget(route, cumulativeDistances, progress, lookAhead) {
  const targetDistance = Math.min(
    cumulativeDistances[cumulativeDistances.length - 1],
    cumulativeDistances[progress] + lookAhead
  )

  for (let index = progress + 1; index < route.length; index += 1) {
    if (cumulativeDistances[index] < targetDistance) continue
    const segmentLength = cumulativeDistances[index] - cumulativeDistances[index - 1]
    const ratio = segmentLength === 0
      ? 0
      : (targetDistance - cumulativeDistances[index - 1]) / segmentLength
    return {
      x: route[index - 1].x + (route[index].x - route[index - 1].x) * ratio,
      z: route[index - 1].z + (route[index].z - route[index - 1].z) * ratio
    }
  }

  return route[route.length - 1]
}

export function createAutopilot(road, options = {}) {
  const surfaceCondition = options.surfaceCondition
    ? getSurfaceCondition(options.surfaceCondition.id)
    : getSurfaceCondition('dry-asphalt')
  const route = buildRoute(road)
  if (!route) {
    return {
      status: 'blocked',
      update: () => makeCommand(0, 0, true, 'blocked')
    }
  }

  const cumulativeDistances = [0]
  for (let index = 1; index < route.length; index += 1) {
    cumulativeDistances.push(
      cumulativeDistances[index - 1] + distanceBetween(route[index - 1], route[index])
    )
  }

  const progressIndex = findSafeRejoinIndex(options.startState, route, road)
  if (progressIndex === null) {
    return {
      status: 'reset-required',
      update: () => makeCommand(0, 0, true, 'reset-required'),
      getProgress: () => ({
        currentWaypointIndex: 0,
        totalWaypoints: route.length,
        completionPercent: 0,
        routeWaypoints: route
      })
    }
  }

  let progress = progressIndex

  return {
    status: 'ready',
    update(state, maxSpeedMps, deltaSeconds) {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !Number.isFinite(maxSpeedMps)) {
        return makeCommand(0, 0, true, 'blocked')
      }

      while (
        progress < route.length - 2
        && distanceBetween(state, route[progress + 1]) <= distanceBetween(state, route[progress])
      ) {
        progress += 1
      }

      const endPoint = route[route.length - 1]
      let remainingDistance = (
        distanceBetween(state, route[progress])
        + cumulativeDistances[cumulativeDistances.length - 1]
        - cumulativeDistances[progress]
      )

      if (progress >= Math.max(0, route.length - 3)) {
        const finalSegmentStart = route[route.length - 2]
        const finalSegmentLength = distanceBetween(finalSegmentStart, endPoint)
        const finalDirection = {
          x: (endPoint.x - finalSegmentStart.x) / finalSegmentLength,
          z: (endPoint.z - finalSegmentStart.z) / finalSegmentLength
        }
        remainingDistance = Math.max(
          0,
          (endPoint.x - state.x) * finalDirection.x
            + (endPoint.z - state.z) * finalDirection.z
        )
      }

      if (
        distanceBetween(state, endPoint) <= COMPLETE_DISTANCE
        && Math.abs(state.speedMps) <= COMPLETE_SPEED
      ) {
        return makeCommand(0, 0, true, 'complete')
      }

      const lookAhead = Math.max(2, Math.abs(state.speedMps) * 0.45)
      const target = getRouteTarget(route, cumulativeDistances, progress, lookAhead)
      const desiredHeading = Math.atan2(target.x - state.x, target.z - state.z)
      const headingError = normalizeAngle(desiredHeading - state.headingRadians)
      const effectiveMaxSpeed = Math.min(
        Math.max(maxSpeedMps, 0),
        AUTONOMOUS_SPEED_LIMIT_MPS
      ) * surfaceCondition.speedFactor
      const speedRatio = Math.min(Math.abs(state.speedMps) / Math.max(effectiveMaxSpeed, 1), 1)
      const maxHeadingChange = MAX_STEERING_RATE * deltaSeconds * speedRatio
      const steering = maxHeadingChange > 0
        ? clamp(headingError / maxHeadingChange, -1, 1)
        : 0

      const targetSpeed = remainingDistance <= COMPLETE_DISTANCE
        ? 0
        : Math.min(
          effectiveMaxSpeed,
          Math.sqrt(2 * BRAKING_RATE * surfaceCondition.brakingFactor * Math.max(
            remainingDistance - STOPPING_DISTANCE_MARGIN,
            0
          ))
        )
      const brake = state.speedMps > targetSpeed
      const throttle = state.speedMps < targetSpeed ? 1 : 0

      return makeCommand(throttle, steering, brake, 'driving')
    },
    getProgress() {
      return {
        currentWaypointIndex: progress,
        totalWaypoints: route.length,
        completionPercent: Math.min(100, Math.round((progress / Math.max(1, route.length - 1)) * 100)),
        routeWaypoints: route
      }
    }
  }
}

export function getForwardObstacleProximity(state, road) {
  if (!road || !Array.isArray(road.obstacles) || road.obstacles.length === 0) {
    return { detected: false, distanceMeters: null, obstacleId: null, status: 'clear' }
  }

  const forwardX = Math.sin(state.headingRadians)
  const forwardZ = Math.cos(state.headingRadians)
  let closest = null
  let minDistance = Number.POSITIVE_INFINITY

  for (const obstacle of road.obstacles) {
    const toX = obstacle.x - state.x
    const toZ = obstacle.z - state.z
    const forwardDist = toX * forwardX + toZ * forwardZ
    const lateralDist = Math.abs(toX * -forwardZ + toZ * forwardX)

    if (forwardDist > 0 && forwardDist < 20 && lateralDist < (road.width / 2 + 1)) {
      const directDist = Math.hypot(toX, toZ) - (obstacle.radius ?? 0.6) - VEHICLE_RADIUS
      const trueDist = Math.max(0, directDist)
      if (trueDist < minDistance) {
        minDistance = trueDist
        closest = obstacle
      }
    }
  }

  if (closest && minDistance < 15) {
    const status = minDistance < 2.5 ? 'critical' : minDistance < 6.5 ? 'avoiding' : 'detected'
    return {
      detected: true,
      distanceMeters: minDistance,
      obstacleId: closest.id,
      obstacleKind: closest.kind,
      status
    }
  }

  return { detected: false, distanceMeters: null, obstacleId: null, status: 'clear' }
}
