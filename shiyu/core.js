/* ============================================================
   拾愈 · 核心引擎层
   纯离线可用：像素分析 → 情绪判定 → 文案 + 手绘注脚
   可选升级：配置 API 后由视觉大模型读图，覆盖离线结果
   ============================================================ */

window.SY = (function () {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function uid() {
    return 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
  }

  function seededRandom(seed) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return function () {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function dateKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function dayLabel(key) {
    const today = dateKey();
    if (key === today) return '今天';
    const t = new Date(); t.setDate(t.getDate() - 1);
    if (key === dateKey(t)) return '昨天';
    const parts = key.split('-');
    return parts[1].replace(/^0/, '') + '月' + parts[2].replace(/^0/, '') + '日';
  }

  function timeLabel(ts) {
    const d = new Date(ts);
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /* ---------------- 情绪字典 ---------------- */
  const EMOTIONS = [
    { id: 'tired',  label: '疲惫', color: '#7E8CA0', soft: '#E6E9EF',
      note: '今天的消耗比补充多', stickers: ['lamp', 'moon', 'cloud'] },
    { id: 'calm',   label: '平静', color: '#7F9E93', soft: '#E4EDEA',
      note: '此刻不需要用力', stickers: ['wave', 'leaf', 'wind'] },
    { id: 'happy',  label: '愉悦', color: '#D99341', soft: '#F8EEDF',
      note: '有一秒是亮着的', stickers: ['sun', 'star', 'spark'] },
    { id: 'sad',    label: '委屈', color: '#7A8DA8', soft: '#E7EBF2',
      note: '有点沉，先别急着好吧', stickers: ['raindrop', 'cloud', 'moon'] },
    { id: 'anxious',label: '焦虑', color: '#AC8265', soft: '#F2E8E1',
      note: '心里有太多同时在响', stickers: ['yarn', 'wave', 'rain'] },
    { id: 'hope',   label: '期待', color: '#7BA168', soft: '#E9F0E3',
      note: '有件事还没发生，但已经在路上', stickers: ['sprout', 'bird', 'sun'] },
    { id: 'lonely', label: '孤独', color: '#8A87A0', soft: '#EAE9F0',
      note: '一个人待着，也算数', stickers: ['moon', 'star', 'window'] },
    { id: 'warm',   label: '温暖', color: '#C87B4A', soft: '#F7E9DF',
      note: '被接住了一小会儿', stickers: ['paw', 'cup', 'heart'] }
  ];

  const EMOTION_MAP = {};
  EMOTIONS.forEach(e => { EMOTION_MAP[e.id] = e; });

  /* ---------------- 文案库（直译优先、零烂词） ---------------- */
  const EMOTION_COPY = {
    tired: [
      '你已经做得够多了，剩下的明天再说。',
      '撑到现在的人，都很了不起了。',
      '今天先到这儿，没人规定要一路顺到底。',
      '累不是你的错，别把疲惫当成不够好。',
      '允许自己慢下来，路不会怪你。',
      '有些日子是用来过的，不是用来赢的。',
      '有些力气，得留着明天用。',
      '你不用一直有产出，停一下也是进度。',
      '今天已经很努力了，剩下的交给睡一觉。',
      '不是所有日子都要有进展，撑住就是进展。'
    ],
    calm: [
      '此刻没有必须解决的事，那就先没有。',
      '世界很吵，你这里挺安静。',
      '慢一点，也不会被落下。',
      '安静待着，也算一种前进。',
      '这一分钟只属于你。',
      '什么都不发生，也挺好。',
      '有些时间就是拿来浪费的。',
      '你在一个不用力的地方待着。',
      '这种平，其实很难得。',
      '不用赶，也不用交代。'
    ],
    happy: [
      '这一下开心，记住了。',
      '今天有一秒是亮着的。',
      '你笑起来的样子，自己也该被感染。',
      '好事不必多，有一件就够。',
      '这一刻值得被多看两眼。',
      '把这份轻收好，明天会用到。',
      '你刚刚自己逗笑了自己。',
      '真好，这种事不用理由。',
      '今天的快乐是限量的，趁热收着。',
      '这一刻的轻盈，先记下来。'
    ],
    sad: [
      '你不需要一直坚强。',
      '有点难过是允许的。',
      '今天先别急着好吧。',
      '你的感受不需要解释。',
      '被误解的时候，先照顾自己。',
      '不开心就不开心，不用找原因。',
      '你不是玻璃做的，偶尔碎一下也没关系。',
      '先歇一歇，别把硬撑成习惯。',
      '有些委屈放一放会变小。',
      '今天允许自己不那么体面。'
    ],
    anxious: [
      '先做一件最小的事。',
      '担心的事，大多不会来。',
      '你不需要现在就想明白全部。',
      '慢一点回复也没关系。',
      '把「万一」先放一放。',
      '现在能做的只有一件，那就做那一件。',
      '你脑子里的声音，不是命令。',
      '先睡一觉，很多事会变轻。',
      '慌的时候，先去洗把脸。',
      '你已经准备了比你想的多。'
    ],
    hope: [
      '好事在路上，先留个位置。',
      '今天值得期待一下。',
      '有个还没到的日子在等你。',
      '先期待着，也不算浪费。',
      '有些答案要等它自己长出来。',
      '还没开始，也是一种开始。',
      '先往前走，风景会跟上来。',
      '你在等的那件事，正在成形。',
      '期待是很好用的力气。',
      '留一点空白，好事才有地方来。'
    ],
    lonely: [
      '一个人也可以待得好。',
      '安静不等于孤单。',
      '你不用一直热闹着。',
      '世界很大，你有一个位置就够。',
      '想安静的时候，安静是允许的。',
      '你并不需要被填满。',
      '独处是充电，不是被剩下。',
      '这一刻只有你，也挺好。',
      '留一点只属于自己的时间。',
      '有些话先说给自己听，也算说过了。'
    ],
    warm: [
      '有一点点暖，就够撑一会儿。',
      '今天的温度，记住了。',
      '有人对你好，是有回响的。',
      '被接住的瞬间，值得停下来。',
      '光落在你身上了一会儿。',
      '这种暖不用多，就一小块。',
      '你也被好好对待过。',
      '把这份温度带回去。',
      '有些温柔是悄悄发生的。',
      '今天的你，也值得被温柔对待。'
    ]
  };

  /* 画面线索触发的补充句（直译照片，不空喊） */
  const HINT_COPY = {
    '光': [
      '今天这点光，是借给你的。',
      '光刚好落在这一块，别辜负。',
      '有一束光停住了，就当是提醒。'
    ],
    '天空': [
      '抬头那一下，天空刚好。',
      '天很大，你占的那一小块也挺好。',
      '云走过去了，剩下的就是你的。'
    ],
    '夜': [
      '夜里也有一小块是亮的。',
      '晚一点没关系，灯还亮着。',
      '今天撑到这一格的，都算数。'
    ],
    '绿': [
      '有这一处绿，就够了。',
      '会长的都在慢慢长。',
      '这点颜色，比你想的耐用。'
    ],
    '人': [
      '先照顾好自己，再照顾别的。',
      '被拍下来的这个人，今天已经很努力。',
      '你的脸不用有表情也可以。',
      '你在就够了。'
    ],
    '桌面': [
      '桌上那点东西，替你撑了一会儿。',
      '收拾不收拾，都不影响今天。',
      '这堆乱糟糟，也是一种在生活。'
    ],
    '窗': [
      '窗外那点动静，也是今天的一部分。',
      '光从那边进来，先落在这。',
      '看着外面，就当透了口气。'
    ]
  };

  /* ---------------- 手绘注脚库（线描 SVG，零文字） ---------------- */
  const STICKERS = {
    sun: {
      name: '小太阳',
      d: ['M32 20.5c6.4 0 11.5 5.1 11.5 11.5S38.4 43.5 32 43.5 20.5 38.4 20.5 32 25.6 20.5 32 20.5Z',
          'M32 9v6M32 49v6M9 32h6M49 32h6M15.7 15.7l4.3 4.3M43.9 43.9l4.3 4.3M48.3 15.7L44 20M20 44l-4.3 4.3']
    },
    star: {
      name: '小星星',
      d: ['M32 11l4.9 10.4 11.3 1.5-8.3 7.9 2.1 11.3L32 36.6 22 42.1l2.1-11.3-8.3-7.9 11.3-1.5Z']
    },
    moon: {
      name: '弯月',
      d: ['M41.5 11.5c-9.6 2.8-15.6 12.4-13.2 22.2 2.6 10.6 13.8 16.2 22.2 12.9C41.6 50.4 33.9 44.2 32.6 35 31.4 27 34.2 16.9 41.5 11.5Z']
    },
    cloud: {
      name: '云',
      d: ['M17 43c-5.2 0-9-3.7-9-8.2 0-4.2 3.2-7.6 7.4-8 1.2-6.3 6.6-10.9 13.1-10.9 7 0 12.8 5.3 13.7 12 4.9.4 8.8 4.3 8.8 8.8 0 4.9-4 8.3-9.1 8.3H17Z',
          'M22 36.5c3.5-2.5 7.6-3.4 11.6-2.4']
    },
    rain: {
      name: '小雨',
      d: ['M17 35c-4.6 0-7.9-3.2-7.9-7.1 0-3.7 2.8-6.6 6.4-6.9 1.1-5.5 5.7-9.5 11.4-9.5 6.1 0 11.1 4.6 11.9 10.4 4.3.4 7.6 3.8 7.6 7.6 0 4.2-3.4 6.9-7.9 6.9H17Z',
          'M22 41l-2.4 7M32 41l-2.4 7M42 41l-2.4 7']
    },
    raindrop: {
      name: '一滴水',
      d: ['M32 10c7 9.8 11.3 16.6 11.3 22.4C43.3 40.8 38.2 46 32 46s-11.3-5.2-11.3-13.6C20.7 26.6 25 19.8 32 10Z']
    },
    lamp: {
      name: '小台灯',
      d: ['M13.5 30.5h37L43 16H21Z', 'M32 30.5V46', 'M23 49h18']
    },
    leaf: {
      name: '叶子',
      d: ['M12.5 45C12.5 29 23 15.5 45 13c1.2 21-9.2 34.5-24.4 34.5-5 0-8.1-1-8.1-2.5Z',
          'M19.5 41c8.6-6.4 15-13.5 21-23']
    },
    sprout: {
      name: '小芽',
      d: ['M32 52V29', 'M32 31c-8.6 0-13-5.4-13-10.8 7.6-1.3 13 3.4 13 10.8Z',
          'M32 31c8.6 0 13.6-5.6 13.6-11.2-8.2-1.3-13.6 4.2-13.6 11.2Z']
    },
    bird: {
      name: '小鸟',
      d: ['M20 40c0-8 6.4-14.5 14.5-14.5 6.6 0 11.5 4.2 13.5 9.8l6 2.7-6.6 2.2c-2.3 4.4-6.8 7.3-12.9 7.3-7.2 0-14.5-2.4-14.5-7.5Z',
          'M28 30c4.6-4.6 10.4-5.4 15.4-2.2']
    },
    yarn: {
      name: '毛线团',
      d: ['M32 14.5c9.6 0 16.3 6.6 16.3 16.3S41.6 50 32 50 15.7 40.4 15.7 30.8 22.4 14.5 32 14.5Z',
          'M21.5 24.5c8 3 17 10 20.5 20', 'M26 16.5c2 10 9 18.5 18 21.5', 'M18 36c7-1 14 1 19.5 6']
    },
    wave: {
      name: '水面',
      d: ['M9 27c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0',
          'M9 38c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0',
          'M9 49c4-3.4 8-3.4 12 0s8 3.4 12 0 8-3.4 12 0 8 3.4 10 0']
    },
    wind: {
      name: '风',
      d: ['M10 22h22a6.5 6.5 0 1 0-6.4-7.8', 'M10 33h28a6.5 6.5 0 1 1-6.4 7.8', 'M10 27.5h13']
    },
    cup: {
      name: '杯子',
      d: ['M15 25h27v17.5A7.5 7.5 0 0 1 34.5 50h-12A7.5 7.5 0 0 1 15 42.5Z',
          'M42 29h4.5a6.5 6.5 0 0 1 0 13H42']
    },
    paw: {
      name: '猫爪',
      d: ['M32 47c6.6 0 12-4 12-9 0-4-4-6.4-12-6.4S20 34 20 38c0 5 5.4 9 12 9Z',
          'M16 27.5c2.6 0 4.4-2.6 4.4-5.4 0-2.4-1.6-4.1-3.9-4.1-2.6 0-4.6 2.2-4.6 5 0 2.6 1.8 4.5 4.1 4.5Z',
          'M27.5 20.5c2.7 0 4.7-2.7 4.7-5.6 0-2.5-1.7-4.3-4.1-4.3-2.7 0-4.8 2.3-4.8 5.2 0 2.7 1.9 4.7 4.2 4.7Z',
          'M42 27.5c2.3 0 4.1-1.9 4.1-4.5 0-2.8-2-5-4.6-5-2.3 0-3.9 1.7-3.9 4.1 0 2.8 1.8 5.4 4.4 5.4Z',
          'M50 27.5c2.3 0 4.1-1.9 4.1-4.5 0-2.8-2-5-4.6-5-2.3 0-3.9 1.7-3.9 4.1 0 2.8 1.8 5.4 4.4 5.4Z']
    },
    heart: {
      name: '小爱心',
      d: ['M32 50C17 40.5 12 32.6 12 25.5 12 18.6 16.9 14 23 14c4 0 7.4 2.1 9 5.2C33.6 16.1 37 14 41 14c6.1 0 11 4.6 11 11.5C52 32.6 47 40.5 32 50Z']
    },
    window: {
      name: '窗',
      d: ['M14 13h36v38H14Z', 'M32 13v38', 'M14 32h36', 'M44 32h10l-6 6']
    },
    spark: {
      name: '小闪',
      d: ['M32 11l3.4 12.2L47.5 26l-12 3.4L32 42l-3.4-12.6L16.5 26l12.1-2.8Z']
    }
  };

  const STICKER_KEYS = Object.keys(STICKERS);

  /* 注脚落位（避开人脸常见区域：上中偏下为主） */
  const ANCHORS = [
    { x: 0.18, y: 0.78, r: -8 },
    { x: 0.80, y: 0.76, r: 7 },
    { x: 0.16, y: 0.30, r: 6 },
    { x: 0.82, y: 0.28, r: -6 },
    { x: 0.50, y: 0.88, r: 3 }
  ];

  /* ---------------- 像素级图像分析（离线） ---------------- */
  function analyzeImage(img) {
    const N = 96;
    const cv = document.createElement('canvas');
    cv.width = N; cv.height = N;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, N, N);
    let data;
    try { data = ctx.getImageData(0, 0, N, N).data; }
    catch (e) { return defaultFeatures(); }

    let sumL = 0, sumS = 0, sumW = 0, dark = 0, bright = 0, sat = 0;
    let green = 0, sky = 0, skin = 0, warmLight = 0;
    let faceSkin = 0, faceArea = 0;
    let topL = 0, botL = 0, cntTop = 0, cntBot = 0;
    const lums = [];
    const hueHist = new Array(12).fill(0);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const s = max === 0 ? 0 : (max - min) / 255;
      sumL += l; sumS += s; sumW += (r - b) / 255;
      lums.push(l);
      if (l < 0.24) dark++;
      if (l > 0.78) bright++;
      if (s > 0.18) sat++;
      if (g > r + 6 && g > b + 6) green++;
      if (b > r + 8 && l > 0.55) sky++;
      if (r > 150 && g > 115 && b < 145 && l > 0.55) warmLight++;

      const isSkin = r > 112 && g > 68 && b > 48 && r > g && r > b &&
                     (r - b) > 24 && (r - g) > 12 && l > 0.30 && s > 0.10;
      if (isSkin) skin++;

      const x = p % N, y = (p / N) | 0;
      if (x > N * 0.22 && x < N * 0.78 && y > N * 0.04 && y < N * 0.55) {
        faceArea++;
        if (isSkin) faceSkin++;
      }

      if (y < N * 0.35) { topL += l; cntTop++; }
      else if (y > N * 0.65) { botL += l; cntBot++; }

      let h = 0;
      const dmax = max - min;
      if (dmax > 18) {
        if (max === r) h = ((g - b) / dmax) % 6;
        else if (max === g) h = (b - r) / dmax + 2;
        else h = (r - g) / dmax + 4;
        h = Math.round(h * 60 / 30) % 12;
        if (h < 0) h += 12;
      }
      hueHist[h] += s;
    }

    const total = data.length / 4;
    const avgL = sumL / total;
    const variance = lums.reduce((a, v) => a + (v - avgL) * (v - avgL), 0) / total;

    /* 边缘密度：相邻像素亮度跳变的频率。密集色块的全局标准差不高，
       但边缘极多——这正是"杂乱/焦虑"的特征，用它比标准差更敏感。 */
    let edge = 0, edgeCnt = 0;
    for (let y = 1; y < N - 1; y++) {
      for (let x = 1; x < N - 1; x++) {
        const i = (y * N + x) * 4;
        const l = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        const r2 = (0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6]) / 255;
        const d2 = (0.299 * data[i + N * 4] + 0.587 * data[i + N * 4 + 1] + 0.114 * data[i + N * 4 + 2]) / 255;
        edge += Math.abs(l - r2) + Math.abs(l - d2);
        edgeCnt += 2;
      }
    }
    const edgeDensity = edgeCnt ? edge / edgeCnt : 0;

    let domHue = 0, domVal = -1;
    for (let i = 0; i < 12; i++) if (hueHist[i] > domVal) { domVal = hueHist[i]; domHue = i; }

    const f = {
      L: avgL,
      S: sumS / total,
      W: sumW / total,
      contrast: Math.sqrt(variance),
      edgeDensity: edgeDensity,
      darkRatio: dark / total,
      brightRatio: bright / total,
      satRatio: sat / total,
      greenRatio: green / total,
      skyRatio: sky / total,
      skinRatio: skin / total,
      faceRatio: faceArea ? faceSkin / faceArea : 0,
      warmLightRatio: warmLight / total,
      topL: cntTop ? topL / cntTop : avgL,
      botL: cntBot ? botL / cntBot : avgL,
      domHue: domHue * 30
    };

    /* 画面线索 */
    const hints = [];
    if (f.skyRatio > 0.16) hints.push('天空');
    if (f.warmLightRatio > 0.06) hints.push('光');
    if (f.L < 0.34 && f.darkRatio > 0.38) hints.push('夜');
    if (f.greenRatio > 0.11) hints.push('绿');
    /* 只有当"上部中央"聚集了足够肤色，才认为是画面里有人 */
    if (f.faceRatio > 0.14 && f.skinRatio > 0.03) hints.push('人');
    if (f.topL - f.botL > 0.12) hints.push('窗');
    f.hints = hints;
    f.domColor = dominantColor(data);
    return f;
  }

  function defaultFeatures() {
    return {
      L: 0.5, S: 0.2, W: 0, contrast: 0.16, edgeDensity: 0.03, darkRatio: 0.2, brightRatio: 0.2,
      satRatio: 0.3, greenRatio: 0.05, skyRatio: 0.05, skinRatio: 0.03, faceRatio: 0,
      warmLightRatio: 0.04, topL: 0.5, botL: 0.5, domHue: 30,
      hints: [], domColor: '#B9AFA0'
    };
  }

  function dominantColor(data) {
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n);
    const mx = Math.max(r, g, b, 1);
    const l = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const s = (mx - Math.min(r, g, b)) / mx;
    const shift = l < 0.45 ? 0.75 : 1;
    const mix = (c) => Math.round(clamp(c * shift + 245 * (1 - shift) * 0.55, 0, 255));
    return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  }

  /* ---------------- 情绪判定 ---------------- */
  function judgeEmotion(f, seed) {
    const s = {
      tired: 3.2 * (f.L < 0.42 ? 1 : 0) + 1.6 * (f.darkRatio > 0.32 ? 1 : 0)
           + 1.2 * (f.contrast > 0.19 ? 1 : 0) - 1.6 * (f.S > 0.42 ? 1 : 0),
      calm: 2.5 * (f.S < 0.18 ? 1 : 0) + 1.9 * (f.L > 0.44 && f.L < 0.72 ? 1 : 0)
           + 1.3 * (f.brightRatio < 0.12 ? 1 : 0) - 1.7 * (f.contrast > 0.25 ? 1 : 0),
      happy: 2.7 * (f.S > 0.34 ? 1 : 0) + 1.8 * (f.W > 0.05 ? 1 : 0)
           + 1.4 * (f.brightRatio > 0.14 ? 1 : 0) - 1.5 * (f.darkRatio > 0.36 ? 1 : 0),
      sad: 2.1 * (f.L < 0.38 ? 1 : 0) + 1.7 * (f.S > 0.28 && f.L < 0.46 ? 1 : 0)
          + 1.2 * (f.skyRatio > 0.14 && f.brightRatio > 0.18 ? 1 : 0),
      anxious: 2.8 * (f.edgeDensity > 0.011 ? 1 : 0) + 2.0 * (f.contrast > 0.20 ? 1 : 0)
              + 1.6 * (f.edgeDensity > 0.008 && f.S > 0.20 ? 1 : 0)
              + 1.0 * (f.darkRatio > 0.30 && f.S > 0.22 ? 1 : 0)
              - 2.0 * (f.edgeDensity < 0.007 ? 1 : 0),
      hope: 1.9 * (f.greenRatio > 0.11 ? 1 : 0) + 1.9 * (f.W > 0.02 && f.L > 0.58 ? 1 : 0)
           + 1.5 * (f.skyRatio > 0.17 && f.L > 0.54 ? 1 : 0),
      lonely: 2.1 * (f.L < 0.37 && f.S < 0.22 ? 1 : 0) + 1.5 * (f.darkRatio > 0.34 ? 1 : 0)
             + 1.1 * (f.topL - f.botL < -0.08 ? 1 : 0) - 1.4 * (f.skinRatio > 0.08 ? 1 : 0),
      warm: 2.7 * (f.warmLightRatio > 0.08 ? 1 : 0) + 2.1 * (f.W > 0.085 ? 1 : 0)
           + 1.4 * (f.faceRatio > 0.14 ? 1 : 0) + 0.8 * (f.S > 0.22 && f.L > 0.42 && f.L < 0.78 ? 1 : 0)
    };
    const rnd = seededRandom(seed || 1);
    Object.keys(s).forEach(k => { s[k] = Math.max(0, s[k] + (rnd() - 0.5) * 0.35); });
    const sorted = Object.entries(s).sort((a, b) => b[1] - a[1]);
    const total = sorted.reduce((a, b) => a + b[1], 0) || 1;
    const top = sorted[0];
    const confidence = clamp(top[1] / total * 100 * 3.2, 28, 94);
    return { emotionId: top[0], confidence: Math.round(confidence), scores: s };
  }

  /* ---------------- 文案挑选 ---------------- */
  const sessionUsed = new Set();

  function pickCopy(emotionId, hints, seed, avoidHint) {
    const pool = EMOTION_COPY[emotionId] || EMOTION_COPY.calm;
    const rnd = seededRandom(seed || 7);
    const usable = (hints || []).filter(h => h !== avoidHint);
    const hint = usable.length ? usable[Math.floor(rnd() * usable.length)] : null;

    let line;
    if (hint && HINT_COPY[hint] && rnd() < 0.42) {
      const hp = HINT_COPY[hint];
      line = hp[Math.floor(rnd() * hp.length)];
    } else {
      const fresh = pool.filter(l => !sessionUsed.has(l));
      const arr = fresh.length ? fresh : pool;
      line = arr[Math.floor(rnd() * arr.length)];
    }
    sessionUsed.add(line);
    if (sessionUsed.size > 200) sessionUsed.clear();
    return { line, hint };
  }

  function pickDetail(emotionId, hints, avoidHint) {
    const e = EMOTION_MAP[emotionId];
    const usable = (hints || []).filter(h => h !== avoidHint);
    const hint = usable.length ? usable[0] : (hints && hints[0]) || null;
    const map = {
      '光': '我看见了落在你身上的一点光。',
      '天空': '我看见了那一片天。',
      '夜': '我看见了夜里还亮着的一小块。',
      '绿': '我看见了那一处绿。',
      '人': '我看见了你自己。',
      '窗': '我看见了窗那边透进来的动静。'
    };
    const first = hint && map[hint] ? map[hint] : '我看见了这一下。';
    return first + (e ? e.note + '。' : '');
  }

  /* 组合文案 + 详情，保证两者不指向同一个线索 */
  function compose(emotionId, hints, seed) {
    const usable = (hints || []).filter(Boolean);
    const a = pickCopy(emotionId, usable, seed);
    const b = pickDetail(emotionId, usable, a.hint);
    return { copy: a.line, detail: b };
  }

  function pickSticker(emotionId, seed, exclude) {
    const e = EMOTION_MAP[emotionId];
    let list = e && e.stickers ? e.stickers.slice() : STICKER_KEYS.slice();
    if (exclude && list.length > 1) list = list.filter(k => k !== exclude);
    const rnd = seededRandom(seed || 3);
    return list[Math.floor(rnd() * list.length)];
  }

  /* ---------------- IndexedDB 档案 ---------------- */
  const DB_NAME = 'shiyu', DB_STORE = 'moments';
  let dbPromise = null;

  function db() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbPromise;
  }

  async function idbAll() {
    try {
      const d = await db();
      return await new Promise((res, rej) => {
        const t = d.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).getAll();
        t.onsuccess = () => res(t.result || []);
        t.onerror = () => rej(t.error);
      });
    } catch (e) { return []; }
  }

  async function idbPut(item) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).put(item);
      t.onsuccess = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }

  async function idbDel(id) {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(DB_STORE, 'readwrite').objectStore(DB_STORE).delete(id);
      t.onsuccess = () => res(true);
      t.onerror = () => rej(t.error);
    });
  }

  /* ---------------- 设置 ---------------- */
  const SETTINGS_KEY = 'shiyu.settings.v1';

  function defaultSettings() {
    return {
      provider: 'off',      // off | openai | gemini
      baseUrl: '',
      model: '',
      apiKey: '',
      style: 'ink',         // ink 手绘 | stamp 印章
      remindHour: 20,
      remindOn: false
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign(defaultSettings(), raw ? JSON.parse(raw) : {});
    } catch (e) { return defaultSettings(); }
  }

  function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {}
  }

  /* ---------------- 可选：视觉大模型升级 ---------------- */
  async function callVLM(settings, dataUrl, features) {
    if (!settings.provider || settings.provider === 'off' || !settings.apiKey) return null;
    const prompt = [
      '你是中文情绪观察者。看图并只输出 JSON，不要任何多余文字。',
      '字段：emotion( tired|calm|happy|sad|anxious|hope|lonely|warm 八选一 ),',
      'confidence(0-100整数), copy(一句话中文文案,20字内,具体、像从心里说出来,',
      '禁止出现"治愈""岁月静好""加油""晚安""放下"等空词,禁止解释情绪),',
      'detail(一句"我看见了…",25字内,必须指向画面里的具体物件或光线),',
      'sticker(从 sun,star,moon,cloud,rain,raindrop,lamp,leaf,sprout,bird,yarn,wave,wind,cup,paw,heart,window,spark 中选一个最贴合此刻的)',
      JSON.stringify({ 'ok': 1 })
    ].join('');

    const t0 = Date.now();
    try {
      if (settings.provider === 'gemini') {
        const base = (settings.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/$/, '');
        const url = base + '/' + settings.model + ':generateContent?key=' + encodeURIComponent(settings.apiKey);
        const res = await fetch(url, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: dataUrl.split(',')[1] } }] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.9 }
          })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const j = await res.json();
        const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text).join('');
        return parseVLM(txt, features, Date.now() - t0);
      }
      const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
      const res = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + settings.apiKey },
        body: JSON.stringify({
          model: settings.model || 'gpt-4o-mini',
          temperature: 0.9,
          response_format: { type: 'json_object' },
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const txt = j.choices?.[0]?.message?.content || '';
      return parseVLM(txt, features, Date.now() - t0);
    } catch (e) {
      return { error: String(e.message || e) };
    }
  }

  function parseVLM(txt, features, ms) {
    if (!txt) return null;
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    let obj;
    try { obj = JSON.parse(m[0]); } catch (e) { return null; }
    const emotionId = EMOTION_MAP[obj.emotion] ? obj.emotion : 'calm';
    const copy = (typeof obj.copy === 'string' ? obj.copy : (obj.copy || [])[0] || '').trim();
    const detail = (typeof obj.detail === 'string' ? obj.detail : '').trim();
    const sticker = STICKERS[obj.sticker] ? obj.sticker : pickSticker(emotionId, hashStr(copy || 'x'));
    if (!copy) return null;
    return {
      emotionId, confidence: clamp(Number(obj.confidence) || 70, 20, 99),
      copy: copy.slice(0, 40), detail: detail.slice(0, 60),
      sticker, source: 'vlm', ms
    };
  }

  /* ---------------- 注脚渲染 ---------------- */
  function stickerSVG(key, opts) {
    opts = opts || {};
    const s = STICKERS[key] || STICKERS.spark;
    const size = opts.size || 96;
    const color = opts.color || '#3A342C';
    const ink = opts.ink || 'rgba(255,255,255,0.85)';
    const rot = opts.rotate || 0;
    const paths = s.d.map(d =>
      '<path d="' + d + '" fill="none" stroke="' + ink + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
    ).join('');
    const paths2 = s.d.map(d =>
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    ).join('');
    let inner;
    if (opts.stamp) {
      inner =
        '<g transform="rotate(' + rot + ' 32 32)">' +
        '<circle cx="32" cy="32" r="29" fill="none" stroke="' + ink + '" stroke-width="5"/>' +
        '<circle cx="32" cy="32" r="29" fill="none" stroke="' + color + '" stroke-width="2.4"/>' +
        '<circle cx="32" cy="32" r="25" fill="none" stroke="' + color + '" stroke-width="1" stroke-dasharray="2 5"/>' +
        '<g transform="translate(10 10) scale(0.69)">' + paths + paths2 + '</g>' +
        '</g>';
    } else {
      inner = '<g transform="rotate(' + rot + ' 32 32)">' + paths + paths2 + '</g>';
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" class="sticker-svg" viewBox="0 0 64 64" width="' + size + '" height="' + size + '" aria-hidden="true">' + inner + '</svg>';
  }

  /* ---------------- 导出海报 ---------------- */
  function exportPoster(item, style) {
    return new Promise((resolve, reject) => {
      const W = 1080, H = 1350, PH = 1080;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');

      ctx.fillStyle = '#FBF7F0';
      ctx.fillRect(0, 0, W, H);

      const img = new Image();
      img.onload = () => {
        const r = Math.max(W / img.width, PH / img.height);
        const dw = img.width * r, dh = img.height * r;
        ctx.drawImage(img, (W - dw) / 2, (PH - dh) / 2, dw, dh);

        const emo = EMOTION_MAP[item.emotionId] || EMOTION_MAP.calm;
        const inkColor = '#3A342C';

        /* 底部文案带 */
        const bandY = PH;
        const grad = ctx.createLinearGradient(0, bandY, 0, H);
        grad.addColorStop(0, '#FBF7F0');
        grad.addColorStop(1, '#F4EDE2');
        ctx.fillStyle = grad;
        ctx.fillRect(0, bandY, W, H - bandY);

        ctx.fillStyle = emo.color;
        ctx.beginPath(); ctx.arc(64, bandY + 52, 7, 0, Math.PI * 2); ctx.fill();

        ctx.font = '500 26px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#6E6558';
        ctx.fillText(emo.label + ' · ' + timeLabel(item.ts), 86, bandY + 60);

        ctx.fillStyle = inkColor;
        ctx.font = '500 46px "Songti SC","SimSun","PingFang SC",serif';
        const line = wrapText(ctx, item.copy, W - 128, 2);
        line.forEach((t, i) => ctx.fillText(t, 64, bandY + 132 + i * 66));

        ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
        ctx.fillStyle = '#9A9082';
        ctx.fillText('拾愈 · ' + dateKey(new Date(item.ts)), 64, H - 46);

        cv.toBlob(b => {
          const url = URL.createObjectURL(b);
          resolve(url);
        }, 'image/png', 0.95);
      };
      img.onerror = reject;
      img.src = item.dataUrl;
    });
  }

  function wrapText(ctx, text, maxW, maxLines) {
    const chars = Array.from(text || '');
    const lines = [];
    let cur = '';
    for (const ch of chars) {
      const test = cur + ch;
      if (ctx.measureText(test).width > maxW && cur) {
        lines.push(cur);
        cur = ch;
        if (lines.length >= maxLines) break;
      } else cur = test;
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && chars.length > lines.join('').length) {
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + '…';
    }
    return lines;
  }

  function download(url, filename) {
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
  }

  return {
    $, $$, uid, hashStr, seededRandom, clamp, pad, dateKey, dayLabel, timeLabel,
    EMOTIONS, EMOTION_MAP, EMOTION_COPY, HINT_COPY, STICKERS, STICKER_KEYS, ANCHORS,
    analyzeImage, defaultFeatures, judgeEmotion, pickCopy, pickDetail, pickSticker,
    idbAll, idbPut, idbDel, loadSettings, saveSettings, defaultSettings,
    callVLM, stickerSVG, exportPoster, download, wrapText,
    analyze: analyzeImage, judge: judgeEmotion,
    copyFor: pickCopy, detailFor: pickDetail, stickerFor: pickSticker, compose
  };
})();
