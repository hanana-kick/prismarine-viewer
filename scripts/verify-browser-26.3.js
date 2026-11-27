'use strict'

// This test renders a real WebGL frame in Chromium and verifies that the
// observer player is not only present in data structures but textured onscreen.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const EventEmitter = require('node:events')
const puppeteer = require('puppeteer')
const { PNG } = require('pngjs')
const { Vec3 } = require('vec3')
const Chunk = require('prismarine-chunk')('26.3')
const mcData = require('minecraft-data')('26.3')

const output = path.join(__dirname, '../test/26.3-browser.png')

async function test () {
  const bot = new EventEmitter()
  bot.username = 'viewer-browser-test'
  bot.version = '26.3'
  bot.entity = { position: new Vec3(0, 64, 0), yaw: 0, pitch: 0 }
  bot.players = {}
  bot.registry = { entitiesByName: {}, items: [] }
  const chunk = new Chunk()
  const berNames = [
    'chest', 'shulker_box', 'skeleton_skull', 'red_banner',
    'copper_golem_statue', 'decorated_pot', 'conduit', 'end_portal', 'moving_piston'
  ]
  for (const [index, name] of berNames.entries()) {
    chunk.setBlockStateId(new Vec3(index + 1, 64, 3), mcData.blocksByName[name].minStateId)
  }
  bot.world = { getColumnAt: async () => chunk, raycast: () => null }
  bot.entities = {
    40: { id: 40, name: 'salmon', width: 0.7, height: 0.4, position: new Vec3(1, 64, 0) },
    41: { id: 41, name: 'creeper', width: 0.6, height: 1.7, position: new Vec3(-2, 64, 0) },
    42: { id: 42, name: 'oak_boat', width: 1.375, height: 0.5625, position: new Vec3(2, 64, 0) },
    43: { id: 43, name: 'cushion', width: 1, height: 0.25, position: new Vec3(0, 64, -2) },
    44: { id: 44, name: 'falling_block', width: 0.98, height: 0.98, position: new Vec3(-3, 64, 2) },
    45: { id: 45, name: 'item_frame', width: 0.5, height: 0.5, position: new Vec3(-1, 64, 2) },
    46: { id: 46, name: 'item_display', width: 0, height: 0, position: new Vec3(1, 64, 2) },
    47: { id: 47, name: 'text_display', width: 0, height: 0, position: new Vec3(3, 64, 2) },
    48: { id: 48, name: 'firework_rocket', width: 0.25, height: 0.25, position: new Vec3(-3, 64, -2) },
    49: { id: 49, name: 'bamboo_raft', width: 1.375, height: 0.5625, position: new Vec3(3, 64, -2) },
    50: { id: 50, name: 'mannequin', width: 0.6, height: 1.95, position: new Vec3(-4, 64, 0) },
    51: { id: 51, name: 'end_crystal', width: 2, height: 2, position: new Vec3(4, 64, 0) }
  }
  const entityIds = Object.keys(bot.entities).map(Number)

  const port = 30647
  require('../lib/mineflayer')(bot, { port, viewDistance: 1, firstPerson: false })
  let browser
  const pageErrors = []
  try {
    browser = await puppeteer.launch({
      headless: 'shell',
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--use-gl=angle', '--use-angle=swiftshader-webgl',
        '--enable-unsafe-swiftshader', '--enable-webgl'
      ]
    })
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 })
    const webglReady = await page.evaluate(() => {
      const canvas = document.createElement('canvas')
      return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
    })
    if (!webglReady) {
      throw new Error('No WebGL context in CI Chromium: check SwiftShader headless launch flags')
    }
    page.on('pageerror', error => {
      pageErrors.push(error.message)
      console.error('[Browser pageerror] ' + error.stack)
    })
    page.on('console', message => {
      console.log('[Browser ' + message.type() + '] ' + message.text())
    })
    page.on('requestfailed', request => {
      console.error('[Browser request failed] ' + request.url() + ': ' +
        JSON.stringify(request.failure()))
    })
    page.on('response', response => {
      if (response.status() >= 400) {
        console.error('[Browser HTTP ' + response.status() + '] ' + response.url())
      }
    })
    await page.goto('http://127.0.0.1:' + port + '/?viewerDebug=1', { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForFunction(() => {
        const debug = window.__prismarineDebug
        if (!debug || !debug.player()) return false
        const player = debug.player()
        let textured = false
        player.traverse(child => {
          if (child.isMesh && child.material?.map) textured = true
        })
        const entities = Object.values(debug.viewer.entities.entities)
        const meshesReady = entities.every(entity => {
          let mesh = false
          entity.traverse(child => { if (child.isMesh) mesh = true })
          return mesh
        })
        const berGroups = Object.values(debug.viewer.world.blockEntityGroups)
        const berReady = berGroups.length > 0 && berGroups.every(group => {
          let mesh = false
          group.traverse(child => { if (child.isMesh) mesh = true })
          return mesh
        })
        return textured && entities.length >= 12 && meshesReady && berReady
      }, { timeout: 30000 })
    } catch (error) {
      const diagnostics = await page.evaluate(() => {
        const debug = window.__prismarineDebug
        if (!debug) {
          return { debugFound: false, canvasCount: document.querySelectorAll('canvas').length }
        }
        const player = debug.player()
        const meshes = []
        player?.traverse(object => {
          if (object.isMesh) {
            meshes.push({
              type: object.type,
              vertices: object.geometry?.attributes?.position?.count,
              texture: !!object.material?.map,
              visible: object.visible,
              frustumCulled: object.frustumCulled
            })
          }
        })
        return {
          debugFound: true,
          playerFound: !!player,
          playerPosition: player?.position.toArray(),
          cameraPosition: debug.viewer.camera.position.toArray(),
          meshes,
          entities: Object.keys(debug.viewer.entities.entities),
          worldActive: debug.viewer.world.active
        }
      })
      console.error('[Browser diagnostic] ' + JSON.stringify(diagnostics))
      fs.mkdirSync(path.dirname(output), { recursive: true })
      await page.screenshot({ path: output, type: 'png' })
      throw error
    }

    const state = await page.evaluate((ids) => {
      const debug = window.__prismarineDebug
      const scene = debug.viewer.scene
      const result = { texturedAvatarMeshes: 0, missingEntities: [] }
      debug.player().traverse(child => {
        if (child.isMesh && child.material?.map) result.texturedAvatarMeshes++
      })
      for (const id of ids) {
        const obj = debug.viewer.entities.entities[id]
        if (!obj) { result.missingEntities.push(id); continue }
        let mesh = false
        obj.traverse(child => { if (child.isMesh) mesh = true })
        if (!mesh) result.missingEntities.push(id)
      }
      result.sceneChildren = scene.children.length
      result.blockEntityModels = Object.values(debug.viewer.world.blockEntityGroups)
        .reduce((count, group) => count + group.children.length, 0)
      result.occlusion = debug.player().userData.playerOccluded
      return result
    }, entityIds)
    assert(state.texturedAvatarMeshes > 0, 'Local player mesh never received its skin')
    assert.deepEqual(state.missingEntities, [], 'Browser did not render all test mobs')
    assert(state.blockEntityModels >= 9, 'Browser did not render every block-entity test block')
    assert(pageErrors.length === 0, 'Browser errors: ' + pageErrors.join('; '))

    fs.mkdirSync(path.dirname(output), { recursive: true })
    const screenshot = await page.screenshot({ path: output, type: 'png' })
    const image = PNG.sync.read(Buffer.from(screenshot))
    let nonBackground = 0
    let magenta = 0
    for (let y = 140; y < 460; y++) {
      for (let x = 180; x < 620; x++) {
        const i = (y * image.width + x) * 4
        const [r, g, b] = image.data.subarray(i, i + 3)
        if (Math.abs(r - 173) + Math.abs(g - 216) + Math.abs(b - 230) > 65) nonBackground++
        if (r > 245 && b > 245 && g < 10) magenta++
      }
    }
    assert(nonBackground > 100, 'WebGL image contains no recognizable player or entities')
    assert.equal(magenta, 0, 'WebGL frame still contains magenta entity proxies')
    console.log(`Chromium WebGL: player skin, ${entityIds.length} entities, ${state.blockEntityModels} block-entity models and screenshot verified`)
    console.log('Rendered non-background pixels: ' + nonBackground)
  } finally {
    if (browser) await browser.close()
    bot.viewer.close()
  }
}

test().catch(error => {
  console.error(error)
  process.exitCode = 1
})
