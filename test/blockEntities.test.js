/* eslint-env jest */
const THREE = require('three')
const { World, isBlockEntityName } = require('../viewer/lib/world')

jest.mock('../viewer/lib/utils', () => ({
  loadTexture: () => {},
  loadJSON: (name, cb) => {
    const bounds = { '1.21.4': { minY: 0, worldHeight: 256 } }
    const states = {}
    cb(name === 'worldBounds.json' ? bounds : states)
  }
}))

jest.mock('../viewer/lib/blockEntityModels', () => ({
  createBlockEntityMesh: jest.fn()
}))

class FakeWorker {
  constructor () {
    this.messages = []
  }

  postMessage (data) {
    this.messages.push(data)
  }
}
global.Worker = FakeWorker

const { WorldRenderer } = require('../viewer/lib/worldrenderer')
const { createBlockEntityMesh } = require('../viewer/lib/blockEntityModels')

function emptySectionGeometry () {
  return {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    colors: new Float32Array(0),
    uvs: new Float32Array(0),
    animations: new Float32Array(0),
    indices: [],
    sx: 8,
    sy: 8,
    sz: 8
  }
}

function worldWithChest (blockEntity) {
  const world = Object.create(World.prototype)
  const isChest = pos => pos.x === 1 && pos.y === 2 && pos.z === 3
  world.columns = {
    '0,0': {
      getBlockStateId: pos => isChest(pos) ? 1 : 0,
      getBlock: pos => {
        const chest = isChest(pos)
        return {
          name: chest ? 'chest' : 'air',
          shapes: [],
          getProperties: () => chest ? { facing: 'north', type: 'single', waterlogged: false } : {}
        }
      },
      getBiome: () => 1,
      getBlockEntity: pos => isChest(pos) ? blockEntity : undefined
    }
  }
  world.blockCache = {}
  world.biomeCache = { 1: { name: 'plains' } }
  return world
}

describe('block entity descriptors', () => {
  test('uses absolute positions, properties and chunk NBT when available', () => {
    const blockEntity = { id: 'minecraft:chest', Items: [] }
    const descriptors = worldWithChest(blockEntity).getSectionBlockEntities(0, 0, 0)
    expect(descriptors).toEqual([{
      name: 'chest',
      position: { x: 1, y: 2, z: 3 },
      properties: { facing: 'north', type: 'single', waterlogged: false },
      blockEntity
    }])
  })

  test('omits unavailable NBT and excludes regular block models', () => {
    const [descriptor] = worldWithChest().getSectionBlockEntities(0, 0, 0)
    expect(descriptor).not.toHaveProperty('blockEntity')
    expect(isBlockEntityName('piston_head')).toBe(false)
    expect(isBlockEntityName('oak_sign')).toBe(false)
    expect(isBlockEntityName('barrier')).toBe(false)
    expect(isBlockEntityName('light')).toBe(false)
    expect(isBlockEntityName('structure_void')).toBe(false)
  })
})

describe('WorldRenderer block entities', () => {
  let renderer
  let worker

  beforeEach(() => {
    createBlockEntityMesh.mockReset()
    renderer = new WorldRenderer(new THREE.Scene(), 1)
    renderer.setVersion('1.21.4')
    renderer.addColumn(0, 0, {})
    worker = renderer.workers[0]
  })

  function emitGeometry (blockEntities) {
    worker.onmessage({
      data: { type: 'geometry', key: '0,0,0', geometry: emptySectionGeometry(), blockEntities }
    })
  }

  test('adds an identifiable model to the scene even with no section vertices', () => {
    const model = new THREE.Group()
    model.name = 'chest-model'
    createBlockEntityMesh.mockReturnValue(model)
    const entry = {
      name: 'chest',
      position: { x: 1, y: 2, z: 3 },
      properties: { facing: 'north' }
    }

    emitGeometry([entry])

    const group = renderer.blockEntityGroups['0,0,0']
    expect(renderer.sectionMeshs['0,0,0'].geometry.getAttribute('position').count).toBe(0)
    expect(createBlockEntityMesh).toHaveBeenCalledWith(entry, '1.21.4')
    expect(renderer.scene.children).toContain(group)
    expect(group.children).toContain(model)
    expect(group.name).toBe('blockEntities:0,0,0')
  })

  test('disposes replaced and unloaded models, including groups already outside the scene', async () => {
    const first = new THREE.Group()
    const second = new THREE.Group()
    first.dispose = jest.fn()
    second.dispose = jest.fn()
    createBlockEntityMesh.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const entry = { name: 'conduit', position: { x: 0, y: 0, z: 0 }, properties: {} }

    emitGeometry([entry])
    emitGeometry([entry])
    expect(first.dispose).toHaveBeenCalledTimes(1)

    const group = renderer.blockEntityGroups['0,0,0']
    renderer.scene.remove(group)
    renderer.removeColumn(0, 0)
    await new Promise(resolve => setImmediate(resolve))

    expect(second.dispose).toHaveBeenCalledTimes(1)
    expect(renderer.blockEntityGroups['0,0,0']).toBeUndefined()
    expect(renderer.scene.children).not.toContain(group)
  })
})
