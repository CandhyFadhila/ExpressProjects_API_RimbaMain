const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");
const nodeExternals = require("webpack-node-externals");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const webpack = require("webpack");

module.exports = {
  entry: path.resolve(__dirname, "src/index.js"), // titik masuk servermu
  target: "node", // penting: bundle untuk Node.js
  mode: "production",
  devtool: "source-map", // biar masih bisa debug
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "server.js",
    clean: true, // bersihkan folder build
  },

  // Jangan bundle node_modules (lebih aman utk backend)
  externals: [nodeExternals()],
  externalsPresets: { node: true },

  // Pertahankan __dirname & __filename seperti runtime Node asli
  node: { __dirname: false, __filename: false },

  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        extractComments: false,
        terserOptions: {
          compress: {
            // Di backend biasanya butuh logging, jadi jangan drop_console
          },
          format: { comments: false },
          keep_classnames: true, // aman untuk lib yang mengandalkan nama class
          keep_fnames: true, // aman untuk DI/ORM yang pakai nama fungsi
        },
      }),
    ],
  },

  plugins: [
    // Set environment ke production di bundle
    new webpack.DefinePlugin({
      "process.env.NODE_ENV": JSON.stringify("production"),
    }),

    // Copy folder aset yang dipakai server saat runtime (opsional, tapi cocok dengan strukturmu)
    new CopyWebpackPlugin({
      patterns: [
        {
          from: path.resolve(__dirname, "src/public"),
          to: "public",
          noErrorOnMissing: true,
        },
        {
          from: path.resolve(__dirname, "src/templates"),
          to: "templates",
          noErrorOnMissing: true,
        },
        {
          from: path.resolve(__dirname, ".env"),
          to: ".env",
          noErrorOnMissing: true,
        }, // kalau kamu load .env saat runtime
      ],
    }),
  ],
};
