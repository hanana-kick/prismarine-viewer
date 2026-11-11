/* global window */

const THREE = require('three')
const TWEEN = require('@tweenjs/tween.js')
THREE.OrbitControls = require('three/examples/jsm/controls/OrbitControls.js').OrbitControls

const { Viewer, Entity } = require('../viewer')
const { updatePlayerVisibility } = require('../viewer/lib/player-visibility')

const io = require('socket.io-client')
const socket = io({
  path: window.location.pathname + 'socket.io'
})

let firstPositionUpdate = true

const renderer = new THREE.WebGLRenderer()
renderer.setPixelRatio(window.devicePixelRatio || 1)
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

const viewer = new Viewer(renderer)

let controls = new THREE.OrbitControls(viewer.camera, renderer.domElement)
let botMesh = null
let lastPlayerVisibilityCheck = -Infinity

function animate (time) {
  window.requestAnimationFrame(animate)
  if (controls) controls.update()
  viewer.update()
  if (botMesh && controls && time - lastPlayerVisibilityCheck >= 250) {
    updatePlayerVisibility(viewer.camera, viewer.world, botMesh)
    lastPlayerVisibilityCheck = time
  }
  renderer.render(viewer.scene, viewer.camera)
}
animate()

window.addEventListener('resize', () => {
  viewer.camera.aspect = window.innerWidth / window.innerHeight
  viewer.camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

socket.on('version', (version) => {
  if (!viewer.setVersion(version)) {
    return false
  }

  firstPositionUpdate = true
  if (botMesh) {
    viewer.scene.remove(botMesh)
    botMesh = null
  }
  lastPlayerVisibilityCheck = -Infinity
  viewer.listen(socket)

  socket.on('position', ({ pos, addMesh, yaw, pitch }) => {
    if (yaw !== undefined && pitch !== undefined) {
      if (controls) {
        controls.dispose()
        controls = null
      }
      viewer.setFirstPersonCamera(pos, yaw, pitch)
      return
    }
    if (firstPositionUpdate && Number.isFinite(pos.x) && Number.isFinite(pos.y) && Number.isFinite(pos.z)) {
      controls.target.set(pos.x, pos.y, pos.z)
      viewer.camera.position.set(pos.x + 7, pos.y + 10, pos.z + 12)
      controls.update()
      firstPositionUpdate = false
    }
    if (addMesh) {
      if (!botMesh) {
        botMesh = new Entity('26.3', 'player', viewer.scene).mesh
        botMesh.position.set(pos.x, pos.y, pos.z)
        viewer.scene.add(botMesh)
      } else {
        new TWEEN.Tween(botMesh.position).to({ x: pos.x, y: pos.y, z: pos.z }, 50).start()
      }

      const da = (yaw - botMesh.rotation.y) % (Math.PI * 2)
      const dy = 2 * da % (Math.PI * 2) - da
      new TWEEN.Tween(botMesh.rotation).to({ y: botMesh.rotation.y + dy }, 50).start()
    }
  })
})
