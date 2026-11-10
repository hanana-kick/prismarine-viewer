'use strict'

const path = require('path')
const { makeTextureAtlas } = require('./lib/atlas')
const { prepareBlocksStates } = require('./lib/modelsBuilder')
const mcAssets = require('minecraft-assets')
const Chunks = require('prismarine-chunk')
const fs = require('fs-extra')
const { supportedVersions } = require('./lib/version')
const targetVersions = process.env.PRISMARINE_VIEWER_TARGET_VERSIONS
  ? process.env.PRISMARINE_VIEWER_TARGET_VERSIONS.split(',').map(s => s.trim())
  : supportedVersions
for (const v of targetVersions) {
  if (!supportedVersions.includes(v)) throw new Error(`Unknown viewer build version: ${v}`)
}

const publicPath = path.resolve(__dirname, '../public')
const texturesPath = path.join(publicPath, 'textures')
const blockStatesPath = path.join(publicPath, 'blocksStates')
const force = process.env.PRISMARINE_VIEWER_FORCE_BUILD === '1'

function assetsFor (version) {
  if (version !== '26.3') {
    const assets = mcAssets(version)
    if (!assets) throw new Error(`Missing minecraft-assets data for ${version}`)
    return assets
  }

  const directory = process.env.PRISMARINE_MC26_ASSETS_DIR
  if (!directory) throw new Error('26.3 assets not extracted: run node scripts/prepare.js')

  const blocksStates = fs.readJSONSync(path.join(directory, 'blocks_states.json'))
  const blocksModels = fs.readJSONSync(path.join(directory, 'blocks_models.json'))
  return { directory, blocksStates, blocksModels }
}

function main () {
  fs.ensureDirSync(publicPath)
  fs.ensureDirSync(texturesPath)
  fs.ensureDirSync(blockStatesPath)

  // The worker must receive the correct world bounds, including -64..319 in 26.3.
  const bounds = Object.fromEntries(targetVersions.map(version => {
    const chunk = new (Chunks(version))()
    return [version, { minY: chunk.minY ?? 0, worldHeight: chunk.worldHeight ?? 256 }]
  }))
  fs.writeJSONSync(path.join(publicPath, 'worldBounds.json'), bounds)

  for (const version of targetVersions) {
    const atlasPath = path.join(texturesPath, version + '.png')
    const statesPath = path.join(blockStatesPath, version + '.json')
    if (!force && fs.existsSync(atlasPath) && fs.existsSync(statesPath)) {
      console.log(`Using existing assets for ${version}`)
      continue
    }

    console.log(`Generating viewer assets for Minecraft ${version}`)
    const assets = assetsFor(version)
    const atlas = makeTextureAtlas(assets)
    fs.writeFileSync(atlasPath, atlas.image)
    const blockStates = prepareBlocksStates(assets, atlas)
    fs.writeJSONSync(statesPath, blockStates)
    fs.copySync(assets.directory, path.join(texturesPath, version), { overwrite: true })
    console.log(`Generated textures/${version}.png and blocksStates/${version}.json`)
  }
}

main()
