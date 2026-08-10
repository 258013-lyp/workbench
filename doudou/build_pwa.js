const fs = require('fs');

const SRC = 'D:/Work Buddy/2026-08-07-22-13-56/拼豆工作台.html';
const OUT = 'D:/Work Buddy/2026-08-07-22-13-56/doudou-app/index.html';

let html = fs.readFileSync(SRC, 'utf8');

// 仅注入「源文件里还没有」的 PWA 标签，避免重复（源文件已含 apple-mobile-web-app-capable / mobile-web-app-capable / theme-color）
const headTags = [
  '<link rel="manifest" href="./manifest.webmanifest" />',
  '<link rel="icon" type="image/png" sizes="192x192" href="./icon-192.png" />',
  '<link rel="icon" type="image/png" sizes="512x512" href="./icon-512.png" />',
  '<link rel="apple-touch-icon" href="./icon-180.png" />',
  '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />'
];
const need = headTags.filter(function (t) { return !html.includes(t); });
if (need.length) {
  html = html.replace('<head>', '<head>\n  ' + need.join('\n  ') + '\n');
}

const sw = '  <script>\n' +
  "    if ('serviceWorker' in navigator) {\n" +
  "      window.addEventListener('load', function () {\n" +
  "        navigator.serviceWorker.register('./sw.js').catch(function () {});\n" +
  '      });\n' +
  '    }\n' +
  '  </script>\n';
if (!html.includes("register('./sw.js')")) {
  html = html.replace('</body>', sw + '</body>');
}

fs.writeFileSync(OUT, html, 'utf8');
console.log('index.html written, bytes =', html.length);
console.log('headInjectedCount =', need.length, need);
console.log('swInjected =', html.includes("register('./sw.js')"));
console.log('hasManifestLink =', html.includes('rel="manifest"'));
console.log('appleMetaDuplicates =', (html.match(/apple-mobile-web-app-capable/g) || []).length);
