// 晚风予言 · 实时热榜代理（本机版，零账号）
// 作用：在「有真实外网、无浏览器 CORS 限制」的本地服务端抓取各平台热搜/热门话题，
//       供页面在点击「🔄 拉实时热榜」时同源（或跨域带 CORS）调用。
// 用法： node scripts/proxy.mjs   然后浏览器访问 http://localhost:8787/hot?plat=weibo
// 平台： weibo / douyin / xhs / zhihu / bili / kuaishou / shipinhao

import http from 'node:http';

const PORT = Number(process.env.PORT) || 8787;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
async function getJSON(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
async function getText(url, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': UA, ...headers } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally { clearTimeout(t); }
}
async function raceFirst(fetchers) {
  // 并发尝试多个源，返回第一个拿到非空数据的；全失败则返回 []
  const settled = await Promise.allSettled(fetchers.map(f => f().then(arr => (arr && arr.length) ? arr : Promise.reject(new Error('empty')))));
  for (const s of settled) if (s.status === 'fulfilled' && s.value && s.value.length) return s.value;
  return [];
}
// tophub 聚合站 HTML 解析（视频号/快手无官方开放接口，tophub 稳定可抓）
async function parseTopHub(url) {
  const html = await getText(url);
  const tb = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
  if (!tb) return [];
  const rows = [...tb[1].matchAll(/<td[^>]*>\d+\.<\/td>\s*<td><a[^>]*>([^<]+)<\/a>/g)];
  return rows.map(r => ({ t: r[1].trim(), heat: 0 })).filter(x => x.t.length >= 2);
}

// —— 各平台抓取器（server-side，真实外网）——
const SOURCES = {
  weibo: async () => raceFirst([
    async () => {
      const d = await getJSON('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' });
      const arr = (d && d.data && d.data.realtime) || [];
      return arr.filter(x => x && x.word && !x.is_ad).slice(0, 30).map(x => ({ t: x.word, heat: Number(x.num) || 0 }));
    },
  ]),
  douyin: async () => raceFirst([
    async () => {
      const d = await getJSON('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/');
      const arr = Array.isArray(d) ? d : (d && d.word_list) || [];
      return arr.slice(0, 30).map(x => ({ t: x.word || x.hot_word || '', heat: Number(x.hot_value || x.hot || 0) || 0 }));
    },
  ]),
  xhs: async () => raceFirst([
    async () => {
      // 小红书无官方开放接口；尝试社区聚合源，失败则空（页面会如实显示为空）
      const d = await getJSON('https://api.vvhan.com/api/hotlist/xhsHot');
      const arr = (d && d.data) || (Array.isArray(d) ? d : []);
      return (Array.isArray(arr) ? arr : []).slice(0, 30).map(x => ({ t: x.title || x.word || x.name || '', heat: Number(x.hot || 0) || 0 }));
    },
  ]),
  zhihu: async () => raceFirst([
    async () => {
      const d = await getJSON('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true', {
        Referer: 'https://www.zhihu.com/', 'x-requested-with': 'fetch',
      });
      const arr = (d && d.data) || [];
      return arr.slice(0, 30).map(x => ({ t: x.target && x.target.title || '', heat: Number(x.target && x.target.metrics && x.target.metrics.hit_count) || 0 }));
    },
  ]),
  bili: async () => raceFirst([
    async () => {
      const d = await getJSON('https://api.bilibili.com/x/web-interface/popular?ps=20&pn=1', { Referer: 'https://www.bilibili.com/' });
      const arr = (d && d.data && d.data.list) || [];
      return arr.slice(0, 30).map(x => ({ t: x.title || '', heat: Number(x.stat && x.stat.view) || 0 }));
    },
  ]),
  kuaishou: async () => raceFirst([
    async () => parseTopHub('https://tophub.today/n/MZd7PrPerO'),
  ]),
  shipinhao: async () => raceFirst([
    async () => parseTopHub('https://tophub.today/n/W1VdJPZoLQ'),
  ]),
};

async function fetchPlat(plat) {
  const fn = SOURCES[plat];
  if (!fn) return { items: [], error: '未知平台: ' + plat };
  try {
    const items = await fn();
    return { items: (items || []).filter(x => x && x.t && x.t.length >= 2).slice(0, 30), error: null };
  } catch (e) {
    return { items: [], error: (e && e.message) || '抓取失败' };
  }
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  const u = new URL(req.url, 'http://localhost');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  try {
    if (u.pathname === '/health') return send(200, { ok: true });
    if (u.pathname === '/hot') {
      const plat = u.searchParams.get('plat') || 'weibo';
      const r = await fetchPlat(plat);
      return send(200, { plat, items: r.items, updatedAt: Date.now(), error: r.error });
    }
    return send(200, { name: '晚风予言实时热榜代理', usage: '/hot?plat=weibo|douyin|xhs|zhihu|bili|kuaishou|shipinhao' });
  } catch (e) {
    return send(500, { error: (e && e.message) || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log('[proxy] 实时热榜代理已启动 → http://localhost:' + PORT + '/hot?plat=weibo');
  console.log('[proxy] 页面「⚙ 代理」留空即自动使用本地址；按 Ctrl+C 停止');
});
