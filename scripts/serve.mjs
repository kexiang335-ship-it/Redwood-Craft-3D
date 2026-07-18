import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.REDWOOD_PORT ?? 4173);
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

export function resolveStaticFile(siteRoot, requestPath) {
  const normalizedRoot = resolve(siteRoot);
  let filePath = resolve(normalizedRoot, requestPath === '/' ? 'index.html' : `.${requestPath}`);

  if (filePath !== normalizedRoot && !filePath.startsWith(`${normalizedRoot}/`)) {
    return null;
  }

  try {
    if (statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html');
    if (!statSync(filePath).isFile()) return null;
    return filePath;
  } catch {
    return null;
  }
}

const server = createServer((request, response) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const filePath = resolveStaticFile(rootDirectory, requestPath);
  if (!filePath) {
    response.writeHead(404).end('Not found');
    return;
  }

  try {
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => {
    console.log(`Redwood Craft 3D is available at http://127.0.0.1:${port}`);
  });
}
