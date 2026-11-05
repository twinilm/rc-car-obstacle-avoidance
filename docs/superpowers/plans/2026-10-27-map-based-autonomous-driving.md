# Map-Based Autonomous Driving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic map-based autonomous driving that follows all three simulator roads, detours around known obstacles, and stops safely at completion or when blocked.

**Architecture:** Add a pure JavaScript autonomy module that builds a validated path from a road centerline and obstacle map, then provides bounded controls toward a look-ahead point. Keep `stepVehicle` as the only vehicle movement implementation and connect the new module to the existing Manual/Autonomous selector and Start/Stop/Reset controls. Open the simulator in Autonomous mode for the demonstration.

**Tech Stack:** Vite, vanilla JavaScript, Three.js 0.160.0, Node.js built-in `node:test`.

**Spec:** [Map-Based Autonomous Driving design](../designs/2026-10-27-map-based-autonomous-driving.md)

## Global Constraints

- Autonomous driving is for the browser simulator only; do not connect or send commands to a physical RC car.
- Use the existing road centerlines and obstacle definitions; do not add sensor simulation or sensor readings.
- Support City Roads, Curved Roads, and Obstacle Course.
- Open in Autonomous mode but require an explicit Start action; provide Stop and Reset.
- Reuse existing vehicle movement, road-boundary, and obstacle-collision logic.
- Do not add ML, a physics package, backend, database, network request, or user-data collection.
- Preserve the existing Vite `base: './'` GitHub Pages configuration and Three.js `0.160.0` dependency.
- If no safe route is available or a final vehicle guard triggers, stop and show a status instead of continuing.
- Cap autonomous speed at the tested 4 m/s limit; lower dashboard speed settings still apply.
- The workspace is not a Git repository; do not initialize Git or create commits.

## Project File Map

- `src/simulator/autopilot.js`: build a validated centerline/detour path and return autonomous control inputs.
- `src/simulator/autopilot.test.js`: test route validation and closed-loop driving against real and synthetic roads.
- `src/simulator.js`: replace the disabled Autonomous placeholder with explicit map-based simulation behavior and coordinate autonomous controls.
- `src/simulator.test.js`: assert the UI documents the actual autonomy scope and retains controls.
- `package.json`: include the new pure-module test file in `npm test`.
- `docs/superpowers/designs/2026-10-27-map-based-autonomous-driving.md`: approved scope, constraints, design, and decision log.
- `docs/HARDWARE-INTEGRATION.md`: clarify that the map-based demo is simulation-only and does not provide perception or hardware control.

## Review Focus

- **A path exists but the car cannot physically follow a tight detour:** run the actual kinematic vehicle model against each catalog road and assert it reaches the end without collision or leaving the road.
- **A detour point clears an obstacle but the segment between points cuts through it:** validate whole path segments against obstacle circles, not waypoints only.
- **Both sides of an obstacle are blocked by road edges or other obstacles:** test a narrow synthetic road and require a blocked result.
- **Look-ahead control skips route sections or points backward:** test the full one-way route and require progress to the endpoint with bounded inputs.
- **Switching Manual/Autonomous leaves held input or movement active:** browser-check mode change, pause, reset, and explicit restart.

---

### Task 1: Create the autonomous route follower

**Files:**
- Create: `src/simulator/autopilot.js`
- Create: `src/simulator/autopilot.test.js`
- Read: `src/simulator/roads.js`
- Read: `src/simulator/vehicle.js`

**Interfaces:**
- Consumes: `ROAD_DEFINITIONS`, `isInsideRoad(position, vehicleRadius, road)`, `findCollidingObstacle(position, vehicleRadius, road)`, `createVehicleState(road)`, and `stepVehicle(state, input, road, deltaSeconds)`.
- Produces:
  - `createAutopilot(road)` returns `{ status, update(state, maxSpeedMps, deltaSeconds) }`.
  - Initial `status` is `ready` or `blocked`.
  - `update(...)` returns `{ throttle, steering, brake, status }`, where status is `driving`, `complete`, or `blocked`.
  - Throttle and steering are always in `[-1, 1]`; `brake` is boolean.

- [x] **Step 1: Write failing tests for the autonomy interface and safe failure**

Create `src/simulator/autopilot.test.js` with Node’s built-in runner:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { ROAD_DEFINITIONS } from './roads.js'
import { createAutopilot } from './autopilot.js'

test('creates a ready route for each catalog road', () => {
  for (const road of ROAD_DEFINITIONS) {
    assert.equal(createAutopilot(road).status, 'ready')
  }
})

test('reports blocked when an obstacle fills a narrow road', () => {
  const road = {
    id: 'blocked',
    width: 4,
    start: { x: 0, z: 0, headingRadians: 0 },
    centerline: [{ x: 0, z: 0 }, { x: 0, z: 20 }],
    obstacles: [{ id: 'wide-obstacle', x: 0, z: 10, radius: 3 }],
    intersections: [],
    markings: []
  }

  assert.equal(createAutopilot(road).status, 'blocked')
})
```

- [x] **Step 2: Run the tests and verify the missing module fails**

Run: `node --test src/simulator/autopilot.test.js`

Expected: FAIL because `src/simulator/autopilot.js` does not exist yet.

- [x] **Step 3: Implement centerline sampling and obstacle detours**

In `autopilot.js`, sample each straight centerline segment at no more than 0.5-meter spacing and retain the original start and end. For each obstacle whose clearance circle intersects the centerline, compute the closest along-route position and tangent. Try a smooth lateral offset on each side, peaking at the obstacle and fading to zero before and after it. Use a detour distance at least `obstacle.radius + 0.55 + 0.5` meters. Generate deterministic side combinations and accept only a route whose sampled points remain inside the road and whose every segment stays at least `obstacle.radius + 0.55 + 0.5` meters from every obstacle. If none pass, set `status` to `blocked`.

Add private helpers for centerline interpolation, point-to-segment distance, segment-to-obstacle distance, and route validation. Keep them private to the module.

- [x] **Step 4: Add bounded look-ahead steering and safe route completion**

For a ready route, retain a monotonically increasing progress index. Find a target ahead by `Math.max(2, Math.abs(state.speedMps) * 0.45)` meters. Normalize heading error to `[-Math.PI, Math.PI]` and set steering to the clamped heading correction divided by `1.25 * deltaSeconds * speedRatio`, where `speedRatio = Math.min(Math.abs(state.speedMps) / Math.max(maxSpeedMps, 1), 1)`. Return zero steering when the car is stationary. Set a braking target near the endpoint using `Math.sqrt(2 * 8.5 * remainingMeters)`; request brake when current speed exceeds that target by 0.3 m/s, otherwise request throttle while below it by 0.3 m/s. Return `complete` only when the car is within 0.35 meters of the final point and below 0.2 m/s.

- [x] **Step 5: Test closed-loop driving on all three roads**

Add a test helper that creates `createAutopilot(road)` and `createVehicleState(road)`, advances at `1 / 60` second for at most 10,000 frames using `stepVehicle`, and records any `collision` or `boundary` status. For each catalog road, assert that the route completes, no collision/boundary occurs, and every returned throttle/steering value is between -1 and 1. Assert that an initially blocked autopilot returns `blocked` without issuing movement inputs.

- [x] **Step 6: Run the focused autonomy tests**

Run: `node --test src/simulator/autopilot.test.js`

Expected: all route, safety, and closed-loop simulation tests pass. Tune detours or look-ahead in `autopilot.js` if an actual road fails; do not weaken the no-collision or no-boundary assertions.

### Task 2: Connect autonomy to the simulator controls

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/simulator.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `createAutopilot(road)` and its `{ status, update(state, maxSpeedMps, deltaSeconds) }` interface; existing simulator UI and vehicle module.
- Produces: map-based Autonomous mode by default and optional Manual mode, sharing explicit Start/Stop/Reset controls and the existing vehicle movement implementation.

- [x] **Step 1: Update markup tests for the non-placeholder mode**

Change the Autonomous markup test in `src/simulator.test.js` to assert that Autonomous is selected by default and the note states that autonomy uses the track map. Remove the assertion that Autonomous is a placeholder. Add assertions for Start Autonomous Drive, Stop, Reset, and the visible status region.

- [x] **Step 2: Run the markup tests to verify the new wording is not present**

Run: `node --test src/simulator.test.js`

Expected: FAIL because the existing UI still says autonomous driving is not implemented.

- [x] **Step 3: Update the mode change and Start/Pause behavior**

Import `createAutopilot` in `simulator.js` and create a fresh controller on setup and each road selection. When the road changes, reset the vehicle and rebuild its controller. When the mode changes, pause, release every held input, preserve the current vehicle position, update the explanatory note, and disable manual control buttons only in Autonomous mode. Enable Start in Autonomous mode only if its controller reports `ready`. Start/Pause must work in either mode and must not accept keyboard/pointer driving input in Autonomous mode.

- [x] **Step 4: Use autonomous controls in the existing update loop**

In each frame while running, use held manual inputs in Manual mode or the autopilot result in Autonomous mode. Pass either input object to the existing `stepVehicle`; do not move the Three.js mesh directly from the autonomy module. On `complete`, stop the loop, set vehicle speed to zero, and show `ROUTE COMPLETE`. On a blocked controller, show `AUTONOMY BLOCKED`. If `stepVehicle` reports `collision` or `boundary`, stop, release inputs, and show the corresponding stop-required status. Reset recreates both vehicle state and autopilot for the selected road.

- [x] **Step 5: Update simulator markup test expectations**

Replace the old placeholder assertion with:

```js
assert.match(markup, /Autonomous mode uses the track map/)
assert.match(markup, /simulation-toggle/)
assert.match(markup, /role="status"/)
```

Ensure the bottom-of-view disclaimer says autonomy is a local simulation and does not use real sensors or hardware.

- [x] **Step 6: Include autonomy tests in the package test command**

Update the existing `test` script in `package.json` to append `src/simulator/autopilot.test.js`, preserving the road, vehicle, and markup tests.

- [x] **Step 7: Run the full test suite**

Run: `npm test`

Expected: all existing manual-driving tests, autonomy tests, and markup tests pass.

### Task 3: Document limits and verify the browser build

**Files:**
- Modify: `docs/HARDWARE-INTEGRATION.md`
- Read: `docs/superpowers/designs/2026-10-27-map-based-autonomous-driving.md`
- Read: `vite.config.js`

**Interfaces:**
- Documents map-based autonomy as simulated behavior that uses known road definitions only.
- Makes no physical-car, real sensor, ML, or real-world performance claims.

- [x] **Step 1: Clarify simulation-only autonomy in the integration notes**

Update the introduction of `docs/HARDWARE-INTEGRATION.md` to say the browser now has local map-based autonomous driving for its procedural roads, but it does not perceive the environment, read real sensors, or control hardware. Leave the proposed future command/telemetry contracts and separate gateway architecture labeled as not implemented.

- [x] **Step 2: Run tests and the production build**

Run:

```powershell
npm test
npm run build
```

Expected: every test passes and Vite completes a production build.

- [x] **Step 3: Browser-check manual and autonomous mode lifecycle**

Run `npm run dev` and inspect `/#simulator`. For each of City Roads, Curved Roads, and Obstacle Course, select Autonomous, confirm the note identifies map-based simulation, press Start, and verify speed/distance changes and route completion. Confirm an obstacle detour causes neither collision nor boundary status. Pause and Reset; switch to Manual and verify W/Up and on-screen controls still work. Confirm switching modes releases held inputs and the Autonomous controls are not accidentally mapped to manual keys.

- [x] **Step 4: Check the blocked route and production preview**

Confirm the synthetic blocked-road unit test reports `blocked`, then run `npm run preview` and load `/#simulator`. Verify the page initializes, selects a road, and starts the autonomous demo from the built files. Confirm relative production asset URLs remain unchanged.

## Self-review

- **Spec coverage:** simulation-only scope, all three roads, explicit start, shared pause/reset, map-based route following, obstacle detours, finite route completion, blocked/guard stop, non-ML/non-sensor wording, unit tests, browser checks, and static build each have a task.
- **Placeholder scan:** the plan contains no TBD items or unspecified implementation steps.
- **Interface consistency:** `createAutopilot(road)` returns `status` plus `update(state, maxSpeedMps, deltaSeconds)`; the update result consistently uses `throttle`, `steering`, `brake`, and `status`.
- **Review-focus coverage:** actual vehicle-following, whole-segment collision clearance, blocked roads, progress/look-ahead, and mode/input lifecycle are each assigned to tests or browser verification.
- **Repository workflow:** no Git initialization or commit is included because the workspace has no Git repository.
