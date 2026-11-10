# prismarine-viewer (Minecraft Java 26.3 fork)

This branch adds support for Minecraft Java **26.3 (protocol 777)** to the PrismarineJS viewer.

## Install directly from GitHub with pnpm

```bash
pnpm add github:hanana-kick/prismarine-viewer#mc-26.3
```

Use `require('prismarine-viewer')` as before. No npm publishing is required.

```js
const mineflayerViewer = require('prismarine-viewer').mineflayer

// bot must be connected to a Minecraft Java 26.3 server using
// an independently 26.3-compatible Mineflayer/protocol stack.
bot.once('spawn', () => {
  mineflayerViewer(bot, { port: 3000, firstPerson: true })
})
```

This branch ships prebuilt **26.3 browser bundles, block-state JSON and textures**
in Git, so a normal pnpm GitHub install needs no package build script approval.
It targets Minecraft Java 26.3; older versions can be built locally but are not
part of the prebuilt 26.3 distribution.

For maintainers, `npm run build` extracts the official 26.3 Minecraft client JAR
and regenerates the atlas and browser bundles (requires network access and a
working Node canvas toolchain). `npm run verify:mc26` validates the generated
26.3 data, models and bundles.

Dependencies for the 26.3 data, registry, block and chunk support currently use
the pinned `@wp2508` PrismarineJS forks, since the upstream 26.3 support PRs
are not yet merged. This fork does not modify the consumer's Mineflayer
installation. It supplies the viewer only; network protocol/login compatibility
remains the responsibility of the bot library.

The original project documentation follows.

---

# prismarine-viewer

Web based viewer for servers and bots

[![NPM version](https://img.shields.io/npm/v/prismarine-viewer.svg)](http://npmjs.com/package/prismarine-viewer)
[![Build Status](https://img.shields.io/github/actions/workflow/status/PrismarineJS/prismarine-viewer/ci.yml.svg?label=CI&logo=github&logoColor=lightgrey)](https://github.com/PrismarineJS/prismarine-viewer/actions?query=workflow%3A%22CI%22)
[![Discord](https://img.shields.io/badge/chat-on%20discord-brightgreen.svg)](https://discord.gg/GsEFRM8)
[![Gitter](https://img.shields.io/badge/chat-on%20gitter-brightgreen.svg)](https://gitter.im/PrismarineJS/general)
[![Irc](https://img.shields.io/badge/chat-on%20irc-brightgreen.svg)](https://irc.gitter.im/)
[![Issue Hunt](https://github.com/BoostIO/issuehunt-materials/blob/master/v1/issuehunt-shield-v1.svg)](https://issuehunt.io/r/PrismarineJS/prismarine-viewer)

[![Try it on gitpod](https://img.shields.io/badge/try-on%20gitpod-brightgreen.svg)](https://gitpod.io/#https://github.com/PrismarineJS/prismarine-viewer)

[<img src="https://prismarinejs.github.io/prismarine-viewer/test_1.18.1.png" alt="viewer" width="300">](https://prismarinejs.github.io/prismarine-viewer/)

Supports versions 1.8.8, 1.9.4, 1.10.2, 1.11.2, 1.12.2, 1.13.2, 1.14.4, 1.15.2, 1.16.1, 1.16.4, 1.17.1, 1.18.1, 1.19, 1.20.1, 1.21.1, 1.21.4. Other versions of the same major (e.g. 1.21.8) render with the textures and models of the closest supported one.

## Install

```bash
npm install prismarine-viewer
```

## Example

```js
const mineflayer = require('mineflayer')
const mineflayerViewer = require('prismarine-viewer').mineflayer

const bot = mineflayer.createBot({
  username: 'Bot'
})

bot.once('spawn', () => {
  mineflayerViewer(bot, { port: 3000 }) // Start the viewing server on port 3000

  // Draw the path followed by the bot
  const path = [bot.entity.position.clone()]
  bot.on('move', () => {
    if (path[path.length - 1].distanceTo(bot.entity.position) > 1) {
      path.push(bot.entity.position.clone())
      bot.viewer.drawLine('path', path)
    }
  })
})
```

More examples:

* First person bot [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/firstperson_bot.js)
* Record view as video file [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/headless.js)
* Streaming video to a python script [example](https://github.com/PrismarineJS/prismarine-viewer/tree/master/examples/python)
* Visualize a world, without a bot [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/standalone.js)
* Visualize the world coming from a proxy [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/proxy.js)
* Click to move [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/clickmove.js)
* Use the core api for viewing worlds [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/core)
* Create an electron app with viewer [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/electron)
* Create a fully front end viewer with an in memory world [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/standalone)
* A minecraft web client example, using mineflayer and a websocket proxy [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/web_client)
* Export parts of worlds as screenshot or 3d models [example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/exporter)

## Projects using prismarine-viewer

* [prismarine-web-client](https://gitlab.com/PrismarineJS/prismarine-web-client) A minecraft client in your browser


## API

### prismarine-viewer

#### viewer

The core rendering library. It provides Viewer and WorldView which together make it possible to render a minecraft world.
Check its [API](viewer/README.md)

#### mineflayer

Serve a webserver allowing to visualize the bot surrounding, in first or third person. Comes with drawing functionnalities.

```js
const { mineflayer } = require('prismarine-viewer')
```

Options:
* `viewDistance` view radius, in chunks, default: `6`
* `firstPerson` is the view first person ? default: `false`
* `port` the port for the webserver, default: `3000`

Players are rendered with their skin, wide or slim, and cape when the server sends skin data (online-mode servers).

[example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/bot.js)

#### standalone

Serve a webserver allowing to visualize a world.

```js
const { standalone } = require('prismarine-viewer')
```

Options:
* `version` the version to use, default: `1.13.2`
* `generator` a world generator function, default: `(x, y, z) => 0`
* `center` a vec3 to center the view on, default: `new Vec3(0, 0, 0)`
* `viewDistance` view radius, in chunks, default: `6`
* `port` the port for the webserver, default: `3000`

[example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/standalone.js)

#### headless

Render the bot view and stream it to a file or over TCP.

```js
const { headless } = require('prismarine-viewer')
```

Options:
* `viewDistance` view radius, in chunks, default: `6`
* `output` the output file or a `host:port` address to stream to, default: `output.mp4`
* `frames` number of frames to record, `-1` for infinite, default: `200`
* `width` the width of a frame, default: `512`
* `height` the height of a frame, default: `512`

[example](https://github.com/PrismarineJS/prismarine-viewer/blob/master/examples/headless.js)

### Drawing (mineflayer mode)

All drawing function have a unique id that can be used to replace or erase the primitive.

#### bot.viewer.drawLine (id, points, color=0xff0000)

Draw a line passing through all the `points`.

#### bot.viewer.erase (id)

Remove the primitive with the given id from the display.

#### bot.viewer.close ()

Stop the server and disconnect users.

## Tests

`npm run jestTest -- -t "1.9.4"`
