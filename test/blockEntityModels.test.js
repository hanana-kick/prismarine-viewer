/**
 * @jest-environment node
 */
/* eslint-env jest */
const { createBlockEntityMesh } = require('../viewer/lib/blockEntityModels')

jest.mock('../viewer/lib/utils', () => ({
  loadTexture: () => {},
  loadJSON: () => {}
}))

const colors = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black']
const copper = ['copper', 'exposed_copper', 'weathered_copper', 'oxidized_copper', 'waxed_copper', 'waxed_exposed_copper', 'waxed_weathered_copper', 'waxed_oxidized_copper']
const names = [
  'chest', 'ender_chest', 'trapped_chest', ...copper.map(name => `${name}_chest`),
  'shulker_box', ...colors.map(color => `${color}_shulker_box`),
  ...['skeleton', 'wither_skeleton', 'zombie', 'player', 'creeper', 'dragon', 'piglin'].flatMap(name => [
    name === 'skeleton' || name === 'wither_skeleton' ? `${name}_skull` : `${name}_head`,
    name === 'skeleton' || name === 'wither_skeleton' ? `${name}_wall_skull` : `${name}_wall_head`
  ]),
  ...colors.flatMap(color => [`${color}_banner`, `${color}_wall_banner`]),
  ...copper.map(name => `${name}_golem_statue`),
  'decorated_pot', 'conduit', 'end_portal', 'end_gateway', 'moving_piston'
]

function propertiesFor (name) {
  if (name.includes('wall')) return { facing: 'north' }
  if (name.endsWith('_chest')) return { facing: 'north', type: 'single' }
  if (name.endsWith('_shulker_box')) return { facing: 'up' }
  if (name.endsWith('_banner') || name.endsWith('_skull') || name.endsWith('_head')) return { rotation: '0' }
  if (name.includes('golem_statue')) return { facing: 'north', copper_golem_pose: 'sitting' }
  if (name === 'moving_piston') return { facing: 'north', type: 'normal' }
  return {}
}

function validateGeometry (root) {
  let meshes = 0
  root.traverse(object => {
    if (!object.isMesh) return
    meshes++
    for (const attribute of Object.values(object.geometry.attributes)) {
      for (const value of attribute.array) expect(Number.isFinite(value)).toBe(true)
    }
  })
  expect(meshes).toBeGreaterThan(0)
}

describe('block entity model factory', () => {
  test.each(names.map(name => [name]))('%s has identifiable finite geometry', name => {
    const root = createBlockEntityMesh({ name, position: { x: 1, y: 2, z: 3 }, properties: propertiesFor(name) }, '26.3')
    expect(root).not.toBeNull()
    expect(root.position.toArray()).toEqual([1, 2, 3])
    validateGeometry(root)
    root.dispose()
    expect(root.children).toHaveLength(0)
  })

  test('reads NBT variants without changing the model contract', () => {
    const patterned = createBlockEntityMesh({
      name: 'red_banner',
      position: { x: 0, y: 0, z: 0 },
      properties: { rotation: '4' },
      blockEntity: { patterns: [{ pattern: 'stripe_top', color: 'white' }] }
    }, '26.3')
    validateGeometry(patterned)
    patterned.dispose()

    const shulker = createBlockEntityMesh({
      name: 'shulker_box',
      position: { x: 0, y: 0, z: 0 },
      properties: { facing: 'north' },
      blockEntity: { open: 0.5 }
    }, '26.3')
    validateGeometry(shulker)
    shulker.dispose()
  })

  test('does not claim invisible or ordinary baked-model blocks', () => {
    for (const name of ['barrier', 'light', 'structure_void', 'stone', 'piston_head', 'oak_sign']) {
      expect(createBlockEntityMesh({ name, position: { x: 0, y: 0, z: 0 }, properties: {} }, '26.3')).toBeNull()
    }
  })
})
