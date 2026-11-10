'use strict'

// The worker needs 26.3 only; do not bundle every legacy Minecraft version.
module.exports = {
  pc: {
    '26.3': {
      get attributes () { return require('minecraft-data/minecraft-data/data/pc/26.3/attributes.json') },
      get blockCollisionShapes () { return require('minecraft-data/minecraft-data/data/pc/26.3/blockCollisionShapes.json') },
      get blocks () { return require('minecraft-data/minecraft-data/data/pc/26.3/blocks.json') },
      get blockLoot () { return require('minecraft-data/minecraft-data/data/pc/1.20/blockLoot.json') },
      get biomes () { return require('minecraft-data/minecraft-data/data/pc/26.3/biomes.json') },
      get commands () { return require('minecraft-data/minecraft-data/data/pc/1.20.3/commands.json') },
      get effects () { return require('minecraft-data/minecraft-data/data/pc/26.3/effects.json') },
      get enchantments () { return require('minecraft-data/minecraft-data/data/pc/26.3/enchantments.json') },
      get entities () { return require('minecraft-data/minecraft-data/data/pc/26.3/entities.json') },
      get entityLoot () { return require('minecraft-data/minecraft-data/data/pc/1.20/entityLoot.json') },
      get foods () { return require('minecraft-data/minecraft-data/data/pc/26.3/foods.json') },
      get instruments () { return require('minecraft-data/minecraft-data/data/pc/26.3/instruments.json') },
      get items () { return require('minecraft-data/minecraft-data/data/pc/26.3/items.json') },
      get language () { return require('minecraft-data/minecraft-data/data/pc/26.3/language.json') },
      get loginPacket () { return require('minecraft-data/minecraft-data/data/pc/26.1/loginPacket.json') },
      get mapIcons () { return require('minecraft-data/minecraft-data/data/pc/1.20.2/mapIcons.json') },
      get materials () { return require('minecraft-data/minecraft-data/data/pc/26.3/materials.json') },
      get particles () { return require('minecraft-data/minecraft-data/data/pc/26.3/particles.json') },
      get protocol () { return require('minecraft-data/minecraft-data/data/pc/26.3/protocol.json') },
      get recipes () { return require('minecraft-data/minecraft-data/data/pc/26.3/recipes.json') },
      get sounds () { return require('minecraft-data/minecraft-data/data/pc/26.3/sounds.json') },
      get tints () { return require('minecraft-data/minecraft-data/data/pc/26.3/tints.json') },
      get version () { return require('minecraft-data/minecraft-data/data/pc/26.3/version.json') },
      get windows () { return require('minecraft-data/minecraft-data/data/pc/1.16.1/windows.json') },
      proto: ''
    }
  },
  bedrock: {}
}
