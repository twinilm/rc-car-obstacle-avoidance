import { ROAD_DEFINITIONS } from './simulator/roads.js'
import { AUTONOMOUS_SPEED_LIMIT_MPS, createAutopilot, getForwardObstacleProximity } from './simulator/autopilot.js'
import { createSimulationScene } from './simulator/scene.js'
import { createVehicleState, stepVehicle } from './simulator/vehicle.js'
import { CAMERA_MAX_RANGE_M, readSimulatedSensors, SIDE_SENSOR_MAX_RANGE_M, ULTRASONIC_MAX_RANGE_M } from './simulator/sensors.js'
import { getSurfaceCondition, SURFACE_CONDITIONS } from './simulator/surfaceConditions.js'
import { createBackendClient } from './services/backendClient.js'

const controls = ['forward', 'reverse', 'left', 'right', 'brake']
const controlKeys = new Map([
  ['ArrowUp', 'forward'],
  ['w', 'forward'],
  ['W', 'forward'],
  ['ArrowDown', 'reverse'],
  ['s', 'reverse'],
  ['S', 'reverse'],
  ['ArrowLeft', 'left'],
  ['a', 'left'],
  ['A', 'left'],
  ['ArrowRight', 'right'],
  ['d', 'right'],
  ['D', 'right'],
  [' ', 'brake']
])
const MPH_TO_MPS = 0.44704
const METERS_TO_FEET = 3.28084

const VEHICLE_COLORS = [
  { id: 'cyan', label: 'Cyber Cyan', hex: 0x00e5ff, css: '#00e5ff' },
  { id: 'graphite', label: 'Stealth Graphite', hex: 0x334155, css: '#334155' },
  { id: 'crimson', label: 'Crimson Racing', hex: 0xef4444, css: '#ef4444' },
  { id: 'amber', label: 'Solar Amber', hex: 0xf59e0b, css: '#f59e0b' },
  { id: 'white', label: 'Arctic White', hex: 0xf8fafc, css: '#f8fafc' },
  { id: 'lime', label: 'Acid Lime', hex: 0xa3e635, css: '#a3e635' }
]

function getRoad(id) {
  const road = ROAD_DEFINITIONS.find((item) => item.id === id)
  if (!road) throw new Error(`Unknown road selection: ${id}`)
  return road
}

function formatSensorRange(reading, maxRangeMeters) {
  if (reading.status === 'clear') return `Clear (> ${maxRangeMeters.toFixed(1)} m)`
  return `${reading.distanceMeters.toFixed(1)} m · ${reading.obstacleKind.toUpperCase()}`
}

export function renderSimulator() {
  const roads = ROAD_DEFINITIONS.map((road, index) => `
    <button class="road-option${road.id === ROAD_DEFINITIONS[0].id ? ' is-selected' : ''}" type="button"
      data-road="${road.id}" aria-pressed="${road.id === ROAD_DEFINITIONS[0].id}">
      <span class="road-option-index">${String(index + 1).padStart(2, '0')}</span>
      <span class="road-option-body">
        <strong>${road.name}</strong>
        <small>${road.summary}</small>
      </span>
      <span class="road-option-badge">${road.surface.toUpperCase()}</span>
    </button>
  `).join('')

  const colorSwatches = VEHICLE_COLORS.map((color, index) => `
    <button class="color-swatch${index === 0 ? ' is-active' : ''}" type="button"
      data-color="${color.hex}" data-color-id="${color.id}" aria-label="${color.label}" title="${color.label}">
      <span class="color-preview" style="background-color: ${color.css};"></span>
      <span class="color-name">${color.label}</span>
    </button>
  `).join('')

  const surfaceOptions = SURFACE_CONDITIONS.map((condition, index) => `
    <option value="${condition.id}"${index === 0 ? ' selected' : ''}>${condition.label}</option>
  `).join('')

  return `
    <div class="site-shell simulator-shell">
      <header class="site-header simulator-header">
        <div class="header-left">
          <a class="brand" href="#home" aria-label="Back to RC Lab home">
            <span class="brand-mark" aria-hidden="true">RC</span>
            <span class="brand-copy">
              <strong>RC / LAB</strong>
              <small>Autonomous 3D Simulator</small>
            </span>
          </a>
          <div class="header-divider" aria-hidden="true"></div>
          <nav class="workspace-tabs" role="tablist" aria-label="Simulator Workspaces">
            <button class="tab-button is-active" id="tab-sim" type="button" role="tab" aria-selected="true" aria-controls="panel-sim">
              <span class="tab-icon" aria-hidden="true">⬡</span> Simulator
            </button>
            <button class="tab-button" id="tab-tuning" type="button" role="tab" aria-selected="false" aria-controls="panel-tuning">
              <span class="tab-icon" aria-hidden="true">⚙</span> Vehicle Setup
            </button>
            <button class="tab-button" id="tab-diag" type="button" role="tab" aria-selected="false" aria-controls="panel-diag">
              <span class="tab-icon" aria-hidden="true">📊</span> Diagnostics
            </button>
          </nav>
        </div>

        <div class="header-right">
          <div class="sim-status-pill" id="header-status-pill" role="status">
            <span class="status-pulse"></span>
            <span id="header-status-text">AUTONOMOUS · READY</span>
          </div>
          <a class="button button-outline header-action" href="#home"><span aria-hidden="true">←</span> Overview</a>
        </div>
      </header>

      <main class="simulator-main">
        <div class="simulator-layout">
          <!-- 3D VIEWPORT PRIMARY PANEL -->
          <section class="viewport-panel panel" aria-labelledby="viewport-heading">
            <div class="panel-heading viewport-panel-heading">
              <div class="viewport-meta">
                <span class="section-index">THREE.JS ENGINE · REAL-TIME 3D</span>
                <h2 id="viewport-heading">Virtual Proving Ground</h2>
              </div>
              <div class="viewport-badges">
                <span class="live-badge"><i></i> <span id="renderer-status">READY</span></span>
                <span class="fps-badge" id="fps-display">60 FPS</span>
              </div>
            </div>

            <div class="sim-viewport" id="sim-viewport" aria-label="Interactive 3D RC car simulator viewport">
              <!-- HUD Overlays -->
              <div class="viewport-hud-topleft">
                <div class="hud-speedometer">
                  <span class="hud-speed-num" id="hud-speed">0</span>
                  <span class="hud-speed-unit">MPH</span>
                </div>
                <div class="hud-submetrics">
                  <span class="hud-gear" id="hud-gear">PARK</span>
                  <span class="hud-mode-pill" id="hud-mode">AUTONOMOUS</span>
                </div>
              </div>

              <div class="viewport-hud-topright">
                <div class="camera-toolbar" role="group" aria-label="Camera controls">
                  <button class="cam-btn is-active" type="button" data-camera-mode="follow" title="Follow Cam (Chase)">Follow</button>
                  <button class="cam-btn" type="button" data-camera-mode="orbit" title="Orbit Inspection (Drag to rotate, Scroll to zoom)">Orbit</button>
                  <button class="cam-btn" type="button" data-camera-mode="topdown" title="Tactical Drone (Bird's Eye)">Drone</button>
                  <button class="cam-btn" type="button" data-camera-mode="bumper" title="Front Bumper / Hood Cam">Bumper</button>
                  <button class="cam-btn cam-reset-btn" id="camera-reset" type="button" title="Reset View">⟲</button>
                </div>
                <span class="viewport-road-tag" id="viewport-road-name">CITY ROAD</span>
              </div>

              <!-- Obstacle Proximity Warning Banner -->
              <div class="hud-proximity-banner" id="hud-proximity" hidden>
                <span class="proximity-icon">⚠</span>
                <span id="proximity-text">OBSTACLE DETECTED</span>
              </div>

              <!-- Pause Overlay -->
              <div class="viewport-pause-overlay" id="viewport-pause" hidden>
                <div class="pause-card">
                  <strong>SIMULATION PAUSED</strong>
                  <p>Press <kbd>P</kbd> or click Resume to continue</p>
                  <button type="button" class="button button-primary" id="overlay-resume" style="margin-top: 14px; width: 100%;">
                    Resume Drive <span aria-hidden="true">→</span>
                  </button>
                </div>
              </div>

              <div class="scene-error" id="scene-error" role="alert" hidden></div>
            </div>

            <!-- Viewport Bottom Action Bar -->
            <div class="viewport-action-bar">
              <div class="action-buttons-group">
                <button class="button button-primary" id="simulation-toggle" type="button">
                  Start Autonomous Drive <span aria-hidden="true">→</span>
                </button>
                <button class="button button-outline" id="simulation-pause" type="button" disabled>
                  Pause
                </button>
                <button class="button button-outline" id="simulation-stop" type="button" disabled>Stop</button>
                <button class="button button-outline" id="simulation-reset" type="button">
                  Reset car
                </button>
              </div>

              <div class="viewport-caption">
                <span class="road-desc-item">
                  <span class="legend-dot"></span> <span id="road-summary">${ROAD_DEFINITIONS[0].summary}</span>
                </span>
                <span class="sim-status-label" id="sim-status" role="status" aria-live="polite">SYSTEM READY</span>
              </div>
            </div>
          </section>

          <!-- SIDEBAR TABS CONTAINER -->
          <aside class="dashboard-sidebar">
            <!-- TAB 1: MAIN SIMULATOR CONTROLS & TELEMETRY -->
            <div class="tab-content is-active" id="panel-sim" role="tabpanel" aria-labelledby="tab-sim">
              <!-- LIVE TELEMETRY -->
              <section class="panel telemetry-panel" aria-labelledby="telemetry-heading">
                <div class="panel-heading compact-heading">
                  <div>
                    <span class="section-index">LIVE SENSORS & KINEMATICS</span>
                    <h2 id="telemetry-heading">Telemetry</h2>
                  </div>
                  <span class="backend-sync-status" id="backend-sync-status" role="status" aria-live="polite">
                    BACKEND SYNC DISABLED
                  </span>
                </div>

                <div class="metric-grid">
                  <div class="metric-card speed-metric">
                    <span class="metric-label">VELOCITY <span>MPH</span></span>
                    <strong id="speed-value">0</strong>
                    <span class="metric-foot" id="speed-direction">STATIONARY</span>
                  </div>
                  <div class="metric-card">
                    <span class="metric-label">ODOMETER</span>
                    <strong id="distance-value">0 <small>ft</small></strong>
                    <span class="metric-foot" id="distance-metric-m">0.0 m total</span>
                  </div>
                </div>

                <div class="metric-row-secondary">
                  <div class="metric-mini">
                    <span class="mini-label">STEERING LOCK</span>
                    <strong id="steering-val">0.0°</strong>
                    <div class="steering-gauge" aria-hidden="true">
                      <span class="gauge-bar" id="steering-bar"></span>
                    </div>
                  </div>
                  <div class="metric-mini">
                    <span class="mini-label">SIM TIME</span>
                    <strong id="elapsed-time">00:00.0</strong>
                    <span class="mini-sub" id="sim-hz">60 Hz Phys</span>
                  </div>
                </div>

                <div class="metric-row-secondary">
                  <div class="metric-mini">
                    <span class="mini-label">MAP PROXIMITY · SIMULATED</span>
                    <strong id="sensor-distance">Clear (&gt;15m)</strong>
                    <span class="mini-sub" id="sensor-target">No Obstacle Ahead</span>
                  </div>
                  <div class="metric-mini">
                    <span class="mini-label">COORDINATES</span>
                    <strong id="coords-val">X: 0.0 · Z: 0.0</strong>
                    <span class="mini-sub" id="heading-deg">Heading: 0° (North)</span>
                  </div>
                </div>

                <div class="sensor-readout-grid" aria-label="Simulated directional sensors">
                  <div class="metric-mini">
                    <span class="mini-label">FRONT ULTRASONIC · SIM</span>
                    <strong id="sensor-front-ultrasonic">Clear (&gt;4.0 m)</strong>
                  </div>
                  <div class="metric-mini">
                    <span class="mini-label">LEFT DISTANCE · SIM</span>
                    <strong id="sensor-left-distance">Clear (&gt;2.5 m)</strong>
                  </div>
                  <div class="metric-mini">
                    <span class="mini-label">RIGHT DISTANCE · SIM</span>
                    <strong id="sensor-right-distance">Clear (&gt;2.5 m)</strong>
                  </div>
                </div>

                <div class="camera-detection-panel">
                  <span class="mini-label">VIRTUAL CAMERA · GEOMETRY ONLY</span>
                  <p id="camera-detections" aria-live="off">No objects in view (&gt;15.0 m)</p>
                </div>

              </section>

              <!-- DRIVING CONTROLS -->
              <section class="panel controls-panel" aria-labelledby="controls-heading">
                <div class="panel-heading compact-heading">
                  <div>
                    <span class="section-index">CONTROL MODE</span>
                    <h2 id="controls-heading">Driving Controls</h2>
                  </div>
                  <label class="mode-select-label" for="driving-mode">
                    <span class="sr-only">Driving mode</span>
                    <select id="driving-mode" name="driving-mode">
                      <option value="manual">Manual</option>
                      <option value="autonomous" selected>Autonomous</option>
                    </select>
                  </label>
                </div>

                <p class="mode-note" id="mode-note">Autonomous mode: Map-based pathfollower routes around known obstacles.</p>

                <div class="control-console">
                  <div class="steering-control" aria-label="Driving controls">
                    <button class="control-button steer-button steer-up" type="button" data-control="forward" aria-label="Forward" aria-pressed="false" disabled>
                      <span>FWD</span><kbd>W</kbd>
                    </button>
                    <div class="steering-row">
                      <button class="control-button steer-button" type="button" data-control="left" aria-label="Steer left" aria-pressed="false" disabled>
                        <span>LEFT</span><kbd>A</kbd>
                      </button>
                      <span class="steering-center" aria-hidden="true"><i></i></span>
                      <button class="control-button steer-button" type="button" data-control="right" aria-label="Steer right" aria-pressed="false" disabled>
                        <span>RIGHT</span><kbd>D</kbd>
                      </button>
                    </div>
                    <button class="control-button steer-button steer-down" type="button" data-control="reverse" aria-label="Reverse" aria-pressed="false" disabled>
                      <span>REV</span><kbd>S</kbd>
                    </button>
                  </div>
                  <button class="control-button brake-button" type="button" data-control="brake" aria-label="Brake" aria-pressed="false" disabled>
                    <span class="brake-icon" aria-hidden="true">!</span>
                    <span>EMERGENCY BRAKE<small><kbd>SPACE</kbd> HOLD TO STOP</small></span>
                  </button>
                </div>

                <div class="keyboard-hint">
                  <span>SHORTCUTS</span>
                  <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Drive · <kbd>SPACE</kbd> Brake · <kbd>P</kbd> Pause · <kbd>R</kbd> Reset</span>
                </div>
              </section>

              <!-- ENVIRONMENT SELECTION -->
              <section class="panel track-panel" aria-labelledby="track-heading">
                <div class="panel-heading compact-heading">
                  <div>
                    <span class="section-index">5 TEST TRACKS</span>
                    <h2 id="track-heading">Select Environment</h2>
                  </div>
                </div>
                <div class="road-picker" role="group" aria-label="Select driving track">
                  ${roads}
                </div>
                <label class="surface-condition-field" for="surface-condition">
                  <span>Surface condition</span>
                  <select id="surface-condition" name="surface-condition">${surfaceOptions}</select>
                </label>
                <p class="surface-condition-current">Active condition: <strong id="current-surface-condition">Dry asphalt</strong></p>
              </section>
            </div>

            <!-- TAB 2: VEHICLE SETUP & TUNING PANEL -->
            <div class="tab-content" id="panel-tuning" role="tabpanel" aria-labelledby="tab-tuning" hidden>
              <section class="panel tuning-panel">
                <div class="panel-heading compact-heading">
                  <div>
                    <span class="section-index">RC SPECIFICATION</span>
                    <h2>Vehicle Setup</h2>
                  </div>
                </div>

                <!-- Body Paint -->
                <div class="tuning-block">
                  <label class="tuning-label">Body Paint Finish</label>
                  <div class="color-palette-grid">
                    ${colorSwatches}
                  </div>
                </div>

                <!-- Maximum Simulated Speed -->
                <div class="tuning-block">
                  <label class="speed-field" for="max-speed">
                    <span>
                      <span>MAX SPEED LIMIT</span>
                      <strong><output id="max-speed-value" for="max-speed">28 mph</output></strong>
                    </span>
                    <input id="max-speed" name="max-speed" type="range" min="5" max="48" step="1" value="28">
                    <span class="range-scale"><span>5 MPH</span><span>48 MPH</span></span>
                  </label>
                </div>

                <!-- Steering Sensitivity -->
                <div class="tuning-block">
                  <label class="speed-field" for="steering-sens">
                    <span>
                      <span>STEERING SENSITIVITY</span>
                      <strong><output id="steering-sens-val" for="steering-sens">1.0x</output></strong>
                    </span>
                    <input id="steering-sens" name="steering-sens" type="range" min="0.5" max="2.0" step="0.1" value="1.0">
                    <span class="range-scale"><span>0.5x (Gentle)</span><span>2.0x (Sharp)</span></span>
                  </label>
                </div>

                <!-- Acceleration & Braking Response -->
                <div class="tuning-block">
                  <label class="tuning-label">Drivetrain Response</label>
                  <div class="segmented-control" role="group" aria-label="Throttle Map">
                    <button class="seg-btn is-active" type="button" data-throttle-map="normal">Standard</button>
                    <button class="seg-btn" type="button" data-throttle-map="sport">Sport (1.4x)</button>
                    <button class="seg-btn" type="button" data-throttle-map="race">Race (1.8x)</button>
                  </div>
                </div>

                <!-- Camera Follow Distance -->
                <div class="tuning-block">
                  <label class="speed-field" for="cam-distance">
                    <span>
                      <span>CAMERA FOLLOW DISTANCE</span>
                      <strong><output id="cam-dist-val" for="cam-distance">9.5 m</output></strong>
                    </span>
                    <input id="cam-distance" name="cam-distance" type="range" min="6" max="18" step="0.5" value="9.5">
                    <span class="range-scale"><span>6 m (Close)</span><span>18 m (Wide)</span></span>
                  </label>
                </div>
              </section>
            </div>

            <!-- TAB 3: DIAGNOSTICS & SYSTEM TELEMETRY -->
            <div class="tab-content" id="panel-diag" role="tabpanel" aria-labelledby="tab-diag" hidden>
              <section class="panel diag-panel">
                <div class="panel-heading compact-heading">
                  <div>
                    <span class="section-index">ENGINEERING TELEMETRY</span>
                    <h2>Diagnostics</h2>
                  </div>
                  <span class="diag-status-badge">ONLINE</span>
                </div>

                <!-- Autopilot Path Progress -->
                <div class="diag-block">
                  <div class="diag-header-row">
                    <span>PATHFINDER WAYPOINTS</span>
                    <strong id="diag-waypoints">0 / 0 (0%)</strong>
                  </div>
                  <div class="progress-bar-track">
                    <div class="progress-bar-fill" id="diag-progress-fill" style="width: 0%;"></div>
                  </div>
                </div>

                <!-- Map-derived obstacle proximity -->
                <div class="diag-block">
                  <div class="diag-label">MAP PROXIMITY ESTIMATE · SIMULATED</div>
                  <div class="diag-readout-grid">
                    <div><small>NEAREST OBSTACLE</small><span id="diag-sensor-dist">&gt; 15.0 m</span></div>
                    <div><small>MAP CORRIDOR</small><span>Forward</span></div>
                    <div><small>TARGET OBSTACLE</small><span id="diag-sensor-target">None</span></div>
                    <div><small>SAFETY STATUS</small><span id="diag-safety-status">NOMINAL</span></div>
                  </div>
                </div>

                <!-- Virtual Wheel Encoders -->
                <div class="diag-block">
                  <div class="diag-label">VIRTUAL WHEEL ENCODERS & ODOMETRY</div>
                  <div class="diag-readout-grid">
                    <div><small>ENCODER TICKS</small><span id="diag-ticks">0 pulses</span></div>
                    <div><small>WHEEL RPM</small><span id="diag-rpm">0 RPM</span></div>
                    <div><small>DISTANCE (SI)</small><span id="diag-si-dist">0.00 m</span></div>
                    <div><small>SLIP RATIO</small><span>0.0% (Sim)</span></div>
                  </div>
                </div>

                <!-- Virtual IMU -->
                <div class="diag-block">
                  <div class="diag-label">VIRTUAL 6-AXIS IMU</div>
                  <div class="diag-readout-grid">
                    <div><small>HEADING YAW</small><span id="diag-yaw">0.00 rad</span></div>
                    <div><small>ANGULAR VELOCITY</small><span id="diag-ang-vel">0.0 deg/s</span></div>
                    <div><small>LATERAL ACCEL</small><span id="diag-lat-accel">0.00 G</span></div>
                    <div><small>PITCH / ROLL</small><span>0.0° (Level)</span></div>
                  </div>
                </div>

                <!-- WebGL & Engine Diagnostics -->
                <div class="diag-block">
                  <div class="diag-label">GRAPHICS PIPELINE</div>
                  <div class="diag-readout-grid">
                    <div><small>FRAME RATE</small><span id="diag-fps">60 FPS</span></div>
                    <div><small>DRAW CALLS</small><span id="diag-draw-calls">--</span></div>
                    <div><small>TRIANGLES</small><span id="diag-triangles">--</span></div>
                    <div><small>SHADOW MAP</small><span>2048 PCF</span></div>
                  </div>
                </div>
              </section>
            </div>
          </aside>
        </div>

        <p class="simulator-disclaimer">
          <span aria-hidden="true">i</span> Local browser simulation prototype only — no physical car connection.
          Map-based autonomy uses the selected track layout and known obstacle locations.
          Simulated sensor readings and camera-like object labels are geometric estimates; no machine learning, webcam access, or hardware connection.
        </p>
      </main>

      <footer class="simulator-footer">
        <span>RC / LAB <span class="footer-separator">/</span> 3D SIMULATOR V2.0</span>
        <a href="#home">Back to overview <span aria-hidden="true">↗</span></a>
      </footer>
    </div>
  `
}

export function setupSimulator(container) {
  const abortController = new AbortController()
  const { signal } = abortController
  const heldBy = new Map(controls.map((control) => [control, new Set()]))
  const buttons = new Map(
    [...container.querySelectorAll('[data-control]')].map((button) => [button.dataset.control, button])
  )

  // Top header status
  const headerStatusText = container.querySelector('#header-status-text')
  const headerStatusPill = container.querySelector('#header-status-pill')
  const backendSyncStatus = container.querySelector('#backend-sync-status')

  // Telemetry elements
  const speedValue = container.querySelector('#speed-value')
  const speedDirection = container.querySelector('#speed-direction')
  const distanceValue = container.querySelector('#distance-value')
  const distanceMetricM = container.querySelector('#distance-metric-m')
  const status = container.querySelector('#sim-status')
  const viewport = container.querySelector('#sim-viewport')
  const errorMessage = container.querySelector('#scene-error')
  const rendererStatus = container.querySelector('#renderer-status')
  const roadSummary = container.querySelector('#road-summary')
  const roadName = container.querySelector('#viewport-road-name')
  const surfaceConditionSelect = container.querySelector('#surface-condition')
  const surfaceConditionName = container.querySelector('#current-surface-condition')
  const maxSpeed = container.querySelector('#max-speed')
  const maxSpeedValue = container.querySelector('#max-speed-value')
  const mode = container.querySelector('#driving-mode')
  const modeNote = container.querySelector('#mode-note')
  const toggleButton = container.querySelector('#simulation-toggle')
  const pauseButton = container.querySelector('#simulation-pause')
  const stopButton = container.querySelector('#simulation-stop')
  const resetButton = container.querySelector('#simulation-reset')
  const cameraButtons = [...container.querySelectorAll('[data-camera-mode]')]
  const cameraResetButton = container.querySelector('#camera-reset')

  // HUD elements
  const hudSpeed = container.querySelector('#hud-speed')
  const hudGear = container.querySelector('#hud-gear')
  const hudMode = container.querySelector('#hud-mode')
  const hudProximity = container.querySelector('#hud-proximity')
  const proximityText = container.querySelector('#proximity-text')
  const viewportPause = container.querySelector('#viewport-pause')
  const overlayResume = container.querySelector('#overlay-resume')
  const fpsDisplay = container.querySelector('#fps-display')

  // Secondary telemetry
  const steeringVal = container.querySelector('#steering-val')
  const steeringBar = container.querySelector('#steering-bar')
  const elapsedTimeEl = container.querySelector('#elapsed-time')
  const sensorDistanceEl = container.querySelector('#sensor-distance')
  const sensorTargetEl = container.querySelector('#sensor-target')
  const frontUltrasonicEl = container.querySelector('#sensor-front-ultrasonic')
  const leftDistanceEl = container.querySelector('#sensor-left-distance')
  const rightDistanceEl = container.querySelector('#sensor-right-distance')
  const cameraDetectionsEl = container.querySelector('#camera-detections')
  const coordsVal = container.querySelector('#coords-val')
  const headingDegEl = container.querySelector('#heading-deg')

  // Tuning elements
  const steeringSens = container.querySelector('#steering-sens')
  const steeringSensVal = container.querySelector('#steering-sens-val')
  const camDistance = container.querySelector('#cam-distance')
  const camDistVal = container.querySelector('#cam-dist-val')
  const colorSwatches = [...container.querySelectorAll('.color-swatch')]
  const throttleSegButtons = [...container.querySelectorAll('[data-throttle-map]')]

  // Diagnostics elements
  const diagWaypoints = container.querySelector('#diag-waypoints')
  const diagProgressFill = container.querySelector('#diag-progress-fill')
  const diagSensorDist = container.querySelector('#diag-sensor-dist')
  const diagSensorTarget = container.querySelector('#diag-sensor-target')
  const diagSafetyStatus = container.querySelector('#diag-safety-status')
  const diagTicks = container.querySelector('#diag-ticks')
  const diagRpm = container.querySelector('#diag-rpm')
  const diagSiDist = container.querySelector('#diag-si-dist')
  const diagYaw = container.querySelector('#diag-yaw')
  const diagAngVel = container.querySelector('#diag-ang-vel')
  const diagLatAccel = container.querySelector('#diag-lat-accel')
  const diagFps = container.querySelector('#diag-fps')
  const diagDrawCalls = container.querySelector('#diag-draw-calls')
  const diagTriangles = container.querySelector('#diag-triangles')

  // Workspace tab buttons & panels
  const tabButtons = [...container.querySelectorAll('.tab-button')]
  const tabPanels = [...container.querySelectorAll('.tab-content')]

  if (
    !speedValue || !speedDirection || !distanceValue || !status || !viewport || !errorMessage
    || !rendererStatus || !roadSummary || !roadName || !maxSpeed || !maxSpeedValue || !mode
    || !modeNote || !toggleButton || !stopButton || !resetButton
    || !surfaceConditionSelect || !surfaceConditionName
    || !backendSyncStatus
    || !frontUltrasonicEl || !leftDistanceEl || !rightDistanceEl || !cameraDetectionsEl
  ) {
    throw new Error('Simulator view is missing a required dashboard element.')
  }

  // State
  let currentRoad = ROAD_DEFINITIONS[0]
  let currentSurfaceCondition = getSurfaceCondition('dry-asphalt')
  let vehicleState = createVehicleState(currentRoad)
  let autopilot = createAutopilot(currentRoad, { surfaceCondition: currentSurfaceCondition })
  let scene = null
  let running = false
  let isPaused = false
  let lastTimestamp = 0
  let animationFrameId = null
  let elapsedMilliseconds = 0
  let previousHeading = vehicleState.headingRadians
  let currentColorHex = 0x00e5ff
  let steeringSensitivity = 1.0
  let accelerationFactor = 1.0
  let brakingFactor = 1.0
  const backendClient = createBackendClient({
    baseUrl: import.meta.env?.VITE_API_BASE_URL ?? ''
  })
  let backendSyncTimer = null
  let lastAccelerationMps2 = 0
  let lastSteeringInput = 0
  let lastBrakeInput = false

  // 1. Workspace Tab Switching
  tabButtons.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabButtons.forEach((t) => {
        t.classList.remove('is-active')
        t.setAttribute('aria-selected', 'false')
      })
      tabPanels.forEach((p) => {
        p.classList.remove('is-active')
        p.hidden = true
      })

      tab.classList.add('is-active')
      tab.setAttribute('aria-selected', 'true')
      const targetId = tab.getAttribute('aria-controls')
      const targetPanel = container.querySelector(`#${targetId}`)
      if (targetPanel) {
        targetPanel.classList.add('is-active')
        targetPanel.hidden = false
      }
    }, { signal })
  })

  // 2. Road Selection
  const roadButtons = [...container.querySelectorAll('[data-road]')]
  roadButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const roadId = button.dataset.road
      if (roadId === currentRoad.id) return
      selectRoad(roadId)
    }, { signal })
  })

  function selectRoad(roadId) {
    try {
      currentRoad = getRoad(roadId)
      roadButtons.forEach((btn) => {
        const isSelected = btn.dataset.road === roadId
        btn.classList.toggle('is-selected', isSelected)
        btn.setAttribute('aria-pressed', String(isSelected))
      })
      roadName.textContent = currentRoad.name.toUpperCase()
      roadSummary.textContent = currentRoad.summary
      rebuildScene()
    } catch (err) {
      showError(err.message)
    }
  }

  surfaceConditionSelect.addEventListener('change', () => {
    try {
      const selectedCondition = getSurfaceCondition(surfaceConditionSelect.value)
      if (selectedCondition.id === currentSurfaceCondition.id) return

      if (running) isPaused = true
      clearHeldControls()
      sendBackendControl(false)
      currentSurfaceCondition = selectedCondition
      surfaceConditionName.textContent = currentSurfaceCondition.label
      rebuildScene({ preserveVehicleState: true })
      if (autopilot.status === 'reset-required') {
        running = false
        isPaused = false
        vehicleState = { ...vehicleState, speedMps: 0, status: 'ready' }
      }
      updateControlsState()
      updateDashboard()
    } catch (err) {
      showError(err.message)
    }
  }, { signal })

  function rebuildScene({ preserveVehicleState = false } = {}) {
    if (!preserveVehicleState) {
      running = false
      isPaused = false
      vehicleState = createVehicleState(currentRoad)
      elapsedMilliseconds = 0
      previousHeading = vehicleState.headingRadians
    }
    autopilot = createAutopilot(currentRoad, {
      surfaceCondition: currentSurfaceCondition,
      startState: preserveVehicleState ? vehicleState : null
    })

    scene?.dispose()
    scene = null

    try {
      scene = createSimulationScene(viewport, currentRoad, currentColorHex, currentSurfaceCondition)
      scene.render(vehicleState)
      errorMessage.hidden = true
      rendererStatus.textContent = 'READY'
      updateDashboard()
    } catch (err) {
      showError(`WebGL Initialization failed: ${err.message}`)
    }
  }

  function showError(msg) {
    errorMessage.textContent = msg
    errorMessage.hidden = false
    rendererStatus.textContent = 'ERROR'
  }

  function updateBackendConnectionStatus() {
    const backendStatus = backendClient.getStatus()
    const acknowledgedVehicle = backendClient.getLatestVehicle()
    const labels = {
      disabled: 'BACKEND SYNC DISABLED',
      checking: 'BACKEND CONNECTING',
      connected: 'BACKEND CONNECTED',
      unavailable: 'BACKEND UNAVAILABLE'
    }
    const label = labels[backendStatus.state]
    if (backendSyncStatus.textContent !== label) {
      backendSyncStatus.textContent = label
    }
    if (backendSyncStatus.dataset.state !== backendStatus.state) {
      backendSyncStatus.dataset.state = backendStatus.state
    }
    const statusMessage = acknowledgedVehicle
      ? `${backendStatus.message} Last acknowledged vehicle: ${acknowledgedVehicle.vehicleId}, ${acknowledgedVehicle.speedMps.toFixed(2)} m/s.`
      : backendStatus.message
    if (backendSyncStatus.title !== statusMessage) {
      backendSyncStatus.title = statusMessage
    }
  }

  function reportBackendOperation(operation) {
    if (!backendClient.enabled) return
    void operation.then(updateBackendConnectionStatus).catch((error) => {
      backendSyncStatus.textContent = 'BACKEND SYNC ERROR'
      backendSyncStatus.title = error instanceof Error ? error.message : String(error)
      console.error('Simulator backend synchronization failed.', error)
    })
  }

  function sendBackendControl(emergencyStop) {
    if (!backendClient.enabled) return
    const forward = heldBy.get('forward')?.size ? 1 : 0
    const reverse = heldBy.get('reverse')?.size ? 1 : 0
    const left = heldBy.get('left')?.size ? 1 : 0
    const right = heldBy.get('right')?.size ? 1 : 0
    const brake = Boolean(heldBy.get('brake')?.size) || emergencyStop
    reportBackendOperation(backendClient.sendControl({
      throttle: mode.value === 'manual' ? forward - reverse : 0,
      steering: mode.value === 'manual' ? left - right : 0,
      brake,
      emergencyStop
    }))
  }

  function publishBackendSnapshot() {
    if (!backendClient.enabled) return
    const sensorFrame = {
      vehicleId: 'sim-vehicle-1',
      routeId: currentRoad.id,
      source: 'simulated',
      readings: readSimulatedSensors(vehicleState, currentRoad)
    }
    reportBackendOperation(backendClient.publishSnapshot({
      vehicle: {
        vehicleId: 'sim-vehicle-1',
        speedMps: vehicleState.speedMps,
        accelerationMps2: lastAccelerationMps2,
        braking: lastBrakeInput,
        steering: lastSteeringInput,
        position: { x: vehicleState.x, z: vehicleState.z },
        headingRadians: vehicleState.headingRadians,
        mode: mode.value,
        status: vehicleState.status,
        distanceMeters: vehicleState.distanceMeters
      },
      sensorFrame,
      routeId: currentRoad.id,
      obstacles: currentRoad.obstacles.map((obstacle) => ({
        id: obstacle.id,
        kind: obstacle.kind,
        x: obstacle.x,
        z: obstacle.z,
        radius: obstacle.radius,
        distanceMeters: Math.max(
          0,
          Math.hypot(obstacle.x - vehicleState.x, obstacle.z - vehicleState.z)
            - obstacle.radius
        ),
        status: 'active'
      }))
    }))
  }

  // 3. Driving Mode & UI State
  mode.addEventListener('change', () => {
    if (running) isPaused = true
    clearHeldControls()

    if (mode.value === 'autonomous') {
      autopilot = createAutopilot(currentRoad, {
        surfaceCondition: currentSurfaceCondition,
        startState: vehicleState
      })
      if (autopilot.status === 'reset-required') {
        running = false
        isPaused = false
        vehicleState = { ...vehicleState, speedMps: 0, status: 'ready' }
      }
    }

    const isManual = mode.value === 'manual'
    modeNote.textContent = isManual
      ? 'Manual control enabled: Steer with keyboard (WASD/arrows) or on-screen directional controls.'
      : 'Autonomous mode: Map-based pathfollower routes around known obstacles.'
    hudMode.textContent = isManual ? 'MANUAL' : 'AUTONOMOUS'
    reportBackendOperation(backendClient.sendMode(mode.value))
    sendBackendControl(false)
    updateControlsState()
    updateDashboard()
  }, { signal })

  function updateControlsState() {
    const isManual = mode.value === 'manual'
    const isSimulationActive = running && !isPaused

    buttons.forEach((btn) => {
      btn.disabled = !isManual || !isSimulationActive
    })

    if (!running) {
      toggleButton.disabled = mode.value === 'autonomous' && autopilot.status === 'reset-required'
      toggleButton.innerHTML = mode.value === 'manual'
        ? 'Start Manual Drive <span aria-hidden="true">→</span>'
        : 'Start Autonomous Drive <span aria-hidden="true">→</span>'
      if (pauseButton) pauseButton.disabled = true
      stopButton.disabled = true
    } else {
      toggleButton.disabled = isPaused
      toggleButton.innerHTML = 'Driving active...'
      if (pauseButton) {
        pauseButton.disabled = false
        pauseButton.textContent = isPaused ? 'Resume' : 'Pause'
      }
      stopButton.disabled = false
    }

    if (viewportPause) viewportPause.hidden = !isPaused
  }

  // 4. Input Gathering
  function getManualInput() {
    const forward = heldBy.get('forward')?.size ? 1 : 0
    const reverse = heldBy.get('reverse')?.size ? 1 : 0
    const left = heldBy.get('left')?.size ? 1 : 0
    const right = heldBy.get('right')?.size ? 1 : 0
    const brake = Boolean(heldBy.get('brake')?.size)

    return {
      throttle: forward - reverse,
      steering: left - right,
      brake,
      maxSpeedMps: Number(maxSpeed.value) * MPH_TO_MPS * currentSurfaceCondition.speedFactor,
      steeringSensitivity,
      accelerationFactor: accelerationFactor * currentSurfaceCondition.accelerationFactor,
      brakingFactor: brakingFactor * currentSurfaceCondition.brakingFactor
    }
  }

  function clearHeldControls() {
    for (const [control, owners] of heldBy) {
      owners.clear()
      const button = buttons.get(control)
      if (button) {
        button.classList.remove('is-active')
        button.setAttribute('aria-pressed', 'false')
      }
    }
  }

  function handleControlPress(control, keyId) {
    if (mode.value !== 'manual' || !running || isPaused) return
    const set = heldBy.get(control)
    if (!set) return
    set.add(keyId)
    const btn = buttons.get(control)
    if (btn) {
      btn.classList.add('is-active')
      btn.setAttribute('aria-pressed', 'true')
    }
    sendBackendControl(false)
  }

  function handleControlRelease(control, keyId) {
    const set = heldBy.get(control)
    if (!set) return
    const wasHeld = set.delete(keyId)
    if (set.size === 0) {
      const btn = buttons.get(control)
      if (btn) {
        btn.classList.remove('is-active')
        btn.setAttribute('aria-pressed', 'false')
      }
    }
    if (wasHeld) sendBackendControl(false)
  }

  // Button Pointer Events
  buttons.forEach((button, control) => {
    button.addEventListener('pointerdown', (e) => {
      if (button.disabled) return
      button.setPointerCapture(e.pointerId)
      handleControlPress(control, `pointer-${e.pointerId}`)
    }, { signal })

    const release = (e) => {
      handleControlRelease(control, `pointer-${e.pointerId}`)
    }
    button.addEventListener('pointerup', release, { signal })
    button.addEventListener('pointercancel', release, { signal })
  })

  // Keyboard Event Listeners
  window.addEventListener('keydown', (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return

    if (event.key === 'p' || event.key === 'P') {
      togglePause()
      return
    }
    if (event.key === 'r' || event.key === 'R') {
      resetSimulation()
      return
    }
    if (event.key === 'c' || event.key === 'C') {
      cycleCameraMode()
      return
    }

    const control = controlKeys.get(event.key)
    if (control) {
      event.preventDefault()
      handleControlPress(control, `key-${event.code}`)
    }
  }, { signal })

  window.addEventListener('keyup', (event) => {
    const control = controlKeys.get(event.key)
    if (control) {
      handleControlRelease(control, `key-${event.code}`)
    }
  }, { signal })

  // 5. Actions (Toggle, Pause, Stop, Reset)
  toggleButton.addEventListener('click', () => {
    if (!running) {
      running = true
      isPaused = false
      lastTimestamp = performance.now()
      sendBackendControl(false)
      updateControlsState()
    }
  }, { signal })

  if (pauseButton) {
    pauseButton.addEventListener('click', () => {
      togglePause()
    }, { signal })
  }

  if (overlayResume) {
    overlayResume.addEventListener('click', () => {
      togglePause()
    }, { signal })
  }

  function togglePause() {
    if (!running) {
      running = true
      isPaused = false
      lastTimestamp = performance.now()
      sendBackendControl(false)
      updateControlsState()
      return
    }
    isPaused = !isPaused
    if (!isPaused) {
      lastTimestamp = performance.now()
    }
    updateControlsState()
  }

  stopButton.addEventListener('click', () => {
    running = false
    isPaused = false
    clearHeldControls()
    vehicleState = { ...vehicleState, speedMps: 0, status: 'ready' }
    lastAccelerationMps2 = 0
    lastSteeringInput = 0
    lastBrakeInput = true
    sendBackendControl(true)
    updateControlsState()
    updateDashboard()
  }, { signal })

  resetButton.addEventListener('click', () => {
    resetSimulation()
  }, { signal })

  function resetSimulation() {
    running = false
    isPaused = false
    clearHeldControls()
    vehicleState = createVehicleState(currentRoad)
    lastAccelerationMps2 = 0
    lastSteeringInput = 0
    lastBrakeInput = false
    sendBackendControl(false)
    autopilot = createAutopilot(currentRoad, { surfaceCondition: currentSurfaceCondition })
    elapsedMilliseconds = 0
    previousHeading = vehicleState.headingRadians
    updateControlsState()
    updateDashboard()
    scene?.render(vehicleState)
  }

  // 6. Camera Controls
  cameraButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const cameraMode = btn.dataset.cameraMode
      setCameraModeUI(cameraMode)
    }, { signal })
  })

  function setCameraModeUI(cameraMode) {
    cameraButtons.forEach((b) => {
      b.classList.toggle('is-active', b.dataset.cameraMode === cameraMode)
      b.setAttribute('aria-pressed', String(b.dataset.cameraMode === cameraMode))
    })
    scene?.setCameraMode(cameraMode)
  }

  function cycleCameraMode() {
    const modes = ['follow', 'orbit', 'topdown', 'bumper']
    const activeBtn = cameraButtons.find((b) => b.classList.contains('is-active'))
    const currentMode = activeBtn?.dataset.cameraMode || 'follow'
    const nextIndex = (modes.indexOf(currentMode) + 1) % modes.length
    setCameraModeUI(modes[nextIndex])
  }

  cameraResetButton?.addEventListener('click', () => {
    setCameraModeUI('follow')
    scene?.resetCamera()
  }, { signal })

  // 7. Vehicle Tuning Listeners
  maxSpeed.addEventListener('input', () => {
    maxSpeedValue.textContent = `${maxSpeed.value} mph`
  }, { signal })

  steeringSens?.addEventListener('input', () => {
    steeringSensitivity = Number(steeringSens.value)
    if (steeringSensVal) steeringSensVal.textContent = `${steeringSensitivity.toFixed(1)}x`
  }, { signal })

  throttleSegButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      throttleSegButtons.forEach((b) => b.classList.remove('is-active'))
      btn.classList.add('is-active')
      const map = btn.dataset.throttleMap
      if (map === 'sport') {
        accelerationFactor = 1.4
        brakingFactor = 1.3
      } else if (map === 'race') {
        accelerationFactor = 1.8
        brakingFactor = 1.6
      } else {
        accelerationFactor = 1.0
        brakingFactor = 1.0
      }
    }, { signal })
  })

  camDistance?.addEventListener('input', () => {
    const dist = Number(camDistance.value)
    if (camDistVal) camDistVal.textContent = `${dist.toFixed(1)} m`
    scene?.setCameraParameters({ followDistance: dist })
  }, { signal })

  colorSwatches.forEach((swatch) => {
    swatch.addEventListener('click', () => {
      colorSwatches.forEach((s) => s.classList.remove('is-active'))
      swatch.classList.add('is-active')
      currentColorHex = Number(swatch.dataset.color)
      scene?.setVehicleColor(currentColorHex)
    }, { signal })
  })

  // 8. Main Physics & Render Tick Loop
  function tick(timestamp) {
    if (signal.aborted) return

    if (running && !isPaused) {
      const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, 0.05)
      lastTimestamp = timestamp
      elapsedMilliseconds += deltaSeconds * 1000

      let input
      if (mode.value === 'autonomous') {
        const selectedMps = Number(maxSpeed.value) * MPH_TO_MPS
        const autopilotCmd = autopilot.update(vehicleState, selectedMps, deltaSeconds)
        const effectiveMaxSpeedMps = Math.min(selectedMps, AUTONOMOUS_SPEED_LIMIT_MPS)
          * currentSurfaceCondition.speedFactor
        input = {
          ...autopilotCmd,
          maxSpeedMps: effectiveMaxSpeedMps,
          steeringSensitivity,
          accelerationFactor: accelerationFactor * currentSurfaceCondition.accelerationFactor,
          brakingFactor: brakingFactor * currentSurfaceCondition.brakingFactor
        }

        if (autopilotCmd.status === 'complete') {
          running = false
          updateControlsState()
        } else if (
          autopilotCmd.status === 'blocked'
          || autopilotCmd.status === 'reset-required'
        ) {
          running = false
          isPaused = false
          vehicleState = { ...vehicleState, speedMps: 0, status: 'ready' }
          updateControlsState()
        }
      } else {
        input = getManualInput()
      }

      const previousSpeedMps = vehicleState.speedMps
      vehicleState = stepVehicle(vehicleState, input, currentRoad, deltaSeconds)
      lastAccelerationMps2 = deltaSeconds > 0
        ? (vehicleState.speedMps - previousSpeedMps) / deltaSeconds
        : 0
      lastSteeringInput = input.steering ?? 0
      lastBrakeInput = Boolean(input.brake)

      if (vehicleState.status === 'collision' || vehicleState.status === 'boundary') {
        running = false
        updateControlsState()
      }

      scene?.render(vehicleState, input)
    } else {
      lastTimestamp = timestamp
      scene?.render(vehicleState)
    }

    updateDashboard()
    animationFrameId = requestAnimationFrame(tick)
  }

  // 9. Dashboard Updates
  function updateDashboard() {
    const speedMps = vehicleState.speedMps ?? 0
    const speedMph = Math.round(Math.abs(speedMps) / MPH_TO_MPS)
    speedValue.textContent = String(speedMph)
    if (hudSpeed) hudSpeed.textContent = String(speedMph)

    // Direction / Gear
    let directionText = 'STATIONARY'
    let gearText = 'PARK'
    if (speedMps > 0.1) {
      directionText = 'FORWARD'
      gearText = 'DRIVE'
    } else if (speedMps < -0.1) {
      directionText = 'REVERSING'
      gearText = 'REVERSE'
    }
    speedDirection.textContent = directionText
    if (hudGear) hudGear.textContent = gearText

    // Odometer
    const feet = Math.round(vehicleState.distanceMeters * METERS_TO_FEET)
    distanceValue.innerHTML = `${feet} <small>ft</small>`
    if (distanceMetricM) distanceMetricM.textContent = `${vehicleState.distanceMeters.toFixed(1)} m total`

    // Coordinates & Heading
    if (coordsVal) coordsVal.textContent = `X: ${vehicleState.x.toFixed(1)} · Z: ${vehicleState.z.toFixed(1)}`
    const headingDeg = Math.round(((vehicleState.headingRadians * 180) / Math.PI) % 360)
    const normalizedDeg = headingDeg < 0 ? headingDeg + 360 : headingDeg
    if (headingDegEl) headingDegEl.textContent = `Heading: ${normalizedDeg}°`

    // Steering Angle
    const steerDeg = (vehicleState.steeringAngle * 180) / Math.PI
    if (steeringVal) steeringVal.textContent = `${steerDeg.toFixed(1)}°`
    if (steeringBar) {
      const percent = (vehicleState.steeringAngle / 0.48) * 50
      steeringBar.style.transform = `translateX(${percent}%)`
    }

    // Elapsed Time
    if (elapsedTimeEl) {
      const totalSec = Math.floor(elapsedMilliseconds / 1000)
      const mins = String(Math.floor(totalSec / 60)).padStart(2, '0')
      const secs = String(totalSec % 60).padStart(2, '0')
      const tenths = Math.floor((elapsedMilliseconds % 1000) / 100)
      elapsedTimeEl.textContent = `${mins}:${secs}.${tenths}`
    }

    // Simulated directional sensors and map-derived proximity
    const simulatedSensors = readSimulatedSensors(vehicleState, currentRoad)
    frontUltrasonicEl.textContent = formatSensorRange(
      simulatedSensors.frontUltrasonic,
      ULTRASONIC_MAX_RANGE_M
    )
    leftDistanceEl.textContent = formatSensorRange(
      simulatedSensors.leftDistance,
      SIDE_SENSOR_MAX_RANGE_M
    )
    rightDistanceEl.textContent = formatSensorRange(
      simulatedSensors.rightDistance,
      SIDE_SENSOR_MAX_RANGE_M
    )
    cameraDetectionsEl.textContent = simulatedSensors.cameraDetections.length
      ? simulatedSensors.cameraDetections.map((detection) => (
        `${detection.obstacleKind.toUpperCase()} · ${detection.obstacleId} · ${detection.distanceMeters.toFixed(1)} m`
      )).join('  /  ')
      : `No objects in view (> ${CAMERA_MAX_RANGE_M.toFixed(1)} m)`
    if (surfaceConditionName) surfaceConditionName.textContent = currentSurfaceCondition.label

    const proximity = getForwardObstacleProximity(vehicleState, currentRoad)
    if (proximity.detected) {
      const distStr = `${proximity.distanceMeters.toFixed(1)} m`
      if (sensorDistanceEl) sensorDistanceEl.textContent = `${distStr} · ${proximity.obstacleKind?.toUpperCase() ?? 'HAZARD'}`
      if (sensorTargetEl) sensorTargetEl.textContent = `Obstacle ID: ${proximity.obstacleId}`

      if (hudProximity) {
        hudProximity.hidden = false
        if (proximityText) {
          proximityText.textContent = proximity.status === 'critical'
            ? `CRITICAL PROXIMITY: ${proximity.obstacleId} (${distStr})`
            : `OBSTACLE DETECTED: ${proximity.obstacleId} ahead (${distStr})`
        }
      }
    } else {
      if (sensorDistanceEl) sensorDistanceEl.textContent = 'Clear (>15m)'
      if (sensorTargetEl) sensorTargetEl.textContent = 'No Obstacle Ahead'
      if (hudProximity) hudProximity.hidden = true
    }

    // Diagnostics Telemetry
    if (diagWaypoints && typeof autopilot?.getProgress === 'function') {
      const prog = autopilot.getProgress()
      diagWaypoints.textContent = `${prog.currentWaypointIndex + 1} / ${prog.totalWaypoints} (${prog.completionPercent}%)`
      if (diagProgressFill) diagProgressFill.style.width = `${prog.completionPercent}%`
    }

    if (diagSensorDist) diagSensorDist.textContent = proximity.detected ? `${proximity.distanceMeters.toFixed(2)} m` : '> 15.0 m'
    if (diagSensorTarget) diagSensorTarget.textContent = proximity.detected ? proximity.obstacleId : 'None'
    if (diagSafetyStatus) {
      diagSafetyStatus.textContent = vehicleState.status === 'collision'
        ? 'COLLISION FAULT'
        : proximity.status === 'critical' ? 'PROXIMITY ALERT' : 'NOMINAL'
    }

    if (diagTicks) diagTicks.textContent = `${Math.round(vehicleState.distanceMeters * 42)} pulses`
    if (diagRpm) {
      const wheelRps = Math.abs(speedMps) / (2 * Math.PI * 0.24)
      diagRpm.textContent = `${Math.round(wheelRps * 60)} RPM`
    }
    if (diagSiDist) diagSiDist.textContent = `${vehicleState.distanceMeters.toFixed(2)} m`
    if (diagYaw) diagYaw.textContent = `${vehicleState.headingRadians.toFixed(3)} rad`

    const headingDiff = vehicleState.headingRadians - previousHeading
    previousHeading = vehicleState.headingRadians
    if (diagAngVel) diagAngVel.textContent = `${((headingDiff * 60 * 180) / Math.PI).toFixed(1)} deg/s`

    // Performance Metrics
    const perf = scene?.getPerformanceMetrics?.()
    if (perf) {
      if (fpsDisplay) fpsDisplay.textContent = `${perf.fps} FPS`
      if (diagFps) diagFps.textContent = `${perf.fps} FPS`
      if (diagDrawCalls) diagDrawCalls.textContent = String(perf.drawCalls)
      if (diagTriangles) diagTriangles.textContent = String(perf.triangles)
    }

    // Status Pill & Text
    let statusText = 'SYSTEM READY'
    if (mode.value === 'autonomous' && autopilot.status === 'blocked') {
      statusText = 'AUTONOMOUS ROUTE BLOCKED'
    } else if (mode.value === 'autonomous' && autopilot.status === 'reset-required') {
      statusText = 'RESET REQUIRED TO REJOIN ROUTE'
    } else if (vehicleState.status === 'collision') {
      statusText = `COLLISION: ${vehicleState.collisionId}`
    } else if (vehicleState.status === 'boundary') {
      statusText = 'OFF-TRACK BOUNDARY REACHED'
    } else if (isPaused) {
      statusText = 'SIMULATION PAUSED'
    } else if (running) {
      if (mode.value === 'autonomous') {
        statusText = proximity.detected ? 'AVOIDING OBSTACLE' : 'FOLLOWING PATH'
      } else {
        statusText = 'MANUAL CONTROL ACTIVE'
      }
    } else if (vehicleState.distanceMeters > 0 && Math.abs(speedMps) < 0.05) {
      statusText = 'DESTINATION REACHED'
    }

    status.textContent = statusText
    if (headerStatusText) {
      const modePrefix = mode.value === 'autonomous' ? 'AUTONOMOUS' : 'MANUAL'
      headerStatusText.textContent = `${modePrefix} · ${statusText}`
    }

    if (headerStatusPill) {
      headerStatusPill.classList.toggle('status-alert', vehicleState.status === 'collision' || vehicleState.status === 'boundary')
      headerStatusPill.classList.toggle('status-paused', isPaused)
    }
    updateBackendConnectionStatus()
  }

  // Initialize
  rebuildScene()
  updateControlsState()
  updateBackendConnectionStatus()
  if (backendClient.enabled) {
    reportBackendOperation(backendClient.checkHealth())
    reportBackendOperation(backendClient.sendMode(mode.value))
    backendSyncTimer = window.setInterval(publishBackendSnapshot, 1000)
  }
  animationFrameId = requestAnimationFrame(tick)

  return () => {
    cancelAnimationFrame(animationFrameId)
    if (backendSyncTimer !== null) window.clearInterval(backendSyncTimer)
    abortController.abort()
    backendClient.dispose()
    scene?.dispose()
  }
}
