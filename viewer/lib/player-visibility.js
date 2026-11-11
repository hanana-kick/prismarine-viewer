'use strict'

const THREE = require('three')

// Keep the local bot findable when the observer camera is above dense trees.
// Draw the actual player mesh through blocking chunks only while occluded;
// restore vanilla depth testing as soon as the line of sight clears.
function updatePlayerVisibility (camera, worldRenderer, player) {
  if (!camera || !player) return false
  const target = player.position.clone().add(new THREE.Vector3(0, 0.9, 0))
  const vector = target.sub(camera.position)
  const distance = vector.length()
  const blocks = Object.values(worldRenderer?.sectionMeshs || {})
  let occluded = false
  if (distance > 0.5 && blocks.length) {
    const ray = new THREE.Raycaster(camera.position, vector.normalize(), 0.05, distance - 0.35)
    occluded = ray.intersectObjects(blocks, false).length > 0
  }
  if (player.userData.playerOccluded === occluded) return occluded
  player.userData.playerOccluded = occluded

  player.traverse(object => {
    if (!object.isMesh) return
    if (object.userData.originalRenderOrder === undefined) {
      object.userData.originalRenderOrder = object.renderOrder
    }
    object.renderOrder = occluded ? 1000 : object.userData.originalRenderOrder
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue
      if (!object.userData.originalMaterialDepth) object.userData.originalMaterialDepth = new Map()
      if (!object.userData.originalMaterialDepth.has(material)) {
        object.userData.originalMaterialDepth.set(material, {
          depthTest: material.depthTest,
          depthWrite: material.depthWrite
        })
      }
      const original = object.userData.originalMaterialDepth.get(material)
      material.depthTest = occluded ? false : original.depthTest
      material.depthWrite = occluded ? false : original.depthWrite
      material.needsUpdate = true
    }
  })
  return occluded
}

module.exports = { updatePlayerVisibility }
