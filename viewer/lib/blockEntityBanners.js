const THREE = require('three')
const { createModel, addBox, addQuad, facingRotation, texturePath } = require('./blockEntityParts')

const COLOR_NAMES = [
  'white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray',
  'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'
]

const DYE_COLORS = {
  white: 0xf9fffe,
  orange: 0xf9801d,
  magenta: 0xc74ebd,
  light_blue: 0x3ab3da,
  yellow: 0xfed83d,
  lime: 0x80c71f,
  pink: 0xf38baa,
  gray: 0x474f52,
  light_gray: 0x9d9d97,
  cyan: 0x169c9c,
  purple: 0x8932b8,
  blue: 0x3c44aa,
  brown: 0x835432,
  green: 0x5e7c16,
  red: 0xb02e26,
  black: 0x1d1d21
}

// Keys are the Pattern codes used by the legacy Patterns NBT list. Values are
// the asset names used by both modern pattern IDs and the 26.3 texture files.
const PATTERN_IDS = {
  b: 'base',
  bs: 'stripe_bottom',
  ts: 'stripe_top',
  ls: 'stripe_left',
  rs: 'stripe_right',
  cs: 'stripe_center',
  ms: 'stripe_middle',
  drs: 'stripe_downright',
  dls: 'stripe_downleft',
  ss: 'small_stripes',
  cr: 'cross',
  sc: 'straight_cross',
  ld: 'diagonal_left',
  rud: 'diagonal_right',
  lud: 'diagonal_up_left',
  rd: 'diagonal_up_right',
  vh: 'half_vertical',
  vhr: 'half_vertical_right',
  hh: 'half_horizontal',
  hhb: 'half_horizontal_bottom',
  bl: 'square_bottom_left',
  br: 'square_bottom_right',
  tl: 'square_top_left',
  tr: 'square_top_right',
  bt: 'triangle_bottom',
  tt: 'triangle_top',
  bts: 'triangles_bottom',
  tts: 'triangles_top',
  mc: 'circle',
  mr: 'rhombus',
  bo: 'border',
  cbo: 'curly_border',
  bri: 'bricks',
  gra: 'gradient',
  gru: 'gradient_up',
  cre: 'creeper',
  sku: 'skull',
  flo: 'flower',
  moj: 'mojang',
  glb: 'globe',
  pig: 'piglin',
  flw: 'flow',
  gus: 'guster'
}
const PATTERN_NAMES = new Set(Object.values(PATTERN_IDS))

const CLOTH_WIDTH = 20 / 16
const CLOTH_HEIGHT = 40 / 16
const CLOTH_DEPTH = 1 / 16
const TEXTURE_SIZE = 64

function unwrap (value) {
  while (value && typeof value === 'object' && 'value' in value) value = value.value
  return value
}

function normalizedName (value) {
  value = unwrap(value)
  return typeof value === 'string'
    ? value.trim().toLowerCase().replace(/^minecraft:/, '')
    : ''
}

function patternName (value) {
  value = unwrap(value)
  if (value && typeof value === 'object') {
    value = value.asset_id ?? value.assetId ?? value.id ?? value.name
  }
  const name = normalizedName(value)
  if (PATTERN_NAMES.has(name)) return name
  return PATTERN_IDS[name] || null
}

function dyeColor (value) {
  value = unwrap(value)
  if (typeof value === 'string') {
    const name = normalizedName(value)
    if (Object.prototype.hasOwnProperty.call(DYE_COLORS, name)) return DYE_COLORS[name]
    if (!/^(?:[0-9]|1[0-5])$/.test(name)) return null
    value = Number(name)
  }
  if (!Number.isInteger(value) || value < 0 || value >= COLOR_NAMES.length) return null
  return DYE_COLORS[COLOR_NAMES[value]]
}

// The banner textures use the vanilla 64x64 cuboid atlas rather than a full
// image per face. Crop the default primitive UVs to the relevant atlas region.
function cropUV (mesh, left, top, right, bottom) {
  const uv = mesh.geometry.attributes.uv
  const vScale = (bottom - top) / TEXTURE_SIZE
  const vBottom = 1 - bottom / TEXTURE_SIZE
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i,
      (left + uv.getX(i) * (right - left)) / TEXTURE_SIZE,
      vBottom + uv.getY(i) * vScale
    )
  }
  uv.needsUpdate = true
}

function addSupport (group, wall, texture) {
  if (!wall) {
    const post = addBox(group, [2 / 16, 42 / 16, 2 / 16], [0, 21 / 16, -1 / 16], texture, {
      name: 'banner-post'
    })
    cropUV(post, 46, 2, 48, 44)
  }

  const support = addBox(group, [20 / 16, 2 / 16, 2 / 16], [0, 40 / 16, -1 / 16], texture, {
    name: wall ? 'banner-wall-support' : 'banner-crossbar'
  })
  cropUV(support, 2, 44, 22, 46)
}

function addPatternFace (group, options) {
  const mesh = addQuad(group, CLOTH_WIDTH, CLOTH_HEIGHT,
    [0, CLOTH_HEIGHT / 2, options.z], options.texture, {
      name: `banner-pattern:${options.pattern}:${options.layer}:${options.back ? 'back' : 'front'}`,
      color: options.color,
      depthWrite: false,
      rotation: options.back ? [0, Math.PI, 0] : undefined
    })
  if (options.back) cropUV(mesh, 22, 1, 42, 41)
  else cropUV(mesh, 1, 1, 21, 41)
  mesh.renderOrder = options.layer
}

function addPatterns (group, blockEntity, version) {
  const patterns = unwrap(blockEntity.patterns ?? blockEntity.Patterns)
  if (!Array.isArray(patterns)) return 0

  let layer = 0
  for (const rawEntry of patterns) {
    const patternEntry = unwrap(rawEntry)
    if (!patternEntry || typeof patternEntry !== 'object') continue
    const pattern = patternName(patternEntry.pattern ?? patternEntry.Pattern)
    const color = dyeColor(patternEntry.color ?? patternEntry.Color)
    if (!pattern || color === null) continue

    layer++
    const texture = texturePath(version, `entity/banner/${pattern}`)
    const z = CLOTH_DEPTH / 2 + 0.001 + (layer - 1) * 0.0005
    addPatternFace(group, { pattern, color, texture, layer, z, back: false })
    addPatternFace(group, { pattern, color, texture, layer, z: -z, back: true })
  }
  return layer
}

function createBannerModel (entry, version) {
  if (!entry || typeof entry.name !== 'string') return null
  const name = normalizedName(entry.name)
  const match = /^([a-z_]+?)(_wall)?_banner$/.exec(name)
  if (!match || !Object.prototype.hasOwnProperty.call(DYE_COLORS, match[1])) return null

  const color = match[1]
  const wall = Boolean(match[2])
  const properties = entry.properties || {}
  const blockEntity = entry.blockEntity || {}
  const model = createModel(entry.position)
  const facing = new THREE.Group()
  facing.name = wall ? 'banner-wall-facing' : 'banner-standing-facing'
  facing.position.set(0.5, 0, 0.5)

  if (wall) {
    facing.rotation.y = facingRotation(normalizedName(properties.facing))
  } else {
    const rawRotation = Number(unwrap(properties.rotation))
    const rotation = Number.isFinite(rawRotation) ? ((Math.trunc(rawRotation) % 16) + 16) % 16 : 0
    facing.rotation.y = -rotation * Math.PI / 8
  }
  model.add(facing)

  const banner = new THREE.Group()
  banner.name = wall ? 'wall-banner' : 'standing-banner'
  banner.scale.setScalar(2 / 3)
  if (wall) banner.position.set(0, -5 / 16, -7 / 16)
  facing.add(banner)

  const cloth = addBox(banner, [CLOTH_WIDTH, CLOTH_HEIGHT, CLOTH_DEPTH],
    [0, CLOTH_HEIGHT / 2, 0], texturePath(version, 'entity/banner/base'), {
      name: 'banner-cloth',
      color: DYE_COLORS[color]
    })
  cropUV(cloth, 1, 1, 21, 41)
  addSupport(banner, wall, texturePath(version, 'entity/banner/banner_base'))

  model.userData.bannerColor = color
  model.userData.bannerType = wall ? 'wall' : 'standing'
  model.userData.bannerPatternCount = addPatterns(banner, blockEntity, version)
  return model
}

module.exports = { createBannerModel }
