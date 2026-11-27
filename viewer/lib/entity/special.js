const THREE = require('three')
const { getItemMesh } = require('./Item')
const { getBlockMesh } = require('./blockModel')
const { loadTexture } = globalThis.isElectron ? require('../utils.electron.js') : require('../utils')

let createCanvas
try { ({ createCanvas } = require('canvas')) } catch {}

// Only types for which createSpecialEntity returns an Object3D. Types which
// still use a rig (or intentionally have no renderer) must not be listed here.
const specialEntityTypes = new Set([
  'falling_block', 'block_display', 'tnt', 'item_frame', 'glow_item_frame',
  'painting', 'item_display', 'text_display', 'splash_potion', 'lingering_potion',
  'egg', 'ender_pearl', 'snowball', 'experience_bottle', 'eye_of_ender',
  'end_crystal', 'cushion', 'area_effect_cloud', 'lightning_bolt',
  'wind_charge', 'breeze_wind_charge', 'ominous_item_spawner'
])

const billboardModes = ['fixed', 'vertical', 'horizontal', 'center']
const cushionColors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const worldPosition = new THREE.Vector3()

function specialRoot (type) {
  const root = new THREE.Group()
  root.name = `special:${type}`
  root.userData.specialType = type
  root.dispose = () => {
    if (root.userData.disposed) return
    root.userData.disposed = true
    const geometries = new Set()
    const materials = new Set()
    const textures = new Set()
    const objects = []
    root.traverse(object => objects.push(object))
    for (const object of objects) {
      if (object.geometry) geometries.add(object.geometry)
      if (object.material) {
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material)
      }
    }
    // Stop nested asynchronous loaders before clearing their children. Their
    // own dispose methods also own the resources below them.
    for (const object of objects) {
      if (object === root || !object.dispose) continue
      object.traverse(child => {
        geometries.delete(child.geometry)
        if (child.material) {
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) materials.delete(material)
        }
      })
      object.dispose()
    }
    for (const geometry of geometries) geometry.dispose()
    for (const material of materials) {
      if (material.map?.userData?.specialOwned) textures.add(material.map)
      material.dispose()
    }
    for (const texture of textures) texture.dispose()
    root.clear()
  }
  return root
}

function unresolved (type) {
  const object = new THREE.Object3D()
  object.userData.unresolvedEntity = type
  return object
}

function loadMap (root, path, callback) {
  loadTexture(path, map => {
    if (root.userData.disposed) return
    map.magFilter = THREE.NearestFilter
    map.minFilter = THREE.NearestFilter
    callback(map)
  })
}

function vector (value, fallback) {
  if (Array.isArray(value)) return new THREE.Vector3(Number(value[0]) || 0, Number(value[1]) || 0, Number(value[2]) || 0)
  if (value && typeof value === 'object') return new THREE.Vector3(Number(value.x) || 0, Number(value.y) || 0, Number(value.z) || 0)
  return new THREE.Vector3(...fallback)
}

function scaleVector (value) {
  if (Number.isFinite(value)) return new THREE.Vector3(value, value, value)
  const result = vector(value, [1, 1, 1])
  if (Array.isArray(value)) result.set(value[0] ?? 1, value[1] ?? 1, value[2] ?? 1)
  else if (value && typeof value === 'object') result.set(value.x ?? 1, value.y ?? 1, value.z ?? 1)
  return result
}

function quaternion (value) {
  if (Array.isArray(value)) return new THREE.Quaternion(value[0] || 0, value[1] || 0, value[2] || 0, value[3] ?? 1).normalize()
  if (value && typeof value === 'object') return new THREE.Quaternion(value.x || 0, value.y || 0, value.z || 0, value.w ?? 1).normalize()
  return new THREE.Quaternion()
}

function installBillboard (root, value) {
  const mode = typeof value === 'number' ? billboardModes[value] : String(value || 'fixed').toLowerCase()
  root.userData.billboard = mode
  if (mode === 'fixed') return
  root.userData.orientToCamera = camera => {
    if (!camera || root.userData.disposed) return
    if (mode === 'center') {
      root.quaternion.copy(camera.quaternion)
    } else if (mode === 'vertical') {
      root.getWorldPosition(worldPosition)
      root.rotation.set(0, Math.atan2(camera.position.x - worldPosition.x, camera.position.z - worldPosition.z), 0)
    } else if (mode === 'horizontal') {
      root.rotation.set(-Math.PI / 2, 0, 0)
    }
  }
}

function displayTransform (root, content, data) {
  const display = { ...(data.display || {}), ...data }
  const transform = new THREE.Group()
  transform.position.copy(vector(display.translation, [0, 0, 0]))
  transform.scale.copy(scaleVector(display.scale))
  transform.quaternion.copy(quaternion(display.leftRotation))
  if (display.rightRotation) transform.quaternion.multiply(quaternion(display.rightRotation))
  transform.add(content)
  root.add(transform)
  root.userData.displayTransform = {
    translation: transform.position.toArray(),
    scale: transform.scale.toArray(),
    billboard: display.billboard || 'fixed'
  }
  installBillboard(root, display.billboard)
  return transform
}

function blockState (data, fallback) {
  let state = data.blockState ?? data.block ?? data.blockName ?? fallback
  let properties = data.blockProperties || data.properties || {}
  if (typeof state === 'string') {
    const match = state.match(/^(?:minecraft:)?([^[]+)(?:\[([^]]+)\])?$/)
    if (match) {
      state = match[1]
      if (match[2]) {
        properties = {}
        for (const entry of match[2].split(',')) {
          const [key, value] = entry.split('=')
          if (key && value !== undefined) properties[key.trim()] = value.trim()
        }
      }
    }
  } else if (state && typeof state === 'object') {
    properties = state.properties || state.Properties || properties
    state = state.name || state.Name || state.blockName || fallback
  }
  if (!state || typeof state !== 'string') state = fallback
  return { name: state.replace(/^minecraft:/, ''), properties }
}

function blockEntity (type, version, data, fallback) {
  const root = specialRoot(type)
  const state = blockState(data, fallback)
  const block = getBlockMesh(state.name, version, state.properties)
  if (type === 'block_display') {
    block.position.set(-0.5, -0.5, -0.5)
    block.userData.displayRoot = root
    displayTransform(root, block, data)
  } else {
    block.position.set(-0.5, 0, -0.5)
    root.add(block)
  }
  root.userData.blockState = state
  return root
}

function itemContent (name, version) {
  return getItemMesh(name, version, () => unresolved(name))
}

function projectile (type, version, data) {
  const names = { eye_of_ender: 'ender_eye' }
  const root = specialRoot(type)
  const item = itemContent(data.itemName || names[type] || type, version)
  item.scale.setScalar(0.5)
  item.position.y = 0.125
  root.add(item)
  return root
}

function itemDisplay (version, data) {
  const root = specialRoot('item_display')
  if (data.itemName !== null) {
    const item = itemContent(data.itemName || 'diamond', version)
    item.userData.displayRoot = root
    displayTransform(root, item, data)
  } else {
    displayTransform(root, unresolved('item_display'), data)
  }
  root.userData.itemName = data.itemName || null
  return root
}

function applyFacing (root, facing) {
  if (typeof facing === 'number') facing = ['down', 'up', 'north', 'south', 'west', 'east'][facing]
  if (facing === 'up') root.rotation.x = -Math.PI / 2
  else if (facing === 'down') root.rotation.x = Math.PI / 2
  else if (facing === 'north') root.rotation.y = Math.PI
  else if (facing === 'west') root.rotation.y = Math.PI / 2
  else if (facing === 'east') root.rotation.y = -Math.PI / 2
}

function itemFrame (type, version, data) {
  const root = specialRoot(type)
  const frame = new THREE.Group()
  frame.position.y = 0.5
  root.add(frame)
  const geometry = new THREE.PlaneGeometry(1, 1)
  const frontMaterial = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    emissive: type === 'glow_item_frame' ? 0x606060 : 0x000000,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.DoubleSide
  })
  const backMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  const front = new THREE.Mesh(geometry, frontMaterial)
  front.position.z = 0.032
  const back = new THREE.Mesh(geometry, backMaterial)
  back.position.z = 0.03
  back.rotation.y = Math.PI
  frame.add(back, front)
  loadMap(root, `textures/${version}/blocks/${type}.png`, map => { frontMaterial.map = map; frontMaterial.needsUpdate = true })
  loadMap(root, `textures/${version}/blocks/birch_planks.png`, map => { backMaterial.map = map; backMaterial.needsUpdate = true })

  if (data.itemName !== null) {
    const item = itemContent(data.itemName || 'diamond', version)
    item.position.z = 0.065
    item.rotation.z = -(Number(data.frameRotation ?? data.rotation) || 0) * Math.PI / 4
    frame.add(item)
  }
  applyFacing(root, data.facing)
  root.userData.frameRotation = Number(data.frameRotation ?? data.rotation) || 0
  return root
}

function painting (version, data) {
  const root = specialRoot('painting')
  const variant = data.painting && typeof data.painting === 'object' ? data.painting : {}
  const suppliedName = typeof data.painting === 'string' ? data.painting : 'kebab'
  const name = String(data.paintingName || data.variantName || variant.name || variant.assetId || suppliedName).replace(/^minecraft:/, '').replace(/^painting\//, '')
  const geometry = new THREE.PlaneGeometry(1, 1)
  const pictureMaterial = new THREE.MeshLambertMaterial({ transparent: true, alphaTest: 0.1 })
  const backMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const picture = new THREE.Mesh(geometry, pictureMaterial)
  const back = new THREE.Mesh(geometry, backMaterial)
  back.rotation.y = Math.PI
  back.position.z = -0.03125
  root.add(back, picture)

  const setSize = (width, height) => {
    width = Math.max(1, width) / 16
    height = Math.max(1, height) / 16
    picture.scale.set(width, height, 1)
    back.scale.set(width, height, 1)
    picture.position.y = height / 2
    back.position.y = height / 2
    root.userData.paintingSize = { width, height }
  }
  setSize(data.paintingWidth || variant.width || 16, data.paintingHeight || variant.height || 16)
  loadMap(root, `textures/${version}/painting/${name}.png`, map => {
    pictureMaterial.map = map
    pictureMaterial.needsUpdate = true
    if (!data.paintingWidth && !variant.width && map.image) setSize(map.image.width, map.image.height)
  })
  loadMap(root, `textures/${version}/painting/back.png`, map => { backMaterial.map = map; backMaterial.needsUpdate = true })
  applyFacing(root, data.facing)
  root.userData.paintingName = name
  return root
}

function componentText (component) {
  if (component === null || component === undefined) return ''
  if (typeof component === 'string' || typeof component === 'number') return String(component)
  if (Array.isArray(component)) return component.map(componentText).join('')
  if (typeof component === 'object') {
    if (component.text !== undefined) return componentText(component.text) + componentText(component.extra)
    if (component.translate) return component.translate + componentText(component.extra)
    if (component.value !== undefined) return componentText(component.value)
  }
  return String(component)
}

function textColor (value, fallback) {
  if (typeof value === 'string') return value
  const number = Number(value ?? fallback) >>> 0
  return `#${(number & 0xffffff).toString(16).padStart(6, '0')}`
}

function textDisplay (data) {
  const root = specialRoot('text_display')
  const canvas = createCanvas ? createCanvas(512, 256) : (typeof document !== 'undefined' ? document.createElement('canvas') : null)
  if (!canvas) {
    root.userData.unresolvedEntity = 'text_display (canvas unavailable)'
    return root
  }
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  const text = componentText(data.text ?? data.textComponent ?? 'Text display')
  const lines = text.split('\n')
  const fontSize = 32
  context.font = `${data.bold ? 'bold ' : ''}${fontSize}px sans-serif`
  context.textBaseline = 'top'
  const background = data.background === undefined ? 0x40000000 : Number(data.background) >>> 0
  if (typeof data.background === 'string') {
    context.fillStyle = data.background
    context.fillRect(0, 0, canvas.width, canvas.height)
  } else if (background >>> 24) {
    context.fillStyle = `rgba(${(background >>> 16) & 255},${(background >>> 8) & 255},${background & 255},${(background >>> 24) / 255})`
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  const opacity = data.textOpacity === undefined ? 1 : ((Number(data.textOpacity) & 255) / 255)
  context.globalAlpha = opacity
  context.fillStyle = textColor(data.color, 0xffffff)
  context.textAlign = ['left', 'right', 'center'].includes(data.alignment) ? data.alignment : 'center'
  if (data.shadow) {
    context.shadowColor = 'rgba(0,0,0,0.8)'
    context.shadowOffsetX = 3
    context.shadowOffsetY = 3
  }
  const x = context.textAlign === 'left' ? 12 : context.textAlign === 'right' ? canvas.width - 12 : canvas.width / 2
  lines.forEach((line, index) => context.fillText(line, x, 12 + index * (fontSize + 6), canvas.width - 24))

  const texture = new THREE.CanvasTexture(canvas)
  texture.userData = { specialOwned: true }
  texture.minFilter = THREE.LinearFilter
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide, depthWrite: false, depthTest: !data.seeThrough })
  const width = Math.max(0.5, (Number(data.lineWidth) || 200) / 40)
  const height = width * canvas.height / canvas.width
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
  mesh.position.y = height / 2
  mesh.onBeforeRender = (renderer, scene, camera) => root.userData.orientToCamera?.(camera)
  root.add(mesh)
  installBillboard(root, data.billboard)
  root.userData.text = text
  return root
}

function endCrystal (version, data) {
  const root = specialRoot('end_crystal')
  const frameMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
  const coreMaterial = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x321040 })
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), frameMaterial)
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55), coreMaterial)
  frame.position.y = 0.8
  core.position.y = 0.8
  core.onBeforeRender = () => {
    core.rotation.y = performance.now() / 900
    core.rotation.x = Math.sin(performance.now() / 1300) * 0.25
  }
  root.add(frame, core)
  loadMap(root, `textures/${version}/entity/end_crystal/end_crystal.png`, map => {
    frameMaterial.map = map
    coreMaterial.map = map
    frameMaterial.needsUpdate = true
    coreMaterial.needsUpdate = true
  })
  if (data.showBottom) {
    const bottom = getBlockMesh('bedrock', version)
    bottom.scale.set(1, 0.25, 1)
    bottom.position.set(-0.5, -0.25, -0.5)
    root.add(bottom)
  }
  return root
}

function cushion (version, data) {
  const root = specialRoot('cushion')
  const color = typeof data.color === 'number' ? cushionColors[data.color & 15] : (data.color || data.variant || 'red')
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff })
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 1), material)
  mesh.position.y = 0.125
  root.add(mesh)
  loadMap(root, `textures/${version}/entity/cushion/${color}_cushion.png`, map => { material.map = map; material.needsUpdate = true })
  root.userData.color = color
  return root
}

function particleSprite (root, path, color, opacity = 0.6) {
  const material = new THREE.SpriteMaterial({ color, transparent: true, opacity, depthWrite: false })
  loadMap(root, path, map => { material.map = map; material.needsUpdate = true })
  return new THREE.Sprite(material)
}

function areaEffectCloud (version, data) {
  const root = specialRoot('area_effect_cloud')
  const radius = Math.max(0.1, Number(data.radius) || 3)
  const color = data.particleColor ?? data.color ?? 0xd7c9e8
  const material = new THREE.SpriteMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false })
  loadMap(root, `textures/${version}/particle/spell_0.png`, map => { material.map = map; material.needsUpdate = true })
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.399963229728653
    const distance = radius * Math.sqrt((i + 0.5) / 28)
    const sprite = new THREE.Sprite(material)
    sprite.position.set(Math.cos(angle) * distance, 0.15 + (i % 5) * 0.07, Math.sin(angle) * distance)
    sprite.scale.set(0.35, 0.35, 0.35)
    root.add(sprite)
  }
  root.userData.radius = radius
  return root
}

function lightningBolt () {
  const root = specialRoot('lightning_bolt')
  const material = new THREE.MeshBasicMaterial({ color: 0xd9edff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
  const segments = [
    [0, 3, 0, 0.16, 6, 0], [0.25, 4.5, 0, 0.12, 2.4, -0.3],
    [-0.25, 2.4, 0, 0.11, 2.8, 0.35], [0.65, 3.8, 0, 0.08, 2.1, -0.65],
    [-0.7, 1.4, 0, 0.07, 1.8, 0.75]
  ]
  for (const [x, y, z, width, height, angle] of segments) {
    const branch = new THREE.Group()
    branch.position.set(x, y, z)
    branch.rotation.z = angle
    for (const rotation of [0, Math.PI / 2]) {
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material)
      quad.rotation.y = rotation
      branch.add(quad)
    }
    root.add(branch)
  }
  return root
}

function windCharge (type, version) {
  const root = specialRoot(type)
  const path = type === 'breeze_wind_charge' ? `textures/${version}/entity/breeze/breeze_wind.png` : `textures/${version}/entity/projectiles/wind_charge.png`
  const sprite = particleSprite(root, path, 0xffffff, 0.85)
  sprite.scale.set(0.65, 0.65, 0.65)
  sprite.position.y = 0.25
  sprite.onBeforeRender = () => { sprite.material.rotation = performance.now() / 350 }
  root.add(sprite)
  return root
}

function ominousItemSpawner (version, data) {
  const root = specialRoot('ominous_item_spawner')
  const item = itemContent(data.itemName || 'ominous_bottle', version)
  item.scale.setScalar(0.5)
  item.position.y = 0.125
  root.add(item)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.025, 6, 20), new THREE.MeshBasicMaterial({ color: 0xb79bd4, transparent: true, opacity: 0.75 }))
  ring.position.y = 0.125
  ring.onBeforeRender = () => { ring.rotation.y = performance.now() / 500; ring.rotation.x = performance.now() / 900 }
  root.add(ring)
  for (let i = 0; i < 4; i++) {
    const particle = particleSprite(root, `textures/${version}/particle/spell_${i}.png`, 0xb79bd4, 0.65)
    const angle = i * Math.PI / 2
    particle.position.set(Math.cos(angle) * 0.3, 0.15 + i * 0.05, Math.sin(angle) * 0.3)
    particle.scale.set(0.12, 0.12, 0.12)
    root.add(particle)
  }
  return root
}

function createSpecialEntity (type, version, data = {}) {
  type = String(type || '').replace(/^minecraft:/, '')
  data = data || {}
  if (type === 'falling_block' || type === 'block_display' || type === 'tnt') return blockEntity(type, version, data, type === 'tnt' ? 'tnt' : 'stone')
  if (type === 'item_display') return itemDisplay(version, data)
  if (type === 'item_frame' || type === 'glow_item_frame') return itemFrame(type, version, data)
  if (type === 'painting') return painting(version, data)
  if (type === 'text_display') return textDisplay(data)
  if (['splash_potion', 'lingering_potion', 'egg', 'ender_pearl', 'snowball', 'experience_bottle', 'eye_of_ender'].includes(type)) return projectile(type, version, data)
  if (type === 'end_crystal') return endCrystal(version, data)
  if (type === 'cushion') return cushion(version, data)
  if (type === 'area_effect_cloud') return areaEffectCloud(version, data)
  if (type === 'lightning_bolt') return lightningBolt()
  if (type === 'wind_charge' || type === 'breeze_wind_charge') return windCharge(type, version)
  if (type === 'ominous_item_spawner') return ominousItemSpawner(version, data)
  return null
}

module.exports = { createSpecialEntity, specialEntityTypes }
