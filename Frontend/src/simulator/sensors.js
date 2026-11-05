export const ULTRASONIC_MAX_RANGE_M = 4
export const SIDE_SENSOR_MAX_RANGE_M = 2.5
export const SENSOR_BEAM_HALF_ANGLE_RADIANS = Math.PI / 12
export const CAMERA_MAX_RANGE_M = 15
export const CAMERA_FIELD_OF_VIEW_RADIANS = Math.PI / 3

const RANGE_SENSOR_CONFIG = {
  frontUltrasonic: {
    maxRangeMeters: ULTRASONIC_MAX_RANGE_M,
    direction: (heading) => ({ x: Math.sin(heading), z: Math.cos(heading) })
  },
  leftDistance: {
    maxRangeMeters: SIDE_SENSOR_MAX_RANGE_M,
    direction: (heading) => ({ x: -Math.cos(heading), z: Math.sin(heading) })
  },
  rightDistance: {
    maxRangeMeters: SIDE_SENSOR_MAX_RANGE_M,
    direction: (heading) => ({ x: Math.cos(heading), z: -Math.sin(heading) })
  }
}

function validateInputs(state, road) {
  if (
    !state
    || !Number.isFinite(state.x)
    || !Number.isFinite(state.z)
    || !Number.isFinite(state.headingRadians)
    || !road
    || !Array.isArray(road.obstacles)
  ) {
    throw new TypeError('Simulated sensors require a finite vehicle pose and road obstacles.')
  }

  for (const obstacle of road.obstacles) {
    if (
      !obstacle
      || typeof obstacle.id !== 'string'
      || typeof obstacle.kind !== 'string'
      || !Number.isFinite(obstacle.x)
      || !Number.isFinite(obstacle.z)
      || !Number.isFinite(obstacle.radius)
      || obstacle.radius < 0
    ) {
      throw new TypeError('Simulated sensor obstacles require finite positions and non-negative radii.')
    }
  }
}

function makeClearReading() {
  return {
    distanceMeters: null,
    obstacleId: null,
    obstacleKind: null,
    status: 'clear'
  }
}

function readRange(state, obstacles, direction, maxRangeMeters) {
  const perpendicular = { x: -direction.z, z: direction.x }
  let closest = null

  for (const obstacle of obstacles) {
    const deltaX = obstacle.x - state.x
    const deltaZ = obstacle.z - state.z
    const along = deltaX * direction.x + deltaZ * direction.z
    if (along <= 0) continue

    const lateral = Math.abs(deltaX * perpendicular.x + deltaZ * perpendicular.z)
    const angle = Math.atan2(lateral, along)
    if (angle > SENSOR_BEAM_HALF_ANGLE_RADIANS) continue

    const distanceMeters = Math.max(0, Math.hypot(deltaX, deltaZ) - obstacle.radius)
    if (distanceMeters > maxRangeMeters || (closest && distanceMeters >= closest.distanceMeters)) continue

    closest = { obstacle, distanceMeters }
  }

  if (!closest) return makeClearReading()

  return {
    distanceMeters: closest.distanceMeters,
    obstacleId: closest.obstacle.id,
    obstacleKind: closest.obstacle.kind,
    status: 'detected'
  }
}

function readCameraDetections(state, obstacles) {
  const forwardX = Math.sin(state.headingRadians)
  const forwardZ = Math.cos(state.headingRadians)
  const detections = []

  for (const obstacle of obstacles) {
    const deltaX = obstacle.x - state.x
    const deltaZ = obstacle.z - state.z
    const forwardDistance = deltaX * forwardX + deltaZ * forwardZ
    if (forwardDistance <= 0) continue

    const lateralDistance = Math.abs(deltaX * forwardZ - deltaZ * forwardX)
    const angle = Math.atan2(lateralDistance, forwardDistance)
    const distanceMeters = Math.max(0, Math.hypot(deltaX, deltaZ) - obstacle.radius)

    if (
      angle <= CAMERA_FIELD_OF_VIEW_RADIANS / 2
      && distanceMeters <= CAMERA_MAX_RANGE_M
    ) {
      detections.push({
        obstacleId: obstacle.id,
        obstacleKind: obstacle.kind,
        distanceMeters
      })
    }
  }

  return detections.sort((a, b) => a.distanceMeters - b.distanceMeters)
}

export function readSimulatedSensors(state, road) {
  validateInputs(state, road)

  const readings = {}
  for (const [name, config] of Object.entries(RANGE_SENSOR_CONFIG)) {
    readings[name] = readRange(
      state,
      road.obstacles,
      config.direction(state.headingRadians),
      config.maxRangeMeters
    )
  }

  return {
    ...readings,
    cameraDetections: readCameraDetections(state, road.obstacles)
  }
}
