'use strict'

// Index vanilla Java 26.3 entity textures for the older Bedrock-based entity
// geometry definitions used by Prismarine Viewer. Asset names moved in 26.x,
// including steve -> player/wide/steve and pig -> pig/pig_temperate.
const fs = require('fs')
const path = require('path')
const definitions = require('../viewer/lib/entity/entities.json')

const aliases = {
  'entity/steve': 'entity/player/wide/steve',
  'entity/alex': 'entity/player/slim/alex',
  'entity/cow/cow': 'entity/cow/cow_temperate',
  'entity/cow/red_mooshroom': 'entity/cow/mooshroom_red',
  'entity/cow/brown_mooshroom': 'entity/cow/mooshroom_brown',
  'entity/pig/pig': 'entity/pig/pig_temperate',
  'entity/chicken': 'entity/chicken/chicken_temperate',
  'entity/sheep/sheep_fur': 'entity/sheep/sheep_wool',
  'entity/guardian': 'entity/guardian/guardian',
  'entity/guardian_elder': 'entity/guardian/elder_guardian',
  'entity/iron_golem': 'entity/iron_golem/iron_golem',
  'entity/witch': 'entity/witch/witch',
  'entity/bat': 'entity/bat/bat',
  'entity/blaze': 'entity/blaze/blaze',
  'entity/endermite': 'entity/endermite/endermite',
  'entity/experience_orb': 'entity/experience/experience_orb',
  'entity/boat/acacia': 'entity/boat/acacia',
  'entity/armorstand/wood': 'entity/armorstand/armorstand',
  'entity/turtle/big_sea_turtle': 'entity/turtle/turtle',
  'entity/llama/creamy': 'entity/llama/llama_creamy',
  'entity/llama/spit': 'entity/llama/llama_spit',
  'entity/fox/snow_fox': 'entity/fox/fox_snow',
  'entity/cat/white': 'entity/cat/cat_white',
  'entity/cat/tuxedo': 'entity/cat/cat_black',
  'entity/cat/tuxedo_tame': 'entity/cat/cat_black',
  'entity/cat/red': 'entity/cat/cat_red',
  'entity/cat/siamese': 'entity/cat/cat_siamese',
  'entity/cat/british_shorthair': 'entity/cat/cat_british_shorthair',
  'entity/cat/calico': 'entity/cat/cat_calico',
  'entity/cat/persian': 'entity/cat/cat_persian',
  'entity/cat/ragdoll': 'entity/cat/cat_ragdoll',
  'entity/cat/tabby': 'entity/cat/cat_tabby',
  'entity/cat/jellie': 'entity/cat/cat_jellie',
  'entity/cat/all_black': 'entity/cat/cat_all_black',
  'entity/panda/lazy_panda': 'entity/panda/panda_lazy',
  'entity/panda/worried_panda': 'entity/panda/panda_worried',
  'entity/panda/playful_panda': 'entity/panda/panda_playful',
  'entity/panda/brown_panda': 'entity/panda/panda_brown',
  'entity/panda/weak_panda': 'entity/panda/panda_weak',
  'entity/panda/aggressive_panda': 'entity/panda/panda_aggressive',
  'entity/rabbit/white_splotched': 'entity/rabbit/rabbit_white_splotched',
  'entity/rabbit/salt': 'entity/rabbit/rabbit_salt',
  'entity/rabbit/toast': 'entity/rabbit/rabbit_toast'
}

function walkImages (directory, prefix, output) {
  if (!fs.existsSync(directory)) return
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name)
    const relative = prefix + '/' + item.name
    if (item.isDirectory()) walkImages(full, relative, output)
    else if (item.isFile() && item.name.endsWith('.png')) output.add(relative.slice(0, -4))
  }
}

function getLegacyPath (value) {
  return value.replace(/^textures\//, '')
}

function resolveTexture (source, available) {
  const oldPath = getLegacyPath(source)
  if (available.has(oldPath)) return oldPath
  if (aliases[oldPath] && available.has(aliases[oldPath])) return aliases[oldPath]

  const base = path.posix.basename(oldPath)
  const candidates = Array.from(available).filter(candidate => {
    const name = path.posix.basename(candidate)
    return name === base || name === base + '_temperate'
  })
  if (!candidates.length) return null
  const oldDir = path.posix.dirname(oldPath)
  const score = candidate => {
    const parent = path.posix.dirname(candidate)
    let points = 0
    if (parent === oldDir) points += 30
    if (parent.startsWith(oldDir + '/')) points += 12
    if (candidate.endsWith('/' + base)) points += 8
    if (candidate.endsWith('_temperate')) points += 5
    if (/baby|_armor|_overlay|_eyes|glow/.test(candidate)) points -= 20
    return points
  }
  candidates.sort((a, b) => score(b) - score(a) || a.localeCompare(b))
  return candidates[0]
}

function findDefaultTexture (name, available) {
  if (name === 'cat' && available.has('entity/cat/cat_white')) {
    return 'entity/cat/cat_white'
  }
  if (name === 'armor_stand' && available.has('entity/armorstand/armorstand')) {
    return 'entity/armorstand/armorstand'
  }
  if (name === 'turtle' && available.has('entity/turtle/turtle')) {
    return 'entity/turtle/turtle'
  }
  if (name === 'mooshroom' && available.has('entity/cow/mooshroom_red')) {
    return 'entity/cow/mooshroom_red'
  }
  if (name === 'chicken' && available.has('entity/chicken/chicken_temperate')) {
    return 'entity/chicken/chicken_temperate'
  }
  if (name === 'pig' && available.has('entity/pig/pig_temperate')) {
    return 'entity/pig/pig_temperate'
  }
  if (name === 'cow' && available.has('entity/cow/cow_temperate')) {
    return 'entity/cow/cow_temperate'
  }
  if (name === 'player' || name === 'player_slim') {
    const key = name === 'player_slim' ? 'entity/player/slim/alex' : 'entity/player/wide/steve'
    return available.has(key) ? key : null
  }
  const directory = 'entity/' + name + '/'
  const base = name.replace(/_baby$/, '')
  const options = Array.from(available).filter(candidate => candidate.startsWith(directory))
  const rank = candidate => {
    const leaf = path.posix.basename(candidate)
    let score = 0
    if (leaf === base) score += 100
    if (leaf === base + '_temperate') score += 90
    if (leaf.startsWith(base + '_')) score += 25
    if (/baby|_armor|_overlay|_eyes|glow|angry|tame|saddle/.test(leaf)) score -= 60
    if (candidate.split('/').length === 3) score += 10
    return score
  }
  options.sort((a, b) => rank(b) - rank(a) || a.localeCompare(b))
  if (options.length) return options[0]
  // Older entities commonly have a flat file under entity/ rather than a folder.
  const key = 'entity/' + name
  return available.has(key) ? key : null
}

function generateEntityTextureMap (assetsDirectory) {
  const available = new Set()
  for (const subdir of ['entity', 'items', 'misc']) {
    walkImages(path.join(assetsDirectory, subdir), subdir, available)
  }
  const textures = {}
  for (const entity of Object.values(definitions)) {
    for (const source of Object.values(entity.textures || {})) {
      if (typeof source !== 'string' || textures[source]) continue
      const matched = resolveTexture(source, available)
      if (matched) textures[source] = 'textures/26.3/' + matched + '.png'
    }
  }
  const defaults = {}
  for (const name of Object.keys(definitions)) {
    const matched = findDefaultTexture(name, available)
    if (matched) defaults[name] = 'textures/26.3/' + matched + '.png'
  }

  // New Java Edition entity types can use a compatible existing rig while
  // dedicated geometry is pending. Their textures still come from 26.3.
  for (const name of [
    'allay', 'armadillo', 'axolotl', 'bogged', 'breeze', 'camel', 'camel_husk',
    'copper_golem', 'creaking', 'frog', 'glow_squid', 'goat', 'happy_ghast',
    'mannequin', 'nautilus', 'parched', 'sniffer', 'sulfur_cube', 'tadpole',
    'trader_llama', 'warden', 'zombie_nautilus'
  ]) {
    const matched = findDefaultTexture(name, available)
    if (matched) defaults[name] = 'textures/26.3/' + matched + '.png'
  }

  const total = new Set(Object.values(definitions).flatMap(e => Object.values(e.textures || {}))).size
  const manifest = { textures, defaults }
  const file = path.join(__dirname, '../viewer/lib/entity/texture-map-26.3.json')
  fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n')
  console.log(`26.3 entity textures: ${Object.keys(textures).length}/${total} legacy paths mapped, ${Object.keys(defaults).length} entity defaults`)
  if (!defaults.player || !defaults.player_slim || !textures['textures/entity/creeper/creeper']) {
    throw new Error('Essential player and creeper textures are missing')
  }
  return manifest
}

module.exports = { generateEntityTextureMap }
