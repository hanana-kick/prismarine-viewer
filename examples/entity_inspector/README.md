# Entity inspector

Renders one 26.3 entity at a time so a rendering problem can be isolated to a bone, a
part, a texture or the model's position on the floor, instead of being hunted through a
whole world.

## Interactive inspector

```
npm run inspect:entities            # node scripts/entity-inspector-26.3.js --serve
```

Then open the printed URL. The panel offers:

- entity picker with a filter box, plus `←`/`→` for the previous/next entity
- one checkbox per rig part, so a single part can be drawn alone
- hitbox wireframe (cyan), drawn-mesh bounding box (amber), bone pivots with names (pink)
- texture and wireframe toggles, grid, axes, scale and yaw sliders
- camera presets `iso`, `front`, `back`, `left`, `right`, `top`

URL parameters: `?entity=cow` opens one entity directly, `?bare=1` hides the panel for
screenshots. The dropped-item entity draws the item model chosen with the item-name box
(or `--item` headlessly).

## Headless gallery

```
npm run gallery:entities                                   # every entity -> PNG + index.html
node scripts/entity-inspector-26.3.js creeper warden --parts
node scripts/entity-inspector-26.3.js --all --views iso,front,top --out /tmp/gallery
```

| Flag | Meaning |
| --- | --- |
| `--serve` | build the bundle and serve the interactive page (no screenshots) |
| `--all` | every entity in the 26.3 registry |
| `<names…>` | only these entities (substring match) |
| `--parts` | also one screenshot per rig part |
| `--views a,b,c` | camera presets to capture, default `iso` |
| `--out <dir>` | output directory, default `test/entity-gallery` |
| `--width`, `--height` | screenshot size, default 420×420 |
| `--port <n>` | static server port, default 30663 |
| `--limit <n>` | stop after n entities |
| `--scale <k>` | uniform model scale, for inspecting tiny models |
| `--item <name>` | item drawn by the `item` entity, default `diamond_sword` |
| `--ascii` | print a text preview of each shot, for terminals without image review |
| `--no-build` | reuse the existing bundle |

Outputs: `report.json` (one record per entity/part) and `index.html` (severity-coloured
cards, each linking to that entity in the inspector).

## Automation API

The page exposes `window.__inspector` for scripted capture:

```js
await inspector.show('warden', { parts: ['default'], bones: true, preset: 'front' })
await inspector.texturesReady()          // every part's texture has landed
inspector.state()                        // { name, rendered, parts, warnings, error, … }
inspector.names()                        // every entity in the catalog
```

Option keys: `parts`, `texture`, `wireframe`, `hitbox`, `meshBox`, `bones`, `grid`,
`axes`, `scale`, `yaw`, `preset`, `itemName`.

## What the warnings mean

| Warning | Reading |
| --- | --- |
| `no rig named "x" in entities.json` | the entity resolves to a missing rig |
| `renders nothing` / `construction failed` | the rig builds an empty mesh |
| `borrowed rig "x", silhouette is not this mob` | the entity draws another mob's rig; the outline is wrong even when the texture is right |
| `part "x" has no 26.3 texture, dropped` | the texture map lacks this variant |
| `mesh sinks N blocks below the floor` | grounded mob authored under its feet; it clips into the floor in world |
| `mesh floats N blocks above the floor` | grounded mob authored above its feet, e.g. the boat float |
| `mesh floor at y=… (model is not authored on the ground)` | fliers, swimmers and projectiles, for which a floor offset is correct |
| `draws W×H, hitbox is w×h` | drawn size and hitbox differ by more than 0.35 blocks |

`interaction` and `marker` deliberately draw nothing, matching vanilla. Display,
frame, projectile and particle entities use their serialized metadata; the inspector
uses a representative default when no world metadata is supplied.

## Converting a vanilla model into `entities.json`

Rigs are stored in the viewer's Bedrock-like frame: `pivot` and cube `origin` are absolute
model pixels, y measured **up** from the entity's feet, x mirrored by the mesh scale.
`Entity.getMesh` divides by 16 and rotates a cube about its own bone's pivot.

A Java `PartPose.offsetAndRotation(px, py, pz, rx, ry, rz)` with
`CubeListBuilder.addBox(bx, by, bz, w, h, d)` becomes:

```
pivot  = (px, G - py, pz)
origin = (px + bx, (G - py) - (by + h), pz + bz)   // box y range mirrored about the pivot
size   = (w, h, d)
rotation = (rx, ry, rz) in degrees
```

`G` is the Java model y of the entity's feet: `24` for the mobs rendered through the
standard `MobRenderer` path, and `6` for models whose renderer translates by `0.375`
(`AbstractBoatRenderer`, `AbstractMinecartRenderer`), where the hull is authored around
the entity position. Per-rod or per-tentacle placement such as the blaze's 12 rods lives
in those pivots, so a dropped pose collapses the parts onto one another.
