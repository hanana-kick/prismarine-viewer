'use strict'

// Per-entity rendering harness for Minecraft Java 26.3.
//
//   node scripts/entity-inspector-26.3.js --serve
//     Builds the bundle and serves the interactive inspector (entity picker, individual
//     part toggles, hitbox/mesh overlays, bone pivots, camera presets).
//
//   node scripts/entity-inspector-26.3.js --all --out test/entity-gallery
//     Renders one screenshot per entity headlessly plus an HTML gallery.
//
//   node scripts/entity-inspector-26.3.js creeper warden --parts
//     Only the listed entities, plus one shot per rig part.
const fs = require('fs')
const path = require('path')
const http = require('http')
const { spawnSync } = require('child_process')

const root = path.resolve(__dirname, '..')
const inspectorDir = path.join(root, 'examples', 'entity_inspector')

// Vanilla authors these models around the entity position rather than on the floor, or
// lets parts such as tentacles and splayed spider legs cross the floor plane, so a mesh
// that does not sit on y=0 is correct for them.
const MODEL_FLOATS_BY_DESIGN = new Set([
  'ghast', 'happy_ghast', 'ender_dragon', 'wither', 'blaze', 'breeze', 'phantom', 'bat',
  'allay', 'vex', 'bee', 'parrot', 'shulker', 'end_crystal', 'squid', 'glow_squid',
  'cod', 'salmon', 'tropical_fish', 'pufferfish', 'tadpole', 'dolphin', 'turtle',
  'axolotl', 'nautilus', 'zombie_nautilus', 'guardian', 'elder_guardian',
  'spider', 'cave_spider', 'eye_of_ender'
])

function parseArgs (argv) {
  const options = {
    serve: false,
    all: false,
    parts: false,
    build: true,
    views: ['iso'],
    out: path.join(root, 'test', 'entity-gallery'),
    width: 420,
    height: 420,
    port: 30663,
    limit: 0,
    scale: 1,
    item: '',
    ascii: false,
    names: []
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const value = () => argv[++i]
    if (arg === '--serve') options.serve = true
    else if (arg === '--all') options.all = true
    else if (arg === '--parts') options.parts = true
    else if (arg === '--no-build') options.build = false
    else if (arg === '--out') options.out = path.resolve(root, value())
    else if (arg === '--views') options.views = value().split(',').filter(Boolean)
    else if (arg === '--width') options.width = Number(value())
    else if (arg === '--height') options.height = Number(value())
    else if (arg === '--port') options.port = Number(value())
    else if (arg === '--limit') options.limit = Number(value())
    else if (arg === '--scale') options.scale = Number(value())
    else if (arg === '--item') options.item = value()
    else if (arg === '--ascii') options.ascii = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg.startsWith('-')) throw new Error(`Unknown option ${arg}`)
    else options.names.push(arg)
  }
  return options
}

function buildBundle () {
  const result = spawnSync(process.execPath, [
    path.join(root, 'node_modules', 'webpack', 'bin', 'webpack.js'),
    '--config', path.join(inspectorDir, 'webpack.config.js')
  ], { cwd: root, stdio: 'inherit' })
  if (result.status !== 0) throw new Error('Inspector bundle build failed')
}

function rigSourceOf (Entity, name, rig) {
  if (rig === name) return 'own rig'
  if (Entity.compatibleEntityRigs[name]) return 'shared rig'
  if (/_boat$/.test(name) || /_chest_boat$/.test(name) ||
      name === 'bamboo_raft' || name === 'bamboo_chest_raft') return 'shared boat rig'
  return 'fallback rig'
}

// Every 26.3 entity, how the viewer resolves it and how large it actually draws.
function buildCatalog () {
  const THREE = require('three')
  const registry = require('prismarine-registry')('26.3')
  const Entity = require('../viewer/lib/entity/Entity')
  const rigs = require('../viewer/lib/entity/entities.json')
  const textureMap = require('../viewer/lib/entity/texture-map-26.3.json')
  const scene = new THREE.Scene()

  const catalog = {}
  for (const entry of Object.values(registry.entities)) {
    const name = String(entry.name || '').replace(/^minecraft:/, '')
    if (!name) continue
    const hidden = Entity.nonMeshEntities.has(name)
    const simple = Entity.simpleEntities[name]
    const rig = Entity.selectRig(name)
    const rigData = rigs[rig]
    const record = {
      name,
      hitbox: { width: entry.width, height: entry.height },
      kind: hidden ? 'hidden' : (simple ? 'simple' : 'rig'),
      rig: simple ? `simple:${simple.shape}` : rig,
      rigSource: rigSourceOf(Entity, name, rig),
      parts: [],
      rendered: null,
      warnings: []
    }
    const warn = (level, text) => record.warnings.push({ level, text })

    if (rigData) {
      const firstTexture = Object.values(rigData.textures || {})[0]
      for (const [part, model] of Object.entries(rigData.geometry)) {
        const source = (rigData.textures || {})[part] || (part === 'default' ? firstTexture : null)
        const bones = model.bones || []
        record.parts.push({
          part,
          texture: Entity.textureFor('26.3', name, part, source),
          bones: bones.length,
          cubes: bones.reduce((total, bone) => total + (bone.cubes ? bone.cubes.length : 0), 0),
          cubeRotations: bones.reduce((total, bone) =>
            total + (bone.cubes || []).filter(cube => cube.rotation).length, 0)
        })
      }
    }

    const measure = () => {
      const entity = new Entity('26.3', name, scene)
      entity.mesh.updateMatrixWorld(true)
      const box = new THREE.Box3().setFromObject(entity.mesh)
      let triangles = 0
      entity.mesh.traverse(object => {
        if (object.geometry && object.geometry.index) triangles += object.geometry.index.count / 3
      })
      if (!box.isEmpty()) {
        const size = box.getSize(new THREE.Vector3())
        record.rendered = {
          width: size.x, height: size.y, depth: size.z, minY: box.min.y, triangles
        }
      }
    }
    // Dropped items are built by the item model, not a rig: nothing to measure here.
    if (name !== 'item') {
      try { measure() } catch (error) { warn('bad', `construction failed: ${error.message}`) }
    }

    if (hidden) warn('info', 'rendered as nothing (nonMesh)')
    if (simple) warn('info', `simple ${simple.shape} placeholder, not a real model`)
    if (name === 'item') warn('info', 'dropped item: built from the item model, pick the item with --item')
    if (!hidden && !simple && name !== 'item') {
      if (!rigData) warn('bad', `no rig named "${rig}" in entities.json`)
      else if (rig !== name && !name.endsWith(rig)) warn('warn', `borrowed rig "${rig}", silhouette is not this mob`)
      if (record.rendered === null) warn('bad', 'renders nothing')
      else {
        const dw = Math.abs(record.rendered.width - entry.width)
        const dh = Math.abs(record.rendered.height - entry.height)
        if (Math.max(dw, dh) > 0.35) {
          warn('warn', `draws ${record.rendered.width.toFixed(2)}×${record.rendered.height.toFixed(2)}, hitbox is ${entry.width}×${entry.height}`)
        }
        const floats = MODEL_FLOATS_BY_DESIGN.has(name) ||
          entry.type === 'projectile' || entry.type === 'water_creature' || entry.type === 'ambient'
        if (floats) {
          if (Math.abs(record.rendered.minY) > 0.1) {
            warn('info', `mesh floor at y=${record.rendered.minY.toFixed(2)} (model is not authored on the ground)`)
          }
        } else if (record.rendered.minY < -0.1) {
          warn('warn', `mesh sinks ${Math.abs(record.rendered.minY).toFixed(2)} blocks below the floor`)
        } else if (record.rendered.minY > 0.1) {
          warn('warn', `mesh floats ${record.rendered.minY.toFixed(2)} blocks above the floor`)
        }
      }
      const untextured = record.parts.filter(part => part.part !== 'sheared' && part.part !== 'charged' && !part.texture)
      for (const part of untextured) warn('warn', `part "${part.part}" has no 26.3 texture, dropped`)
      if (record.parts.length > 1 && !textureMap.defaults[name]) {
        warn('warn', 'no 26.3 default texture for this type: variant chosen by rig order')
      }
    }
    catalog[name] = record
  }
  return catalog
}

function startServer (catalog, port) {
  const express = require('express')
  const app = express()
  app.get('/catalog.json', (request, response) => response.json(catalog))
  app.use(express.static(path.join(inspectorDir, 'public')))
  // Entity and block textures live in the repository's built public/ directory.
  app.use(express.static(path.join(root, 'public')))
  const server = http.createServer(app)
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}

function chromePath () {
  try {
    return require('puppeteer').executablePath()
  } catch (error) {
    // The pinned puppeteer release may not have downloaded its own build.
    const cache = path.join(process.env.HOME || '', '.cache', 'puppeteer')
    for (const channel of ['chrome', 'chrome-headless-shell']) {
      const dir = path.join(cache, channel)
      if (!fs.existsSync(dir)) continue
      for (const version of fs.readdirSync(dir).reverse()) {
        for (const candidate of [
          path.join(dir, version, 'chrome-linux64', 'chrome'),
          path.join(dir, version, 'chrome-headless-shell')
        ]) {
          if (fs.existsSync(candidate)) return candidate
        }
      }
    }
    throw error
  }
}

function selectNames (options, catalog) {
  const all = Object.keys(catalog)
  let names = options.all
    ? all
    : options.names.flatMap(pattern => all.filter(name => name === pattern || name.includes(pattern)))
  if (options.limit) names = names.slice(0, options.limit)
  if (!names.length) throw new Error('Nothing to render: pass entity names, a substring, or --all')
  return names
}

// Share of the middle of the frame that is not the scene background: catches entity
// meshes that exist but draw nothing (or are scaled away to a speck).
function pixelCoverage (file) {
  if (!fs.existsSync(file)) return 0
  const { PNG } = require('pngjs')
  const png = PNG.sync.read(fs.readFileSync(file))
  const background = [0x1b, 0x20, 0x26]
  const x0 = Math.floor(png.width * 0.15)
  const x1 = Math.ceil(png.width * 0.85)
  const y0 = Math.floor(png.height * 0.15)
  const y1 = Math.ceil(png.height * 0.85)
  let drawn = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4
      const delta = Math.max(
        Math.abs(png.data[i] - background[0]),
        Math.abs(png.data[i + 1] - background[1]),
        Math.abs(png.data[i + 2] - background[2]))
      if (delta > 12) drawn++
    }
  }
  return drawn / ((x1 - x0) * (y1 - y0)) * 100
}

// Text-mode preview so renders can be checked without a GUI: G/B/R mark greenish,
// bluish (hitbox overlay) and reddish pixels, the ramp otherwise shades brightness.
function asciiPreview (file, columns = 64) {
  if (!fs.existsSync(file)) return '(missing screenshot)'
  const { PNG } = require('pngjs')
  const png = PNG.sync.read(fs.readFileSync(file))
  const rows = Math.round(columns * (png.height / png.width) * 0.5)
  const ramp = ' .:-=+*#%@'
  const lines = []
  for (let y = 0; y < rows; y++) {
    let line = ''
    for (let x = 0; x < columns; x++) {
      const i = (Math.floor((y + 0.5) * png.height / rows) * png.width +
        Math.floor((x + 0.5) * png.width / columns)) * 4
      const r = png.data[i]
      const g = png.data[i + 1]
      const b = png.data[i + 2]
      if (g > r * 1.4 && g > b * 1.2) line += 'G'
      else if (b > r * 1.5 && b > g * 1.1) line += 'B'
      else if (r > g * 1.5 && r > b * 1.2) line += 'R'
      else line += ramp[Math.min(9, Math.floor(((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * 10))]
    }
    lines.push(line)
  }
  return lines.join('\n')
}

async function capture (page, options, name, view, parts, file) {
  await page.evaluate((entity, settings) =>
    window.__inspector.show(entity, settings), name, {
    preset: view, parts: parts || 'all', scale: options.scale, itemName: options.item || undefined
  })
  await page.waitForFunction('window.__inspector.texturesReady()', { timeout: 5000 }).catch(() => {})
  await page.evaluate(() => new Promise(resolve =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(() =>
      window.requestAnimationFrame(resolve)))))
  await page.screenshot({ path: file })
  const summary = await page.evaluate(() => window.__inspector.state())
  summary.coverage = pixelCoverage(file)
  if (summary.coverage < 2) {
    summary.warnings.push({ level: 'bad', text: `screenshot fills only ${summary.coverage.toFixed(1)}% of the frame` })
  }
  return summary
}
async function renderGallery (options, catalog) {
  const puppeteer = require('puppeteer')
  const names = selectNames(options, catalog)
  fs.mkdirSync(options.out, { recursive: true })

  const server = await startServer(catalog, options.port)
  const browser = await puppeteer.launch({
    headless: 'shell',
    executablePath: chromePath(),
    args: [
      '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
      '--use-gl=angle', '--use-angle=swiftshader-webgl',
      '--enable-unsafe-swiftshader', '--enable-webgl'
    ]
  })
  const results = []
  try {
    const page = await browser.newPage()
    page.setDefaultTimeout(30000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.setViewport({ width: options.width, height: options.height, deviceScaleFactor: 1 })
    await page.goto(`http://127.0.0.1:${options.port}/?bare=1`, { waitUntil: 'networkidle2' })
    await page.waitForFunction('window.__inspector && window.__inspector.ready === true', { timeout: 30000 })

    for (const name of names) {
      for (const view of options.views) {
        const whole = await capture(page, options, name, view, null,
          path.join(options.out, `${name}${options.views.length > 1 ? `.${view}` : ''}.png`))
        results.push({ name, view, part: null, summary: whole })
        if (options.parts) {
          for (const part of whole.parts) {
            const only = await capture(page, options, name, view, [part.part],
              path.join(options.out, `${name}__${part.part}.png`))
            results.push({ name, view, part: part.part, summary: only })
          }
        }
      }
      if (options.ascii) console.log(`\n${name}\n${asciiPreview(path.join(options.out, `${name}.png`))}`)
      process.stdout.write(`\r${results.filter(result => !result.part).length}/${names.length} ${name.padEnd(24)}`)
    }
    console.log('')
    fs.writeFileSync(path.join(options.out, 'report.json'), JSON.stringify({
      generatedAt: new Date().toISOString(),
      pageErrors: errors,
      results: results.map(({ name, view, part, summary }) => ({ name, view, part, ...summary }))
    }, null, 2))
    fs.writeFileSync(path.join(options.out, 'index.html'), galleryHtml(results, options))
    if (errors.length) console.log(`page errors: ${errors.join('; ')}`)
  } finally {
    await browser.close()
    server.close()
  }
  return { names, out: options.out }
}

function galleryHtml (results, options) {
  const rows = results.filter(result => !result.part)
  const cards = rows.map(result => {
    const summary = result.summary
    const size = summary.rendered
      ? `${summary.rendered.width.toFixed(2)}×${summary.rendered.height.toFixed(2)}×${summary.rendered.depth.toFixed(2)}`
      : 'nothing'
    const hitbox = summary.hitbox ? `${summary.hitbox.width}×${summary.hitbox.height}` : '—'
    const worst = summary.warnings.reduce((level, warning) =>
      warning.level === 'bad' ? 'bad' : (warning.level === 'warn' && level !== 'bad' ? 'warn' : level), 'ok')
    const notes = summary.warnings.map(warning => `${warning.level}: ${warning.text}`).join('\n')
    const parts = summary.parts.map(part =>
      `${part.part}${part.texture ? '' : ' (no texture)'}${part.visible ? '' : ' [hidden]'}`).join('<br>')
    return `<figure class="${worst}">
      <a href="/?entity=${summary.name}"><img src="${result.file}" alt="${summary.name}" loading="lazy"></a>
      <figcaption>
        <strong><a href="/?entity=${summary.name}">${summary.name}</a></strong>
        <dl>
          <dt>rig</dt><dd>${summary.rig || '—'} (${summary.rigSource || '—'})</dd>
          <dt>hitbox</dt><dd>${hitbox}</dd>
          <dt>drawn</dt><dd>${size}</dd>
          <dt>parts</dt><dd>${parts || '—'}</dd>
          <dt>notes</dt><dd class="notes">${notes || 'ok'}</dd>
        </dl>
      </figcaption>
    </figure>`
  }).join('\n')
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>26.3 entity gallery</title><style>
body { font: 12px/1.45 monospace; background: #14181d; color: #dbe3ec; margin: 16px; }
input { width: 260px; background: #1d242b; color: #dbe3ec; border: 1px solid #2c343d; padding: 4px; font: inherit; }
main { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; margin-top: 12px; }
figure { margin: 0; background: #1b2026; border: 1px solid #2c343d; border-left: 4px solid #3c4650; padding: 6px; }
figure.warn { border-left-color: #ffb300; } figure.bad { border-left-color: #ff4081; }
img { width: 100%; height: 190px; object-fit: contain; background: #232a31; image-rendering: pixelated; }
figcaption dl { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; margin: 6px 0 0; }
dt { color: #7d8b9a; } dd { margin: 0; word-break: break-all; }
.notes { white-space: pre-wrap; color: #ffcc66; }
a { color: #dbe3ec; text-decoration: none; }
</style></head><body>
<h1>Minecraft Java 26.3 entity gallery — ${rows.length} entities</h1>
<p>Rendered by scripts/entity-inspector-26.3.js (${options.views.join(', ')}). Click a picture to open the inspector.
Filter: <input id="f" type="search" oninput="document.querySelectorAll('figure').forEach(function(e){e.style.display=e.textContent.toLowerCase().includes(f.value.toLowerCase())?'':'none'})"></p>
<main>${cards}</main>
</body></html>
`
}

async function main () {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(0, 14).join('\n'))
    return undefined
  }
  if (options.build) buildBundle()
  const catalog = buildCatalog()
  if (options.serve) {
    const server = await startServer(catalog, options.port)
    console.log(`Entity inspector: http://127.0.0.1:${options.port}/  (${Object.keys(catalog).length} entities)`)
    console.log('Ctrl-C to stop.')
    return new Promise(resolve => server.on('close', resolve))
  }
  const { names, out } = await renderGallery(options, catalog)
  const suspect = names.filter(name =>
    catalog[name].warnings.some(warning => warning.level !== 'info'))
  console.log(`Wrote ${names.length} entities to ${out}`)
  console.log(`gallery: ${path.join(out, 'index.html')}`)
  console.log(`${suspect.length} of them carry warnings`)
  return undefined
}

if (require.main === module) {
  main().catch(error => {
    console.error(error.stack || String(error))
    process.exitCode = 1
  })
}

module.exports = { buildCatalog, startServer, galleryHtml }
