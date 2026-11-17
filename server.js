const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function getLocalIp() {
  const ifaces = os.networkInterfaces();
  for (const name in ifaces) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(BASE_DIR, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 - Arquivo não encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIp = getLocalIp();
  console.log('\n=============================================================');
  console.log('       🚗 VELOX GPS · SERVIDOR PARA CELULAR ATIVO!          ');
  console.log('=============================================================');
  console.log('\n📱 NO SEU CELULAR:');
  console.log('  1. Certifique-se de estar conectado no mesmo Wi-Fi deste PC.');
  console.log('  2. Abra o Chrome (Android) ou Safari (iPhone).');
  console.log('  3. Digite o endereço abaixo na barra do navegador:\n');
  console.log(`     👉  http://${localIp}:${PORT}\n`);
  console.log('=============================================================');
  console.log('Pressione Ctrl + C para encerrar o servidor quando terminar.\n');
});
