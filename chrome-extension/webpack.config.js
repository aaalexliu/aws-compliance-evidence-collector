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
    clean: true,
    // Remove library config to avoid module issues
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
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          priority: 10
        },
        awssdk: {
          test: /[\\/]node_modules[\\/]@aws-sdk[\\/]/,
          name: 'aws-sdk',
          priority: 20
        }
      }
    }
  },
  target: 'web',
  // Ensure proper module handling for browser extensions
  experiments: {
    outputModule: false
  }
};
