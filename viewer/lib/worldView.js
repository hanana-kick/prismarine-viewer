const { spiral, ViewRect, chunkPos } = require('./simpleUtils')
const { Vec3 } = require('vec3')
const EventEmitter = require('events')
// Numeric state ids need prismarine-block only on the Node/mineflayer side.
// Keep it out of the browser bundle; the registry fallback still preserves the name.
/* eslint-disable no-eval */
const prismarineBlock = typeof window === 'undefined' ? eval('require')('prismarine-block') : null
/* eslint-enable no-eval */

const blockClasses = {}

// Skin and cape texture URLs of a player entity (textures.minecraft.net on
// online-mode servers); nothing for other entities or players without skin data
function playerSkin (bot, e) {
  const skinData = e.username !== undefined && bot.players[e.username]?.skinData
  if (!skinData) return { skinModel: defaultSkinModel(e.uuid) }
  return { skin: skinData.url, skinModel: skinData.model, cape: skinData.capeUrl }
}

// Vanilla's DefaultPlayerSkin: a player without skin data is Alex when the Java hashCode of
// their UUID is odd, which is the xor of the lowest bit of each 32-bit quarter.
function defaultSkinModel (uuid) {
  if (typeof uuid !== 'string') return undefined
  const hex = uuid.replace(/-/g, '')
  if (hex.length !== 32) return undefined
  const odd = [7, 15, 23, 31].reduce((acc, i) => acc ^ parseInt(hex[i], 16), 0) & 1
  return odd ? 'slim' : undefined
}

function metadataValues (entity) {
  if (!entity.metadata) return []
  const values = Array.isArray(entity.metadata) ? entity.metadata : Object.values(entity.metadata)
  return values.map(value => value && typeof value === 'object' && 'value' in value && 'key' in value ? value.value : value)
}

function itemSlot (registry, slot) {
  if (!slot || typeof slot !== 'object') return undefined
  if (slot.present === false) return undefined
  if (slot.itemCount === 0 || slot.count === 0) return { itemName: null }
  if (typeof slot.name === 'string') return { itemName: slot.name.replace(/^minecraft:/, '') }
  const id = slot.itemId ?? slot.blockId
  if (id === undefined || id < 0) return undefined
  const name = registry.items[id]?.name || registry.itemsByName?.[id]?.name
  return name ? { itemName: name } : undefined
}

function firstItemSlot (registry, entity) {
  const keys = registry.entitiesByName?.[entity.name]?.metadataKeys
  let slots = metadataValues(entity)
  if (keys) {
    const index = keys.indexOf('item')
    if (index >= 0 && entity.metadata[index] !== undefined) slots = [entity.metadata[index]]
  }
  for (const slot of slots) {
    const item = itemSlot(registry, slot)
    if (item) return item
  }
  return undefined
}

// A dropped item's stack lives in the entity's metadata, keyed by the raw metadata index.
function droppedItemName (registry, entity) {
  if (entity.name !== 'item') return undefined
  return firstItemSlot(registry, entity)?.itemName || undefined
}

function metadataAt (entity, names, index) {
  if (!entity.metadata) return undefined
  for (const name of names) {
    if (entity.metadata[name] !== undefined) return entity.metadata[name]
  }
  return entity.metadata[index]
}

function safeVector (value, quaternion = false) {
  if (Array.isArray(value)) return value.slice(0, quaternion ? 4 : 3).map(Number)
  if (!value || typeof value !== 'object') return undefined
  const result = { x: Number(value.x) || 0, y: Number(value.y) || 0, z: Number(value.z) || 0 }
  if (quaternion) result.w = Number(value.w ?? 1)
  return result
}

function safeComponent (value, depth = 0) {
  if (value === null || value === undefined) return value
  if (typeof value === 'string' || typeof value === 'number') return value
  if (depth > 8) return undefined
  if (Array.isArray(value)) return value.map(entry => safeComponent(entry, depth + 1)).filter(entry => entry !== undefined)
  if (typeof value !== 'object') return String(value)
  const result = {}
  for (const key of ['text', 'translate', 'extra', 'color', 'bold', 'italic', 'underlined', 'strikethrough', 'obfuscated', 'insertion']) {
    if (value[key] === undefined) continue
    result[key] = key === 'text' || key === 'translate' || key === 'extra'
      ? safeComponent(value[key], depth + 1)
      : value[key]
  }
  if (!Object.keys(result).length && value.value !== undefined) return safeComponent(value.value, depth + 1)
  return result
}

function blockState (bot, value) {
  if (typeof value === 'string') {
    const match = value.match(/^(?:minecraft:)?([^[]+)(?:\[([^]]+)\])?$/)
    if (!match || !bot.registry.blocksByName[match[1]]) return undefined
    const properties = {}
    if (match[2]) {
      for (const part of match[2].split(',')) {
        const [key, property] = part.split('=')
        if (key && property !== undefined) properties[key.trim()] = property.trim()
      }
    }
    return { name: match[1], properties }
  }
  if (value && typeof value === 'object') {
    if (value.Name || value.name) return { name: String(value.Name || value.name).replace(/^minecraft:/, ''), properties: value.Properties || value.properties || {} }
    value = value.stateId ?? value.blockState ?? value.value
  }
  if (!Number.isInteger(value) || value < 0 || !bot.registry.blocksByStateId?.[value]) return undefined
  try {
    if (!blockClasses[bot.version]) blockClasses[bot.version] = prismarineBlock(bot.version)
    const block = blockClasses[bot.version].fromStateId(value, 0)
    return { name: block.name, properties: block.getProperties() }
  } catch {
    return { name: bot.registry.blocksByStateId[value].name, properties: {} }
  }
}

function displayData (entity) {
  const result = {}
  const vectors = [
    ['translation', ['translation'], 11, false], ['scale', ['scale'], 12, false],
    ['leftRotation', ['left_rotation', 'leftRotation'], 13, true],
    ['rightRotation', ['right_rotation', 'rightRotation'], 14, true]
  ]
  for (const [field, names, index, quaternion] of vectors) {
    const value = safeVector(metadataAt(entity, names, index), quaternion)
    if (value) result[field] = value
  }
  const billboard = metadataAt(entity, ['billboard', 'billboard_constraints'], 15)
  if (typeof billboard === 'number' || typeof billboard === 'string') result.billboard = billboard
  const context = metadataAt(entity, ['item_display_context', 'displayContext'], 24)
  if (entity.name === 'item_display' && (typeof context === 'number' || typeof context === 'string')) result.itemDisplayContext = context
  return result
}

// Extract only fields used by the special renderers. In 26.3 metadataKeys is
// absent, so the vanilla raw slot positions are used alongside conservative
// shape checks; the raw metadata object itself never crosses the worker.
function specialEntityData (bot, entity) {
  const result = {}
  if (entity.name === 'falling_block' || entity.name === 'block_display') {
    const first = metadataAt(entity, ['block_state', 'blockState'], entity.name === 'block_display' ? 23 : 8)
    let state = blockState(bot, first)
    if (!state) {
      for (const value of metadataValues(entity)) {
        if (!value || typeof value !== 'object') continue
        if (value.Name === undefined && value.name === undefined && value.stateId === undefined && value.blockState === undefined) continue
        state = blockState(bot, value)
        if (state) break
      }
    }
    if (state) result.blockState = state
  }

  if (['item', 'item_frame', 'glow_item_frame', 'item_display', 'splash_potion', 'lingering_potion', 'ominous_item_spawner'].includes(entity.name)) {
    const item = firstItemSlot(bot.registry, entity)
    if (item) result.itemName = item.itemName
  }
  if (entity.name === 'item_frame' || entity.name === 'glow_item_frame') {
    const rotation = metadataAt(entity, ['rotation', 'frameRotation'], 9)
    if (Number.isInteger(rotation) && rotation >= 0 && rotation <= 7) result.frameRotation = rotation
    if (entity.facing !== undefined || entity.direction !== undefined) result.facing = entity.facing ?? entity.direction
  }
  if (entity.name === 'block_display' || entity.name === 'item_display' || entity.name === 'text_display') Object.assign(result, displayData(entity))

  if (entity.name === 'text_display') {
    const text = safeComponent(metadataAt(entity, ['text', 'textComponent'], 23))
    if (text !== undefined) result.text = text
    const lineWidth = metadataAt(entity, ['line_width', 'lineWidth'], 24)
    if (Number.isFinite(lineWidth) && lineWidth > 0) result.lineWidth = lineWidth
    const background = metadataAt(entity, ['background_color', 'background'], 25)
    if (Number.isFinite(background) || typeof background === 'string') result.background = background
    const opacity = metadataAt(entity, ['text_opacity', 'textOpacity'], 26)
    if (Number.isFinite(opacity)) result.textOpacity = opacity
    const flags = metadataAt(entity, ['style_flags', 'styleFlags'], 27)
    if (Number.isInteger(flags)) {
      result.shadow = !!(flags & 1)
      result.seeThrough = !!(flags & 2)
      if (!(flags & 4) && background === undefined) result.background = 0x40000000
      result.alignment = ['center', 'left', 'right'][(flags >> 3) & 3] || 'center'
    }
  }

  if (entity.name === 'painting') {
    const variant = metadataAt(entity, ['variant', 'painting_variant'], 8)
    const inline = variant?.variantData || variant?.data || variant
    const name = inline?.assetId || inline?.asset_id || inline?.name
    if (typeof name === 'string') result.paintingName = name.replace(/^minecraft:/, '').replace(/^painting\//, '')
    if (Number.isFinite(inline?.width)) result.paintingWidth = inline.width
    if (Number.isFinite(inline?.height)) result.paintingHeight = inline.height
    if (entity.facing !== undefined || entity.direction !== undefined) result.facing = entity.facing ?? entity.direction
  }
  if (entity.name === 'cushion') {
    const color = metadataAt(entity, ['color', 'dye_color'], 8)
    if (typeof color === 'string' || (Number.isInteger(color) && color >= 0 && color < 16)) result.color = color
  }
  if (entity.name === 'area_effect_cloud') {
    const radius = metadataAt(entity, ['radius'], 8)
    const color = metadataAt(entity, ['color', 'particleColor'], 9)
    if (Number.isFinite(radius) && radius > 0) result.radius = radius
    if (Number.isFinite(color)) result.particleColor = color
  }
  if (entity.name === 'end_crystal' && entity.showBottom !== undefined) result.showBottom = !!entity.showBottom
  return result
}

function spawnData (bot, entity) {
  return {
    id: entity.id,
    name: entity.name,
    pos: entity.position,
    width: entity.width,
    height: entity.height,
    username: entity.username,
    riding: !!entity.vehicle,
    itemName: droppedItemName(bot.registry, entity),
    ...specialEntityData(bot, entity),
    ...playerSkin(bot, entity)
  }
}

class WorldView extends EventEmitter {
  constructor (world, viewDistance, position = new Vec3(0, 0, 0), emitter = null) {
    super()
    this.world = world
    this.viewDistance = viewDistance
    this.loadedChunks = {}
    // loadChunk awaits the world, so a load can finish after its column was unloaded or the world
    // was replaced. Each load records a token under its column key and the world generation it read
    // from; it only emits if both are still current once the column arrives.
    this.pendingLoads = {}
    this.nextLoadToken = 0
    this.worldGeneration = 0
    this.lastPos = new Vec3(0, 0, 0).update(position)
    this.emitter = emitter || this

    this.listeners = {}
    this.emitter.on('mouseClick', async (click) => {
      const ori = new Vec3(click.origin.x, click.origin.y, click.origin.z)
      const dir = new Vec3(click.direction.x, click.direction.y, click.direction.z)
      const block = this.world.raycast(ori, dir, 256)
      if (!block) return
      this.emit('blockClicked', block, block.face, click.button)
    })
  }

  listenToBot (bot) {
    const worldView = this
    this.listeners[bot.username] = {
      // 'move': botPosition,
      entitySpawn: function (e) {
        if (e === bot.entity) return
        worldView.emitter.emit('entity', spawnData(bot, e))
      },
      entityUpdate: function (e) {
        const data = specialEntityData(bot, e)
        const itemName = droppedItemName(bot.registry, e)
        if (itemName !== undefined) data.itemName = itemName
        if (Object.keys(data).length) worldView.emitter.emit('entity', { id: e.id, pos: e.position, ...data })
      },
      entityMoved: function (e) {
        worldView.emitter.emit('entity', { id: e.id, pos: e.position, pitch: e.pitch, yaw: e.yaw })
      },
      entityAttach: function (e) {
        worldView.emitter.emit('entity', { id: e.id, riding: true })
      },
      entityDetach: function (e) {
        worldView.emitter.emit('entity', { id: e.id, riding: false })
      },
      entityHurt: function (e) {
        worldView.emitter.emit('entity', { id: e.id, hurt: true })
      },
      entityGone: function (e) {
        worldView.emitter.emit('entity', { id: e.id, delete: true })
      },
      chunkColumnLoad: function (pos) {
        worldView.loadChunk(pos)
      },
      chunkColumnUnload: function (pos) {
        worldView.unloadChunk(pos)
      },
      // A dimension change or server transfer unloads every column (each arrives above as a
      // chunkColumnUnload) and may replace bot.world with a fresh object; follow it so chunks that
      // load afterwards are read from the world the bot is now in, not the one it left.
      login: function () {
        worldView.setWorld(bot.world)
      },
      blockUpdate: function (oldBlock, newBlock) {
        const stateId = newBlock.stateId ? newBlock.stateId : ((newBlock.type << 4) | newBlock.metadata)
        worldView.emitter.emit('blockUpdate', { pos: oldBlock.position, stateId })
      }
    }

    for (const [evt, listener] of Object.entries(this.listeners[bot.username])) {
      bot.on(evt, listener)
    }

    for (const id in bot.entities) {
      const e = bot.entities[id]
      if (e && e !== bot.entity) {
        this.emitter.emit('entity', spawnData(bot, e))
      }
    }
  }

  removeListenersFromBot (bot) {
    for (const [evt, listener] of Object.entries(this.listeners[bot.username])) {
      bot.removeListener(evt, listener)
    }
    delete this.listeners[bot.username]
  }

  async init (pos) {
    const [botX, botZ] = chunkPos(pos)

    const positions = []
    spiral(this.viewDistance * 2, this.viewDistance * 2, (x, z) => {
      const p = new Vec3((botX + x) * 16, 0, (botZ + z) * 16)
      positions.push(p)
    })

    this.lastPos.update(pos)
    await this._loadChunks(positions)
  }

  async _loadChunks (positions, sliceSize = 5, waitTime = 0) {
    for (let i = 0; i < positions.length; i += sliceSize) {
      await new Promise((resolve) => setTimeout(resolve, waitTime))
      await Promise.all(positions.slice(i, i + sliceSize).map(p => this.loadChunk(p)))
    }
  }

  setWorld (world) {
    this.world = world
    this.worldGeneration++
  }

  async loadChunk (pos) {
    const [botX, botZ] = chunkPos(this.lastPos)
    const dx = Math.abs(botX - Math.floor(pos.x / 16))
    const dz = Math.abs(botZ - Math.floor(pos.z / 16))
    if (dx < this.viewDistance && dz < this.viewDistance) {
      const key = `${pos.x},${pos.z}`
      const token = ++this.nextLoadToken
      const generation = this.worldGeneration
      this.pendingLoads[key] = token
      const column = await this.world.getColumnAt(pos)
      if (this.pendingLoads[key] !== token || this.worldGeneration !== generation) return
      delete this.pendingLoads[key]
      if (column) {
        const chunk = column.toJson()
        this.emitter.emit('loadChunk', { x: pos.x, z: pos.z, chunk })
        this.loadedChunks[key] = true
      }
    }
  }

  unloadChunk (pos) {
    this.emitter.emit('unloadChunk', { x: pos.x, z: pos.z })
    delete this.loadedChunks[`${pos.x},${pos.z}`]
    delete this.pendingLoads[`${pos.x},${pos.z}`]
  }

  async updatePosition (pos, force = false) {
    const [lastX, lastZ] = chunkPos(this.lastPos)
    const [botX, botZ] = chunkPos(pos)
    if (lastX !== botX || lastZ !== botZ || force) {
      const newView = new ViewRect(botX, botZ, this.viewDistance)
      for (const coords of Object.keys(this.loadedChunks)) {
        const x = parseInt(coords.split(',')[0])
        const z = parseInt(coords.split(',')[1])
        const p = new Vec3(x, 0, z)
        if (!newView.contains(Math.floor(x / 16), Math.floor(z / 16))) {
          this.unloadChunk(p)
        }
      }
      const positions = []
      spiral(this.viewDistance * 2, this.viewDistance * 2, (x, z) => {
        const p = new Vec3((botX + x) * 16, 0, (botZ + z) * 16)
        if (!this.loadedChunks[`${p.x},${p.z}`]) {
          positions.push(p)
        }
      })
      this.lastPos.update(pos)
      await this._loadChunks(positions)
    } else {
      this.lastPos.update(pos)
    }
  }
}

module.exports = { WorldView }
