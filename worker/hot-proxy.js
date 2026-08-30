// 晚风予言 · 实时热榜代理（Cloudflare Worker 版）
// 部署：wrangler deploy（免费）。部署后把 Worker 地址填到页面「⚙ 代理」即可在任意设备点一下就拉实时热榜。
// 契约与本地版一致： GET /hot?plat=weibo → { plat, items:[{t,heat}], updatedAt }
// 平台： weibo / douyin / xhs / zhihu / bili / baidu / toutiao

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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
  const settled = await Promise.allSettled(fetchers.map(f => f().then(arr => (arr && arr.length) ? arr : Promise.reject(new Error('empty')))));
  for (const s of settled) if (s.status === 'fulfilled' && s.value && s.value.length) return s.value;
  return [];
}

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
  baidu: async () => raceFirst([
    async () => {
      const html = await getText('https://top.baidu.com/board?tab=realtime');
      const m = html.match(/<!--s-data:([\s\S]*?)-->/);
      if (!m) return [];
      const obj = JSON.parse(m[1]);
      const cards = (obj && obj.data && obj.data.cards) || [];
      for (const c of cards) {
        if (Array.isArray(c.content) && c.content.length) {
          return c.content.slice(0, 30).map(x => ({ t: x.word || '', heat: Number(x.hotScore) || 0 }));
        }
      }
      return [];
    },
  ]),
  toutiao: async () => raceFirst([
    async () => {
      const d = await getJSON('https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc', { Referer: 'https://www.toutiao.com/' });
      const arr = (d && d.data) || [];
      return arr.slice(0, 30).map(x => ({ t: x.Title || '', heat: Number(x.HotValue) || 0 }));
    },
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

export default {
  async fetch(request) {
    const u = new URL(request.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json; charset=utf-8' };
    if (u.pathname === '/health') return new Response(JSON.stringify({ ok: true }), { headers: cors });
    if (u.pathname === '/hot') {
      const plat = u.searchParams.get('plat') || 'weibo';
      const r = await fetchPlat(plat);
      return new Response(JSON.stringify({ plat, items: r.items, updatedAt: Date.now(), error: r.error }), { headers: cors });
    }
    return new Response(JSON.stringify({ name: '晚风予言实时热榜代理', usage: '/hot?plat=weibo' }), { headers: cors });
  }
};
