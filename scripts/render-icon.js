/**
 * Rendert build/icon.svg via Electron offscreen-renderer zu PNG mit echtem Alpha-Channel.
 * qlmanage produziert helle Pixel an den transparenten Ecken — Electron's webContents.capturePage()
 * liefert sauberes RGBA. Aufruf:  npx electron scripts/render-icon.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const SVG_PATH = path.join(__dirname, '..', 'build', 'icon.svg');
const OUT_PATH = path.join(__dirname, '..', 'build', 'icon.png');
const SIZE = 1024;

app.whenReady().then(async () => {
  const svg = fs.readFileSync(SVG_PATH, 'utf8');
  const html =
    `<!DOCTYPE html><html><head><style>
       html,body{margin:0;padding:0;background:transparent;overflow:hidden;}
       svg{display:block;width:${SIZE}px;height:${SIZE}px;}
     </style></head><body>${svg}</body></html>`;

  const win = new BrowserWindow({
    width: SIZE,
    height: SIZE,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    hasShadow: false,
    webPreferences: { offscreen: false, backgroundThrottling: false },
  });

  await win.loadURL('data:text/html;base64,' + Buffer.from(html).toString('base64'));
  // 1 Frame Render-Zeit damit das SVG ge-rastert ist
  await new Promise((r) => setTimeout(r, 200));

  const image = await win.webContents.capturePage();
  fs.writeFileSync(OUT_PATH, image.toPNG());
  console.log(`✓ ${OUT_PATH} (${SIZE}×${SIZE}, real alpha)`);

  win.destroy();
  app.quit();
}).catch((err) => {
  console.error('icon render error:', err);
  process.exit(1);
});
