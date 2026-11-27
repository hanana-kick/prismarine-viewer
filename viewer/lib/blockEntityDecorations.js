const { createHeadModel } = require('./blockEntityHeads')
const { createBannerModel } = require('./blockEntityBanners')
const { createArtifactModel } = require('./blockEntityArtifacts')

function createDecorationModel (entry, version) {
  if (!entry?.name) return null
  return createHeadModel(entry, version) || createBannerModel(entry, version) || createArtifactModel(entry, version)
}

module.exports = { createDecorationModel }
