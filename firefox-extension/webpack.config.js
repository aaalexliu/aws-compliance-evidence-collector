const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: {
    background: './core/background.js',
    content: './core/content.js',
    sidepanel: './ui/sidepanel.js',
    'workflow-designer': './ui/workflow-designer.js',
    'auth-sdk': './ui/auth-sdk.js',
    auth: './ui/auth.js',
    landing: './ui/landing.js',
    popup: './ui/popup.js'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].bundle.js',
    clean: true
  },
  resolve: {
    fallback: {
      buffer: require.resolve('buffer/'),
      stream: require.resolve('stream-browserify'),
      process: require.resolve('process/browser'),
      path: false,
      fs: false,
      crypto: false,
      util: false,
      os: false,
      http: false,
      https: false,
      zlib: false,
      url: false
    }
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'config', to: 'config' },
        { from: 'sample-documents', to: 'sample-documents' },
        { from: 'ui/*.html', to: 'ui/[name][ext]' }
      ]
    })
  ],
  optimization: {
    splitChunks: {
      cacheGroups: {
        awssdk: {
          test: /[\\/]node_modules[\\/]@aws-sdk[\\/]/,
          name: 'aws-sdk',
          chunks: 'all',
          priority: 20
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
          priority: 10
        }
      }
    },
    minimize: true
  },
  performance: {
    maxEntrypointSize: 512000,
    maxAssetSize: 512000
  }
};
