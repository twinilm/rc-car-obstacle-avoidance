# Autonomous RC Car 3D Simulator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a static-hostable, interactive Three.js RC car simulator with three selectable roads and manual driving, while keeping autonomy and hardware integration explicitly future work.

**Architecture:** Preserve the existing Vite hash-routed homepage. Implement pure road data/collision and vehicle kinematics as small JavaScript modules, render their output with Three.js, and connect them through the current simulator view and its start/pause/restart states. Document future hardware interfaces without adding a backend or physical connection.

**Tech Stack:** Vite, vanilla JavaScript, CSS, Three.js `0.160.0`, Node.js built-in `node:test`.

**Spec:** [Approved simulator design](../designs/2026-10-27-autonomous-rc-3d-simulator.md)

## Global Constraints

- Add the exact Three.js version `0.160.0` as a direct dependency.
- Use procedural Three.js geometry for the RC car, roads, markings, cones, and barriers; do not require external model downloads.
- Use lightweight custom JavaScript kinematics rather than a full physics engine.
- Implement City Roads, Curved Roads, and an Obstacle Course as selectable simulator environments.
- Use Manual as the only driving mode; Autonomous is a visible, non-functional placeholder.
- Keep all simulator runtime behavior client-side, with no user data collection or external runtime service.
- Do not add a backend, database, hardware connection, autonomous-driving implementation, machine learning, object detection, or fabricated sensor readings.
- Keep the existing hash-router and Vite relative `base: './'` configuration for GitHub Pages.
- Target a typical modern desktop browser with WebGL; aim for smooth interaction around 30 FPS and show a useful error when WebGL is unavailable.
- Preserve the current homepage and navigation; do not recreate the project.
- This workspace is not currently a Git repository; do not add commit or push steps or initialize Git without user direction.

## Project File Map

- `package.json`, `package-lock.json`: pin Three.js 0.160.0.
- `src/main.js`: existing hash routing and lifecycle cleanup.
- `src/home.js`: existing homepage; retain its content and working links.
- `src/simulator.js`: road/mode picker, simulator UI, and control/state coordinator.
- `src/simulator/roads.js`: road catalog, Three.js road builder, and pure road/obstacle collision helpers.
- `src/simulator/vehicle.js`: pure vehicle state/kinematics and procedural vehicle mesh creation.
- `src/simulator/scene.js`: Three.js renderer, lighting, scene assembly, follow/orbit camera, viewport resize, and resource disposal.
- `src/simulator/roads.test.js`: built-in Node tests for road catalog and collision helpers.
- `src/simulator/vehicle.test.js`: built-in Node tests for movement, speed cap, braking/reverse, steering, and collision response.
- `src/simulator.test.js`: built-in Node test for the road/mode picker markup contract.
- `src/style.css`: preserve homepage styling; add responsive road picker, scene canvas, controls, dashboard, and errors.
- `docs/HARDWARE-INTEGRATION.md`: proposed future commands/sensors/telemetry and the separate gateway boundary.

## Review Focus

- A curved-road or turning vehicle must remain bounded by the road: test closest-centerline distance and boundary behavior in `roads.test.js` and `vehicle.test.js`.
- Holding reverse while moving forward must brake to a stop before reversing, and speed must never exceed the selected cap: test in `vehicle.test.js`.
- Obstacle collision must stop the car and identify a collision status without moving through a cone/barrier: test in `vehicle.test.js`.
- Losing focus, pausing, restarting, or navigating away must not leave a held key/pointer active or a render loop running: exercise all lifecycle paths in browser checks for Task 4.
- WebGL initialization failure must produce a visible message and preserve Home navigation rather than silently pretending to render: validate the error path in Task 3/4.

---

### Task 1: Add Three.js and define reusable roads

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/simulator/roads.js`
- Create: `src/simulator/roads.test.js`

**Interfaces:**
- Produces `ROAD_DEFINITIONS`, with exactly `city`, `curved`, and `obstacle-course` entries. Each entry has `id`, `name`, `summary`, `width`, `centerline` (`[{x, z}]`), `start` (`{x, z, headingRadians}`), `surface`, `markings`, and `obstacles` (`[{id, kind, x, z, radius}]`).
- Produces `distanceToRoadCenterline(position, road): number`, `isInsideRoad(position, vehicleRadius, road): boolean`, `findCollidingObstacle(position, vehicleRadius, road): obstacle | null`, and `buildRoad(road): THREE.Group`.
- Road collision helpers use plain `{x, z}` values and remain deterministic; `buildRoad` owns only geometry creation and returns a group for the scene to attach.
- A private `distanceToSegment(point, start, end): number` helper handles zero-length segments without returning `NaN`.

- [x] **Step 1: Add the approved exact Three.js dependency**

Run:

```powershell
npm install --save-exact three@0.160.0
```

Expected: `package.json` records `"three": "0.160.0"` and the lockfile resolves that exact version.

- [x] **Step 2: Write failing road catalog and collision tests**

Create `src/simulator/roads.test.js` with Node’s built-in test runner:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROAD_DEFINITIONS,
  distanceToRoadCenterline,
  isInsideRoad,
  findCollidingObstacle
} from './roads.js'

test('catalog contains the three selected simulator road types', () => {
  assert.deepEqual(
    ROAD_DEFINITIONS.map((road) => road.id),
    ['city', 'curved', 'obstacle-course']
  )
})

test('road helpers distinguish road center, shoulder, and an obstacle', () => {
  const road = ROAD_DEFINITIONS.find((item) => item.id === 'obstacle-course')
  assert.equal(distanceToRoadCenterline(road.start, road), 0)
  assert.equal(isInsideRoad(road.start, 0.4, road), true)
  assert.equal(isInsideRoad({ x: 1000, z: 1000 }, 0.4, road), false)
  assert.ok(road.obstacles.length > 0)
  const obstacle = road.obstacles[0]
  assert.equal(findCollidingObstacle(obstacle, 0.2, road).id, obstacle.id)
})

test('duplicate centerline points do not produce invalid distance values', () => {
  const degenerateRoad = {
    width: 4,
    centerline: [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 10 }]
  }
  assert.equal(distanceToRoadCenterline({ x: 0, z: 1 }, degenerateRoad), 1)
})
```

- [ ] **Step 3: Run the road tests and verify the expected initial failure**

Run: `node --test src/simulator/roads.test.js`

Expected: FAIL because `src/simulator/roads.js` does not yet export the catalog/helpers.

- [ ] **Step 4: Implement the road catalog and pure collision helpers**

Define distinct waypoint routes and obstacles for City, Curved, and Obstacle Course. Implement point-to-segment distance across every centerline segment; `isInsideRoad` returns true only when the minimum distance plus vehicle radius is no greater than half road width. `findCollidingObstacle` returns the first obstacle whose center distance is less than the sum of radii, or `null`.

```js
function distanceToSegment(point, start, end) {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const lengthSquared = dx * dx + dz * dz
  const amount = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
  return Math.hypot(point.x - (start.x + amount * dx), point.z - (start.z + amount * dz))
}

export function distanceToRoadCenterline(position, road) {
  return Math.min(...road.centerline.slice(1).map((point, index) => {
    const start = road.centerline[index]
    return distanceToSegment(position, start, point)
  }))
}
```

Build `buildRoad(road)` from a Three.js ribbon sampled along waypoint segments. Add the road surface, edge markers, markings appropriate to the definition, and procedural cone/barrier meshes from obstacle entries. Return a group without attaching it to an unrelated/global scene.

- [ ] **Step 5: Run road tests and build**

Run: `node --test src/simulator/roads.test.js`

Expected: PASS for catalog selection, centerline distance, boundary, and obstacle checks.

Run: `npm run build`

Expected: PASS with Three.js bundled by Vite.

### Task 2: Implement and test vehicle kinematics

**Files:**
- Create: `src/simulator/vehicle.js`
- Create: `src/simulator/vehicle.test.js`
- Modify: `src/simulator/roads.test.js` only if a shared collision test fixture is needed.

**Interfaces:**
- Produces `createVehicleState(road): VehicleState`.
- Produces `stepVehicle(state, input, road, deltaSeconds): VehicleState`, returning a new state without mutating its arguments.
- `input` is `{ throttle: -1 | 0 | 1, steering: -1 | 0 | 1, brake: boolean, maxSpeedMps: number }`.
- `VehicleState` is `{x, z, headingRadians, speedMps, distanceMeters, status, collisionId}`.
- Produces `createVehicleMesh(): THREE.Group` for the renderer.

- [ ] **Step 1: Write failing kinematics tests**

Create `src/simulator/vehicle.test.js`. Use a straight fake road with no obstacles to keep tests independent of Three.js rendering:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { createVehicleState, stepVehicle } from './vehicle.js'

const road = {
  width: 20,
  centerline: [{ x: 0, z: -100 }, { x: 0, z: 100 }],
  start: { x: 0, z: 0, headingRadians: 0 },
  obstacles: []
}

test('forward input accelerates and respects the selected speed cap', () => {
  let state = createVehicleState(road)
  for (let frame = 0; frame < 120; frame += 1) {
    state = stepVehicle(state, {
      throttle: 1, steering: 0, brake: false, maxSpeedMps: 4
    }, road, 1 / 60)
  }
  assert.ok(state.speedMps > 0)
  assert.ok(state.speedMps <= 4)
  assert.ok(state.z > 0)
})
```

Add separate tests for steering changing heading, reverse input braking to zero before negative speed, brake reducing absolute speed, and distance never becoming negative.

Use assertions like these to ensure reverse does not instantly change direction:

```js
test('reverse input brakes before changing travel direction', () => {
  const movingForward = {
    ...createVehicleState(road),
    speedMps: 1
  }
  const braking = stepVehicle(movingForward, {
    throttle: -1, steering: 0, brake: false, maxSpeedMps: 4
  }, road, 1 / 60)
  assert.ok(braking.speedMps >= 0)
  let state = braking
  for (let frame = 0; frame < 60; frame += 1) {
    state = stepVehicle(state, {
      throttle: -1, steering: 0, brake: false, maxSpeedMps: 4
    }, road, 1 / 60)
  }
  assert.ok(state.speedMps < 0)
})

test('steering changes heading while braking reduces speed and distance stays nonnegative', () => {
  const moving = { ...createVehicleState(road), speedMps: 2 }
  const turning = stepVehicle(moving, {
    throttle: 0, steering: 1, brake: false, maxSpeedMps: 4
  }, road, 1 / 60)
  assert.notEqual(turning.headingRadians, moving.headingRadians)

  const braking = stepVehicle(moving, {
    throttle: 0, steering: 0, brake: true, maxSpeedMps: 4
  }, road, 1 / 60)
  assert.ok(braking.speedMps >= 0)
  assert.ok(braking.speedMps < moving.speedMps)
  assert.ok(braking.distanceMeters >= 0)
})

test('obstacle contact stops the vehicle and reports the obstacle id', () => {
  const blockedRoad = {
    ...road,
    obstacles: [{ id: 'cone-1', kind: 'cone', x: 0, z: 0, radius: 0.6 }]
  }
  const state = {
    ...createVehicleState(blockedRoad),
    speedMps: 2
  }
  const result = stepVehicle(state, {
    throttle: 1, steering: 0, brake: false, maxSpeedMps: 4
  }, blockedRoad, 1 / 60)
  assert.equal(result.speedMps, 0)
  assert.equal(result.collisionId, 'cone-1')
})
```

- [ ] **Step 2: Run the vehicle tests and verify they fail first**

Run: `node --test src/simulator/vehicle.test.js`

Expected: FAIL because the vehicle module is not implemented.

- [ ] **Step 3: Implement pure vehicle state and update**

Use bounded acceleration/deceleration and delta time capped to avoid large time jumps after a paused tab. Positive throttle accelerates forward; negative throttle decelerates forward motion before entering reverse. Brake decelerates toward zero. Clamp absolute speed to `maxSpeedMps`. Apply steering as heading change proportional to signed speed, integrate x/z position and absolute traveled distance, then use the Task 1 road helpers to set boundary/collision status. A collision stops motion and stores the obstacle ID.

```js
export function createVehicleState(road) {
  return {
    x: road.start.x,
    z: road.start.z,
    headingRadians: road.start.headingRadians,
    speedMps: 0,
    distanceMeters: 0,
    status: 'ready',
    collisionId: null
  }
}
```

Keep all constants in `vehicle.js` and validate/clamp input speed limits to finite non-negative values.

- [ ] **Step 4: Add a procedural RC car mesh**

Create the body, cabin, wheels, and front marker from low-poly Three.js primitives in `createVehicleMesh()`. Return a single group with the same forward orientation as the road’s `headingRadians`; do not load remote models or assets.

```js
export function createVehicleMesh() {
  const car = new THREE.Group()
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(1.3, 0.35, 2.1),
    new THREE.MeshStandardMaterial({ color: 0xc4f277, roughness: 0.55 })
  )
  body.position.y = 0.42
  car.add(body)
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 0.35, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x29434b, roughness: 0.3 })
  )
  cabin.position.set(0, 0.75, -0.15)
  car.add(cabin)
  const wheelGeometry = new THREE.CylinderGeometry(0.24, 0.24, 0.16, 12)
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.8 })
  for (const x of [-0.66, 0.66]) {
    for (const z of [-0.68, 0.68]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
      wheel.rotation.z = Math.PI / 2
      wheel.position.set(x, 0.24, z)
      car.add(wheel)
    }
  }
  const frontMarker = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 0.08, 0.08),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x667744 })
  )
  frontMarker.position.set(0, 0.48, 1.08)
  car.add(frontMarker)
  return car
}
```

- [ ] **Step 5: Run both pure module test files**

Run: `node --test src/simulator/roads.test.js src/simulator/vehicle.test.js`

Expected: PASS for all catalog, boundary, obstacle, movement, steering, braking/reverse, and speed-cap tests.

### Task 3: Create the Three.js scene and camera

**Files:**
- Create: `src/simulator/scene.js`
- Modify: `src/simulator/roads.js` if geometry sampling needs a private helper
- Modify: `src/simulator/vehicle.js` only to correct the mesh's orientation contract.

**Interfaces:**
- Produces `createSimulationScene(container: HTMLElement, road: RoadDefinition)`.
- Returns `{ render(state), setCameraMode(mode), resetCamera(), dispose() }`.
- `mode` is `'follow' | 'orbit'`.
- Throws an initialization error if renderer/WebGL creation fails; the UI coordinator catches it and displays a visible error.

- [ ] **Step 1: Implement renderer and scene creation**

In `scene.js`, implement renderer initialization inside `createSimulationScene`; append the canvas to the supplied viewport container, set pixel ratio to a capped value, enable shadows only for the low-cost scene, add ambient/directional lighting, build the selected road, and attach `createVehicleMesh()`.

```js
import * as THREE from 'three'
import { buildRoad } from './roads.js'
import { createVehicleMesh } from './vehicle.js'

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
container.append(renderer.domElement)
```

- [ ] **Step 2: Implement rendering and vehicle synchronization**

Implement `render(state)` to set the car's position and heading, update the camera, and draw the scene. The scene module does not own the vehicle simulation or input state.

```js
function render(state) {
  vehicle.position.set(state.x, 0, state.z)
  vehicle.rotation.y = state.headingRadians
  updateCamera(vehicle.position)
  renderer.render(scene, camera)
}
```

- [ ] **Step 3: Implement camera controls**

Initialize a follow camera. `setCameraMode('orbit')` enables pointer drag to adjust azimuth/elevation and wheel/trackpad zoom; clamp elevation and zoom to safe ranges. `setCameraMode('follow')` restores a trailing view; `resetCamera()` restores default distance and angle. Remove all pointer/wheel/resize listeners during `dispose()`.

```js
function setCameraMode(mode) {
  cameraMode = mode
  if (mode === 'follow') resetCamera()
}
```

- [ ] **Step 4: Implement resize and renderer disposal**

Use `ResizeObserver` or a window resize listener to update renderer size and camera aspect. In `dispose()`, disconnect resize handling, remove camera listeners, dispose every geometry/material and the renderer, remove the canvas, and make repeated cleanup harmless.

```js
function dispose() {
  if (disposed) return
  disposed = true
  resizeObserver.disconnect()
  abortController.abort()
  scene.traverse((object) => disposeObjectResources(object))
  renderer.dispose()
  renderer.domElement.remove()
}
```

- [ ] **Step 5: Build and verify scene module integration**

Run: `npm run build`

Expected: PASS with Three.js imports bundled locally. Check the `createSimulationScene` boundary for explicit failures rather than empty render fallbacks. Browser-rendered interaction is verified in Task 4 once the route is wired.

### Task 4: Connect road selection, driving controls, and lifecycle

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/main.js` only if cleanup propagation needs adjustment
- Modify: `src/style.css`
- Create: `src/simulator.test.js`

**Interfaces:**
- `renderSimulator(): string` returns the road/mode selection view.
- `setupSimulator(container: HTMLElement): () => void` owns view listeners and animation lifecycle.
- `createVehicleState(road)` and `stepVehicle(state, input, road, deltaSeconds)` come from `vehicle.js`.
- `createSimulationScene(container, road)` comes from `scene.js`.
- `ROAD_DEFINITIONS` comes from `roads.js`.
- Road buttons expose `data-road="<road-id>"`; the Manual/Autonomous selector uses `#driving-mode`; the start/pause control uses `#simulation-toggle`.

- [ ] **Step 1: Add failing simulator-markup tests**

Create `src/simulator.test.js` with Node’s built-in runner and test the rendered markup:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { renderSimulator } from './simulator.js'

test('simulator exposes all road types, modes, and drive controls', () => {
  const markup = renderSimulator()
  for (const id of ['city', 'curved', 'obstacle-course']) {
    assert.match(markup, new RegExp(`data-road="${id}"`))
  }
  assert.match(markup, /<option value="manual" selected>Manual<\/option>/)
  assert.match(markup, /<option value="autonomous">Autonomous<\/option>/)
  assert.match(markup, /id="simulation-toggle"/)
})
```

- [ ] **Step 2: Run the markup test and verify it fails first**

Run: `node --test src/simulator.test.js`

Expected: FAIL because the current simulator markup is the old in-place CSS mockup.

- [ ] **Step 3: Implement pre-drive road and mode selection**

Render cards for City, Curved, and Obstacle Course from `ROAD_DEFINITIONS`; selecting one highlights the choice and updates the viewport preview. Add Manual/Autonomous choices. Manual is required to start driving. Selecting Autonomous displays a visible non-functional placeholder and does not start autonomous motion or generate sensor results.

- [ ] **Step 4: Add unified keyboard and on-screen manual input**

Map W/Up to throttle forward; S/Down to negative throttle (brake to zero before reverse); A/Left and D/Right to steering. On-screen buttons use pointer hold and the same input state. Prevent browser defaults only for supported controls when the target is not an editable field. Clear held input on keyup, pointerup/cancel/lost capture, window blur, tab hide, pause, restart, and view cleanup.

```js
const controlKeys = new Map([
  ['w', 'forward'], ['ArrowUp', 'forward'],
  ['s', 'reverse'], ['ArrowDown', 'reverse'],
  ['a', 'left'], ['ArrowLeft', 'left'],
  ['d', 'right'], ['ArrowRight', 'right'],
  [' ', 'brake']
])
```

- [ ] **Step 5: Add simulator state controls and telemetry**

Opening the route creates the preview scene and its render loop. Start enables simulation updates; Pause stops vehicle updates and changes status; Resume continues; Reset restores the same road, car, distance, and collision state. Add a maximum-speed slider with an explicit displayed mph value; convert its value to m/s for `stepVehicle`. Display speed in mph, selected road, run status, and collision/boundary status. Add Follow/Orbit and Reset Camera controls.

```js
function frame(timestamp) {
  const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.05)
  lastTimestamp = timestamp
  if (simulatorState === 'running') {
    vehicleState = stepVehicle(vehicleState, readInput(), selectedRoad, deltaSeconds)
  }
  sceneRenderer?.render(vehicleState)
  animationFrame = requestAnimationFrame(frame)
}
```

- [ ] **Step 6: Handle failures and route cleanup**

Catch renderer initialization errors at the UI boundary and replace the viewport with a clear WebGL/initialization error and Home navigation. Make cleanup cancel animation, release inputs, detach handlers, call `scene.dispose()`, and safely handle navigation before the user has started a scene.

```js
try {
  sceneRenderer = createSimulationScene(viewport, selectedRoad)
} catch (error) {
  showSceneError(viewport, error instanceof Error ? error.message : 'WebGL initialization failed.')
}
```

- [ ] **Step 7: Style the real simulator and mobile layout**

Preserve homepage rules. Replace placeholder-only simulator styling with a visible canvas viewport, responsive road-selection cards, telemetry, start/pause/reset/speed controls, mode labels, camera controls, loading/error states, and mobile layouts without horizontal overflow. Include visible keyboard focus states and usable touch targets.

```css
.sim-viewport canvas {
  display: block;
  width: 100%;
  height: 100%;
}

@media (max-width: 700px) {
  .simulator-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 8: Run unit tests and verify browser behavior**

Run `node --test src/simulator/roads.test.js src/simulator/vehicle.test.js src/simulator.test.js` and `npm run dev`. Check `/#home`, `/#simulator`, and direct refresh at `/#simulator`. Verify all three roads, throttle/steering/reverse/brake, max speed, pause/resume, restart, collision/bounds, follow/orbit/zoom/reset, Manual/Autonomous placeholder, Home navigation, focus-loss cleanup, and a 375px viewport. Confirm no console errors and no horizontal overflow. On a typical desktop browser, count animation frames over five seconds while driving and confirm the scene approaches the assumed 30 FPS target without accumulating render loops after route cleanup.

To exercise the WebGL initialization fallback, use browser automation to make `HTMLCanvasElement.getContext('webgl2')` throw before loading the simulator. Start a road and confirm a visible renderer error appears and Home remains navigable.

### Task 5: Document future hardware contracts and validate deployment

**Files:**
- Create: `docs/HARDWARE-INTEGRATION.md`
- Modify: `package.json` to add the built-in test command.
- Do not modify: `vite.config.js` unless relative asset validation fails.

**Interfaces:**
- Documentation covers `VehicleCommand`, `VehicleTelemetry`, and `SensorFrame` as shapes proposed in the approved design.
- No runtime code imports the hardware contract document or connects to an endpoint.
- Add `"test": "node --test src/simulator/roads.test.js src/simulator/vehicle.test.js src/simulator.test.js"` to package scripts; preserve existing scripts.

- [ ] **Step 1: Document the future communication boundary**

Create `docs/HARDWARE-INTEGRATION.md` with the agreed command, telemetry, and sensor fields; label every item as proposed and not implemented. Explain that GitHub Pages serves static frontend assets and a separate backend gateway would be required for physical hardware, authentication, transport, command validation, timeouts, and safe disconnect behavior.

Use the full `VehicleCommand`, `VehicleTelemetry`, and `SensorFrame` field shapes in the approved design. Include units and make each timestamp explicit; label samples as contracts, not actual readings.

Add the test command while preserving the existing `dev`, `build`, and `preview` scripts:

```json
"test": "node --test src/simulator/roads.test.js src/simulator/vehicle.test.js src/simulator.test.js"
```

```js
export const VehicleCommand = {
  throttle: 0, // proposed range: -1 to 1
  steering: 0, // proposed range: -1 to 1
  brake: false,
  mode: 'manual',
  timestamp: 'ISO-8601'
}
```

- [ ] **Step 2: Run pure tests and the production build**

Run:

```powershell
npm test
npm run build
```

Expected: all tests pass and Vite emits a production build.

- [ ] **Step 3: Inspect GitHub Pages asset paths**

Inspect `dist/index.html` for relative `./assets/...` script and stylesheet URLs and verify the favicon is copied. Do not change the existing `base: './'` configuration if these checks pass. No GitHub Actions workflow is added unless the repository already has a deployment convention.

- [ ] **Step 4: Review simulator scope**

Search the delivered simulator and documentation for unsupported claims: confirm there is no ML/autonomous implementation, hardware connection, generated sensor data presented as real, backend, or database. Ensure the UI says autonomous mode and hardware integration are future work.

## Self-review

- Scope coverage: three selected road environments; road chooser; procedural 3D car/track; camera; manual input; boundaries/collisions; speed/status/reset/pause/restart/speed cap; Manual/Autonomous separation; future integration contracts; responsive Vite build; GitHub Pages asset paths.
- Review-focus tests are assigned to `roads.test.js`, `vehicle.test.js`, and browser lifecycle/error checks in Task 4.
- Browser rendering and WebGL failure cannot be fully exercised by Node unit tests and are explicitly verified in the interactive browser step.
- No commit or deployment action is assumed because this workspace is not a Git repository.
