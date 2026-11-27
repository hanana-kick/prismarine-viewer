const THREE = require('three')
const { createModel, addBox, facingRotation, texturePath } = require('./blockEntityParts')

const HEAD_TYPES = {}
for (const [kind, suffix] of Object.entries({
  skeleton: 'skull',
  wither_skeleton: 'skull',
  zombie: 'head',
  player: 'head',
  creeper: 'head',
  dragon: 'head',
  piglin: 'head'
})) {
  HEAD_TYPES[`${kind}_${suffix}`] = { kind, wall: false }
  HEAD_TYPES[`${kind}_wall_${suffix}`] = { kind, wall: true }
}

const HEAD_TEXTURES = {
  skeleton: { path: 'entity/skeleton/skeleton', height: 32 },
  wither_skeleton: { path: 'entity/skeleton/wither_skeleton', height: 32 },
  zombie: { path: 'entity/zombie/zombie', height: 64 },
  player: { path: 'entity/player/wide/steve', height: 64 },
  creeper: { path: 'entity/creeper/creeper', height: 32 },
  dragon: { path: 'entity/enderdragon/dragon', height: 256 },
  piglin: { path: 'entity/piglin/piglin', height: 64 }
}

function parseProfileValue (value) {
  try {
    return JSON.parse(value)
  } catch {}
  try {
    const json = typeof globalThis.atob === 'function'
      ? globalThis.atob(value)
      : globalThis.Buffer?.from(value, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

// GameProfile textures are commonly a base64 JSON property, but serialized NBT
// and caller-provided profiles also use direct skin URLs or { SKIN: { url } }.
function findSkinUrl (value, depth = 0) {
  if (!value || depth > 8) return null
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) return value
    if (depth > 0) return null
    const parsed = parseProfileValue(value)
    return parsed ? findSkinUrl(parsed, depth + 1) : null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findSkinUrl(item, depth + 1)
      if (url) return url
    }
    return null
  }
  if (typeof value !== 'object') return null

  if (value.name === 'textures' && typeof value.value === 'string') {
    const parsed = parseProfileValue(value.value)
    const url = findSkinUrl(parsed, depth + 1)
    if (url) return url
  }
  for (const key of ['skinUrl', 'skinURL', 'skin', 'SKIN', 'textures', 'profile', 'properties', 'url']) {
    const url = findSkinUrl(value[key], depth + 1)
    if (url) return url
  }
  return null
}

// BoxGeometry face order is right, left, top, bottom, front, back. Supplying
// the vanilla cube unwrap keeps each face on the head rather than stretching
// the complete entity atlas over every face.
function mapBoxUV (geometry, box, textureHeight) {
  const [u, v, width, height, depth, textureWidth = 64] = box
  const regions = [
    [u, v + depth, depth, height],
    [u + depth + width, v + depth, depth, height],
    [u + depth, v, width, depth],
    [u + depth + width, v, width, depth],
    [u + depth, v + depth, width, height],
    [u + depth + width + depth, v + depth, width, height]
  ]
  const uv = geometry.attributes.uv
  for (let face = 0; face < regions.length; face++) {
    const [x, y, w, h] = regions[face]
    for (let corner = 0; corner < 4; corner++) {
      const index = face * 4 + corner
      uv.setXY(index,
        (x + uv.getX(index) * w) / textureWidth,
        1 - (y + h) / textureHeight + uv.getY(index) * h / textureHeight
      )
    }
  }
  uv.needsUpdate = true
}

function addPart (group, size, center, texture, name, uv, textureHeight) {
  const mesh = addBox(group, size.map(pixels => pixels / 16), center.map(pixels => pixels / 16), texture, { name })
  if (uv) mapBoxUV(mesh.geometry, uv, textureHeight)
  return mesh
}

function addStandardHead (group, kind, texture, center, textureHeight) {
  const size = kind === 'wither_skeleton' ? 10 : 8
  addPart(group, [size, size, size], center, texture, `${kind}-head`, [0, 0, 8, 8, 8], textureHeight)
  if (kind === 'player') {
    addPart(group, [8.5, 8.5, 8.5], center, texture, 'player-hat', [32, 0, 8, 8, 8], textureHeight)
  }
}

function addDragonHead (group, texture, wall) {
  const y = wall ? 8 : 6
  const z = wall ? 7 : 0
  addPart(group, [12, 8, 12], [0, y, z - 1], texture, 'dragon-head', [0, 0, 12, 8, 12, 256], 256)
  addPart(group, [8, 4, 6], [0, y - 1, z + 5], texture, 'dragon-snout', [48, 0, 8, 4, 6, 256], 256)
  addPart(group, [12, 2, 10], [0, y - 3, z + 3], texture, 'dragon-jaw', [0, 32, 12, 2, 10, 256], 256)
}

function addPiglinHead (group, texture, center) {
  addStandardHead(group, 'piglin', texture, center, 64)
  const [x, y, z] = center
  addPart(group, [4, 4, 1], [x, y - 1, z + 4.5], texture, 'piglin-snout', [31, 1, 4, 4, 1], 64)
  addPart(group, [1, 3, 4], [x - 2.5, y + 2.5, z], texture, 'piglin-left-ear', [2, 0, 1, 3, 4], 64)
  addPart(group, [1, 3, 4], [x + 2.5, y + 2.5, z], texture, 'piglin-right-ear', [2, 4, 1, 3, 4], 64)
}

function createHeadModel (entry, version) {
  if (typeof entry?.name !== 'string') return null
  const type = HEAD_TYPES[entry.name.replace(/^minecraft:/, '')]
  if (!type) return null

  const { kind, wall } = type
  const textureInfo = HEAD_TEXTURES[kind]
  const customSkin = kind === 'player'
    ? findSkinUrl(entry.blockEntity?.skinUrl) || findSkinUrl(entry.blockEntity?.skin) || findSkinUrl(entry.blockEntity?.profile)
    : null
  const texture = customSkin || texturePath(version, textureInfo.path)
  const model = createModel(entry.position)
  const facing = new THREE.Group()
  facing.name = `${kind}-${wall ? 'wall' : 'floor'}-facing`
  facing.position.set(0.5, 0, 0.5)

  const properties = entry.properties || {}
  if (wall) {
    facing.rotation.y = facingRotation(properties.facing)
  } else {
    const value = Number(properties.rotation)
    const rotation = Number.isFinite(value) ? Math.max(0, Math.min(15, Math.trunc(value))) : 0
    // Floor rotation zero faces south; increasing segments turn towards west.
    facing.rotation.y = Math.PI - rotation * Math.PI / 8
  }
  model.add(facing)

  if (kind === 'dragon') {
    addDragonHead(facing, texture, wall)
  } else {
    const size = kind === 'wither_skeleton' ? 10 : 8
    const center = [0, wall ? 8 : size / 2, wall ? size / 2 : 0]
    if (kind === 'piglin') addPiglinHead(facing, texture, center)
    else addStandardHead(facing, kind, texture, center, textureInfo.height)
  }

  model.userData.headType = kind
  model.userData.wall = wall
  return model
}

module.exports = { createHeadModel }
