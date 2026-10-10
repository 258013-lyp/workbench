// 定时抓取「真实全网热点」，回写 wfyy/data/hot.json（与页面同源，浏览器无 CORS 限制）
// 运行环境：GitHub Actions runner（有真实外网、无浏览器 CORS 限制）
//
// 设计原则（第一性原理）：
// 1) 抖音是情感/治愈类短视频的第一平台，必须作为一等公民——多源竞速（抖音官方榜单 / vvhan / oioweb），任一成功即带入。
// 2) 信号质量 > 数量：每条热点带真实热度(heat)，并基于与上轮对比得出趋势(trend=新上榜/持续在榜)。
// 3) 平台多样性：合并后按平台均衡取样，避免某单一平台（如微博）淹没其它平台，保证抖音/知乎/B站都有代表。
// 4) 全部失败时保留旧文件（不覆盖为空白），页面永远有内容。
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_PATHS = [
  join(ROOT, 'wfyy', 'data', 'hot.json'),
  join(ROOT, 'data', 'hot.json'),
];
const PREV_PATH = OUT_PATHS[0];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

async function getJSON(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
async function getText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9', ...headers },
    redirect: 'follow',
    signal: AbortSignal.timeout(9000),
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.text();
}

// 通用：从任意 JSON 结构递归抽取热词（字段名 word/title/hotword/query/name/keyword）
function collectWords(obj, out = []) {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) collectWords(v, out);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (['word', 'title', 'hotword', 'query', 'name', 'keyword'].includes(k) && typeof v === 'string') {
      const s = v.trim();
      if (s.length >= 2 && s.length <= 30 && !/https?:|[\/\\@#]/.test(s)) out.push({ t: s, heat: 0 });
    } else if (v && typeof v === 'object') {
      collectWords(v, out);
    }
  }
  return out;
}

// —— 各数据源适配器（返回 {t, plat, heat}[]，失败抛错由调度器吞掉）——
async function baidu() {
  const html = await getText('https://top.baidu.com/board?tab=realtime');
  const m = html.match(/<!--s-data:([\s\S]*?)-->/);
  if (!m) throw new Error('baidu: 未找到 s-data');
  const data = JSON.parse(m[1]);
  const cards = (data && data.data && data.data.cards) || [];
  for (const c of cards) {
    if (Array.isArray(c.content) && c.content.length) {
      return c.content.slice(0, 30).map((x) => ({ t: x.word || '', heat: Number(x.hotScore) || 0 }));
    }
  }
  throw new Error('baidu: 无内容');
}

async function weibo() {
  const data = await getJSON('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' });
  const list = (data && data.data && data.data.realtime) || [];
  return list
    .filter((x) => x && x.word)
    .slice(0, 30)
    .map((x) => ({ t: x.word, heat: Number(x.num) || 0 }));
}

// 抖音官方榜单（与 Cloudflare Worker 同一端点，带真实热度 hot_value）—— 抖音一等公民的关键源
async function douyinBillboard() {
  const d = await getJSON('https://www.iesdouyin.com/web/api/v2/hotsearch/billboard/word/');
  const arr = Array.isArray(d) ? d : (d && d.word_list) || [];
  if (!arr.length) throw new Error('douyin: 空');
  return arr.slice(0, 30).map((x) => ({ t: x.word || x.hot_word || '', heat: Number(x.hot_value || x.hot || 0) || 0 }))
    .filter((x) => x.t);
}

function genericJSON(url, plat) {
  return async () => {
    const data = await getJSON(url);
    return collectWords(data).slice(0, 20).map((x) => ({ t: x.t, heat: x.heat || 0, plat }));
  };
}

// 抖音额外来源（多源竞速，任一成功即带入抖音热点）
const SOURCES = [
  { name: 'baidu', plat: '百度', fn: baidu },
  { name: 'weibo', plat: '微博', fn: weibo },
  { name: 'douyin-official', plat: '抖音', fn: douyinBillboard },
  { name: 'oioweb-weibo', plat: '微博', fn: genericJSON('https://api.oioweb.cn/api/v1/weibohot', '微博') },
  { name: 'vvhan-wbhot', plat: '微博', fn: genericJSON('https://api.vvhan.com/api/hotlist/wbHot', '微博') },
  { name: 'oioweb-zhihu', plat: '知乎', fn: genericJSON('https://api.oioweb.cn/api/v1/zhihu', '知乎') },
  { name: 'oioweb-bili', plat: 'B站', fn: genericJSON('https://api.oioweb.cn/api/v1/bili', 'B站') },
  { name: 'vvhan-bili', plat: 'B站', fn: genericJSON('https://api.vvhan.com/api/hotlist/bili', 'B站') },
  { name: 'vvhan-douyin', plat: '抖音', fn: genericJSON('https://api.vvhan.com/api/hotlist/douyin', '抖音') },
  { name: 'oioweb-douyin', plat: '抖音', fn: genericJSON('https://api.oioweb.cn/api/v1/douyin', '抖音') },
];

// 读取上一轮 hot.json，用于计算趋势（新上榜 / 持续在榜）
function prevPhrases() {
  try {
    if (!existsSync(PREV_PATH)) return new Set();
    const arr = JSON.parse(readFileSync(PREV_PATH, 'utf8'));
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.map((x) => String(x.t || '').toLowerCase()).filter(Boolean));
  } catch (e) {
    return new Set();
  }
}

async function main() {
  const all = [];
  const seen = new Map(); // key(小写短语) -> {t, plat, heat}
  for (const s of SOURCES) {
    try {
      const items = await s.fn();
      if (items && items.length) {
        let added = 0;
        for (const it of items) {
          const t = (it.t || '').trim();
          if (!t || t.length < 2 || t.length > 30) continue;
          const key = t.toLowerCase();
          const heat = Number(it.heat) || 0;
          const cur = seen.get(key);
          if (!cur) {
            seen.set(key, { t, plat: s.plat, heat });
            added++;
          } else {
            // 同词跨平台：合并平台名 + 取最高热度
            if (cur.plat.indexOf(s.plat) === -1) cur.plat = cur.plat + '/' + s.plat;
            if (heat > cur.heat) cur.heat = heat;
          }
        }
        console.log(`[ok]   ${s.name} (${s.plat}): 取 ${added} 条（累计 ${seen.size}）`);
      } else {
        console.log(`[empty] ${s.name}`);
      }
    } catch (e) {
      console.log(`[fail] ${s.name}: ${e.message}`);
    }
  }

  let merged = [...seen.values()];
  console.log(`去重后合计 ${merged.length} 条`);
  if (merged.length === 0) {
    console.log('所有源均失败：保留旧 hot.json，不覆盖。');
    process.exit(0);
  }

  // 趋势：与上轮对比
  const prev = prevPhrases();
  merged.forEach((x) => { x.trend = prev.has(x.t.toLowerCase()) ? '持续' : '新'; });

  // 平台均衡取样：避免单平台淹没；抖音至少保证 8 条（若源可用）
  const groups = {};
  merged.forEach((x) => { (groups[x.plat] = groups[x.plat] || []).push(x); });
  Object.keys(groups).forEach((p) => groups[p].sort((a, b) => b.heat - a.heat));
  const TOTAL = 40;
  const plats = Object.keys(groups);
  const floor = {};
  if (groups['抖音'] && groups['抖音'].length) floor['抖音'] = Math.min(8, groups['抖音'].length);
  const cap = Math.ceil(TOTAL * 0.45); // 单平台上限 ~18，保证全网多平台混合而非单平台淹没
  const count = {}; plats.forEach((p) => (count[p] = 0));
  const out = [];
  const idx = {}; plats.forEach((p) => (idx[p] = 0));
  // 第一轮：每平台各取 1 条轮转，抖音先补足 floor
  for (const p of plats) {
    while (floor[p] && idx[p] < floor[p] && idx[p] < groups[p].length) { out.push(groups[p][idx[p]++]); count[p]++; }
  }
  // 第二轮：按热度全局轮转填满剩余名额（受单平台 cap 约束，保证跨平台多样性）
  while (out.length < TOTAL) {
    let best = null, bestPlat = null;
    for (const p of plats) {
      if (idx[p] < groups[p].length && count[p] < cap) {
        const cand = groups[p][idx[p]];
        if (!best || cand.heat > best.heat) { best = cand; bestPlat = p; }
      }
    }
    if (!best) break;
    out.push(best); idx[bestPlat]++; count[bestPlat]++;
  }

  // 最终洗牌（平台混合 + 每次顺序不同，页面侧还会再洗牌）
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  console.log(`输出 ${out.length} 条，平台分布：` + plats.map((p) => `${p}:${groups[p].length}`).join('，'));

  const body = JSON.stringify(out.slice(0, TOTAL), null, 2);
  for (const p of OUT_PATHS) {
    writeFileSync(p, body);
    console.log('写入', p);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
