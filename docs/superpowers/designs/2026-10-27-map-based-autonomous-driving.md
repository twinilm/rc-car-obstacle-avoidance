# Map-Based Autonomous Driving — Simulator Follow-Up

## Understanding

- Add autonomous driving to the existing Three.js browser simulator, whose Autonomous selector currently does not drive.
- The feature controls the simulated vehicle only. It does not control a physical RC car.
- Use the existing road centerlines and obstacle definitions; do not add simulated sensors or sensor readings.
- Support City Roads, Curved Roads, and Obstacle Course.
- Open in Autonomous mode, but do not move until the user presses Start Autonomous Drive. Keep Stop and Reset available.
- Follow the selected route, safely detour around obstacles, and stop at the route end or report when blocked/unsafe.

## Assumptions and constraints

- Use deterministic, lightweight JavaScript route following rather than ML, a physics package, or a backend.
- Keep current app modules and static GitHub Pages compatibility.
- Support one local browser session; do not add network requests or collect user data.
- Keep per-frame work small relative to the existing Three.js render loop.
- Reuse the current vehicle kinematics and its road-boundary/obstacle checks as final guards.

## Design

Add a small autonomy module that consumes a road definition and current vehicle state. It builds a path from the existing centerline, adding lateral detours for obstacles that intersect the intended route. Candidate detours must clear the vehicle and obstacle and stay within the drivable boundary. If no safe detour exists, route creation reports blocked rather than returning an unsafe path.

During each update, the autonomy module finds progress along the route, chooses a look-ahead target, and returns bounded throttle and steering inputs. Autonomous speed is capped at 4 m/s (about 9 mph) to stay within the current steering model's tested limits; a lower user-selected speed still applies. The existing `stepVehicle` remains the only movement implementation. Autonomous and manual input remain separate: manual controls do not influence the car in Autonomous mode, and no autonomous code is active in Manual mode.

Selecting a mode pauses any active run and releases held inputs without moving the car. Start runs the selected mode; Stop halts vehicle updates while retaining the current position; Reset returns the car to the selected track’s start. The simulator opens in Autonomous mode so the demonstration is immediately clear, while Manual remains available. The dashboard identifies map-based simulated autonomy and shows ready, driving, stopped, route-complete, blocked, collision, or boundary states. Route completion stops the vehicle. A collision, boundary guard, or unsafe/blocked route also stops it and requires Reset.

No sensor display, real-world perception claim, physical-car control, backend, or autonomous ML is included.

## Validation plan

- Unit-test path generation and driving against all three catalog roads.
- Verify autonomous progress reaches each route end without hitting an obstacle or leaving the road.
- Test an obstacle that cannot be safely detoured and require a blocked result.
- Test bounded throttle/steering and stop-at-completion behavior.
- Preserve the existing manual vehicle, collision, and boundary tests.
- Browser-check explicit Start, Stop, Reset, mode switching, mode messaging, and all three tracks.
- Run `npm test` and `npm run build`; check the production preview.

## Risks

- A detour can look geometrically clear but still be too sharp for the current simple steering model. Validate it through actual kinematic simulation, not only point-distance checks.
- Centerline waypoints are sparse. Use look-ahead and bounded steering; do not promise realistic vehicle dynamics.
- The simple steering model is not validated for high-speed route following, so autonomous mode must enforce its tested 4 m/s speed limit even when the dashboard setting is higher.
- If an unanticipated collision or road-edge event occurs, stop and expose the existing failure status instead of trying to continue.
- This is a deterministic demonstration of using a known track map, not evidence that an autonomous vehicle could perceive or navigate a real environment.

## Decision log

| ID | Decision | Alternatives considered | Why |
|---|---|---|---|
| A1 | Implement autonomy in the browser simulator only. | Control physical hardware or do both. | The current project has no hardware or communication layer; scope remains testable and safe. |
| A2 | Navigate using known track and obstacle definitions. | Add simulated distance sensors and reactive readings. | The user chose the simpler, transparent map-based behavior; it avoids presenting invented readings as sensors. |
| A3 | Use a waypoint follower with validated obstacle detours. | Reactive steering or a grid/graph planner. | It reuses existing route geometry and stays more predictable than purely reactive steering without the cost of a general planner. |
| A4 | Support all three roads and stop at each route endpoint. | Limit autonomy to the obstacle course or drive indefinitely. | The user requested all tracks; finite routes provide a clear, testable outcome. |
| A5 | Require an explicit Start action; provide Stop and Reset. | Start immediately on mode selection or use a toggle-only pause. | Avoids unexpected movement and makes the demo lifecycle clear. |
| A6 | Reject unsafe detours and stop on collision/boundary checks. | Attempt recovery or continue through an obstacle. | A deterministic safe stop is clear and testable in this simple model. |
| A7 | Reuse existing vehicle kinematics and keep autonomy separate from manual input. | Add a second movement model or blend inputs. | Prevents divergent physics and makes mode boundaries clear. |
| A8 | Open the simulator in Autonomous mode with a dedicated Stop button. | Keep Manual as the initial mode and require an extra mode-selection step; use a single start/pause toggle. | Makes the requested autonomous demo immediately discoverable and gives the operator a clear stop control. |
