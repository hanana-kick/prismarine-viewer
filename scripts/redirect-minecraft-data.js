'use strict'

// minecraft-jar-extractor depends on the upstream minecraft-data package.
// During extraction only, resolve its data lookups through our 26.3-capable
// dependency. This leaves all other package imports untouched.
const Module = require('module')
const minecraftData = require('minecraft-data')
const gameData = minecraftData('26.3')
if (!gameData || !gameData.blocksArray || !gameData.itemsArray) {
  throw new Error('The installed minecraft-data package has no Minecraft 26.3 block/item registries')
}

const originalLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'minecraft-data' && parent && parent.filename.includes('minecraft-jar-extractor')) {
    return minecraftData
  }
  return originalLoad.apply(this, arguments)
}
