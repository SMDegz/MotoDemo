const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const root = __dirname;
const port = Number(process.env.PORT || 8080);
const mime = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.glb':'model/gltf-binary', '.gltf':'model/gltf+json', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' };

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  const relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^[/\\]+/, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) && target !== root) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.stat(target, (err, stats) => {
    if (err || !stats.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
    fs.createReadStream(target).pipe(res);
  });
});

server.listen(port, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter(item => item && item.family === 'IPv4' && !item.internal).map(item => item.address);
  console.log(`MotoDemo LAN server is running on port ${port}.`);
  console.log(`This PC: http://localhost:${port}`);
  ips.forEach(ip => console.log(`LAN: http://${ip}:${port}`));
  console.log('Press Ctrl+C to stop the server.');
});
