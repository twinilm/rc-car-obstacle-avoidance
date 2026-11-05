# RC Autonomous Car Simulator Interface Plan

> Superseded for the current 3D simulator by [the Three.js simulator plan](./2026-10-27-autonomous-rc-3d-simulator.md). This earlier plan covers only the initial CSS-based interface foundation.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. The initial interface implementation and verification steps are complete.

**Goal:** Replace the unrelated EV marketing page with a responsive RC autonomous car project homepage and a clearly labeled simulator prototype with interactive local-only driving controls.

**Architecture:** Keep Vite as the static build tool and use a hash-based two-view shell so Home and Simulator navigation works without server-side routing. Separate homepage markup, simulator markup and control behavior into focused JavaScript modules; keep all shared visual and responsive styling in the existing stylesheet. The original viewport was a labeled visual placeholder, not a physical-car interface or machine-learning integration.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Vite; no new dependencies or backend.

**Spec:** User-provided RC autonomous car simulator requirements.

## Global Constraints

- Keep the work limited to the initial interface foundation.
- Use HTML for structure, CSS for styling and responsive layouts, JavaScript for functionality, and Vite for local development and building.
- Use free tools only. Avoid paid APIs, unnecessary downloads, and unnecessary dependencies.
- Do not overwrite working code or recreate the project unnecessarily.
- Do not install a backend or database unless it is genuinely necessary.
- Keep the project compatible with GitHub Pages. Do not rely on a server that GitHub Pages cannot run.
- Do not implement machine learning, object detection, or model integration.
- Do not claim that the simulator controls a real car.
- Provide homepage and simulator navigation, basic driving controls, speed and distance displays, difficulty selection, and responsive layouts.

## Review Focus

- Directly loading the simulator hash or refreshing that view should render the simulator rather than an empty shell.
- Releasing a held control, changing focus, or navigating away should not leave a control stuck or continue accumulating distance.
- Brake and reverse should not display confusing or impossible speed values.
- Keyboard controls should not trigger browser scrolling while driving and should ignore typing in form fields.
- Narrow mobile viewports should keep the viewport, dashboard, and controls usable without horizontal overflow.

---

### Task 1: Create the two-view application shell

**Files:**
- Modify: `index.html`
- Modify: `src/main.js`
- Create: `src/home.js`
- Create: `src/simulator.js`

**Interfaces:**
- `src/home.js` exports `renderHome(): string`.
- `src/simulator.js` exports `renderSimulator(): string` and `setupSimulator(container: HTMLElement): () => void`. The cleanup function releases active inputs and stops simulation updates.
- `src/main.js` chooses the view from `location.hash`, renders it, and calls the prior view cleanup before changing views.

- [x] **Step 1: Add page metadata for the simulator project**

Update the document title and description in `index.html` to identify the RC Autonomous Car Simulator. Keep the existing module entry point and favicon unless they prevent this project from loading.

- [x] **Step 2: Add hash-based Home and Simulator navigation**

In `src/main.js`, render Home for `#home` or an empty hash, render Simulator for `#simulator`, and rerender on `hashchange`. Keep a shared application mount and call the Simulator cleanup when leaving its view.

- [x] **Step 3: Add the homepage view**

Implement `renderHome()` in `src/home.js` with the project name, concise simulator-focused description, prominent Start Simulator link targeting `#simulator`, and a responsive automotive/simulation-inspired hero. Add a visible note that this is a software simulator prototype and does not control a physical vehicle.

- [x] **Step 4: Add the simulator view shell**

Implement `renderSimulator()` in `src/simulator.js` with a Home link targeting `#home`, simulator heading, viewport placeholder, labeled dashboard values, difficulty selector, and control panel. Identify the viewport as a placeholder for a future Three.js scene.

- [x] **Step 5: Build and verify both route renderers**

Run `node .\\node_modules\\vite\\bin\\vite.js build`.

Expected: the production build succeeds and both views are included in the output.

### Task 2: Add simulation controls and dashboard behavior

**Files:**
- Modify: `src/simulator.js`
- Modify: `src/main.js`

**Interfaces:**
- `setupSimulator(container: HTMLElement): () => void` owns all input listeners and the animation timer, and must be safe to call once per rendered simulator view.
- Controls expose forward, reverse, left, right, and brake states through accessible buttons; keyboard aliases are W/Up, S/Down, A/Left, D/Right, and Space for brake.

- [x] **Step 1: Implement press-and-hold control states**

Use pointer down/up/cancel and keyboard down/up to activate the matching controls. Prevent default browser behavior only for supported driving keys when focus is not in an input, select, or editable element. Show active visual state and an accessible pressed state on each button.

- [x] **Step 2: Implement local dashboard updates**

Update speed and distance at a steady interval using the held input and selected difficulty. Show reverse with a negative speed or an explicit reverse indicator; brake should bring speed down. Keep the values explicitly labeled as simulated and do not send commands to hardware.

- [x] **Step 3: Implement cleanup and input edge cases**

Ensure keyup, pointerup, pointercancel, window blur, and route cleanup clear active states. Stop the timer and remove listeners when the simulator view is exited. Ignore keyboard controls while a user edits a form control.

- [x] **Step 4: Verify key and selector behavior**

Run the production build and manually confirm forward, reverse, steering, brake, difficulty updates, keyboard inputs, and Home navigation behave as described. Confirm leaving the view stops updates.

### Task 3: Style and validate the simulator interface

**Files:**
- Modify: `src/style.css`
- Modify: `index.html`
- Modify: `vite.config.js` only if a Pages asset path issue is found

**Interfaces:**
- Shared styles use stable class names from `renderHome()` and `renderSimulator()`.
- Preserve the existing `base: './'` Vite configuration for relative asset URLs unless deployment validation demonstrates a specific failure.

- [x] **Step 1: Style homepage and simulator**

Replace the EV dealership-specific styling with a cohesive dark automotive/simulation visual system. Style the viewport placeholder, dashboard, controls, active/disabled states, navigation, and difficulty selector with visible keyboard focus.

- [x] **Step 2: Add responsive layouts**

At narrow widths, stack simulator viewport and dashboard, wrap or grid controls into usable touch targets, and prevent horizontal overflow. Keep the homepage Start Simulator action prominent at desktop and mobile sizes.

- [x] **Step 3: Verify production output and Pages compatibility**

Run `node .\\node_modules\\vite\\bin\\vite.js build`. Inspect built asset paths and confirm they remain relative for a GitHub Pages project subpath. No GitHub Actions workflow is added unless the repository already contains deployment conventions.

- [x] **Step 4: Verify user flows locally**

Run the Vite development server and check the home page, Start Simulator navigation, Home navigation, direct `#simulator` loading, viewport/dashboard presence, control interaction, and responsive mobile layout. Report any browser-only checks that cannot be run.
