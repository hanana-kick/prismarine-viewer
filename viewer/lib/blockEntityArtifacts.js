const THREE = require('three')
const { createModel, addBox, addQuad, facingRotation, texturePath } = require('./blockEntityParts')

const COPPER_VARIANTS = {
  copper_golem_statue: ['copper_golem', 'copper_golem_eyes', 'none', false],
  exposed_copper_golem_statue: ['copper_golem_exposed', 'copper_golem_eyes_exposed', 'exposed', false],
  weathered_copper_golem_statue: ['copper_golem_weathered', 'copper_golem_eyes_weathered', 'weathered', false],
  oxidized_copper_golem_statue: ['copper_golem_oxidized', 'copper_golem_eyes_oxidized', 'oxidized', false],
  waxed_copper_golem_statue: ['copper_golem', 'copper_golem_eyes', 'none', true],
  waxed_exposed_copper_golem_statue: ['copper_golem_exposed', 'copper_golem_eyes_exposed', 'exposed', true],
  waxed_weathered_copper_golem_statue: ['copper_golem_weathered', 'copper_golem_eyes_weathered', 'weathered', true],
  waxed_oxidized_copper_golem_statue: ['copper_golem_oxidized', 'copper_golem_eyes_oxidized', 'oxidized', true]
}

const POTTERY_PATTERNS = new Set([
  'angler', 'archer', 'arms_up', 'blade', 'brewer', 'burn', 'danger', 'explorer',
  'flow', 'friend', 'guster', 'heart', 'heartbreak', 'howl', 'miner', 'mourner',
  'plenty', 'prize', 'scrape', 'sheaf', 'shelter', 'skull', 'snort'
])

function nbtValue (value) {
  return value && typeof value === 'object' && !Array.isArray(value) && 'value' in value
    ? nbtValue(value.value)
    : value
}

function normalizedName (value) {
  value = nbtValue(value)
  return typeof value === 'string' ? value.replace(/^minecraft:/, '') : ''
}

function partBox (owner, parent, size, center, path, options) {
  const mesh = addBox(owner, size, center, path, options)
  owner.remove(mesh)
  parent.add(mesh)
  return mesh
}

function partQuad (owner, parent, width, height, center, path, options) {
  const mesh = addQuad(owner, width, height, center, path, options)
  owner.remove(mesh)
  parent.add(mesh)
  return mesh
}

function createCopperGolemModel (name, entry, version) {
  const [bodyTexture, eyeTexture, oxidation, waxed] = COPPER_VARIANTS[name]
  const properties = entry.properties || {}
  const requestedPose = normalizedName(properties.copper_golem_pose)
  const pose = ['sitting', 'running', 'star'].includes(requestedPose) ? requestedPose : 'sitting'
  const facing = normalizedName(properties.facing)
  const body = texturePath(version, `entity/copper_golem/${bodyTexture}`)
  const eyes = texturePath(version, `entity/copper_golem/${eyeTexture}`)
  const model = createModel(entry.position)
  const pivot = new THREE.Group()
  pivot.name = 'copper-golem-facing'
  pivot.position.set(0.5, 0, 0.5)
  pivot.rotation.y = facingRotation(facing)
  model.add(pivot)

  const sitting = pose === 'sitting'
  const running = pose === 'running'
  const bodyY = sitting ? 0.48 : 0.69
  const headY = sitting ? 0.86 : 1.08

  partBox(model, pivot, [0.5, 0.48, 0.3], [0, bodyY, 0], body, {
    name: 'copper-golem-body'
  })
  partBox(model, pivot, [0.56, 0.4, 0.4], [0, headY, 0], body, {
    name: 'copper-golem-head'
  })
  partBox(model, pivot, [0.12, 0.12, 0.18], [0, headY - 0.04, -0.28], body, {
    name: 'copper-golem-nose'
  })
  partBox(model, pivot, [0.08, 0.3, 0.08], [0, headY + 0.34, 0], body, {
    name: 'copper-golem-lightning-rod'
  })
  partBox(model, pivot, [0.16, 0.06, 0.16], [0, headY + 0.51, 0], body, {
    name: 'copper-golem-lightning-rod-tip'
  })

  for (const x of [-0.13, 0.13]) {
    partQuad(model, pivot, 0.1, 0.1, [x, headY + 0.06, -0.202], eyes, {
      name: 'copper-golem-eye',
      rotation: [0, Math.PI, 0],
      transparent: true,
      depthWrite: false
    })
  }

  for (const side of [-1, 1]) {
    let armRotation = 0
    let armCenter = [side * 0.37, bodyY, 0]
    let legRotation = 0
    let legCenter = [side * 0.15, sitting ? 0.21 : 0.27, 0]

    if (sitting) {
      armRotation = -0.35 * side
      armCenter = [side * 0.36, bodyY - 0.04, -0.08]
      legRotation = Math.PI / 2
      legCenter = [side * 0.15, 0.16, -0.23]
    } else if (running) {
      armRotation = side * 0.9
      legRotation = -side * 0.75
      legCenter = [side * 0.15, 0.3, side * 0.09]
    } else {
      armRotation = -side * Math.PI * 0.72
      armCenter = [side * 0.45, bodyY + 0.23, 0]
      legRotation = side * 0.35
      legCenter = [side * 0.2, 0.29, 0]
    }

    partBox(model, pivot, [0.16, 0.56, 0.18], armCenter, body, {
      name: `copper-golem-${pose}-arm`,
      rotation: running ? [armRotation, 0, 0] : [0, 0, armRotation]
    })
    partBox(model, pivot, [0.18, 0.48, 0.22], legCenter, body, {
      name: `copper-golem-${pose}-leg`,
      rotation: [legRotation, 0, pose === 'star' ? legRotation : 0]
    })
  }

  model.name = `copper-golem-statue:${oxidation}:${pose}`
  model.userData.pose = pose
  model.userData.oxidation = oxidation
  model.userData.waxed = waxed
  return model
}

function sherdValues (entry) {
  const blockEntity = entry.blockEntity || {}
  const item = nbtValue(entry.item || blockEntity.item) || {}
  let sherds = nbtValue(blockEntity.sherds ?? entry.sherds ?? item.sherds)
  if (!sherds && item.components) {
    const components = nbtValue(item.components)
    sherds = nbtValue(components?.['minecraft:pot_decorations'] ?? components?.pot_decorations)
  }
  if (Array.isArray(sherds)) return sherds.map(nbtValue)
  if (sherds && typeof sherds === 'object') {
    return ['back', 'left', 'right', 'front'].map(direction => nbtValue(sherds[direction]))
  }
  return []
}

function potteryTexture (version, sherd) {
  const name = normalizedName(sherd).replace(/_pottery_sherd$/, '')
  return POTTERY_PATTERNS.has(name)
    ? texturePath(version, `entity/decorated_pot/${name}_pottery_pattern`)
    : null
}

function createDecoratedPotModel (entry, version) {
  const properties = entry.properties || {}
  const crackedValue = nbtValue(properties.cracked)
  const cracked = crackedValue === true || crackedValue === 1 || crackedValue === 'true'
  const sherds = sherdValues(entry)
  const model = createModel(entry.position)
  const pivot = new THREE.Group()
  pivot.name = 'decorated-pot-facing'
  pivot.position.set(0.5, 0, 0.5)
  pivot.rotation.y = facingRotation(normalizedName(properties.facing))
  model.add(pivot)

  const base = texturePath(version, 'entity/decorated_pot/decorated_pot_base')
  const sideTexture = texturePath(version, 'entity/decorated_pot/decorated_pot_side')
  const terracotta = texturePath(version, 'blocks/terracotta')

  partBox(model, pivot, [14 / 16, 10 / 16, 14 / 16], [0, 5 / 16, 0], base, {
    name: 'decorated-pot-body'
  })
  partQuad(model, pivot, 12 / 16, 12 / 16, [0, 10 / 16 + 0.001, 0], terracotta, {
    name: 'decorated-pot-open-interior',
    rotation: [-Math.PI / 2, 0, 0]
  })

  // Four separate walls and rim pieces leave a real hole rather than capping
  // the pot with the top face of a box.
  for (let side = 0; side < 4; side++) {
    const angle = side * Math.PI / 2
    const x = Math.sin(angle) * 6 / 16
    const z = -Math.cos(angle) * 6 / 16
    partQuad(model, pivot, 12 / 16, 4 / 16, [x, 12 / 16, z], base, {
      name: 'decorated-pot-neck',
      rotation: [0, Math.PI - angle, 0]
    })
  }
  for (const z of [-6.5 / 16, 6.5 / 16]) {
    partBox(model, pivot, [14 / 16, 2 / 16, 1 / 16], [0, 15 / 16, z], base, {
      name: 'decorated-pot-rim'
    })
  }
  for (const x of [-6.5 / 16, 6.5 / 16]) {
    partBox(model, pivot, [1 / 16, 2 / 16, 12 / 16], [x, 15 / 16, 0], base, {
      name: 'decorated-pot-rim'
    })
  }

  // Vanilla sherd order is back, left, right, front (north, west, east, south).
  const sides = [
    { center: [0, 5 / 16, -7 / 16 - 0.001], rotation: [0, Math.PI, 0] },
    { center: [-7 / 16 - 0.001, 5 / 16, 0], rotation: [0, -Math.PI / 2, 0] },
    { center: [7 / 16 + 0.001, 5 / 16, 0], rotation: [0, Math.PI / 2, 0] },
    { center: [0, 5 / 16, 7 / 16 + 0.001], rotation: [0, 0, 0] }
  ]
  const appliedSherds = []
  for (let index = 0; index < sides.length; index++) {
    const pattern = potteryTexture(version, sherds[index])
    const side = sides[index]
    partQuad(model, pivot, 12 / 16, 8 / 16, side.center, pattern || sideTexture, {
      name: pattern ? 'decorated-pot-sherd-pattern' : 'decorated-pot-side',
      rotation: side.rotation
    })
    appliedSherds.push(pattern ? normalizedName(sherds[index]) : 'minecraft:brick')
  }

  if (cracked) {
    for (const [x, y, angle] of [[-0.13, 0.47, -0.5], [0.02, 0.35, 0.65], [0.15, 0.23, -0.4]]) {
      partQuad(model, pivot, 0.035, 0.3, [x, y, -7 / 16 - 0.003], terracotta, {
        name: 'decorated-pot-crack',
        rotation: [0, Math.PI, angle],
        color: 0x4b3028,
        depthWrite: false
      })
    }
  }

  model.name = cracked ? 'decorated-pot:cracked' : 'decorated-pot:intact'
  model.userData.cracked = cracked
  model.userData.sherds = appliedSherds
  return model
}

function createConduitModel (entry, version) {
  const blockEntity = entry.blockEntity || {}
  const activeValue = nbtValue(blockEntity.active ?? blockEntity.isActive ?? entry.properties?.active)
  const active = activeValue === true || activeValue === 1 || activeValue === 'true'
  const model = createModel(entry.position)
  const base = texturePath(version, 'entity/conduit/base')
  const cage = texturePath(version, 'entity/conduit/cage')
  const eye = texturePath(version, `entity/conduit/${active ? 'open_eye' : 'closed_eye'}`)

  partBox(model, model, [0.5, 0.5, 0.5], [0.5, 0.5, 0.5], base, {
    name: active ? 'conduit-core-active' : 'conduit-core-inactive'
  })

  for (const x of [-7 / 16, 7 / 16]) {
    for (const z of [-7 / 16, 7 / 16]) {
      partBox(model, model, [1 / 8, 1, 1 / 8], [0.5 + x, 0.5, 0.5 + z], cage, {
        name: 'conduit-frame-vertical'
      })
    }
  }
  for (const y of [-7 / 16, 7 / 16]) {
    for (const z of [-7 / 16, 7 / 16]) {
      partBox(model, model, [1, 1 / 8, 1 / 8], [0.5, 0.5 + y, 0.5 + z], cage, {
        name: 'conduit-frame-x'
      })
    }
    for (const x of [-7 / 16, 7 / 16]) {
      partBox(model, model, [1 / 8, 1 / 8, 1], [0.5 + x, 0.5 + y, 0.5], cage, {
        name: 'conduit-frame-z'
      })
    }
  }

  const eyeSides = [
    { center: [0.5, 0.5, 0.249], rotation: [0, Math.PI, 0] },
    { center: [0.5, 0.5, 0.751], rotation: [0, 0, 0] },
    { center: [0.249, 0.5, 0.5], rotation: [0, -Math.PI / 2, 0] },
    { center: [0.751, 0.5, 0.5], rotation: [0, Math.PI / 2, 0] },
    { center: [0.5, 0.751, 0.5], rotation: [-Math.PI / 2, 0, 0] },
    { center: [0.5, 0.249, 0.5], rotation: [Math.PI / 2, 0, 0] }
  ]
  for (const side of eyeSides) {
    partQuad(model, model, 0.4, 0.4, side.center, eye, {
      name: active ? 'conduit-open-eye' : 'conduit-closed-eye',
      rotation: side.rotation,
      depthWrite: false
    })
  }

  model.name = active ? 'conduit:active' : 'conduit:inactive'
  model.userData.active = active
  return model
}

function createArtifactModel (entry, version) {
  if (!entry) return null
  const name = normalizedName(entry.name)
  if (COPPER_VARIANTS[name]) return createCopperGolemModel(name, entry, version)
  if (name === 'decorated_pot') return createDecoratedPotModel(entry, version)
  if (name === 'conduit') return createConduitModel(entry, version)
  return null
}

module.exports = { createArtifactModel }
