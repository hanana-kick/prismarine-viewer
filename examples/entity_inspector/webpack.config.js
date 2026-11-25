const path = require('path')
const webpack = require('webpack')

// Served by scripts/entity-inspector-26.3.js, which also provides /catalog.json and the
// 26.3 textures from the repository's public/ directory.
module.exports = {
  mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  devtool: false,
  entry: path.resolve(__dirname, './index.js'),
  output: {
    path: path.resolve(__dirname, './public'),
    filename: 'inspector.js'
  },
  resolve: {
    fallback: {
      zlib: false,
      path: require.resolve('path-browserify'),
      buffer: require.resolve('buffer/'),
      assert: require.resolve('assert/')
    }
  },
  module: {
    rules: [
      {
        // three declares sideEffects: false, but examples/js scripts attach to the THREE global
        test: /three[/\\]examples[/\\]js/,
        sideEffects: true
      }
    ]
  },
  plugins: [
    new webpack.ProvidePlugin({ process: 'process/browser' }),
    new webpack.ProvidePlugin({ Buffer: ['buffer', 'Buffer'] }),
    new webpack.NormalModuleReplacementPlugin(
      // eslint-disable-next-line no-unused-vars
      /viewer[/\\]lib[/\\]utils/,
      './utils.web.js'
    )
  ]
}
