/* global window, document, fetch, requestAnimationFrame */
// Inspect one 26.3 entity at a time: its rig, its individual parts, its hitbox and the
// size the renderer actually produces. Driven by hand in a browser or headlessly by
// scripts/entity-inspector-26.3.js through window.__inspector.
const THREE = require('three')
THREE.OrbitControls = require('three/examples/jsm/controls/OrbitControls.js').OrbitControls

const Entity = require('../../viewer/lib/entity/Entity')
const rigs = require('../../viewer/lib/entity/entities.json')
const { getItemMesh } = require('../../viewer/lib/entity/Item')
const HITBOX_COLOR = 0x00e5ff
const MESHBOX_COLOR = 0xffb300
const BONE_COLOR = 0xff4081

const CAMERA_VIEWS = {
  iso: new THREE.Vector3(1, 0.55, 1),
  front: new THREE.Vector3(0, 0.15, 1),
  back: new THREE.Vector3(0, 0.15, -1),
  left: new THREE.Vector3(-1, 0.15, 0),
  right: new THREE.Vector3(1, 0.15, 0),
  top: new THREE.Vector3(0, 1, 0.02)
}

const state = {
  name: null,
  parts: 'all', // 'all' or an array of geometry part names
  texture: true,
  wireframe: false,
  hitbox: true,
  meshBox: true,
  bones: false,
  grid: true,
  axes: false,
  scale: 1,
  yaw: 0,
  preset: 'iso',
  itemName: 'diamond_sword'
}

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true })
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const scene = new THREE.Scene()
scene.background = new THREE.Color(0x1b2026)
scene.add(new THREE.HemisphereLight(0xffffff, 0x404850, 1.05))
const sun = new THREE.DirectionalLight(0xffffff, 0.55)
sun.position.set(4, 8, 6)
scene.add(sun)

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.05, 500)
const controls = new THREE.OrbitControls(camera, renderer.domElement)
controls.enableDamping = false

const grid = new THREE.GridHelper(16, 16, 0x8a94a0, 0x3b444e)
scene.add(grid)
const axes = new THREE.AxesHelper(2)
axes.visible = false
scene.add(axes)

const root = new THREE.Group()
scene.add(root)
const overlays = new THREE.Group()
scene.add(overlays)

let catalog = {}
let current = null // { mesh, info, box }
let buildError = null

function wireBox (size, center, color) {
  const geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z))
  const helper = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color }))
  helper.material.depthTest = false
  helper.position.copy(center)
  helper.renderOrder = 3
  return helper
}

function textSprite (text) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  ctx.font = '28px monospace'
  ctx.fillStyle = '#ffffff'
  ctx.fillText(text, 4, 40)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvas),
    depthTest: false,
    transparent: true
  }))
  sprite.scale.set(0.9, 0.22, 1)
  return sprite
}

function boneMarkers (geometry) {
  const group = new THREE.Group()
  for (const jsonModel of Object.values(geometry)) {
    for (const bone of jsonModel.bones || []) {
      if (!bone.pivot) continue
      const pivot = new THREE.Vector3(bone.pivot[0] / 16, bone.pivot[1] / 16, bone.pivot[2] / 16)
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8),
        new THREE.MeshBasicMaterial({ color: BONE_COLOR })
      )
      marker.position.copy(pivot)
      group.add(marker)
      const label = textSprite(bone.name)
      label.position.copy(pivot).add(new THREE.Vector3(0, 0.1, 0))
      group.add(label)
    }
  }
  return group
}

function applyPartVisibility () {
  if (!current) return
  const wanted = state.parts === 'all' ? null : new Set(state.parts)
  for (const child of current.mesh.children) {
    child.visible = !wanted || wanted.has(child.userData.partName)
  }
}

function applyMaterialTuning () {
  if (!current) return
  current.mesh.traverse(object => {
    if (!object.material) return
    object.material.wireframe = state.wireframe
    if (!state.texture) {
      if (object.userData.savedMap === undefined) object.userData.savedMap = object.material.map
      object.material.map = null
    } else if (object.userData.savedMap !== undefined) {
      object.material.map = object.userData.savedMap
    }
    object.material.needsUpdate = true
  })
}

function rebuild () {
  while (root.children.length) root.remove(root.children[0])
  overlays.clear()
  const info = catalog[state.name]
  if (!info) {
    current = null
    return
  }
  let entity
  buildError = null
  try {
    // Dropped items come from the item model builder rather than a rig.
    entity = state.name === 'item'
      ? { mesh: getItemMesh(state.itemName, '26.3', () => new THREE.Object3D()) }
      : new Entity('26.3', state.name, scene)
  } catch (error) {
    buildError = error.message
    current = null
    return
  }
  entity.mesh.scale.multiplyScalar(state.scale)
  entity.mesh.rotation.y = THREE.MathUtils.degToRad(state.yaw)
  root.add(entity.mesh)
  entity.mesh.updateMatrixWorld(true)

  if (state.hitbox && info.hitbox) {
    overlays.add(wireBox(
      new THREE.Vector3(info.hitbox.width, info.hitbox.height, info.hitbox.width),
      new THREE.Vector3(0, info.hitbox.height / 2, 0),
      HITBOX_COLOR
    ))
  }
  const box = new THREE.Box3().setFromObject(entity.mesh)
  current = { mesh: entity.mesh, info, box }
  if (state.meshBox && !box.isEmpty()) {
    overlays.add(wireBox(
      box.getSize(new THREE.Vector3()),
      box.getCenter(new THREE.Vector3()),
      MESHBOX_COLOR
    ))
  }
  if (state.bones && info.rig && rigs[info.rig]) overlays.add(boneMarkers(rigs[info.rig].geometry))

  applyPartVisibility()
  applyMaterialTuning()
}

function frameCamera () {
  const box = current && !current.box.isEmpty()
    ? current.box
    : new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5))
  const center = box.getCenter(new THREE.Vector3())
  const radius = Math.max(0.6, box.getSize(new THREE.Vector3()).length() / 2)
  const direction = CAMERA_VIEWS[state.preset] || CAMERA_VIEWS.iso
  camera.position.copy(center).add(direction.clone().normalize().multiplyScalar(radius * 3.2))
  camera.near = radius / 50
  camera.far = radius * 100
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

// The headless runner waits on this: every part the catalog says has a texture must have
// its map attached, which only happens once the mesh has been drawn and the fetch landed.
function texturesReady () {
  if (!current) return false
  // Item meshes only appear once the item texture index resolves.
  if (state.name === 'item') {
    const pivot = current.mesh.children[0]
    if (!pivot || !pivot.children.length) return false
  }
  let ready = true
  for (const child of current.mesh.children) {
    const part = (current.info.parts || []).find(candidate => candidate.part === child.userData.partName)
    if (part && part.texture && !child.material.map) ready = false
  }
  return ready
}

function render () {
  requestAnimationFrame(render)
  controls.update()
  renderer.render(scene, camera)
}

function summary () {
  const info = catalog[state.name] || {}
  const empty = current == null || current.box.isEmpty()
  const size = empty ? new THREE.Vector3() : current.box.getSize(new THREE.Vector3())
  return {
    name: state.name,
    exists: !empty,
    rig: info.rig || null,
    rigSource: info.rigSource || null,
    hitbox: info.hitbox || null,
    rendered: { width: size.x, height: size.y, depth: size.z, minY: empty ? 0 : current.box.min.y },
    parts: (current ? current.mesh.children : []).map(child => ({
      part: child.userData.partName,
      visible: child.visible,
      triangles: child.geometry && child.geometry.index ? child.geometry.index.count / 3 : 0,
      texture: (info.parts || []).find(candidate => candidate.part === child.userData.partName)?.texture || null,
      textured: !!(child.material && child.material.map)
    })),
    warnings: info.warnings || [],
    error: buildError,
    texturesReady: texturesReady()
  }
}

function syncUi () {
  const info = catalog[state.name] || {}
  const text = {
    'entity-name': state.name || '—',
    'field-rig': info.rig ? `${info.rig} (${info.rigSource})` : '—',
    'field-hitbox': info.hitbox ? `${info.hitbox.width} × ${info.hitbox.height}` : '—',
    'field-texture': (info.parts || []).map(part => `${part.part}: ${part.texture || 'none'}`).join('\n') || '—',
    'field-warnings': (info.warnings || []).map(warning => `${warning.level}: ${warning.text}`).join('\n') || 'none'
  }
  const empty = current == null || current.box.isEmpty()
  const size = empty ? null : current.box.getSize(new THREE.Vector3())
  text['field-rendered'] = size ? `${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)}` : 'nothing'
  for (const [id, value] of Object.entries(text)) {
    const node = document.getElementById(id)
    if (node) node.textContent = value
  }

  const children = current ? current.mesh.children : []
  const list = document.getElementById('part-list')
  list.innerHTML = ''
  children.forEach((child, index) => {
    const label = document.createElement('label')
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = child.visible
    box.addEventListener('change', () => {
      const inputs = Array.from(list.querySelectorAll('input'))
      state.parts = inputs
        .map((input, position) => ({ input, position }))
        .filter(entry => entry.input.checked)
        .map(entry => children[entry.position].userData.partName)
      applyPartVisibility()
    })
    label.appendChild(box)
    label.appendChild(document.createTextNode(` ${child.userData.partName}`))
    list.appendChild(label)
  })
  document.getElementById('part-count').textContent = String(children.length)
}

function show (name, options = {}) {
  for (const key of ['parts', 'texture', 'wireframe', 'hitbox', 'meshBox', 'bones', 'grid', 'axes', 'scale', 'yaw', 'preset', 'itemName']) {
    if (options[key] !== undefined) state[key] = options[key]
  }
  state.name = name
  grid.visible = state.grid
  axes.visible = state.axes
  rebuild()
  frameCamera()
  syncUi()
  return summary()
}

function step (delta) {
  const names = Object.keys(catalog)
  const at = names.indexOf(state.name)
  show(names[(at + delta + names.length) % names.length])
}

function bindUi () {
  const search = document.getElementById('entity-search')
  const select = document.getElementById('entity-select')
  for (const name of Object.keys(catalog)) {
    const option = document.createElement('option')
    option.value = name
    option.textContent = name
    select.appendChild(option)
  }
  search.addEventListener('input', () => {
    const needle = search.value.trim().toLowerCase()
    for (const option of select.options) option.hidden = !!needle && !option.value.includes(needle)
  })
  select.addEventListener('change', () => show(select.value))
  const itemInput = document.getElementById('item-name')
  if (itemInput) {
    itemInput.addEventListener('change', () => {
      state.itemName = itemInput.value.trim() || 'diamond_sword'
      if (state.name === 'item') show('item')
    })
  }
  document.getElementById('prev').addEventListener('click', () => step(-1))
  document.getElementById('next').addEventListener('click', () => step(1))
  document.getElementById('all-parts').addEventListener('click', () => {
    state.parts = 'all'
    rebuild()
    syncUi()
  })

  const toggles = {
    'toggle-texture': 'texture',
    'toggle-wireframe': 'wireframe',
    'toggle-hitbox': 'hitbox',
    'toggle-meshbox': 'meshBox',
    'toggle-bones': 'bones',
    'toggle-grid': 'grid',
    'toggle-axes': 'axes'
  }
  for (const [id, key] of Object.entries(toggles)) {
    const input = document.getElementById(id)
    input.checked = state[key]
    input.addEventListener('change', () => {
      state[key] = input.checked
      rebuild()
      frameCamera()
    })
  }
  for (const input of document.querySelectorAll('input[name=camera]')) {
    input.addEventListener('change', () => {
      state.preset = input.value
      frameCamera()
    })
  }
  const scale = document.getElementById('scale')
  scale.addEventListener('input', () => {
    state.scale = Number(scale.value)
    document.getElementById('scale-value').textContent = scale.value
    rebuild()
    frameCamera()
  })
  const yaw = document.getElementById('yaw')
  yaw.addEventListener('input', () => {
    state.yaw = Number(yaw.value)
    document.getElementById('yaw-value').textContent = `${yaw.value}°`
    rebuild()
    frameCamera()
  })

  window.addEventListener('keydown', event => {
    if (event.target === search) return
    if (event.key === 'ArrowRight') step(1)
    if (event.key === 'ArrowLeft') step(-1)
  })
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  })
}

async function main () {
  const params = new URLSearchParams(window.location.search)
  if (params.get('bare') === '1') document.getElementById('panel').style.display = 'none'
  catalog = await fetch('catalog.json').then(response => response.json())
  bindUi()
  render()
  const initial = new URLSearchParams(window.location.search).get('entity') || Object.keys(catalog)[0]
  show(initial)
  window.__inspector = {
    ready: true,
    names: () => Object.keys(catalog),
    show,
    state: summary,
    texturesReady,
    errors: []
  }
  window.addEventListener('error', event => window.__inspector.errors.push(event.message))
}

main().catch(error => {
  document.body.textContent = `Entity inspector failed to start: ${error.stack || error}`
})
