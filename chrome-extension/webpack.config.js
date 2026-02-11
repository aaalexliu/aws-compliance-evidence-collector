const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    'background': './core/background.js',
    'content': './core/content.js',
    'auth': './ui/auth.js',
    'sidepanel': './ui/sidepanel.js',
    'landing': './ui/landing.js',
    'workflow-designer': './ui/workflow-designer.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    clean: true
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'ui/*.html', to: 'ui/[name][ext]' },
        { from: 'config', to: 'config' },
        { from: 'sample-documents', to: 'sample-documents' }
      ]
    }),
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ],
  resolve: {
    extensions: ['.js'],
    fallback: {
      "stream": require.resolve("stream-browserify"),
      "crypto": false,
      "buffer": require.resolve("buffer/"),
      "util": require.resolve("util/"),
      "process": require.resolve("process/browser"),
      "path": false,
      "fs": false
    }
  },
  optimization: {
    minimize: true,
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        awssdk: {
          test: /[\\/]node_modules[\\/](@aws-sdk|@smithy)[\\/]/,
          name: 'aws-sdk',
          priority: 20
        },
        vendors: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        },
        common: {
          minChunks: 2,
          name: 'common',
          priority: 5,
          reuseExistingChunk: true
        }
      }
    }
  },
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  },
  target: 'web'
};
