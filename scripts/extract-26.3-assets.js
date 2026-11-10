'use strict'

// Build the subset of Mojang's 26.3 assets that Prismarine Viewer actually
// consumes. The older minecraft-jar-extractor attempts to resolve item
// texture objects as strings and crashes on 26.3; this avoids that path.
const fs = require('fs-extra')
const path = require('path')
const extractZip = require('extract-zip')
const { downloadClient } = require('minecraft-wrap')
const mcData = require('minecraft-data')('26.3')

async function main () {
  const outputDir = path.resolve(process.argv[2])
  const temporaryDir = path.resolve(process.argv[3])
  if (!outputDir || !temporaryDir || !mcData?.blocksArray) {
    throw new Error('Usage: node scripts/extract-26.3-assets.js <output> <temp>')
  }

  fs.ensureDirSync(outputDir)
  fs.ensureDirSync(temporaryDir)

  const jarPath = path.join(temporaryDir, '26.3.jar')
  const clientDir = path.join(temporaryDir, 'client')
  await new Promise((resolve, reject) => {
    downloadClient('26.3', jarPath, err => err ? reject(err) : resolve())
  })
  fs.ensureDirSync(clientDir)
  await extractZip(jarPath, { dir: clientDir })

  const assetDir = path.join(clientDir, 'assets', 'minecraft')
  const blockStatesDir = path.join(assetDir, 'blockstates')
  const modelsDir = path.join(assetDir, 'models', 'block')
  const texturesDir = path.join(assetDir, 'textures')

  const blocksStates = {}
  let foundStates = 0
  for (const block of mcData.blocksArray) {
    const name = block.name.replace(/^minecraft:/, '')
    const file = path.join(blockStatesDir, name + '.json')
    if (fs.existsSync(file)) {
      blocksStates[name] = fs.readJSONSync(file)
      foundStates++
    } else {
      blocksStates[name] = null
    }
  }
  if (foundStates < 500) {
    throw new Error(`Only ${foundStates} 26.3 blockstates found in the Minecraft client JAR`)
  }

  const models = {}
  function readModels (dir, prefix = '') {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const filename = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        readModels(filename, prefix + entry.name + '/')
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        models[prefix + entry.name.slice(0, -5)] = fs.readJSONSync(filename)
      }
    }
  }
  readModels(modelsDir)

  if (Object.keys(models).length < 500) {
    throw new Error('Failed to extract Minecraft 26.3 block models')
  }

  fs.writeJSONSync(path.join(outputDir, 'blocks_states.json'), blocksStates)
  fs.writeJSONSync(path.join(outputDir, 'blocks_models.json'), models)
  for (const entry of fs.readdirSync(texturesDir)) {
    const dest = entry === 'block' ? 'blocks' : entry === 'item' ? 'items' : entry
    fs.copySync(path.join(texturesDir, entry), path.join(outputDir, dest), { overwrite: true })
  }
  if (!fs.existsSync(path.join(outputDir, 'blocks'))) {
    throw new Error('Minecraft client JAR did not contain block textures')
  }
  console.log(`Extracted Minecraft 26.3: ${foundStates} blockstates and ${Object.keys(models).length} models`)
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
