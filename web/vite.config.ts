import { createReadStream, cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

const repoRoot = resolve(__dirname, '..');

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav',
  '.json': 'application/json',
  '.md': 'text/markdown',
};

function copyRuntimeAssets(srcDir: string, destDir: string, exts: string[]): void {
  if (!existsSync(srcDir)) return;
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (!exts.some((ext) => name.endsWith(ext))) continue;
    cpSync(resolve(srcDir, name), resolve(destDir, name));
  }
}

function staticMount(baseUrl: string, rootDir: string): Plugin['configureServer'] {
  return (server) => {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith(baseUrl)) return next();
      const rel = decodeURIComponent(req.url.slice(baseUrl.length).split('?')[0] || '');
      const filePath = normalize(join(rootDir, rel));
      if (!filePath.startsWith(rootDir + sep) && filePath !== rootDir) return next();
      if (!existsSync(filePath) || !statSync(filePath).isFile()) return next();
      res.setHeader('Content-Type', MIME[extname(filePath)] || 'application/octet-stream');
      createReadStream(filePath).pipe(res);
    });
  };
}

function battleHellAssets(): Plugin {
  const modelsSrc = resolve(repoRoot, 'assets/models');
  const audioSrc = resolve(repoRoot, 'assets/audio');
  const mapsSrc = resolve(__dirname, 'maps');

  return {
    name: 'battle-hell-assets',
    configureServer(server) {
      staticMount('/models', modelsSrc)?.(server);
      staticMount('/audio', audioSrc)?.(server);
      staticMount('/maps', mapsSrc)?.(server);
    },
    closeBundle() {
      const out = resolve(__dirname, 'dist');
      copyRuntimeAssets(modelsSrc, resolve(out, 'models'), ['.glb']);
      copyRuntimeAssets(audioSrc, resolve(out, 'audio'), ['.wav']);
      if (existsSync(mapsSrc)) {
        cpSync(mapsSrc, resolve(out, 'maps'), { recursive: true });
      }
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  publicDir: false,
  server: {
    host: '127.0.0.1',
    port: 5188,
    strictPort: true,
    fs: { allow: [repoRoot] },
  },
  preview: {
    host: '127.0.0.1',
    port: 4188,
    strictPort: true,
  },
  build: {
    sourcemap: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
  plugins: [battleHellAssets()],
});
