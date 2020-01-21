const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');

module.exports = {
  entry: './src/index.js',

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js'
  },
  optimization: {
    minimizer: [new OptimizeCSSAssetsPlugin({})],
  },

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: ['babel-loader']
      },
      // bundle CSS into a single CSS file, auto-generating -vendor-prefixes
      {
        test: /\.css$/,
        use: [
          {
            loader: MiniCssExtractPlugin.loader,
            options: {
              hmr: process.env.NODE_ENV === 'development',
            },
          },
          'css-loader',
          // 'postcss-loader'
        ],
      },
    ]
  },
  plugins: ([
    new CleanWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html'
    }),
    // Avoid publishing files when compilation failed:
    new webpack.NoEmitOnErrorsPlugin(),

    // Write out CSS bundle to its own file:
    new MiniCssExtractPlugin()
  ]).concat(process.env.WEBPACK_ENV === 'dev' ? [] : [
    new webpack.optimize.OccurrenceOrderPlugin(),
  ]),

  // Pretty terminal output
  stats: { colors: true },

  // Generate external sourcemaps for the JS & CSS bundles
  devtool: 'source-map',

  // `webpack-dev-server` spawns a live-reloading HTTP server for your project.
  devServer: {
    port: process.env.PORT || 8080,
    contentBase: './src',
    historyApiFallback: true
  }
};