# Simulator Sensors and Surface-Aware Driving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tested virtual directional sensors, surface-aware driving presets, clearer live telemetry, and safe mode switching to the existing RC simulator.

**Architecture:** Keep Vite, vanilla JavaScript, and Three.js. Add small pure modules for sensor geometry and surface presets, then pass the selected surface settings through the current vehicle/autopilot loop. Preserve the existing map-based planner as the only autonomous route controller; extend the current simulator view to expose the new readings, condition selector, and safe state transitions.

**Tech Stack:** Vite, vanilla JavaScript ES modules, Three.js 0.160.0, Node.js built-in `node:test`.

**Spec:** [Simulator Sensors and Surface-Aware Driving](../designs/2026-11-04-simulator-sensors-surface-aware-driving.md)

## Global Constraints

- Keep the app compatible with static GitHub Pages deployment using `base: './'`.
- Do not add a backend, network calls, new dependencies, webcam access, physical-hardware control, or ML.
- Keep all new sensor values explicitly simulated and derived only from local track geometry.
- Retain the five current routes and map-based obstacle detours; do not introduce a second route controller or moving traffic.
- Preserve manual driving, camera controls, tunings, current telemetry, and existing collision/boundary guards.
- Do not display “Week 1” or “Week 2” anywhere in the website.
- Remove only the confirmed `D:\autocar\.freebuff` directory; do not initialize Git or create commits because this workspace is not a Git repository.

## Review Focus

- **Obstacle at sensor-beam edge or beyond maximum range:** should return a clear/no-return value, not a false detection or invalid distance. Test in Task 1.
- **Vehicle heading changes or object is behind the vehicle:** directional ranges and camera list should rotate with the vehicle and exclude out-of-field objects. Test in Task 1.
- **Wet/uneven profile at a route endpoint:** the controller’s braking estimate must match vehicle deceleration so each route stops without collision or boundary exit. Test in Task 2.
- **Mode changes while keys or pointer controls are held:** simulation should pause, release all held controls, preserve position, and safely rejoin or require reset. Test in Task 4.
- **Vehicle is too far from a safe route join point:** Autonomous must report reset-required and issue no movement command. Test in Task 4.

---

### Task 1: Add deterministic virtual sensor geometry

**Files:**
- Create: `src/simulator/sensors.js`
- Create: `src/simulator/sensors.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: a vehicle state with finite `x`, `z`, and `headingRadians`, and a road with an `obstacles` array containing finite `x`, `z`, `radius`, `id`, and `kind`.
- Produces:
  - `readSimulatedSensors(state, road)` returns `{ frontUltrasonic, leftDistance, rightDistance, cameraDetections }`.
  - Each range has `{ distanceMeters: number | null, obstacleId: string | null, obstacleKind: string | null, status: 'clear' | 'detected' }`.
  - Camera detections are sorted by distance and contain `{ obstacleId, obstacleKind, distanceMeters }`.
  - Initial model constants are front range `4 m`, side range `2.5 m`, side/front beam half-angle `15°`, camera range `15 m`, and camera field of view `60°`. These are illustrative simulator settings, not physical sensor specifications.

- [ ] **Step 1: Write tests for clear, front, and side readings**

Add a synthetic road and stationary vehicle to `sensors.test.js`:

```js
const state = { x: 0, z: 0, headingRadians: 0 }
const road = {
  obstacles: [
    { id: 'front-cone', kind: 'cone', x: 0, z: 3, radius: 0.5 },
    { id: 'left-barrel', kind: 'barrel', x: -2, z: 0, radius: 0.5 },
    { id: 'right-barrier', kind: 'barrier', x: 2, z: 0, radius: 0.5 }
  ]
}
const readings = readSimulatedSensors(state, road)
assert.equal(readings.frontUltrasonic.obstacleId, 'front-cone')
assert.equal(readings.frontUltrasonic.distanceMeters, 2.5)
assert.equal(readings.leftDistance.obstacleId, 'left-barrel')
assert.equal(readings.rightDistance.obstacleId, 'right-barrier')
```

Also test an empty road: every range is `{ distanceMeters: null, obstacleId: null, obstacleKind: null, status: 'clear' }` and the camera list is empty.

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test src/simulator/sensors.test.js`

Expected: FAIL because `sensors.js` does not yet export `readSimulatedSensors`.

- [ ] **Step 3: Test beam bounds, heading, and camera field of view**

Add tests proving that (a) an obstacle whose edge is beyond the range limit is clear, (b) an object behind the vehicle is excluded, (c) rotating heading by `Math.PI / 2` rotates the forward reading from +Z to +X, and (d) camera detections include only objects within 15 m and ±30° and are nearest-first.

- [ ] **Step 4: Implement the pure sensor helper**

Use the vehicle heading vectors (`forward = { x: Math.sin(headingRadians), z: Math.cos(headingRadians) }`, `right = { x: Math.cos(headingRadians), z: -Math.sin(headingRadians) }`) to orient each field. For each obstacle, calculate its projected distance and lateral offset, intersect the beam with its radius, and return the nearest non-negative hit within range. Return `distanceMeters: null` for no return. Filter camera objects by forward projection, field-of-view angle, and max distance; sort by distance. Throw `TypeError` for malformed state/obstacle geometry rather than emitting `NaN`.

- [ ] **Step 5: Register and run the sensor test**

Add `src/simulator/sensors.test.js` to the `npm test` command in `package.json`, then run:

```powershell
node --test src/simulator/sensors.test.js
```

Expected: all directional, range-boundary, heading, camera, and clear-road tests pass.

---

### Task 2: Add surface profiles and integrate autonomous stopping

**Files:**
- Create: `src/simulator/surfaceConditions.js`
- Create: `src/simulator/surfaceConditions.test.js`
- Modify: `src/simulator/autopilot.js`
- Modify: `src/simulator/autopilot.test.js`
- Modify: `src/simulator/vehicle.test.js`
- Modify: `package.json`

**Interfaces:**
- `SURFACE_CONDITIONS` exports three profiles:
  - `dry-asphalt`: speed, acceleration, braking factors `1.0`, `1.0`, `1.0`.
  - `wet-asphalt`: factors `0.75`, `0.85`, `0.65`.
  - `uneven`: factors `0.65`, `0.75`, `0.85`.
- `getSurfaceCondition(id)` returns the matching profile or throws `TypeError` for an unknown id.
- `createAutopilot(road, { surfaceCondition = dryProfile, startState = null } = {})` applies the surface speed factor after the autonomous speed cap and uses the effective braking factor in its stopping-distance calculation. Existing calls with only `road` keep dry-asphalt behavior.
- `stepVehicle` keeps its existing API; the simulation caller combines the profile factors with existing user tuning factors.

- [ ] **Step 1: Write profile, vehicle-effect, and closed-loop tests**

Test that all three IDs return stable, finite factors, `dry-asphalt` is neutral, and an unknown ID throws. In `vehicle.test.js`, compare equal-duration acceleration and braking using the `wet-asphalt` and `uneven` factors; assert each non-dry profile accelerates less under the same max speed, and wet braking reduces speed less per frame than dry braking.

- Extend the existing closed-loop autopilot test before changing the implementation. For every road/profile pair, construct `createAutopilot(road, { surfaceCondition })`, pass the profile speed/acceleration/braking factors to `stepVehicle`, and assert bounded commands, no collision/boundary, route completion within 10,000 frames, and zero final speed.

- [ ] **Step 2: Run the focused tests and confirm the new cases fail**

Run: `node --test src/simulator/surfaceConditions.test.js src/simulator/vehicle.test.js src/simulator/autopilot.test.js`

Expected: FAIL because the surface-condition module does not exist and the current autopilot does not account for modified braking response.

- [ ] **Step 3: Implement the surface-condition catalog**

Export the three profiles with the factors above and a validating `getSurfaceCondition(id)` function. Keep the catalog data-only; do not add a physics engine or settings framework.

- [ ] **Step 4: Make autonomous speed and braking profile-aware**

Pass the profile to `createAutopilot`. First cap the requested maximum speed at `AUTONOMOUS_SPEED_LIMIT_MPS`, then multiply by `speedFactor` so a high user speed setting cannot mask wet/uneven behavior. Use `8.5 * brakingFactor` in the stopping-speed calculation so that wet braking reserves more distance. Continue returning bounded throttle/steering and keep `stepVehicle` as the only movement implementation.

- [ ] **Step 5: Register and run focused profile/autopilot tests**

Add `src/simulator/surfaceConditions.test.js` to the `npm test` script and run:

```powershell
node --test src/simulator/surfaceConditions.test.js src/simulator/vehicle.test.js src/simulator/autopilot.test.js
```

Expected: all 15 route/condition combinations and existing vehicle edge cases pass. Tune profile factors or stopping math if a route fails; do not weaken safety assertions.

---

### Task 3: Wire conditions and sensors into the 3D dashboard

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/simulator.test.js`
- Modify: `src/simulator/roads.js`
- Modify: `src/simulator/scene.js`
- Modify: `src/style.css`
- Modify: `README.md`
- Modify: `docs/HARDWARE-INTEGRATION.md`

**Interfaces:**
- `renderSimulator()` displays a labeled `#surface-condition` selector, front/left/right virtual range values, a camera-like detection list, current route/condition, and explicitly simulated labels.
- `setupSimulator(container)` owns the condition selection, calls `readSimulatedSensors(vehicleState, currentRoad)` during dashboard updates, and passes the selected profile to both manual and autonomous inputs.
- `buildRoad(road, surfaceCondition)` and `createSimulationScene(container, road, initialVehicleColor, surfaceCondition)` use the profile to distinguish dry, wet, and uneven road appearance.

- [ ] **Step 1: Add markup assertions before changing the view**

Extend `simulator.test.js` to assert the three option IDs and labels, all three directional sensor value IDs, a camera-detections container, a visible current-condition value, and an explicit “simulated” sensor disclaimer. Assert no week labels occur in `renderHome() + renderSimulator()`.

- [ ] **Step 2: Run the focused markup test and confirm it fails**

Run: `node --test src/simulator.test.js`

Expected: FAIL because the selector and sensor dashboard fields are not present.

- [ ] **Step 3: Add accessible condition and sensor markup**

Populate selector options from `SURFACE_CONDITIONS`. Add distinct labeled readouts for forward ultrasonic, left range, right range, and camera-like detections. Rename the existing long-range estimate so it is clearly map-derived rather than a physical LiDAR/ToF reading. Keep existing speed, distance, steering, heading, telemetry, controls, and camera buttons.

- [ ] **Step 4: Wire range updates and surface selection**

In `setupSimulator`, initialize `currentSurfaceCondition` to `dry-asphalt`. Each dashboard refresh formats detected ranges in meters and clear/no-return values using each sensor’s max-range constant; render camera detections as text nodes or escaped text, not raw obstacle HTML. When the condition changes, pause an active run, release held inputs, update the active profile and autopilot, rebuild the scene with the same vehicle pose, and refresh dashboard values.

For each movement step, apply:

```js
const effectiveMaxSpeedMps = mode.value === 'autonomous'
  ? Math.min(selectedMaxSpeedMps, AUTONOMOUS_SPEED_LIMIT_MPS) * currentSurfaceCondition.speedFactor
  : selectedMaxSpeedMps * currentSurfaceCondition.speedFactor
const accelerationFactor = tuningAccelerationFactor * currentSurfaceCondition.accelerationFactor
const brakingFactor = tuningBrakingFactor * currentSurfaceCondition.brakingFactor
```

Apply the autonomous cap before the surface speed factor. Keep keyboard/manual input handling mode-gated.

- [ ] **Step 5: Apply lightweight surface appearance and responsive styling**

Pass the selected surface profile through `createSimulationScene` into `buildRoad`. Give wet asphalt a darker, smoother-looking material, keep dry asphalt on the current material, and use the existing rough uneven palette for the uneven preset. Do not add textures, post-processing, or assets. Style sensor rows and camera detections with existing panel/grid tokens and verify they wrap at the existing mobile breakpoint.

- [ ] **Step 6: Update user-facing documentation and run focused checks**

Update the README to describe the three virtual ranges, geometric camera-like detections, and surface presets, and state these are simulated. Update `docs/HARDWARE-INTEGRATION.md` to distinguish the new browser-only virtual sensors from future hardware interfaces. Run:

```powershell
node --test src/simulator.test.js src/simulator/sensors.test.js
```

Expected: existing markup assertions plus new sensor/condition assertions pass.

---

### Task 4: Make mode switching and autonomous route rejoining safe

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/simulator/autopilot.js`
- Modify: `src/simulator/autopilot.test.js`
- Modify: `src/simulator.test.js`

**Interfaces:**
- `createAutopilot(road, { surfaceCondition, startState } = {})` starts at the route point nearest `startState` only if a safe connector exists.
- A safe connector is at most `4 m`; sort candidate route samples by distance from `startState`, sample each candidate connector every `0.25 m`, and choose the nearest connector whose samples stay inside the road and at least `obstacle.radius + VEHICLE_RADIUS + 0.5 m` from every obstacle.
- If no safe join exists, `autopilot.status` and update command status are `reset-required`, with zero throttle, zero steering, and brake enabled.
- Mode changes during an active run pause, clear held pointer/key states and visual pressed states, and preserve the vehicle pose.

- [ ] **Step 1: Write safe-rejoin and blocked-rejoin tests**

Add an autopilot test that starts on a safe point along a straight road, verifies the nearest safe route waypoint is selected, and simulates to completion. Add a second state more than 4 m from every safe route point and a third state with obstacle geometry blocking every connector; assert each reports `status === 'reset-required'` and:

```js
assert.deepEqual(autopilot.update(startState, 4, 1 / 60), {
  throttle: 0,
  steering: 0,
  brake: true,
  status: 'reset-required'
})
```

- [ ] **Step 2: Run the focused rejoin tests and confirm they fail**

Run: `node --test src/simulator/autopilot.test.js`

Expected: FAIL because `createAutopilot` does not accept a starting state or validate a rejoin connector.

- [ ] **Step 3: Add nearest-route initialization and connector validation**

When `startState` is present, sort sampled route points by distance and test each candidate no farther than 4 m. Sample each connector at 0.25 m spacing; reject it if any point fails `isInsideRoad(point, VEHICLE_RADIUS, road)` or violates the same obstacle-clearance margin used by planned detours. Use the nearest safe candidate. Return a stationary `reset-required` controller if none succeeds. Do not move or teleport the vehicle.

- [ ] **Step 4: Pause and release controls on mode changes**

Add a helper that clears every set in `heldBy`, removes each button’s active class, and sets `aria-pressed="false"`. On mode change, pause an active run, clear held inputs, and when entering Autonomous recreate the controller with the current surface profile and `vehicleState` as `startState`. If rejoin is rejected, stop the run, set vehicle speed to zero without changing position, and show reset-required in the existing status/HUD. Keep explicit Start/Resume, Stop, Reset, keyboard and pointer release, and scene cleanup behavior.

- [ ] **Step 5: Test mode isolation and run the focused suite**

Extend markup/controller tests for the reset-required message and control states. Use available browser automation to press manual keys, confirm those keys cannot alter an Autonomous run, switch modes while moving, verify pose preservation and cleared pressed states, and test the unsafe-rejoin reset state. Run:

```powershell
npm test
```

Expected: all unit tests pass; no autonomous run consumes manual throttle/steering, and switching modes never teleports or continues with stale inputs.

---

### Task 5: Run end-to-end verification and remove the confirmed directory

**Files:**
- Inspect and remove only: `D:\autocar\.freebuff`
- Validate: `src/`, `public/`, `index.html`, `vite.config.js`, `README.md`

- [ ] **Step 1: Inspect the exact cleanup target**

List `D:\autocar\.freebuff` and its contents, verify the resolved path is exactly that directory, and confirm no project source or user data is inside it.

- [ ] **Step 2: Run the production build**

Run:

```powershell
npm run build
```

Expected: Vite builds successfully and generated HTML/assets retain relative paths suitable for GitHub Pages.

- [ ] **Step 3: Browser-test the built or development app**

Using available browser automation without adding a package, verify the home and simulator routes, each of the five tracks, all three surface conditions, sensor readings changing as the car moves, camera detections appearing/disappearing, Manual keyboard controls, Autonomous keyboard isolation, mode switching while moving, Pause/Resume/Stop/Reset, and blocked/complete states. Inspect browser console output and responsive layout. Report observed performance; do not claim a target-device frame rate without measuring on that device.

- [ ] **Step 4: Remove only `.freebuff`**

After confirming the target in Step 1, remove only the explicit directory `D:\autocar\.freebuff`; do not use a wildcard or delete any sibling directory.

- [ ] **Step 5: Verify the final project**

Run:

```powershell
npm test
npm run build
```

Confirm all tests and the build pass, the website contains no week labels, and `.freebuff` alone was removed. Do not initialize Git or create commits.
