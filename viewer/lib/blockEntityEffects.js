const THREE = require('three')
const { createModel, addBox, addQuad, facingRotation, texturePath } = require('./blockEntityParts')

const TAU = Math.PI * 2
const STAR_COLOURS = [0x8ec5ff, 0xc49bff, 0xf7f2ff, 0x72f1d4, 0xffb5e8, 0x557cff]

function nbtValue (value) {
  return value && typeof value === 'object' && 'value' in value ? value.value : value
}

function randomGenerator (seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed / 0x100000000
  }
}

// A single coloured, additive mesh is considerably cheaper than one mesh and
// material per star. Every quad has explicit, finite UVs even though the
// effect is procedural and does not depend on a texture having loaded.
function createStarField (size, y, gateway) {
  const random = randomGenerator(gateway ? 0x47a7e1 : 0xe1d90a1)
  const count = gateway ? 36 : 84
  const positions = []
  const colours = []
  const uvs = []
  const indices = []
  const margin = gateway ? 0.035 : 0.065

  for (let i = 0; i < count; i++) {
    const galaxy = i % 13 === 0
    const diameter = galaxy
      ? (gateway ? 0.055 : 0.11) + random() * (gateway ? 0.035 : 0.07)
      : (gateway ? 0.012 : 0.018) + random() * (gateway ? 0.035 : 0.065)
    const half = diameter / 2
    const x = (random() - 0.5) * (size - margin * 2)
    const z = (random() - 0.5) * (size - margin * 2)
    const angle = random() * TAU
    const cos = Math.cos(angle) * half
    const sin = Math.sin(angle) * half
    const offset = positions.length / 3

    positions.push(
      x - cos + sin, y, z - sin - cos,
      x + cos + sin, y, z + sin - cos,
      x - cos - sin, y, z - sin + cos,
      x + cos - sin, y, z + sin + cos
    )
    uvs.push(0, 0, 1, 0, 0, 1, 1, 1)
    indices.push(offset, offset + 2, offset + 1, offset + 2, offset + 3, offset + 1)

    const hex = STAR_COLOURS[Math.floor(random() * STAR_COLOURS.length)]
    const brightness = galaxy ? 0.32 : 0.65 + random() * 0.35
    const red = ((hex >> 16) & 0xff) / 255 * brightness
    const green = ((hex >> 8) & 0xff) / 255 * brightness
    const blue = (hex & 0xff) / 255 * brightness
    for (let vertex = 0; vertex < 4; vertex++) colours.push(red, green, blue)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = gateway ? 'end-gateway-stars' : 'end-portal-stars'
  return mesh
}

function createPortalModel (entry, gateway) {
  const group = createModel(entry.position)
  const size = gateway ? 0.55 : 0.998
  const y = gateway ? 0.5 : 0.75
  group.name = gateway ? 'end-gateway-effect' : 'end-portal-effect'

  addQuad(group, size, size, [0.5, y, 0.5], null, {
    name: gateway ? 'end-gateway-surface' : 'end-portal-surface',
    rotation: [-Math.PI / 2, 0, 0],
    color: 0x010104,
    transparent: false,
    alphaTest: 0,
    depthWrite: true
  })
  group.add(createStarField(size - 0.025, y + 0.001, gateway))
  return group
}

function normalizedFacing (value) {
  value = nbtValue(value)
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    return ['down', 'up', 'north', 'south', 'west', 'east'][Number(value)] || 'north'
  }
  return ['down', 'up', 'north', 'south', 'west', 'east'].includes(value) ? value : 'north'
}

function legacyTextures (version) {
  return /^1\.(?:[0-9]|1[0-2])(?:\.|$)/.test(version)
}

function createMovingPistonModel (entry, version) {
  const group = createModel(entry.position)
  const properties = entry.properties || {}
  const blockEntity = entry.blockEntity || {}
  const rawSourceState = nbtValue(blockEntity.blockState ?? blockEntity.sourceBlockState ?? blockEntity.sourceBlock)
  const sourceState = typeof rawSourceState === 'string' ? { Name: rawSourceState } : (rawSourceState || {})
  const sourceProperties = nbtValue(sourceState.Properties ?? sourceState.properties) || {}
  const sourceName = String(nbtValue(sourceState.Name ?? sourceState.name) || '').replace(/^minecraft:/, '')
  const facing = normalizedFacing(properties.facing ?? blockEntity.facing ?? sourceProperties.facing)
  const rawType = nbtValue(properties.type ?? entry.type ?? blockEntity.type ?? sourceProperties.type)
  const sticky = rawType === 'sticky' || sourceName === 'sticky_piston'
  const rawProgress = Number(nbtValue(blockEntity.progress ?? blockEntity.Progress))
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(1, rawProgress)) : 0
  const extending = blockEntity.extending === undefined ? true : Boolean(nbtValue(blockEntity.extending))
  const legacy = legacyTextures(version)
  const pistonTop = legacy ? 'blocks/piston_top_normal' : 'blocks/piston_top'
  const planks = legacy ? 'blocks/planks_oak' : 'blocks/oak_planks'

  group.name = `moving-piston:${sticky ? 'sticky' : 'normal'}:${facing}`
  group.userData.progress = progress
  group.userData.sourceBlock = sourceName || null

  // Parts are authored facing north around the block centre. Rotating a pivot
  // also handles vertical pistons, unlike a yaw-only blockstate rotation.
  const pivot = new THREE.Group()
  pivot.name = 'moving-piston-parts'
  pivot.position.set(0.5, 0.5, 0.5)
  if (facing === 'up') pivot.rotation.x = Math.PI / 2
  else if (facing === 'down') pivot.rotation.x = -Math.PI / 2
  else pivot.rotation.y = facingRotation(facing)
  group.add(pivot)

  // Keep texture-loading closures tied to the outer group's disposal flag.
  function partBox (size, center, path, options) {
    const mesh = addBox(group, size, center, path, options)
    group.remove(mesh)
    pivot.add(mesh)
    return mesh
  }

  function partQuad (width, height, center, path, options) {
    const mesh = addQuad(group, width, height, center, path, options)
    group.remove(mesh)
    pivot.add(mesh)
    return mesh
  }

  partBox([1, 1, 0.5], [0, 0, 0.25], texturePath(version, 'blocks/piston_side'), {
    name: 'piston-base'
  })
  partQuad(1, 1, [0, 0, 0.501], texturePath(version, 'blocks/piston_bottom'), {
    name: 'piston-base-back',
    side: THREE.FrontSide
  })

  const headZ = -0.375 - progress * 0.5
  const headBack = headZ + 0.125
  const extensionLength = -headBack
  partBox([0.25, 0.25, extensionLength], [0, 0, headBack / 2], texturePath(version, 'blocks/piston_inner'), {
    name: 'piston-extension'
  })
  partBox([1, 1, 0.25], [0, 0, headZ], texturePath(version, 'blocks/piston_side'), {
    name: 'piston-head'
  })
  partQuad(1, 1, [0, 0, headZ - 0.126], texturePath(version, sticky ? 'blocks/piston_top_sticky' : pistonTop), {
    name: sticky ? 'piston-head-sticky-face' : 'piston-head-face',
    rotation: [0, Math.PI, 0],
    side: THREE.FrontSide
  })
  partQuad(0.75, 0.75, [0, 0, headZ + 0.126], texturePath(version, planks), {
    name: 'piston-head-wooden-back',
    side: THREE.FrontSide
  })

  // A non-piston moved state is real payload, not the piston assembly itself.
  // Show it travelling separately; oak planks retain their actual texture and
  // other blocks get a neutral surface rather than an invented texture path.
  if (sourceName && !['air', 'piston', 'sticky_piston', 'moving_piston'].includes(sourceName)) {
    const sourceProgress = extending ? progress : 1 - progress
    const sourceTexture = sourceName === 'oak_planks' ? texturePath(version, planks) : null
    partBox([0.998, 0.998, 0.998], [0, 0, -1 - sourceProgress], sourceTexture, {
      name: `moving-source:${sourceName}`,
      color: sourceTexture ? 0xffffff : 0xb8b8b8
    })
  }

  return group
}

function createEffectModel (entry, version) {
  if (!entry || !entry.name) return null
  const name = entry.name.replace(/^minecraft:/, '')
  if (name === 'end_portal') return createPortalModel(entry, false)
  if (name === 'end_gateway') return createPortalModel(entry, true)
  if (name === 'moving_piston') return createMovingPistonModel(entry, version)
  return null
}

module.exports = { createEffectModel }
