import './style.css'

import { renderHome } from './home.js'
import { renderSimulator, setupSimulator } from './simulator.js'

const app = document.querySelector('#app')

if (!app) {
  throw new Error('Application mount point "#app" was not found.')
}

let cleanupCurrentView = () => {}

function renderCurrentView() {
  cleanupCurrentView()
  cleanupCurrentView = () => {}

  if (window.location.hash === '#simulator') {
    app.innerHTML = renderSimulator()
    cleanupCurrentView = setupSimulator(app)
    return
  }

  app.innerHTML = renderHome()
}

window.addEventListener('hashchange', renderCurrentView)
renderCurrentView()
