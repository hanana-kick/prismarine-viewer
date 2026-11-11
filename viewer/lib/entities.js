const THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')

const Entity = require('./entity/Entity')
const { getItemMesh, animateItem } = require('./entity/Item')
const { dispose3 } = require('./dispose')

const invisibleTypes = Entity.nonMeshEntities
const warnedMissing = new Set()

let createCanvas
try { ({ createCanvas } = require('canvas')) } catch {}

function getEntityMesh (entity, scene, version) {
  // A dropped item is its own item's model, and the stack only arrives after the spawn.
  const entityName = typeof entity.name === 'string'
    ? entity.name.replace(/^minecraft:/, '')
    : entity.name
  if (entity.itemName) return getItemMesh(entity.itemName, version, () => missingModel({ ...entity, name: entityName }))
  if (entityName === 'item' || invisibleTypes.has(entityName)) return null
  if (entityName) {
    try {
      const textures = {}
      if (entity.skin) textures.default = entity.skin
      if (entity.cape) textures.cape = entity.cape
      const model = entityName === 'player' && entity.skinModel === 'slim' ? 'player_slim' : entityName
      const e = new Entity(version, model, scene, textures)
      if (!e.mesh.children.length) {
        throw new Error('Empty geometry for ' + entityName)
      }

      if (entity.username !== undefined && createCanvas) {
        const canvas = createCanvas(500, 100)

        const ctx = canvas.getContext('2d')
        ctx.font = '50pt Arial'
        ctx.fillStyle = '#000000'
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'

        const txt = entity.username
        ctx.fillText(txt, 100, 0)

        const tex = new THREE.Texture(canvas)
        tex.needsUpdate = true
        const spriteMat = new THREE.SpriteMaterial({ map: tex })
        const sprite = new THREE.Sprite(spriteMat)
        sprite.position.y += entity.height + 0.6

        e.mesh.add(sprite)
      }
      const limbs = {}
      for (const name of ['leftArm', 'rightArm', 'leftLeg', 'rightLeg']) limbs[name] = e.mesh.getObjectByName(name)
      if (Object.values(limbs).every(Boolean)) {
        e.mesh.walk = { limbs, lastPos: null, speed: 0, pos: 0, age: 0, riding: false, zombieArms: zombieArmMobs.has(entity.name) }
      }

      return e.mesh
    } catch (err) {
      if (!warnedMissing.has(entityName)) {
        console.warn('[prismarine-viewer] No complete entity model for ' + entityName, err)
        warnedMissing.add(entityName)
      }
    }
  }

  return missingModel({ ...entity, name: entityName })
}

function missingModel (entity) {
  // Unknown modded or malformed entities should remain identifiable in logs,
  // never as fluorescent magenta geometry across the world.
  const width = Number.isFinite(entity.width) && entity.width > 0 ? entity.width : 0.6
  const height = Number.isFinite(entity.height) && entity.height > 0 ? entity.height : 0.6
  const geometry = new THREE.BoxGeometry(width, height, width)
  geometry.translate(0, height / 2, 0)
  const material = new THREE.MeshBasicMaterial({
    color: 0x9fa4ae, wireframe: true, transparent: true, opacity: 0.55
  })
  const cube = new THREE.Mesh(geometry, material)
  cube.userData.unresolvedEntity = entity.name || 'unknown'
  return cube
}

const zombieArmMobs = new Set(['zombie', 'husk', 'drowned', 'zombie_villager', 'zombified_piglin'])

// Vanilla rotations are in a y-down model space; this model is y-up, so x and z angles are negated
function animateWalk (mesh, ticks) {
  const w = mesh.walk
  const lastPos = w.lastPos
  w.lastPos = mesh.position.clone()
  w.age += ticks
  if (!lastPos) return

  if (w.riding) {
    w.speed = 0
    w.pos = 0
  } else {
    const moved = Math.hypot(mesh.position.x - lastPos.x, mesh.position.z - lastPos.z)
    const target = Math.min(1, moved / ticks * 4)
    w.speed += (target - w.speed) * (1 - Math.pow(0.6, ticks))
    w.pos += w.speed * ticks
  }

  const { leftArm, rightArm, leftLeg, rightLeg } = w.limbs
  const { speed, pos } = w
  const t = pos * 0.6662
  leftArm.rotation.set(-Math.cos(t) * speed, 0, 0)
  rightArm.rotation.set(-Math.cos(t + Math.PI) * speed, 0, 0)
  leftLeg.rotation.set(-Math.cos(t + Math.PI) * 1.4 * speed, -0.005, 0.005)
  rightLeg.rotation.set(-Math.cos(t) * 1.4 * speed, 0.005, -0.005)
  if (w.riding) {
    leftArm.rotation.x += Math.PI / 5
    rightArm.rotation.x += Math.PI / 5
    leftLeg.rotation.set(1.4137167, -Math.PI / 10, 0.07853982)
    rightLeg.rotation.set(1.4137167, Math.PI / 10, -0.07853982)
  }

  if (w.zombieArms) {
    const age = w.age
    leftArm.rotation.set(Math.PI / 2.25 + Math.sin(age * 0.067) * 0.05, 0.1, Math.cos(age * 0.09) * 0.05 + 0.05)
    rightArm.rotation.set(Math.PI / 2.25 - Math.sin(age * 0.067) * 0.05, -0.1, -(Math.cos(age * 0.09) * 0.05 + 0.05))
  }
}

class Entities {
  constructor (scene) {
    this.scene = scene
    this.entities = {}
    // What the spawn said about each dropped item, since later partial updates carry only the id
    this.items = {}
    this.lastAnimate = performance.now()
  }

  setVersion (version) {
    this.version = version
    this.clear()
  }

  animate () {
    const now = performance.now()
    const ticks = (now - this.lastAnimate) / 50
    this.lastAnimate = now
    if (ticks === 0) return
    for (const mesh of Object.values(this.entities)) {
      if (mesh.walk) animateWalk(mesh, ticks)
      if (mesh.item) animateItem(mesh, ticks)
    }
  }

  clear () {
    for (const mesh of Object.values(this.entities)) {
      this.scene.remove(mesh)
      dispose3(mesh)
    }
    this.entities = {}
    this.items = {}
  }

  update (entity) {
    if (entity.name === 'item') this.items[entity.id] = { name: entity.name, width: entity.width, height: entity.height }
    if (this.items[entity.id]) entity = { ...this.items[entity.id], ...entity }
    if (entity.delete) delete this.items[entity.id]

    // A dropped item's stack arrives after its spawn and can change; its mesh is that stack's model.
    const known = this.entities[entity.id]
    if (known && entity.itemName !== undefined && known.itemName !== entity.itemName) {
      this.scene.remove(known)
      dispose3(known)
      delete this.entities[entity.id]
    }
    if (!this.entities[entity.id]) {
      if (!entity.pos) return
      const mesh = getEntityMesh(entity, this.scene, this.version)
      if (!mesh) return
      mesh.itemName = entity.itemName
      this.entities[entity.id] = mesh
      this.scene.add(mesh)
      if (entity.pos) mesh.position.set(entity.pos.x, entity.pos.y, entity.pos.z)
    }

    const e = this.entities[entity.id]

    if (entity.delete) {
      this.scene.remove(e)
      dispose3(e)
      delete this.entities[entity.id]
    }

    if (entity.pos) {
      new TWEEN.Tween(e.position).to({ x: entity.pos.x, y: entity.pos.y, z: entity.pos.z }, 50).start()
    }
    if (e.walk) {
      if (entity.riding !== undefined) e.walk.riding = entity.riding
      if (entity.hurt) e.walk.speed = 1.5
    }
    if (entity.yaw) {
      const da = (entity.yaw - e.rotation.y) % (Math.PI * 2)
      const dy = 2 * da % (Math.PI * 2) - da
      new TWEEN.Tween(e.rotation).to({ y: e.rotation.y + dy }, 50).start()
    }
  }
}

module.exports = { Entities }
