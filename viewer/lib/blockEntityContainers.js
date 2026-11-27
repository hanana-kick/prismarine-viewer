const THREE = require('three')
const { createModel, addBox, facingRotation, texturePath } = require('./blockEntityParts')

const CHEST_TEXTURES = {
  chest: { single: 'normal', left: 'normal_left', right: 'normal_right' },
  trapped_chest: { single: 'trapped', left: 'trapped_left', right: 'trapped_right' },
  ender_chest: { single: 'ender' },
  copper_chest: { single: 'copper', left: 'copper_left', right: 'copper_right' },
  exposed_copper_chest: { single: 'copper_exposed', left: 'copper_exposed_left', right: 'copper_exposed_right' },
  weathered_copper_chest: { single: 'copper_weathered', left: 'copper_weathered_left', right: 'copper_weathered_right' },
  oxidized_copper_chest: { single: 'copper_oxidized', left: 'copper_oxidized_left', right: 'copper_oxidized_right' },
  waxed_copper_chest: { single: 'copper', left: 'copper_left', right: 'copper_right' },
  waxed_exposed_copper_chest: { single: 'copper_exposed', left: 'copper_exposed_left', right: 'copper_exposed_right' },
  waxed_weathered_copper_chest: { single: 'copper_weathered', left: 'copper_weathered_left', right: 'copper_weathered_right' },
  waxed_oxidized_copper_chest: { single: 'copper_oxidized', left: 'copper_oxidized_left', right: 'copper_oxidized_right' }
}

const SHULKER_COLORS = new Set([
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
])

const SHULKER_ROTATIONS = {
  up: [0, 0, 0],
  down: [Math.PI, 0, 0],
  north: [-Math.PI / 2, 0, 0],
  south: [Math.PI / 2, 0, 0],
  west: [0, 0, Math.PI / 2],
  east: [0, 0, -Math.PI / 2]
}

function createChestModel (name, entry, version) {
  const properties = entry.properties || {}
  const requestedType = properties.type
  const type = CHEST_TEXTURES[name][requestedType] ? requestedType : 'single'
  const texture = texturePath(version, `entity/chest/${CHEST_TEXTURES[name][type]}`)
  const model = createModel(entry.position)
  const facing = new THREE.Group()
  facing.name = 'chest-facing'
  facing.position.set(0.5, 0, 0.5)
  facing.rotation.y = facingRotation(properties.facing)
  model.add(facing)

  // Each half of a double chest is 15 pixels wide and meets at the block edge.
  const double = type !== 'single'
  const width = double ? 15 / 16 : 14 / 16
  const bodyX = type === 'left' ? 1 / 32 : type === 'right' ? -1 / 32 : 0
  const latchX = type === 'left' ? 15 / 32 : type === 'right' ? -15 / 32 : 0

  addBox(facing, [width, 10 / 16, 14 / 16], [bodyX, 5 / 16, 0], texture, {
    name: 'chest-body'
  })

  // Put the lid mesh origin on its rear hinge rather than at its visual center.
  const lid = addBox(facing, [width, 5 / 16, 14 / 16], [bodyX, 10 / 16, -7 / 16], texture, {
    name: 'chest-lid'
  })
  lid.geometry.translate(0, 5 / 32, 7 / 16)

  addBox(facing, [double ? 1 / 16 : 2 / 16, 4 / 16, 1 / 16], [latchX, 10 / 16, 15 / 32], texture, {
    name: 'chest-latch'
  })

  model.userData.container = name
  model.userData.chestType = type
  return model
}

function createShulkerModel (name, color, entry, version) {
  const properties = entry.properties || {}
  const textureName = color ? `shulker_${color}` : 'shulker'
  const texture = texturePath(version, `entity/shulker/${textureName}`)
  const model = createModel(entry.position)
  const facing = new THREE.Group()
  facing.name = 'shulker-facing'
  facing.position.set(0.5, 0.5, 0.5)
  facing.rotation.set(...(SHULKER_ROTATIONS[properties.facing] || SHULKER_ROTATIONS.up))
  model.add(facing)

  addBox(facing, [1, 12 / 16, 1], [0, -2 / 16, 0], texture, {
    name: 'shulker-base'
  })

  const rawOpen = entry.blockEntity?.open
  const open = rawOpen === undefined
    ? 0
    : Math.max(0, Math.min(1, rawOpen === true ? 1 : Number(rawOpen) || 0))
  addBox(facing, [1, 4 / 16, 1], [0, 6 / 16 + open * 0.5, 0], texture, {
    name: 'shulker-lid'
  })

  model.userData.container = name
  model.userData.shulkerColor = color || null
  return model
}

function createContainerModel (entry, version) {
  if (!entry?.name) return null
  const name = entry.name.replace(/^minecraft:/, '')
  if (CHEST_TEXTURES[name]) return createChestModel(name, entry, version)
  if (name === 'shulker_box') return createShulkerModel(name, '', entry, version)

  const match = /^([a-z_]+)_shulker_box$/.exec(name)
  if (match && SHULKER_COLORS.has(match[1])) {
    return createShulkerModel(name, match[1], entry, version)
  }
  return null
}

module.exports = { createContainerModel }
