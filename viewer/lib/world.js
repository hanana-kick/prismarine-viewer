const Chunks = require('prismarine-chunk')
const mcData = require('minecraft-data')
const { Vec3 } = require('vec3')

function columnKey (x, z) {
  return `${x},${z}`
}

function posInChunk (pos) {
  pos = pos.floored()
  pos.x &= 15
  pos.z &= 15
  return pos
}

function isCube (shapes) {
  if (!shapes || shapes.length !== 1) return false
  const shape = shapes[0]
  return shape[0] === 0 && shape[1] === 0 && shape[2] === 0 && shape[3] === 1 && shape[4] === 1 && shape[5] === 1
}

// Block entities which need a dedicated model rather than their blockstate
// model. Signs, beds and other block entities intentionally keep their normal
// section geometry. In particular, piston_head has a regular block model.
function isBlockEntityName (name) {
  return name === 'chest' || name.endsWith('_chest') ||
    name.endsWith('shulker_box') ||
    name.endsWith('_skull') || (name.endsWith('_head') && name !== 'piston_head') ||
    name.endsWith('_banner') ||
    name.endsWith('copper_golem_statue') ||
    name === 'decorated_pot' || name === 'conduit' ||
    name === 'end_portal' || name === 'end_gateway' || name === 'moving_piston'
}

class World {
  constructor (version) {
    this.Chunk = Chunks(version)
    this.columns = {}
    this.blockCache = {}
    this.biomeCache = mcData(version).biomes
    // 0 before 1.18, -64 after — used by models.js to cull out-of-world faces
    this.minY = new this.Chunk().minY ?? 0
  }

  addColumn (x, z, json) {
    const chunk = this.Chunk.fromJson(json)
    this.columns[columnKey(x, z)] = chunk
    return chunk
  }

  removeColumn (x, z) {
    delete this.columns[columnKey(x, z)]
  }

  getColumn (x, z) {
    return this.columns[columnKey(x, z)]
  }

  setBlockStateId (pos, stateId) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return false

    column.setBlockStateId(posInChunk(pos.floored()), stateId)

    return true
  }

  getBlockEntity (pos) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)
    const column = this.columns[key]
    if (!column || typeof column.getBlockEntity !== 'function') return null
    return column.getBlockEntity(posInChunk(pos.floored())) ?? null
  }

  getBlock (pos) {
    const key = columnKey(Math.floor(pos.x / 16) * 16, Math.floor(pos.z / 16) * 16)

    const column = this.columns[key]
    // null column means chunk not loaded
    if (!column) return null

    const loc = pos.floored()
    const locInChunk = posInChunk(loc)
    const stateId = column.getBlockStateId(locInChunk)

    if (!this.blockCache[stateId]) {
      const b = column.getBlock(locInChunk)
      b.isCube = isCube(b.shapes)
      this.blockCache[stateId] = b
    }

    const block = this.blockCache[stateId]
    block.position = loc
    block.biome = this.biomeCache[column.getBiome(locInChunk)]
    if (block.biome === undefined) {
      block.biome = this.biomeCache[1]
    }
    return block
  }

  getBlockEntityDescriptor (block, pos) {
    if (!block || !isBlockEntityName(block.name)) return null
    const descriptor = {
      name: block.name,
      position: { x: pos.x, y: pos.y, z: pos.z },
      properties: block.getProperties()
    }
    const blockEntity = this.getBlockEntity(pos)
    if (blockEntity) descriptor.blockEntity = blockEntity
    return descriptor
  }

  getSectionBlockEntities (sx, sy, sz) {
    const descriptors = []
    const cursor = new Vec3(sx, sy, sz)
    for (cursor.y = sy; cursor.y < sy + 16; cursor.y++) {
      for (cursor.z = sz; cursor.z < sz + 16; cursor.z++) {
        for (cursor.x = sx; cursor.x < sx + 16; cursor.x++) {
          const block = this.getBlock(cursor)
          const descriptor = this.getBlockEntityDescriptor(block, cursor)
          if (descriptor) descriptors.push(descriptor)
        }
      }
    }
    return descriptors
  }
}

module.exports = { World, isBlockEntityName }
