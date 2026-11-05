import { createServer } from 'node:http'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createSimulationStore } from './services/simulationStore.js'

try {
  const config = loadConfig()
  const server = createServer(createApp({
    config,
    store: createSimulationStore()
  }))

  server.on('error', (error) => {
    console.error(`Backend server failed: ${error.message}`)
    process.exitCode = 1
  })

  server.listen(config.port, config.host, () => {
    console.log(`Simulator backend listening at http://${config.host}:${config.port}`)
  })
} catch (error) {
  console.error(`Backend configuration failed: ${error.message}`)
  process.exitCode = 1
}
