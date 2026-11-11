'use strict'

const assert = require('node:assert/strict')
const THREE = require('three')
const { updatePlayerVisibility } = require('../viewer/lib/player-visibility')

const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100)
camera.position.set(0, 3, 8)
const player = new THREE.Object3D()
const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.8, 0.6), material)
body.position.y = 0.9
player.add(body)
const blocker = new THREE.Mesh(
  new THREE.BoxGeometry(5, 5, 0.5),
  new THREE.MeshBasicMaterial({ color: 0x008800 })
)
blocker.position.set(0, 1, 4)
blocker.updateMatrixWorld(true)

assert.equal(updatePlayerVisibility(camera, { sectionMeshs: { leafSection: blocker } }, player), true)
assert.equal(material.depthTest, false, 'Occluded player is still hidden by leaves')
assert.equal(material.depthWrite, false)
assert.equal(body.renderOrder, 1000)

assert.equal(updatePlayerVisibility(camera, { sectionMeshs: {} }, player), false)
assert.equal(material.depthTest, true, 'Player remains in x-ray mode after leaves disappear')
assert.equal(material.depthWrite, true)
assert.equal(body.renderOrder, 0)

console.log('Third-person player remains visible under a simulated dense canopy')
