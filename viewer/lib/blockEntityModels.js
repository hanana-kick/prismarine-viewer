const { createContainerModel } = require('./blockEntityContainers')
const { createDecorationModel } = require('./blockEntityDecorations')
const { createEffectModel } = require('./blockEntityEffects')

// Build a model for blocks whose vanilla blockstate intentionally has no baked
// elements. Each family returns null for names it does not own.
function createBlockEntityMesh (entry, version) {
  if (!entry || !entry.name) return null
  return createContainerModel(entry, version) ||
    createDecorationModel(entry, version) ||
    createEffectModel(entry, version)
}

module.exports = { createBlockEntityMesh }
