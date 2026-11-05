import * as THREE from 'three'
import {
  findCollidingObstacle,
  isInsideRoad
} from './roads.js'

export const VEHICLE_RADIUS = 0.55
const DEFAULT_ACCELERATION_MPS2 = 4.2
const DEFAULT_BRAKING_MPS2 = 8.5
const COAST_DECELERATION_MPS2 = 1.7
const DEFAULT_STEERING_RATE_RADIANS_PER_SECOND = 1.25
const MIN_SPEED_MPS = 0.03
const WHEEL_RADIUS = 0.24

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function approach(value, target, amount) {
  if (value < target) return Math.min(value + amount, target)
  return Math.max(value - amount, target)
}

function getInputValue(value) {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0
}

export function createVehicleState(road) {
  return {
    x: road.start.x,
    z: road.start.z,
    headingRadians: road.start.headingRadians,
    speedMps: 0,
    distanceMeters: 0,
    steeringAngle: 0,
    status: 'ready',
    collisionId: null
  }
}

export function stepVehicle(state, input, road, deltaSeconds) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || state.status === 'collision') {
    return state
  }

  const delta = Math.min(deltaSeconds, 0.05)
  const throttle = getInputValue(input.throttle)
  const steering = getInputValue(input.steering)
  const maxSpeed = Number.isFinite(input.maxSpeedMps)
    ? Math.max(input.maxSpeedMps, 0)
    : 0
  const currentSpeed = Number.isFinite(state.speedMps) ? state.speedMps : 0

  const accelRate = DEFAULT_ACCELERATION_MPS2 * (input.accelerationFactor ?? 1.0)
  const brakeRate = DEFAULT_BRAKING_MPS2 * (input.brakingFactor ?? 1.0)
  const steeringRate = DEFAULT_STEERING_RATE_RADIANS_PER_SECOND * (input.steeringSensitivity ?? 1.0)

  let nextSpeed = currentSpeed

  if (input.brake) {
    nextSpeed = approach(currentSpeed, 0, brakeRate * delta)
  } else if (throttle === 0) {
    nextSpeed = approach(currentSpeed, 0, COAST_DECELERATION_MPS2 * delta)
  } else if (currentSpeed !== 0 && Math.sign(currentSpeed) !== Math.sign(throttle)) {
    nextSpeed = approach(currentSpeed, 0, brakeRate * delta)
  } else {
    nextSpeed = approach(currentSpeed, throttle * maxSpeed, accelRate * delta)
  }

  nextSpeed = clamp(nextSpeed, -maxSpeed, maxSpeed)
  if (Math.abs(nextSpeed) < MIN_SPEED_MPS) nextSpeed = 0

  const steeringScale = Math.min(Math.abs(nextSpeed) / Math.max(maxSpeed, 1), 1)
  const headingDelta = steering * Math.sign(nextSpeed) * steeringScale * steeringRate * delta
  const nextHeading = state.headingRadians + headingDelta

  // Virtual front wheel steering angle for visual articulation and telemetry
  const targetSteeringAngle = steering * 0.48 // ~27 degrees max physical lock
  const currentSteeringAngle = state.steeringAngle ?? 0
  const nextSteeringAngle = approach(currentSteeringAngle, targetSteeringAngle, 4.0 * delta)

  const candidate = {
    x: state.x + Math.sin(nextHeading) * nextSpeed * delta,
    z: state.z + Math.cos(nextHeading) * nextSpeed * delta
  }
  const collision = findCollidingObstacle(candidate, VEHICLE_RADIUS, road)

  if (collision) {
    return {
      ...state,
      speedMps: 0,
      steeringAngle: nextSteeringAngle,
      status: 'collision',
      collisionId: collision.id
    }
  }

  if (!isInsideRoad(candidate, VEHICLE_RADIUS, road)) {
    return {
      ...state,
      speedMps: 0,
      steeringAngle: nextSteeringAngle,
      status: 'boundary',
      collisionId: null
    }
  }

  return {
    ...state,
    x: candidate.x,
    z: candidate.z,
    headingRadians: nextHeading,
    speedMps: nextSpeed,
    steeringAngle: nextSteeringAngle,
    distanceMeters: state.distanceMeters + Math.hypot(candidate.x - state.x, candidate.z - state.z),
    status: Math.abs(nextSpeed) > 0 ? 'moving' : 'ready',
    collisionId: null
  }
}

export function createVehicleMesh(options = {}) {
  const car = new THREE.Group()
  car.name = 'rc-vehicle'

  const initialColor = options.color ?? 0x00e5ff
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: initialColor,
    roughness: 0.35,
    metalness: 0.45
  })
  const chassisMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.5
  })
  const cabinMaterial = new THREE.MeshStandardMaterial({
    color: 0x0b131a,
    roughness: 0.15,
    metalness: 0.85
  })
  const wheelRubberMaterial = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.88,
    metalness: 0.1
  })
  const wheelRimMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.3,
    metalness: 0.85
  })
  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xf0f9ff,
    emissive: 0x38bdf8,
    emissiveIntensity: 1.2,
    roughness: 0.2
  })
  const taillightMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xef4444,
    emissiveIntensity: 0.8,
    roughness: 0.3
  })
  const sensorMaterial = new THREE.MeshStandardMaterial({
    color: 0x0284c7,
    roughness: 0.3,
    metalness: 0.7
  })

  // 1. Lower Chassis Plate & Diffuser
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 2.15), chassisMaterial)
  chassis.position.y = 0.2
  chassis.castShadow = true
  chassis.receiveShadow = true
  car.add(chassis)

  // Front splitter & bumper
  const frontSplitter = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.05, 0.35), chassisMaterial)
  frontSplitter.position.set(0, 0.16, 1.15)
  frontSplitter.castShadow = true
  car.add(frontSplitter)

  // Rear diffuser
  const rearDiffuser = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.12, 0.3), chassisMaterial)
  rearDiffuser.position.set(0, 0.18, -1.15)
  car.add(rearDiffuser)

  // 2. Main Aerodynamic Body Shell
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.28, 2.05), bodyMaterial)
  body.position.y = 0.36
  body.castShadow = true
  body.receiveShadow = true
  car.add(body)

  // Front Hood Scoop / Incline
  const hood = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.8), bodyMaterial)
  hood.position.set(0, 0.44, 0.55)
  hood.castShadow = true
  car.add(hood)

  // 3. Cockpit Canopy / Greenhouse
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.3, 0.95), cabinMaterial)
  cabin.position.set(0, 0.62, -0.1)
  cabin.castShadow = true
  car.add(cabin)

  // 4. Rear Racing Wing / Spoiler
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 0.35), bodyMaterial)
  wing.position.set(0, 0.78, -1.02)
  wing.castShadow = true
  car.add(wing)

  // Wing upright struts
  for (const x of [-0.38, 0.38]) {
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.15), chassisMaterial)
    strut.position.set(x, 0.6, -1.0)
    car.add(strut)
  }

  // 5. Roof Autonomous Sensor Suite (LiDAR Puck & Compute Box)
  const computeBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.35), chassisMaterial)
  computeBox.position.set(0, 0.78, -0.1)
  car.add(computeBox)

  const lidarPuck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 0.14, 16),
    sensorMaterial
  )
  lidarPuck.position.set(0, 0.9, -0.1)
  lidarPuck.castShadow = true
  car.add(lidarPuck)

  const lidarAperture = new THREE.Mesh(
    new THREE.CylinderGeometry(0.125, 0.125, 0.04, 16),
    new THREE.MeshStandardMaterial({ color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 1.5 })
  )
  lidarAperture.position.set(0, 0.9, -0.1)
  car.add(lidarAperture)

  // Telemetry Antenna
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, 0.6, 6),
    chassisMaterial
  )
  antenna.position.set(0.3, 0.95, -0.28)
  antenna.rotation.x = -0.1
  car.add(antenna)

  // 6. Projector Headlights
  for (const x of [-0.44, 0.44]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.08), headlightMaterial)
    light.position.set(x, 0.38, 1.05)
    car.add(light)
  }

  // 7. Taillights (with brake intensity control)
  for (const x of [-0.44, 0.44]) {
    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.07, 0.06), taillightMaterial)
    taillight.position.set(x, 0.38, -1.05)
    car.add(taillight)
  }

  // 8. Wheels & Steering Groups
  const wheelMeshes = []
  const frontSteerGroups = []

  const createWheelMesh = () => {
    const wheelGroup = new THREE.Group()

    // Outer Rubber Tire
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.18, 16),
      wheelRubberMaterial
    )
    tire.rotation.z = Math.PI / 2
    tire.castShadow = true
    wheelGroup.add(tire)

    // Inner Metallic Rim
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(WHEEL_RADIUS * 0.65, WHEEL_RADIUS * 0.65, 0.19, 12),
      wheelRimMaterial
    )
    rim.rotation.z = Math.PI / 2
    wheelGroup.add(rim)

    // Center Lug Nut Cap
    const centerCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.21, 8),
      sensorMaterial
    )
    centerCap.rotation.z = Math.PI / 2
    wheelGroup.add(centerCap)

    return wheelGroup
  }

  // Rear Wheels (rigid axle)
  for (const x of [-0.64, 0.64]) {
    const wheel = createWheelMesh()
    wheel.position.set(x, WHEEL_RADIUS, -0.68)
    car.add(wheel)
    wheelMeshes.push(wheel)
  }

  // Front Wheels (mounted in left/right steering pivot groups)
  for (const x of [-0.64, 0.64]) {
    const steerGroup = new THREE.Group()
    steerGroup.position.set(x, WHEEL_RADIUS, 0.68)

    const wheel = createWheelMesh()
    steerGroup.add(wheel)

    car.add(steerGroup)
    frontSteerGroups.push(steerGroup)
    wheelMeshes.push(wheel)
  }

  // 9. Public Car API for Animation and Customization
  car.setSteering = (angleRadians) => {
    const clampedAngle = clamp(angleRadians, -0.55, 0.55)
    for (const group of frontSteerGroups) {
      group.rotation.y = clampedAngle
    }
  }

  car.rollWheels = (deltaDistance) => {
    const angleDelta = deltaDistance / WHEEL_RADIUS
    for (const wheel of wheelMeshes) {
      wheel.rotation.x += angleDelta
    }
  }

  car.setBraking = (isBraking) => {
    taillightMaterial.emissiveIntensity = isBraking ? 2.6 : 0.7
  }

  car.setBodyColor = (colorHex) => {
    bodyMaterial.color.set(colorHex)
    wing.material.color.set(colorHex)
  }

  return car
}
