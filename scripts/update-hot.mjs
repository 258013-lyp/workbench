// 定时抓取「真实全网热点」，回写 wfyy/data/hot.json（与页面同源，浏览器无 CORS 限制）
// 运行环境：GitHub Actions runner（有真实外网、无浏览器 CORS 限制）
// 数据源策略：服务端多源竞速，合并去重后洗牌，任一带回真实数据即写入；
//            全部失败时保留旧文件（不覆盖为空白），保证页面永远有内容。
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const OUT_PATHS = [
  join(ROOT, 'wfyy', 'data', 'hot.json'),
  join(ROOT, 'data', 'hot.json'),
];

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
      if (s.length >= 2 && s.length <= 30 && !/https?:|[\/\\@#]/.test(s)) out.push(s);
    } else if (v && typeof v === 'object') {
      collectWords(v, out);
    }
  }
  return out;
}

// —— 各数据源适配器（返回 {t, plat}[]，失败抛错由调度器吞掉）——
async function baidu() {
  const html = await getText('https://top.baidu.com/board?tab=realtime');
  // 百度把数据放在 <!--s-data:...--> 注释里
  const m = html.match(/<!--s-data:([\s\S]*?)-->/);
  if (!m) throw new Error('baidu: 未找到 s-data');
  const data = JSON.parse(m[1]);
  return collectWords(data).slice(0, 30).map((t) => ({ t, plat: '百度' }));
}

async function weibo() {
  const data = await getJSON('https://weibo.com/ajax/side/hotSearch', { Referer: 'https://weibo.com/' });
  const list = (data && data.data && data.data.realtime) || [];
  return list
    .filter((x) => x && x.word)
    .slice(0, 30)
    .map((x) => ({ t: x.word, plat: '微博' }));
}

async function genericJSON(url, plat) {
  const data = await getJSON(url);
  return collectWords(data)
    .slice(0, 20)
    .map((t) => ({ t, plat }));
}

const SOURCES = [
  { name: 'baidu', fn: baidu },
  { name: 'weibo', fn: weibo },
  { name: 'oioweb-weibo', fn: () => genericJSON('https://api.oioweb.cn/api/v1/weibohot', '微博') },
  { name: 'vvhan-wbhot', fn: () => genericJSON('https://api.vvhan.com/api/hotlist/wbHot', '微博') },
  { name: 'oioweb-zhihu', fn: () => genericJSON('https://api.oioweb.cn/api/v1/zhihu', '知乎') },
  { name: 'oioweb-bili', fn: () => genericJSON('https://api.oioweb.cn/api/v1/bili', 'B站') },
  { name: 'vvhan-bili', fn: () => genericJSON('https://api.vvhan.com/api/hotlist/bili', 'B站') },
  { name: 'oioweb-douyin', fn: () => genericJSON('https://api.oioweb.cn/api/v1/douyin', '抖音') },
];

async function main() {
  const all = [];
  const seen = new Set();
  for (const s of SOURCES) {
    try {
      const items = await s.fn();
      if (items && items.length) {
        let added = 0;
        for (const it of items) {
          const key = (it.t || '').toLowerCase();
          if (!key || seen.has(key)) continue;
          seen.add(key);
          all.push(it);
          added++;
        }
        console.log(`[ok]   ${s.name}: 取 ${added} 条（累计 ${all.length}）`);
      } else {
        console.log(`[empty] ${s.name}`);
      }
    } catch (e) {
      console.log(`[fail] ${s.name}: ${e.message}`);
    }
  }
  // 洗牌：平台混合 + 每次提交顺序不同（页面侧还会再洗牌一次）
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  console.log(`去重洗牌后合计 ${all.length} 条`);
  if (all.length === 0) {
    console.log('所有源均失败：保留旧 hot.json，不覆盖。');
    process.exit(0);
  }
  const body = JSON.stringify(all.slice(0, 40), null, 2);
  for (const p of OUT_PATHS) {
    writeFileSync(p, body);
    console.log('写入', p);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
