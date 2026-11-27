const THREE = require('three')
const { Vec3 } = require('vec3')
const { getSectionGeometry } = require('../models')
const { loadTexture, loadJSON } = globalThis.isElectron ? require('../utils.electron.js') : require('../utils')

const states = {}
const atlases = {}
const geometryCache = {}
const warnedMissing = new Set()
const plains = { name: 'plains' }

function normalizedProperties (properties) {
  if (!properties) return {}
  if (typeof properties === 'object') return properties
  const result = {}
  for (const part of String(properties).replace(/^\[|\]$/g, '').split(',')) {
    const split = part.indexOf('=')
    if (split > 0) result[part.slice(0, split).trim()] = part.slice(split + 1).trim()
  }
  return result
}

function makeBlock (name, properties) {
  // getSectionGeometry resolves variants from these properties directly; no
  // version-wide registry is needed. Neighbours are all air, so transparency
  // and collision shapes never change the resulting single-block model.
  return {
    name,
    type: 1,
    metadata: 0,
    position: new Vec3(0, 0, 0),
    biome: plains,
    transparent: true,
    isCube: false,
    shapes: [],
    material: 'default',
    getProperties: () => normalizedProperties(properties)
  }
}

function makeSingleBlockWorld (block) {
  // models.js expects a prismarine world, including neighbours for culling and
  // ambient occlusion. Every neighbour is air so the result contains only the
  // requested model, with all of its exterior faces intact.
  const air = {
    name: 'air',
    type: 0,
    position: new Vec3(0, 0, 0),
    biome: plains,
    transparent: true,
    isCube: false,
    shapes: [],
    material: 'default',
    getProperties: () => ({})
  }
  return {
    minY: -64,
    getBlock (pos) {
      if (pos.x === 0 && pos.y === 0 && pos.z === 0) return block
      air.position = pos
      return air
    }
  }
}

function sectionGeometry (name, version, properties, blockStates) {
  const propertyKey = JSON.stringify(normalizedProperties(properties))
  const key = `${version}:${name}:${propertyKey}`
  if (geometryCache[key] !== undefined) return geometryCache[key]
  if (!blockStates[name]) {
    geometryCache[key] = null
    return null
  }
  const block = makeBlock(name, properties)
  const geometry = getSectionGeometry(0, 0, 0, makeSingleBlockWorld(block), blockStates)
  geometryCache[key] = geometry.positions.length ? geometry : null
  return geometryCache[key]
}

function loadBlockStates (version) {
  if (!states[version]) {
    states[version] = new Promise(resolve => loadJSON(`blocksStates/${version}.json`, resolve))
  }
  return states[version]
}

function loadAtlas (version) {
  if (!atlases[version]) {
    atlases[version] = new Promise(resolve => loadTexture(`textures/${version}.png`, texture => {
      texture.magFilter = THREE.NearestFilter
      texture.minFilter = THREE.NearestFilter
      texture.flipY = false
      resolve(texture)
    }))
  }
  return atlases[version]
}

function atlasMaterial (map) {
  const material = new THREE.MeshLambertMaterial({ map, vertexColors: true, transparent: true, alphaTest: 0.1 })
  const time = { value: 0 }
  material.onBeforeCompile = shader => {
    shader.uniforms.time = time
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', 'attribute vec3 animation;\nuniform float time;\n#include <common>')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_UV\nvUv.y += mod(floor(time / animation.y), animation.x) * animation.z;\n#endif')
  }
  material.userData.time = time
  return material
}

/**
 * Build one real block from the same resolved models and atlas used by chunks.
 * The returned group is immediately attachable; loading and disposal are safe
 * in either order. The shared atlas is deliberately not disposed with a block.
 */
function getBlockMesh (name, version, properties = {}) {
  name = String(name || '').replace(/^minecraft:/, '')
  const group = new THREE.Group()
  group.name = `block:${name}`
  group.userData.blockName = name
  group.userData.blockProperties = normalizedProperties(properties)
  let disposed = false
  const ownedGeometries = new Set()
  const ownedMaterials = new Set()

  group.dispose = () => {
    if (disposed) return
    disposed = true
    group.userData.disposed = true
    for (const geometry of ownedGeometries) geometry.dispose()
    for (const material of ownedMaterials) material.dispose()
    group.clear()
  }

  Promise.all([loadBlockStates(version), loadAtlas(version)]).then(([blockStates, map]) => {
    if (disposed) return
    const section = sectionGeometry(name, version, properties, blockStates)
    if (!section || !map) {
      group.userData.unresolvedBlock = name
      if (!warnedMissing.has(`${version}:${name}`)) {
        console.warn(`[prismarine-viewer] No resolved block model for ${name} (${version})`)
        warnedMissing.add(`${version}:${name}`)
      }
      return
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(section.positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(section.normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(section.colors, 3))
    geometry.setAttribute('uv', new THREE.BufferAttribute(section.uvs, 2))
    geometry.setAttribute('animation', new THREE.BufferAttribute(section.animations, 3))
    geometry.setIndex(section.indices)
    const material = atlasMaterial(map)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.name = name
    mesh.position.set(section.sx, section.sy, section.sz)
    mesh.onBeforeRender = (renderer, scene, camera) => {
      material.userData.time.value = performance.now() / 50
      group.userData.displayRoot?.userData.orientToCamera?.(camera)
    }
    ownedGeometries.add(geometry)
    ownedMaterials.add(material)
    group.add(mesh)
    group.userData.resolved = true
  }).catch(error => {
    if (disposed) return
    group.userData.unresolvedBlock = name
    group.userData.unresolvedError = error.message
  })

  return group
}

function blockModelExists (name, version) {
  return loadBlockStates(version).then(blockStates => !!blockStates[String(name || '').replace(/^minecraft:/, '')])
}

module.exports = { getBlockMesh, blockModelExists }
