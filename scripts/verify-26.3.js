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


const palette = require(path.join(root, 'viewer/lib/biome-tints-26.3.json'))
for (const [kind, names] of Object.entries({
  grass: ['forest', 'plains', 'dark_forest', 'taiga'],
  foliage: ['forest', 'plains', 'dark_forest', 'taiga']
})) {
  for (const name of names) {
    const rgb = palette[kind][name]
    assert(Array.isArray(rgb) && rgb.length === 3, `Missing ${kind} colour for ${name}`)
    assert(rgb.every(value => Number.isFinite(value) && value >= 0 && value <= 1),
      `Invalid RGB for ${kind} in ${name}`)
    assert(rgb.some(value => value > 0.1), `Black ${kind} tint for ${name}`)
  }
}
// 26.3 encodes a dynamic colormap lookup as zero; this must never reach
// the Web Worker as literal black.
assert.equal(mcData.tints.foliage.data.find(group => group.keys.includes('forest')).color, 0)
assert(palette.foliage.forest[1] > 0.15, 'Forest foliage was rendered black')

// Audit block-model references for later texture regression diagnosis.
let missingModels = 0
let missingFaces = 0
const sampleFailures = []
function auditVariant (name, variant) {
  if (!variant || !variant.model) {
    missingModels++
    if (sampleFailures.length < 12) sampleFailures.push(name + ': missing model')
    return
  }
  for (const element of variant.model.elements || []) {
    for (const face of Object.values(element.faces || {})) {
      const tex = face.texture
      if (!tex || !Number.isFinite(tex.u) || !Number.isFinite(tex.v)) {
        missingFaces++
        if (sampleFailures.length < 12) sampleFailures.push(name + ': missing face texture')
      }
    }
  }
}
for (const [name, state] of Object.entries(states)) {
  if (!state) continue
  if (state.variants) {
    for (const variant of Object.values(state.variants)) {
      for (const v of Array.isArray(variant) ? variant : [variant]) auditVariant(name, v)
    }
  }
  if (state.multipart) {
    for (const entry of state.multipart) {
      for (const v of Array.isArray(entry.apply) ? entry.apply : [entry.apply]) auditVariant(name, v)
    }
  }
}
console.log(`26.3 model audit: ${missingModels} missing models, ${missingFaces} missing texture faces`)
if (sampleFailures.length) console.log('Model audit samples: ' + sampleFailures.join('; '))

console.log('Minecraft 26.3 data, block models, chunk world bounds and browser bundles verified')
