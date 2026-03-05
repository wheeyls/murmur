import http from 'node:http';
import httpProxy from 'http-proxy';
import { generateOverlayScript } from './overlay.js';
import type { MurmurConfig } from './types.js';

const MURMUR_PREFIX = '/__murmur';
const overlayScript = generateOverlayScript();

const INJECT_TAG = `<script src="${MURMUR_PREFIX}/overlay.js"></script>`;

export function createProxyServer(config: MurmurConfig): http.Server {
  const proxy = httpProxy.createProxyServer({
    target: config.target,
    selfHandleResponse: true,
    ws: true,
    changeOrigin: true,
  });

  proxy.on('proxyReq', (_proxyReq) => {
    _proxyReq.removeHeader('accept-encoding');
  });

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const contentType = proxyRes.headers['content-type'] || '';

    if (contentType.includes('text/html')) {
      let body = '';
      proxyRes.setEncoding('utf-8');
      proxyRes.on('data', (chunk: string) => { body += chunk; });
      proxyRes.on('end', () => {
        const injected = injectScript(body);
        const headers = { ...proxyRes.headers };
        delete headers['content-length'];
        delete headers['content-encoding'];
        delete headers['transfer-encoding'];
        headers['content-length'] = String(Buffer.byteLength(injected));
        res.writeHead(proxyRes.statusCode || 200, headers);
        res.end(injected);
      });
    } else {
      const headers = { ...proxyRes.headers };
      res.writeHead(proxyRes.statusCode || 200, headers);
      proxyRes.pipe(res);
    }
  });

  proxy.on('error', (err, _req, res) => {
    if (res && 'writeHead' in res) {
      (res as http.ServerResponse).writeHead(502, { 'Content-Type': 'text/plain' });
      (res as http.ServerResponse).end(`murmur proxy error: ${err.message}`);
    }
  });

  const server = http.createServer((req, res) => {
    if (req.url?.startsWith(MURMUR_PREFIX)) {
      handleMurmurRoute(req, res);
      return;
    }
    proxy.web(req, res);
  });

  server.on('upgrade', (req, socket, head) => {
    if (req.url === `${MURMUR_PREFIX}/ws`) {
      server.emit('murmur-ws-upgrade', req, socket, head);
      return;
    }
    proxy.ws(req, socket, head);
  });

  return server;
}

function handleMurmurRoute(req: http.IncomingMessage, res: http.ServerResponse): void {
  if (req.url === `${MURMUR_PREFIX}/overlay.js`) {
    res.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
      'Content-Length': String(Buffer.byteLength(overlayScript)),
    });
    res.end(overlayScript);
    return;
  }

  if (req.url === `${MURMUR_PREFIX}/health`) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  res.writeHead(404);
  res.end('Not found');
}

function injectScript(html: string): string {
  if (html.includes(INJECT_TAG)) return html;

  if (html.includes('</body>')) {
    return html.replace('</body>', `${INJECT_TAG}\n</body>`);
  }
  if (html.includes('</html>')) {
    return html.replace('</html>', `${INJECT_TAG}\n</html>`);
  }
  return html + `\n${INJECT_TAG}`;
}
