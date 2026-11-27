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
assert(palette.grass.dark_forest[1] > 0.25, 'Dark forest grass is still using a dark modifier constant as RGB')
assert(palette.grass.dark_forest[1] < palette.grass.forest[1], 'Dark forest grass lost its darker vanilla shade')

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

const { getSectionGeometry } = require('../viewer/lib/models')
const biome = { name: 'forest' }
const airBlock = {
  name: 'air',
  transparent: true,
  isCube: false,
  biome,
  getProperties: () => ({})
}
const leafBlock = {
  name: 'dark_oak_leaves',
  transparent: true,
  isCube: true,
  biome,
  getProperties: () => ({ distance: 7, persistent: false, waterlogged: false })
}
const forestWorld = {
  minY: -64,
  getBlock: pos => {
    const inLeaves = pos.x >= 3 && pos.x <= 5 &&
      pos.y >= 67 && pos.y <= 69 &&
      pos.z >= 3 && pos.z <= 5
    const block = inLeaves ? leafBlock : airBlock
    block.position = { x: pos.x, y: pos.y, z: pos.z }
    return block
  }
}
const forestMesh = getSectionGeometry(0, 64, 0, forestWorld, states)
assert(forestMesh.positions.length > 0, 'Dark oak leaves have no vertices')
assert(forestMesh.colors.length > 0, 'Dark oak leaves have no vertex colours')
for (const value of forestMesh.colors) {
  assert(Number.isFinite(value), 'Leaf mesh colour is not finite')
}
const green = Array.from(forestMesh.colors).filter((value, index) => index % 3 === 1)
const minimumGreen = Math.min(...green)
assert(minimumGreen > 0.12, `Dark oak leaf colours are still too dark: ${minimumGreen}`)
console.log(`26.3 dense-leaf meshing check passed: minimum green = ${minimumGreen.toFixed(3)}`)

const { Vec3 } = require('vec3')
const bubbleBlock = {
  name: 'bubble_column',
  type: mcData.blocksByName.bubble_column.id,
  metadata: 0,
  transparent: true,
  isCube: true,
  biome,
  getProperties: () => ({ drag: true })
}
const bubbleWorld = {
  minY: -64,
  getBlock: pos => {
    const block = pos.x === 0 && pos.y === 0 && pos.z === 0 ? bubbleBlock : airBlock
    block.position = new Vec3(pos.x, pos.y, pos.z)
    return block
  }
}
const bubbleMesh = getSectionGeometry(0, 0, 0, bubbleWorld, states)
assert(bubbleMesh.positions.length > 0, 'Bubble columns must use the water liquid renderer')
console.log('26.3 bubble-column liquid meshing check passed')

// Empty block models are expected for block-entity renderers, invisible helper
// blocks and upper pitcher-crop states; do not classify those as missing models.
const PrismarineBlock = require('prismarine-block')('26.3')
function expectedEmptyBlockModel (name) {
  return name === 'moving_piston' || name === 'end_portal' || name === 'end_gateway' ||
    name === 'chest' || name === 'shulker_box' ||
    name === 'decorated_pot' || name === 'conduit' || name === 'pitcher_crop' ||
    name === 'barrier' || name === 'light' || name === 'structure_void' ||
    name.endsWith('_chest') || name.endsWith('_shulker_box') ||
    name.endsWith('_skull') || name.endsWith('_head') || name.endsWith('_banner') ||
    name.includes('copper_golem_statue')
}
function meshSingleBlock (block) {
  block.position = new Vec3(8, 8, 8)
  block.biome = biome
  const world = {
    minY: -64,
    getBlock: pos => {
      if (pos.x === 8 && pos.y === 8 && pos.z === 8) return block
      const air = PrismarineBlock.fromStateId(0, 0)
      air.position = new Vec3(pos.x, pos.y, pos.z)
      air.biome = biome
      return air
    }
  }
  return getSectionGeometry(0, 0, 0, world, states)
}
const unexpectedEmpty = []
const meshingErrors = []
for (const block of mcData.blocksArray) {
  if (block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') continue
  try {
    const mesh = meshSingleBlock(PrismarineBlock.fromStateId(block.minStateId, 0))
    if (mesh.positions.length === 0 && !expectedEmptyBlockModel(block.name)) unexpectedEmpty.push(block.name)
  } catch (error) {
    meshingErrors.push(block.name + ': ' + error.message)
  }
}
assert.deepEqual(unexpectedEmpty, [], 'Ordinary blocks unexpectedly render no geometry')
assert.deepEqual(meshingErrors, [], 'Block meshing threw an exception')
let pitcherVariants = 0
for (let stateId = mcData.blocksByName.pitcher_crop.minStateId; stateId <= mcData.blocksByName.pitcher_crop.maxStateId; stateId++) {
  if (meshSingleBlock(PrismarineBlock.fromStateId(stateId, 0)).positions.length > 0) pitcherVariants++
}
assert(pitcherVariants > 0, 'Every pitcher-crop state unexpectedly renders no geometry')
console.log(`26.3 full block sweep: ${mcData.blocksArray.length - 3} blocks, 0 unexpected empty models, ${pitcherVariants} pitcher-crop states meshed`)

console.log('Minecraft 26.3 data, block models, chunk world bounds and browser bundles verified')
