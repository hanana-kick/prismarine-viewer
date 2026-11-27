const THREE = require('three')
const { loadTexture } = globalThis.isElectron ? require('./utils.electron.js') : require('./utils')

// Shared lifecycle and primitives for block-entity model families. The returned
// group owns its geometries and materials, but never disposes cached textures.
function createModel (position = { x: 0, y: 0, z: 0 }) {
  const group = new THREE.Group()
  group.position.set(position.x, position.y, position.z)
  group.userData.disposed = false
  group.dispose = () => {
    if (group.userData.disposed) return
    group.userData.disposed = true
    group.traverse(object => {
      object.geometry?.dispose()
      const materials = Array.isArray(object.material) ? object.material : [object.material]
      for (const material of materials) material?.dispose()
    })
    group.clear()
  }
  return group
}

function applyTexture (group, mesh, path, options = {}) {
  if (!path) return
  mesh.onBeforeRender = () => {
    mesh.onBeforeRender = () => {}
    loadTexture(path, texture => {
      if (group.userData.disposed) return
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      mesh.material.map = texture
      mesh.material.needsUpdate = true
      if (options.flipY !== undefined) texture.flipY = options.flipY
    })
  }
}

function addBox (group, size, center, texture, options = {}) {
  const geometry = new THREE.BoxGeometry(size[0], size[1], size[2])
  const material = new THREE.MeshLambertMaterial({
    color: options.color ?? 0xffffff,
    transparent: options.transparent ?? true,
    alphaTest: options.alphaTest ?? 0.1,
    side: options.side ?? THREE.FrontSide
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center[0], center[1], center[2])
  if (options.rotation) mesh.rotation.set(...options.rotation)
  mesh.name = options.name || 'part'
  applyTexture(group, mesh, texture, options)
  group.add(mesh)
  return mesh
}

function addQuad (group, width, height, center, texture, options = {}) {
  const geometry = new THREE.PlaneGeometry(width, height)
  const material = new THREE.MeshBasicMaterial({
    color: options.color ?? 0xffffff,
    transparent: options.transparent ?? true,
    alphaTest: options.alphaTest ?? 0.05,
    side: options.side ?? THREE.DoubleSide,
    depthWrite: options.depthWrite ?? true
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.set(center[0], center[1], center[2])
  if (options.rotation) mesh.rotation.set(...options.rotation)
  mesh.name = options.name || 'quad'
  applyTexture(group, mesh, texture, options)
  group.add(mesh)
  return mesh
}

function facingRotation (facing) {
  return { north: 0, south: Math.PI, west: Math.PI / 2, east: -Math.PI / 2 }[facing] || 0
}

function texturePath (version, path) {
  return `textures/${version}/${path.replace(/^minecraft:/, '')}.png`
}

module.exports = { createModel, addBox, addQuad, facingRotation, texturePath }
