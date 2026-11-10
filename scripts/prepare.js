'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const publicDir = path.join(root, 'public')
const assetsDir = path.join(root, '.cache', 'minecraft-assets', '26.3')
const requiredOutputs = [
  'index.js',
  'worker.js',
  'worldBounds.json',
  'textures/26.3.png',
  'blocksStates/26.3.json'
]
const force = process.argv.includes('--force')

function run (args, env = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env }
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed (exit ${result.status}): node ${args.join(' ')}`)
}

function assertExtracted (directory) {
  for (const name of ['blocks_states.json', 'blocks_models.json']) {
    if (!fs.existsSync(path.join(directory, name))) {
      throw new Error(`Minecraft 26.3 extraction failed: missing ${name}`)
    }
  }
  if (!fs.existsSync(path.join(directory, 'blocks'))) {
    throw new Error('Minecraft 26.3 extraction did not produce block textures')
  }
}

function extractAssets () {
  if (!force && fs.existsSync(path.join(assetsDir, 'blocks_models.json'))) {
    assertExtracted(assetsDir)
    return
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'prismarine-viewer-mc26-'))
  const outputDir = path.join(temporary, 'output')
  const tempDir = path.join(temporary, 'minecraft')
  try {
    run([
      path.join(__dirname, 'extract-26.3-assets.js'),
      path.join(outputDir, '26.3'),
      tempDir
    ])

    const extracted = path.join(outputDir, '26.3')
    assertExtracted(extracted)
    fs.mkdirSync(path.dirname(assetsDir), { recursive: true })
    fs.rmSync(assetsDir, { recursive: true, force: true })
    fs.cpSync(extracted, assetsDir, { recursive: true })
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true })
  }
}

function main () {
  if (!force && requiredOutputs.every(name => fs.existsSync(path.join(publicDir, name)))) {
    console.log('Prismarine Viewer 26.3 prebuilt assets already present')
    return
  }

  if (force) {
    for (const name of ['textures', 'blocksStates', 'worldBounds.json', 'index.js', 'worker.js']) {
      fs.rmSync(path.join(publicDir, name), { recursive: true, force: true })
    }
  }

  extractAssets()

  run([path.join(root, 'viewer', 'prerender.js')], {
    PRISMARINE_MC26_ASSETS_DIR: assetsDir,
    PRISMARINE_VIEWER_FORCE_BUILD: force ? '1' : '0'
  })
  run([require.resolve('webpack/bin/webpack.js')])

  for (const file of requiredOutputs) {
    if (!fs.existsSync(path.join(publicDir, file))) {
      throw new Error(`Viewer build incomplete: missing public/${file}`)
    }
  }
  console.log('Prismarine Viewer Minecraft 26.3 build complete')
}

main()
