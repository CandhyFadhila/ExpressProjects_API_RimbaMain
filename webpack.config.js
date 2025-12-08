const path = require('path');
const nodeExternals = require('webpack-node-externals');

module.exports = {
  entry: './src/index.js', // GANTI dengan nama file utama Anda (misal: app.js atau index.js)
  target: 'node',
  mode: 'production', // Ini akan melakukan minify (mengecilkan size kode)
  externals: [nodeExternals()], // Node modules tidak ikut dibundle
  output: {
    path: path.resolve(__dirname, 'dist'), // Hasil build masuk folder 'dist'
    filename: 'index.js' // Nama file hasil build
  },
  resolve: {
    extensions: ['.js'],
  },
};