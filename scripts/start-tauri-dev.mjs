import { spawn } from "node:child_process"
import { createServer } from "node:net"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, "..")
const viteBinary = resolve(projectRoot, "node_modules/.bin/vite")
const devPort = 1421

function isPortAvailable(port) {
  return new Promise((resolveAvailability) => {
    const server = createServer()

    server.once("error", () => {
      resolveAvailability(false)
    })

    server.once("listening", () => {
      server.close(() => resolveAvailability(true))
    })

    server.listen(port, "127.0.0.1")
  })
}

const portAvailable = await isPortAvailable(devPort)

if (!portAvailable) {
  process.exit(0)
}

const child = spawn(viteBinary, ["--port", String(devPort), "--strictPort"], {
  cwd: projectRoot,
  detached: true,
  stdio: "ignore",
  shell: false,
})

child.unref()