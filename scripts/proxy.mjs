// 晚风予言 · 实时热榜代理（本机版，零账号）
// 作用：在「有真实外网、无浏览器 CORS 限制」的本地服务端抓取各平台热搜/热门话题，
//       供页面在点击「🔄 生成选题灵感」时同源（或跨域带 CORS）调用。
// 用法： node scripts/proxy.mjs   然后浏览器访问 http://localhost:8787/hot?plat=weibo
// 平台： weibo / douyin / xhs / zhihu / bili / kuaishou / shipinhao / all(全网聚合)

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

const PLAT_NICE = { weibo:'微博', douyin:'抖音', xhs:'小红书', zhihu:'知乎', bili:'B站', kuaishou:'快手', shipinhao:'视频号' };
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

// —— 全网音乐平台热歌综合（留声栏真实数据源）——
// 三方平台（网易云 ×3 榜 / QQ音乐 / 酷狗）× 多榜单并行抓取，去重后按「跨平台出现次数」加权为综合热度，
// 避免单一平台偏差：一首歌同时登上网易云热歌 + QQ音乐热歌 + 酷狗飙升，或包揽网易云热歌/飙升/新歌，
// 其综合热度最高，优先进入留声选题。任一源失败自动跳过，全部失败回退常驻库。
async function neMusic(id){
  const d = await getJSON('https://music.163.com/api/playlist/detail?id='+id, { Referer: 'https://music.163.com/' });
  const tracks = (d && d.result && (d.result.tracks || (d.result.playlist && d.result.playlist.tracks))) || [];
  return tracks.slice(0, 30).map(t => ({ name: t.name, singer: (t.artists || []).map(a => a.name).join('/') })).filter(x => x.name);
}
async function qqMusic(topid){
  const url = 'https://c.y.qq.com/v8/fcg-bin/fcg_v8_toplist_cp.fcg?type=top&topid='+topid+'&tpl=3&page=detail&date=&song_begin=0&song_num=30&format=json&inCharset=utf8&outCharset=utf-8&platform=jsonp&needNewCode=0&g_tk=5381';
  const d = await getJSON(url, { Referer: 'https://y.qq.com/' });
  const list = (d && d.songlist) || [];
  return list.slice(0, 30).map(s => {
    const dt = s.data || {};
    const sg = dt.singer;
    const singer = Array.isArray(sg) ? sg.map(x => (x && (x.name||x)) || '').join('/') : (dt.singername || '');
    return { name: dt.songname || dt.song_name || '', singer: singer };
  }).filter(x => x.name);
}
async function kgMusic(rankid){
  const url = 'https://m.kugou.com/rank/info/?rankid='+rankid+'&page=1&json=true';
  const d = await getJSON(url, { Referer: 'https://m.kugou.com/' });
  const list = (d && d.songs && d.songs.list) || [];
  return list.slice(0, 30).map(s => {
    let name = s.songname || '';
    const m = name.match(/\s*\(([^)]*)\)\s*$/);
    if (m && /[A-Za-z]/.test(m[1])) name = name.slice(0, name.length - m[0].length).trim();
    const authors = s.authors || [];
    const singer = Array.isArray(authors)
      ? authors.map(a => (a && (a.author_name || a)) || '').join('/')
      : (s.h5_author_name || '');
    return { name, singer };
  }).filter(x => x.name);
}
const MUSIC_SOURCES = [
  { tag: '网易云·热歌', fn: async () => neMusic(3778678) },
  { tag: '网易云·飙升', fn: async () => neMusic(19723756) },
  { tag: '网易云·新歌', fn: async () => neMusic(3779629) },
  { tag: 'QQ音乐·热歌', fn: async () => qqMusic(26) },
  { tag: '酷狗·飙升', fn: async () => kgMusic(6666) },
];
// 全部音源不可用时回退的常驻热门（真实歌曲，仅离线兜底）
const FALLBACK_MUSIC = [
  { name: '晴天', singer: '周杰伦' }, { name: '孤勇者', singer: '陈奕迅' },
  { name: '起风了', singer: '买辣椒也用券' }, { name: '如愿', singer: '王菲' },
  { name: '人世间', singer: '雷佳' }, { name: '删了吧', singer: '于果' },
  { name: '可能否', singer: '程响' }, { name: '演员', singer: '薛之谦' },
  { name: '体面', singer: '于文文' }, { name: '光年之外', singer: '邓紫棋' },
  { name: '错位时空', singer: '艾辰' }, { name: '热爱105°C的你', singer: '阿肆' },
  { name: '白月光与朱砂痣', singer: '大籽' }, { name: '你的答案', singer: '阿冗' },
  { name: '万疆', singer: '李玉刚' }, { name: '灯火里的中国', singer: '舒楠' },
];

async function fetchPlat(plat) {
  const fn = SOURCES[plat];
  if (!fn) return { items: [], error: '未知平台: ' + plat };
  try {
    let items = await fn();
    items = (items || []).filter(x => x && x.t && x.t.length >= 2).slice(0, 30);
    // 热度归一化：确保数值化；缺失时按排名反推，使跨平台按热度排序可靠
    items = items.map((x, i) => {
      let h = Number(x.heat) || 0;
      if (!h) h = Math.max(1, 9000000 - i * 30000);
      return { t: x.t, heat: h };
    });
    return { items, error: null };
  } catch (e) {
    return { items: [], error: (e && e.message) || '抓取失败' };
  }
}

const ALL_KEYS = ['weibo', 'douyin', 'xhs', 'zhihu', 'bili', 'shipinhao', 'kuaishou'];

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  const u = new URL(req.url, 'http://localhost');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  try {
    if (u.pathname === '/health') return send(200, { ok: true });
    if (u.pathname === '/music') {
      // 全网音乐平台热歌综合：并行抓多平台多榜单 → 去重 → 按跨平台出现次数加权 → 降序
      const collected = [];
      await Promise.all(MUSIC_SOURCES.map(async s => {
        try {
          const arr = await s.fn();
          (arr || []).forEach(x => { if (x && x.name) collected.push({ name: x.name, singer: (x.singer || '').toString(), src: s.tag }); });
        } catch (e) { /* 单源失败忽略，其他源仍可用 */ }
      }));
      const norm = n => (n || '').replace(/[\s\-_～~!！?？.。，、()（）【】[\]()]/g, '').toLowerCase();
      const map = new Map();
      for (const it of collected) {
        const key = norm(it.name);
        if (!key) continue;
        if (!map.has(key)) map.set(key, { name: it.name, singer: it.singer, srcs: new Set() });
        const e = map.get(key);
        e.srcs.add(it.src);
        if (!e.singer && it.singer) e.singer = it.singer;
      }
      let out = [...map.values()].map(e => ({ name: e.name, singer: e.singer, heat: e.srcs.size, src: [...e.srcs].join('/') }));
      // 综合热度 = 跨平台/跨榜单出现次数；同分按歌名稳定排序
      out.sort((a, b) => b.heat - a.heat || (a.name > b.name ? 1 : -1));
      out = out.slice(0, 30);
      const ok = out.length > 0;
      if (!ok) out = FALLBACK_MUSIC.slice(0, 20).map(s => ({ name: s.name, singer: s.singer, heat: 0, src: '常驻' }));
      return send(200, { plat: 'music', items: out, updatedAt: Date.now(), error: ok ? null : '无可用音源，已回退常驻' });
    }
    if (u.pathname === '/hot') {
      const plat = (u.searchParams.get('plat') || 'weibo');
      if (plat === 'all') {
        const merged = [];
        for (const k of ALL_KEYS) {
          try { const r = await fetchPlat(k); (r.items || []).forEach(it => merged.push({ ...it, src: PLAT_NICE[k] || k })); } catch (e) {}
        }
        // 去重（按标题）
        const seen = new Set(); const ded = [];
        for (const it of merged) { const t = (it.t || '').trim(); if (t && !seen.has(t)) { seen.add(t); ded.push(it); } }
        // 每平台取热度前 4，再全局按热度排序，保证跨平台多样性
        const bySrc = {}; ded.forEach(it => { (bySrc[it.src] = bySrc[it.src] || []).push(it); });
        let out = [];
        Object.values(bySrc).forEach(arr => { arr.sort((a, b) => b.heat - a.heat); out = out.concat(arr.slice(0, 4)); });
        out.sort((a, b) => b.heat - a.heat);
        return send(200, { plat: 'all', items: out.slice(0, 40), updatedAt: Date.now(), error: null });
      }
      const r = await fetchPlat(plat);
      return send(200, { plat, items: r.items, updatedAt: Date.now(), error: r.error });
    }
    return send(200, { name: '晚风予言实时热榜代理', usage: '/hot?plat=weibo|douyin|xhs|zhihu|bili|kuaishou|shipinhao|all' });
  } catch (e) {
    return send(500, { error: (e && e.message) || 'server error' });
  }
});

server.listen(PORT, () => {
  console.log('[proxy] 实时热榜代理已启动 → http://localhost:' + PORT + '/hot?plat=weibo');
  console.log('[proxy] 页面「⚙ 代理」留空即自动使用本地址；按 Ctrl+C 停止');
});
