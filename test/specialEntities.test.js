/**
 * @jest-environment node
 */
/* eslint-env jest */
const THREE = require('three')

const textureLoads = []
jest.mock('../viewer/lib/utils', () => ({
  loadJSON: (url, onLoad) => {
    if (url.startsWith('blocksStates/')) {
      const texture = { u: 0, v: 0, su: 1, sv: 1 }
      const faces = {}
      for (const face of ['down', 'up', 'north', 'south', 'west', 'east']) faces[face] = { texture }
      const model = { ao: false, textures: { particle: texture }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces }] }
      return onLoad({ pale_oak_planks: { variants: { '': { model } } } })
    }
    onLoad([
      { name: 'diamond', texture: 'minecraft:items/diamond' },
      { name: 'pale_oak_planks', texture: 'minecraft:block/pale_oak_planks' }
    ])
  },
  loadPixels: (path, onLoad) => onLoad({ width: 1, height: 1, data: [255, 255, 255, 255] }),
  loadTexture: (path, onLoad) => textureLoads.push({ path, onLoad })
}))

const { createSpecialEntity, specialEntityTypes } = require('../viewer/lib/entity/special')
const { getItemMesh } = require('../viewer/lib/entity/Item')
const flush = () => new Promise(resolve => setImmediate(resolve))

function meshCount (root) {
  let count = 0
  root.traverse(object => { if (object.isMesh || object.isSprite) count++ })
  return count
}

describe('special entity renderers', () => {
  beforeEach(() => { textureLoads.length = 0 })

  test('every special type builds a named root without using a rig placeholder', () => {
    for (const type of specialEntityTypes) {
      if (type === 'falling_block' || type === 'block_display' || type === 'tnt') continue
      const root = createSpecialEntity(type, '26.3')
      expect(root.userData.specialType).toBe(type)
      expect(root.userData.unresolvedEntity).toBeUndefined()
      root.dispose()
    }
    expect(createSpecialEntity('firework_rocket', '26.3')).toBeNull()
    expect(createSpecialEntity('leash_knot', '26.3')).toBeNull()
    expect(createSpecialEntity('interaction', '26.3')).toBeNull()
  })

  test('a falling block uses the resolved model and atlas of its actual block state', async () => {
    const root = createSpecialEntity('falling_block', '26.3', {
      blockState: { name: 'pale_oak_planks', properties: {} }
    })
    await flush()
    const atlas = textureLoads.find(load => load.path === 'textures/26.3.png')
    if (atlas) atlas.onLoad(new THREE.Texture())
    await flush()

    expect(root.userData.blockState.name).toBe('pale_oak_planks')
    expect(root.children[0].userData.resolved).toBe(true)
    expect(meshCount(root)).toBeGreaterThan(0)
    root.dispose()
  })

  test('a block item also uses the real block model instead of a cube proxy', async () => {
    const group = getItemMesh('pale_oak_planks', '26.3', () => { throw new Error('fallback must not be used') })
    await flush()
    const atlas = textureLoads.find(load => load.path === 'textures/26.3.png')
    if (atlas) atlas.onLoad(new THREE.Texture())
    await flush()

    const block = group.item.pivot.children[0]
    expect(block.userData.blockName).toBe('pale_oak_planks')
    expect(block.userData.resolved).toBe(true)
    expect(group.item.size).toBe(0.25)
    group.dispose()
  })

  test('painting metadata is measured in pixels, not multiplied into giant art', () => {
    const root = createSpecialEntity('painting', '26.3', { paintingWidth: 32, paintingHeight: 16 })
    expect(root.userData.paintingSize).toEqual({ width: 2, height: 1 })
    root.dispose()
  })

  test('glow item frames have an emissive frame', () => {
    const root = createSpecialEntity('glow_item_frame', '26.3')
    let emissive = false
    root.traverse(object => {
      if (object.material?.emissive?.getHex() === 0x606060) emissive = true
    })
    expect(emissive).toBe(true)
    root.dispose()
  })

  test('text display renders the supplied component and can face the camera', () => {
    const root = createSpecialEntity('text_display', '26.3', {
      text: { text: 'hello', extra: [{ text: ' world' }] }, billboard: 'center'
    })
    expect(root.userData.text).toBe('hello world')
    expect(root.userData.billboard).toBe('center')
    expect(meshCount(root)).toBe(1)
    root.dispose()
  })
})
