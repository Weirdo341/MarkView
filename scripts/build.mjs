import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/renderer/renderer.js'],
  bundle: true,
  outfile: 'dist/renderer.js',
  platform: 'browser',
  target: 'chrome120',
  format: 'iife',
  minify: true,
  sourcemap: false,
  logLevel: 'info',
  loader: {
    '.woff': 'file',
    '.woff2': 'file',
    '.ttf': 'file',
    '.eot': 'file',
    '.svg': 'file',
  },
  define: {
    'process.env.NODE_ENV': '"production"',
  },
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('watching for changes...');
} else {
  await esbuild.build(options);
}