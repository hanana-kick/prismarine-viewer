'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const mcData = require('minecraft-data')('26.3')
assert(mcData && mcData.version && mcData.version.version === 777, 'Expected Minecraft 26.3 protocol 777')
assert(mcData.blocksByName && mcData.blocksByName.stone, 'Missing 26.3 block data')
assert(mcData.blocksByName.poplar_planks, 'Missing Minecraft 26.3 new block data (poplar_planks)')

const Chunk = require('prismarine-chunk')('26.3')
const chunk = new Chunk()
assert(chunk.minY === -64 && chunk.worldHeight === 384, '26.3 chunk world bounds must be -64..319')

const dir = path.join(root, 'public')
for (const file of ['index.js', 'worker.js', 'textures/26.3.png', 'blocksStates/26.3.json', 'worldBounds.json']) {
  assert(fs.existsSync(path.join(dir, file)), `Missing output public/${file}`)
}
const png = fs.readFileSync(path.join(dir, 'textures/26.3.png'))
assert(png.length > 1000 && png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid 26.3 PNG atlas')
const states = JSON.parse(fs.readFileSync(path.join(dir, 'blocksStates/26.3.json'), 'utf8'))
assert(states.stone && states.poplar_planks, '26.3 model atlas missing stone or poplar_planks')
const bounds = JSON.parse(fs.readFileSync(path.join(dir, 'worldBounds.json'), 'utf8'))
assert(bounds['26.3'] && bounds['26.3'].minY === -64 && bounds['26.3'].worldHeight === 384, '26.3 world bounds mismatch')
assert(fs.statSync(path.join(dir, 'index.js')).size > 1000, 'Missing browser client bundle')
assert(fs.statSync(path.join(dir, 'worker.js')).size > 1000, 'Missing Web Worker bundle')

console.log('Minecraft 26.3 data, block models, chunk world bounds and browser bundles verified')
