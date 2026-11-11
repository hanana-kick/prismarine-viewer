'use strict'

// Test the actual 26.3 entity rigs, mapped textures and the initial socket
// position event. No Minecraft server, GPU or Chromium is required.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const EventEmitter = require('node:events')
const THREE = require('three')
const { Vec3 } = require('vec3')
const { io } = require('socket.io-client')

global.THREE = THREE
const root = path.resolve(__dirname, '..')
const Entity = require('../viewer/lib/entity/Entity')
const { Entities } = require('../viewer/lib/entities')
const manifest = require('../viewer/lib/entity/texture-map-26.3.json')

const validPNG = file => {
  const handle = fs.openSync(file, 'r')
  try {
    const bytes = Buffer.alloc(8)
    fs.readSync(handle, bytes, 0, bytes.length, 0)
    return bytes.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  } finally {
    fs.closeSync(handle)
  }
}
for (const texture of new Set([...Object.values(manifest.textures), ...Object.values(manifest.defaults)])) {
  const file = path.resolve(root, 'public', texture)
  assert(file.startsWith(path.join(root, 'public') + path.sep), 'Unsafe entity asset path')
  assert(fs.existsSync(file), `Missing actual 26.3 mob texture: ${texture}`)
  assert(validPNG(file), `Invalid 26.3 mob PNG: ${texture}`)
}
assert(Object.keys(manifest.textures).length >= 150, 'Too many unresolved 26.3 legacy mob textures')

for (const [name, original, expected] of [
  ['player', 'textures/entity/steve', 'player/wide/steve.png'],
  ['player_slim', 'textures/entity/alex', 'player/slim/alex.png'],
  ['cow', 'textures/entity/cow/cow', 'cow/cow_temperate.png'],
  ['pig', 'textures/entity/pig/pig', 'pig/pig_temperate.png'],
  ['chicken', 'textures/entity/chicken', 'chicken/chicken_temperate.png'],
  ['creeper', 'textures/entity/creeper/creeper', 'creeper/creeper.png'],
  ['zombie', 'textures/entity/zombie/zombie', 'zombie/zombie.png']
]) {
  const resolved = Entity.textureFor('26.3', name, 'default', original)
  assert(resolved.endsWith('entity/' + expected), `Incorrect ${name} texture: ${resolved}`)
}

const names = [
  'player', 'player_slim', 'cow', 'pig', 'chicken', 'creeper',
  'zombie', 'skeleton', 'villager', 'sheep', 'wolf',
  'allay', 'armadillo', 'bogged', 'breeze', 'copper_golem',
  'creaking', 'warden'
]
const scene = new THREE.Scene()
const entities = new Entities(scene)
entities.setVersion('26.3')
for (const [id, name] of names.entries()) {
  const e = new Entity('26.3', name, scene)
  const childMeshes = []
  e.mesh.traverse(node => {
    if (node.isSkinnedMesh) childMeshes.push(node)
  })
  assert(childMeshes.length > 0, `${name} has no 26.3 body model`)
  assert(childMeshes.some(mesh => mesh.geometry.attributes.position.count > 0),
    `${name} has empty entity geometry`)
  entities.update({ id: id + 1, name, width: 1, height: 2, pos: { x: id, y: 64, z: 0 } })
  let magenta = false
  entities.entities[id + 1].traverse(node => {
    if (node.isMesh && node.material && node.material.color?.getHex() === 0xff00ff) magenta = true
  })
  assert(!magenta, `${name} was rendered with the magenta fallback`)
}
entities.clear()
console.log(`Minecraft Java 26.3: validated ${names.length} player/mob rigs and ${Object.keys(manifest.textures).length} mapped textures`)

async function initialPositionTest () {
  const bot = new EventEmitter()
  bot.username = 'viewer-test-bot'
  bot.version = '26.3'
  bot.players = {}
  bot.entities = {}
  bot.registry = { entitiesByName: {}, items: [] }
  bot.entity = { position: new Vec3(7, 63, -11), yaw: 0, pitch: 0 }
  bot.world = { getColumnAt: async () => null, raycast: () => null }
  const startViewer = require('../lib/mineflayer')
  const port = 30642
  startViewer(bot, { port, viewDistance: 1, firstPerson: false })
  const client = io('http://127.0.0.1:' + port, { path: '/socket.io', transports: ['websocket'], reconnection: false })
  try {
    const initial = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Initial local player position was never emitted')), 5000)
      const done = (err, pos) => {
        clearTimeout(timeout)
        if (err) reject(err)
        else resolve(pos)
      }
      client.once('position', pos => done(null, pos))
      client.once('connect_error', done)
    })
    assert.deepEqual(initial.pos, { x: 7, y: 63, z: -11 })
    assert.equal(initial.addMesh, true)
    assert.equal(initial.pitch, undefined, 'Third-person view unexpectedly entered first-person mode')
    console.log('Stationary local player receives initial third-person position without a move event')
  } finally {
    client.disconnect()
    bot.viewer.close()
  }
}

initialPositionTest().catch(err => {
  console.error(err)
  process.exitCode = 1
})
