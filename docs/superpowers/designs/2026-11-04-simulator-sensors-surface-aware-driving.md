# Simulator Sensors and Surface-Aware Driving

## Understanding summary

- Extend the existing Vite, vanilla JavaScript, and Three.js simulator rather than recreate it.
- Preserve the five current procedural routes, map-based autonomy, manual controls, vehicle model, dashboard, and GitHub Pages compatibility.
- Add clearly labeled virtual sensor readings and a useful camera-like simulated object list, without claiming physical perception.
- Make road-condition selection affect vehicle and autonomous speed/braking behavior.
- Keep mode switching safe, manual inputs isolated from autonomous control, and route failures explicit.
- Remove only the existing `.freebuff` directory. Do not show “Week 1” or “Week 2” labels on the website.

## Assumptions and constraints

- The simulator is local and single-user. No backend, network calls, data collection, webcam, physical-car control, or ML is introduced.
- Sensor values are deterministic geometric estimates from the current vehicle pose and static track obstacle data; they are not hardware specifications.
- The camera-like feature is a bounded field-of-view list of visible obstacle types and distances, not image processing.
- The current Three.js render loop and Node built-in test runner remain; no dependencies are added.
- Keep per-frame work proportional to the small obstacle list. Treat 30 FPS as a usability target, not a pass/fail claim unless measured on the target laptop.
- Preserve current map route planning and collision/boundary guards as the source of autonomous movement and safety.

## Design

### Routes and conditions

Keep the five existing layouts: city/intersection, highway, curved circuit, obstacle course, and uneven road. Their existing static obstacles remain map-known and are handled by the validated waypoint planner. Do not add a second route planner or moving-traffic simulation.

Add a surface-condition selector independent of route selection, with three deterministic presets: dry asphalt, wet/low-grip asphalt, and uneven surface. Initial speed/acceleration/braking factors are `1.0/1.0/1.0` for dry, `0.75/0.85/0.65` for wet, and `0.65/0.75/0.85` for uneven. The same selected profile must be applied consistently to manual and autonomous driving; the autonomous cap is applied before the condition speed factor, and its stopping-distance calculation uses the active braking response. These are simplified simulation presets, not tire or traction physics claims. The dashboard identifies both route and condition.

### Sensors and dashboard

Add a pure JavaScript sensor helper that takes vehicle pose and road obstacle geometry. It returns:

- A forward ultrasonic-style range capped at 4 m with a 15° half-angle beam.
- Left and right clearance ranges capped at 2.5 m, also with 15° half-angle beams.
- A virtual-camera detection list within 15 m and a 60° forward field of view, with obstacle kinds.

Sensor results distinguish a clear/no-return state from a measured distance and identify the simulated obstacle when detected. Ranges and beam widths are module constants, documented as illustrative simulation settings rather than real sensor specifications. No camera image or browser device access is used.

Extend the dashboard with directional readings and camera-like object labels while retaining current speed, distance, steering, heading, route progress, status, and longer-range map proximity. Label all sensor values as simulated. These readings are observational; they do not replace the map-based planner with a second steering controller.

### Vehicle and mode behavior

Keep `stepVehicle` as the sole movement implementation and retain `createAutopilot` as the route planner/controller. Pass the selected surface profile through both so speed caps and stopping targets match the vehicle’s effective acceleration/braking response. Preserve the existing autonomous speed ceiling and user-selected lower cap.

Changing modes during a run pauses the simulation, releases all held keyboard and pointer inputs, and preserves vehicle position. When entering Autonomous, initialize progress from the nearest safe point on the route using a connector no longer than 4 m, sampled every 0.25 m and validated against road boundaries and obstacle clearance. If no connector is safe, remain stopped and show a reset-required state. Resume is explicit. Stop holds position; Reset returns to the selected route’s start. Manual inputs are ignored in Autonomous mode.

Existing route-complete, blocked, collision, and boundary outcomes remain visible and stop movement. Known obstacles are avoided by the map planner; the virtual sensors do not claim to detect unmodeled or real-world hazards.

## Development and validation plan

1. Implement and unit-test the deterministic directional sensor and virtual-camera geometry.
2. Add the three surface profiles; integrate modifiers with vehicle stepping and autonomous speed/stopping logic.
3. Extend the dashboard and condition selector; implement safe mode-switch input release and route rejoin behavior.
4. Add tests for sensor geometry, profile effects, and closed-loop completion on all five routes under all three conditions. Preserve existing tests and cover blocked/collision/boundary states.
5. Use available browser automation to test manual controls, autonomous input isolation, mode switching, each route/condition, dashboard updates, and console errors. Do not add browser dependencies unless no existing automation can cover the request.
6. Run `npm test` and `npm run build`; check GitHub Pages-relative asset behavior and target-device performance only when measured on that device.
7. Remove only `D:\autocar\.freebuff` and verify the resulting project state.

## Decision log

| ID | Decision | Alternatives considered | Rationale |
|---|---|---|---|
| D1 | Extend the existing static simulator and retain current routes and core behaviors. | Rebuild the app or replace the route/vehicle architecture. | Existing features and closed-loop tests already cover much of the requested driving behavior. |
| D2 | Use geometric virtual sensors and a camera-like object list; no webcam, pixel pipeline, or ML. | Add live camera access or computer-vision dependencies. | Meets the simulator-only requirement while remaining deterministic, lightweight, and testable. |
| D3 | Keep map-based obstacle detours as the only autonomous route controller. | Add a competing sensor-driven steering controller or moving traffic. | Avoids conflicting control logic and preserves known-safe obstacle route tests. |
| D4 | Add three surface presets independent of route selection. | Infer condition only from each current route’s surface field. | Allows repeatable same-route comparisons and makes the condition behavior testable. |
| D5 | Treat sensors as labeled telemetry, not evidence of real-world perception. | Present readings as physical sensor/camera output. | Avoids misleading claims and keeps data provenance clear. |
| D6 | Pause and release held inputs on mode change, preserve pose, and explicitly rejoin the route when switching to Autonomous. | Continue silently with a new input source, reset position, or blend inputs. | Prevents stale/manual input and unexpected controller transitions without discarding progress. |
| D7 | Keep the implementation dependency-free and locally hosted. | Add a backend, hosted service, or heavy simulation library. | Preserves GitHub Pages support and the stated laptop constraints. |
| D8 | Remove only the existing `.freebuff` directory. | Remove other project files or leave that directory. | This is the explicitly confirmed cleanup scope. |
