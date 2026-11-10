'use strict'

// minecraft-data's 26.3 tints.json stores zero as a sentinel for the vanilla
// temperature/downfall colormap path. RGB(0,0,0) is NOT the intended foliage
// or grass colour. Resolve those entries from Mojang's 26.3 colormap PNGs
// when the package is built, not once per rendered block in the Web Worker.
const path = require('path')
const fs = require('fs-extra')
const { createCanvas, Image } = require('canvas')
const minecraftData = require('minecraft-data')

const rainfallAliases = {
  cherry_grove: 'flower_forest',
  dappled_forest: 'forest',
  deep_dark: 'plains',
  dripstone_caves: 'plains',
  frozen_peaks: 'snowy_mountains',
  grove: 'snowy_taiga',
  jagged_peaks: 'snowy_mountains',
  lush_caves: 'jungle',
  mangrove_swamp: 'swamp',
  meadow: 'plains',
  old_growth_birch_forest: 'tall_birch_forest',
  old_growth_pine_taiga: 'giant_tree_taiga',
  old_growth_spruce_taiga: 'giant_spruce_taiga',
  pale_garden: 'forest',
  snowy_plains: 'snowy_tundra',
  snowy_slopes: 'snowy_mountains',
  sparse_jungle: 'jungle_edge',
  stony_peaks: 'mountains',
  stony_shore: 'stone_shore',
  sulfur_caves: 'plains',
  windswept_forest: 'wooded_mountains',
  windswept_gravelly_hills: 'gravelly_mountains',
  windswept_hills: 'mountains',
  windswept_savanna: 'shattered_savanna',
  wooded_badlands: 'wooded_badlands_plateau'
}

function clamp (value) {
  return Math.max(0, Math.min(1, value))
}

function loadColormap (file) {
  if (!fs.existsSync(file)) throw new Error(`Missing Mojang biome colormap: ${file}`)
  const image = new Image()
  image.src = fs.readFileSync(file)
  if (image.width !== 256 || image.height !== 256) {
    throw new Error(`Unexpected biome colormap size: ${image.width}x${image.height}`)
  }
  const canvas = createCanvas(image.width, image.height)
  const context = canvas.getContext('2d')
  context.drawImage(image, 0, 0)
  return context.getImageData(0, 0, image.width, image.height).data
}

function sampleColormap (pixels, temperature, rainfall) {
  // Vanilla GrassColor / FoliageColor: x=(1-temperature)*255,
  // y=(1-temperature*downfall)*255, sampled from the 256x256 colormap.
  const t = clamp(temperature)
  const wetness = clamp(rainfall) * t
  const x = Math.floor((1 - t) * 255)
  const y = Math.floor((1 - wetness) * 255)
  const i = (y * 256 + x) * 4
  return [pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255]
}

function fixedColor (argb) {
  return [
    ((argb >>> 16) & 255) / 255,
    ((argb >>> 8) & 255) / 255,
    (argb & 255) / 255
  ]
}

function modifyDarkForestGrass (rgb) {
  // Vanilla GrassColorModifier.DARK_FOREST:
  // ((baseGrass & 0xFEFEFE) + 0x28340A) >> 1.
  // minecraft-data records only 0x141A05, the additive half-offset,
  // so interpreting it as a full grass RGB makes the ground nearly black.
  const r = Math.round(rgb[0] * 255)
  const g = Math.round(rgb[1] * 255)
  const b = Math.round(rgb[2] * 255)
  const original = (r << 16) | (g << 8) | b
  const modified = (((original & 0xfefefe) + 0x28340a) >>> 1) & 0xffffff
  return fixedColor(modified)
}

function generateBiomeTints (assetsDir) {
  const mc26 = minecraftData('26.3')
  const mcLegacy = minecraftData('1.16.2')
  if (!mc26?.tints || !mc26?.biomesByName || !mcLegacy?.biomesByName) {
    throw new Error('Missing Minecraft biome data needed to resolve 26.3 tint colours')
  }

  const colormaps = {
    grass: loadColormap(path.join(assetsDir, 'colormap', 'grass.png')),
    foliage: loadColormap(path.join(assetsDir, 'colormap', 'foliage.png'))
  }

  const colors = {}
  let dynamicCount = 0
  for (const [kind, records] of Object.entries(mc26.tints)) {
    const resolved = {}
    for (const { keys, color } of records.data) {
      for (const key of keys) {
        const needsColormap = colormaps[kind] && (
          color === 0 ||
          (kind === 'grass' && key === 'dark_forest' && (color & 0xffffff) === 0x141a05)
        )
        if (needsColormap) {
          const biome = mc26.biomesByName[key]
          if (!biome) throw new Error(`Unknown biome in 26.3 tint palette: ${key}`)
          const oldName = rainfallAliases[key] || key
          const oldBiome = mcLegacy.biomesByName[oldName]
          // Newer minecraft-data exposes temperature but omits downfall.
          // Use the preceding biome's rainfall, or its nearest analogue.
          const rainfall = oldBiome?.rainfall ?? (biome.has_precipitation ? 0.5 : 0)
          const vanillaColor = sampleColormap(colormaps[kind], biome.temperature, rainfall)
          resolved[key] = kind === 'grass' && key === 'dark_forest'
            ? modifyDarkForestGrass(vanillaColor)
            : vanillaColor
          dynamicCount++
        } else {
          resolved[key] = fixedColor(color)
        }
      }
    }
    resolved.default = records.default == null || records.default === 0
      ? (colormaps[kind] ? sampleColormap(colormaps[kind], 0.8, 0.5) : [1, 1, 1])
      : fixedColor(records.default)
    colors[kind] = resolved
  }

  const output = path.resolve(__dirname, '../viewer/lib/biome-tints-26.3.json')
  fs.writeJSONSync(output, colors, { spaces: 2 })
  console.log(`Resolved ${dynamicCount} vanilla biome colormap colours for Minecraft 26.3`)
  return colors
}

module.exports = { generateBiomeTints }
