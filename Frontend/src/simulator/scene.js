import * as THREE from 'three'
import { buildRoad } from './roads.js'
import { createVehicleMesh } from './vehicle.js'

const DEFAULT_FOLLOW_DISTANCE = 9.5
const DEFAULT_FOLLOW_HEIGHT = 5.4
const ORBIT_MIN_DISTANCE = 4.5
const ORBIT_MAX_DISTANCE = 28
const ORBIT_MIN_ELEVATION = 0.12
const ORBIT_MAX_ELEVATION = 1.42

function disposeObjectResources(object) {
  object.geometry?.dispose()
  if (Array.isArray(object.material)) {
    for (const material of object.material) material.dispose()
  } else {
    object.material?.dispose()
  }
}

export function createSimulationScene(
  container,
  road,
  initialVehicleColor = 0x00e5ff,
  surfaceCondition
) {
  if (!container || !road) {
    throw new TypeError('A viewport and road definition are required to create the scene.')
  }

  const scene = new THREE.Scene()
  const skyColor = 0x0b0f14
  scene.background = new THREE.Color(skyColor)
  scene.fog = new THREE.Fog(skyColor, 75, 220)

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 320)
  camera.position.set(0, DEFAULT_FOLLOW_HEIGHT, -DEFAULT_FOLLOW_DISTANCE)

  let renderer
  let resizeObserver
  let cameraMode = 'follow'
  let followDistance = DEFAULT_FOLLOW_DISTANCE
  let followHeight = DEFAULT_FOLLOW_HEIGHT
  let orbitAzimuth = Math.PI
  let orbitElevation = 0.44
  let orbitDistance = 12
  let pointerPosition = null
  let lastDistanceMeters = 0
  let disposed = false
  let frameCount = 0
  let lastFpsTime = performance.now()
  let currentFps = 60

  const abortController = new AbortController()
  const { signal } = abortController

  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.className = 'simulation-canvas'
    renderer.domElement.setAttribute('aria-label', `${road.name} 3D driving view`)
    container.append(renderer.domElement)

    // Engineering lighting rig
    const hemisphereLight = new THREE.HemisphereLight(0xdbeafe, 0x111827, 1.8)
    scene.add(hemisphereLight)

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
    keyLight.position.set(-25, 40, -10)
    keyLight.castShadow = true
    keyLight.shadow.mapSize.set(2048, 2048)
    keyLight.shadow.camera.left = -95
    keyLight.shadow.camera.right = 95
    keyLight.shadow.camera.top = 95
    keyLight.shadow.camera.bottom = -95
    keyLight.shadow.bias = -0.0005
    scene.add(keyLight)

    // Subtle cyan accent rim light for vehicle silhouette
    const rimLight = new THREE.DirectionalLight(0x0284c7, 0.85)
    rimLight.position.set(20, 15, 20)
    scene.add(rimLight)

    scene.add(buildRoad(road, surfaceCondition))

    const vehicle = createVehicleMesh({ color: initialVehicleColor })
    scene.add(vehicle)

    function resize() {
      if (disposed) return
      const bounds = container.getBoundingClientRect()
      const width = Math.max(1, Math.floor(bounds.width))
      const height = Math.max(1, Math.floor(bounds.height))
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(resize)
      resizeObserver.observe(container)
    } else {
      window.addEventListener('resize', resize, { signal })
    }
    resize()

    function updateCamera(targetPosition, targetHeading) {
      const target = new THREE.Vector3(targetPosition.x, 0.55, targetPosition.z)

      if (cameraMode === 'follow') {
        const desired = new THREE.Vector3(
          targetPosition.x - Math.sin(targetHeading) * followDistance,
          followHeight,
          targetPosition.z - Math.cos(targetHeading) * followDistance
        )
        camera.position.lerp(desired, 0.18)
        camera.lookAt(new THREE.Vector3(targetPosition.x, 0.7, targetPosition.z))
      } else if (cameraMode === 'topdown') {
        const desired = new THREE.Vector3(
          targetPosition.x,
          followHeight * 3.5,
          targetPosition.z
        )
        camera.position.lerp(desired, 0.2)
        camera.lookAt(target)
      } else if (cameraMode === 'bumper') {
        const desired = new THREE.Vector3(
          targetPosition.x + Math.sin(targetHeading) * 1.3,
          0.65,
          targetPosition.z + Math.cos(targetHeading) * 1.3
        )
        camera.position.copy(desired)
        const lookTarget = new THREE.Vector3(
          targetPosition.x + Math.sin(targetHeading) * 18,
          0.7,
          targetPosition.z + Math.cos(targetHeading) * 18
        )
        camera.lookAt(lookTarget)
      } else {
        // Orbit inspection mode
        const horizontalDistance = Math.cos(orbitElevation) * orbitDistance
        camera.position.set(
          target.x + Math.sin(orbitAzimuth) * horizontalDistance,
          target.y + Math.sin(orbitElevation) * orbitDistance,
          target.z + Math.cos(orbitAzimuth) * horizontalDistance
        )
        camera.lookAt(target)
      }
    }

    function render(state, input = {}) {
      if (disposed) return

      // Update vehicle transform
      vehicle.position.set(state.x, 0, state.z)
      vehicle.rotation.y = state.headingRadians

      // Wheel steering articulation
      if (typeof vehicle.setSteering === 'function') {
        vehicle.setSteering(state.steeringAngle ?? 0)
      }

      // Wheel rolling rotation
      if (typeof vehicle.rollWheels === 'function') {
        const deltaDist = (state.distanceMeters ?? 0) - lastDistanceMeters
        lastDistanceMeters = state.distanceMeters ?? 0
        vehicle.rollWheels(deltaDist)
      }

      // Brake light dynamic emission
      if (typeof vehicle.setBraking === 'function') {
        vehicle.setBraking(Boolean(input.brake))
      }

      updateCamera(vehicle.position, vehicle.rotation.y)
      renderer.render(scene, camera)

      // FPS tracking
      frameCount += 1
      const now = performance.now()
      if (now - lastFpsTime >= 500) {
        currentFps = Math.round((frameCount * 1000) / (now - lastFpsTime))
        frameCount = 0
        lastFpsTime = now
      }
    }

    function setCameraMode(mode) {
      if (mode !== 'follow' && mode !== 'orbit' && mode !== 'topdown' && mode !== 'bumper') {
        throw new TypeError(`Unsupported camera mode: ${mode}`)
      }
      cameraMode = mode
      pointerPosition = null
    }

    function resetCamera() {
      cameraMode = 'follow'
      followDistance = DEFAULT_FOLLOW_DISTANCE
      followHeight = DEFAULT_FOLLOW_HEIGHT
      orbitAzimuth = Math.PI
      orbitElevation = 0.44
      orbitDistance = 12
      pointerPosition = null
    }

    function setCameraParameters(params = {}) {
      if (Number.isFinite(params.followDistance)) {
        followDistance = Math.max(5, Math.min(20, params.followDistance))
      }
      if (Number.isFinite(params.followHeight)) {
        followHeight = Math.max(2.5, Math.min(12, params.followHeight))
      }
    }

    function setVehicleColor(colorHex) {
      if (typeof vehicle.setBodyColor === 'function') {
        vehicle.setBodyColor(colorHex)
      }
    }

    function getPerformanceMetrics() {
      return {
        fps: currentFps,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles
      }
    }

    // Pointer event listeners for orbit mode
    renderer.domElement.addEventListener('pointerdown', (event) => {
      if (cameraMode !== 'orbit' || event.button !== 0) return
      pointerPosition = { x: event.clientX, y: event.clientY }
      renderer.domElement.setPointerCapture(event.pointerId)
    }, { signal })

    renderer.domElement.addEventListener('pointermove', (event) => {
      if (cameraMode !== 'orbit' || !pointerPosition) return
      const deltaX = event.clientX - pointerPosition.x
      const deltaY = event.clientY - pointerPosition.y
      pointerPosition = { x: event.clientX, y: event.clientY }
      orbitAzimuth -= deltaX * 0.006
      orbitElevation = Math.max(
        ORBIT_MIN_ELEVATION,
        Math.min(ORBIT_MAX_ELEVATION, orbitElevation + deltaY * 0.005)
      )
    }, { signal })

    function releasePointer() {
      pointerPosition = null
    }

    renderer.domElement.addEventListener('pointerup', releasePointer, { signal })
    renderer.domElement.addEventListener('pointercancel', releasePointer, { signal })
    renderer.domElement.addEventListener('lostpointercapture', releasePointer, { signal })
    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault(), { signal })
    renderer.domElement.addEventListener('wheel', (event) => {
      if (cameraMode !== 'orbit') return
      event.preventDefault()
      orbitDistance = Math.max(
        ORBIT_MIN_DISTANCE,
        Math.min(ORBIT_MAX_DISTANCE, orbitDistance + event.deltaY * 0.012)
      )
    }, { passive: false, signal })

    return {
      render,
      setCameraMode,
      resetCamera,
      setCameraParameters,
      setVehicleColor,
      getPerformanceMetrics,
      dispose() {
        if (disposed) return
        disposed = true
        resizeObserver?.disconnect()
        abortController.abort()
        scene.traverse(disposeObjectResources)
        renderer.dispose()
        renderer.domElement.remove()
      }
    }
  } catch (error) {
    disposed = true
    resizeObserver?.disconnect()
    abortController.abort()
    if (renderer) {
      scene.traverse(disposeObjectResources)
      renderer.dispose()
      renderer.domElement.remove()
    }
    throw error
  }
}
