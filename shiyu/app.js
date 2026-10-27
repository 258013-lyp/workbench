/* ============================================================
   拾愈 · 交互层
   ============================================================ */
(function () {
  'use strict';
  const S = window.SY;
  const $ = S.$, $$ = S.$$;

  const state = {
    settings: S.loadSettings(),
    stream: null,
    facing: 'environment',
    moments: [],
    current: null,       // 当前结果
    saved: false,
    mapMonth: new Date(),
    remindTimer: null,
    busy: false           // 生成中标志，防止并发/重入
  };

  /* ---------------- 提示 ---------------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------------- 视图切换 ---------------- */
  function switchView(name) {
    $$('.view').forEach(v => v.classList.remove('is-on'));
    $('#view-' + name).classList.add('is-on');
    $$('.tab').forEach(t => t.classList.toggle('is-on', t.dataset.view === name));
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (name === 'today') renderToday();
    if (name === 'map') renderMap();
    if (name === 'shoot' && !state.current) startCamera();
  }

  $('#tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab');
    if (b) switchView(b.dataset.view);
  });

  /* ---------------- 相机 ---------------- */
  async function startCamera() {
    stopCamera();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $('#stageEmpty').style.display = '';
      return;
    }
    try {
      const constraints = {
        video: { facingMode: state.facing, width: { ideal: 1440 }, height: { ideal: 1920 } },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.stream = stream;
      const v = $('#video');
      v.srcObject = stream;
      await v.play().catch(() => {});
      $('#stageEmpty').style.display = 'none';
    } catch (e) {
      $('#stageEmpty').style.display = '';
    }
  }

  function stopCamera() {
    if (state.stream) {
      state.stream.getTracks().forEach(t => t.stop());
      state.stream = null;
    }
  }

  $('#btnFlip').addEventListener('click', () => {
    state.facing = state.facing === 'environment' ? 'user' : 'environment';
    startCamera();
  });

  $('#btnAlbum').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });

  $('#btnShoot').addEventListener('click', () => {
    const v = $('#video');
    if (!v.videoWidth) { toast('相机未就绪，可从相册选一张'); return; }
    const cv = $('#canvas');
    const W = 1080;
    const ratio = v.videoHeight / v.videoWidth;
    cv.width = W; cv.height = Math.round(W * ratio);
    const ctx = cv.getContext('2d');
    const sx = (v.videoWidth - cv.height * v.videoWidth / v.videoHeight) / 2;
    ctx.drawImage(v, sx, 0, cv.height * v.videoWidth / v.videoHeight, v.videoHeight, 0, 0, cv.width, cv.height);
    handleCanvas(cv);
  });

  function handleFile(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const cv = $('#canvas');
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.naturalWidth);
      cv.width = Math.round(img.naturalWidth * scale);
      cv.height = Math.round(img.naturalHeight * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      handleCanvas(cv);
    };
    img.onerror = () => toast('这张图片读不出来');
    img.src = url;
  }

  function handleCanvas(cv) {
    const dataUrl = cv.toDataURL('image/jpeg', 0.88);
    const img = new Image();
    img.onload = () => generate(dataUrl, img);
    img.src = dataUrl;
  }

  /* ---------------- 生成流程 ---------------- */
  async function generate(dataUrl, img) {
    if (state.busy) return;            // 防止快速连点/重入导致并发生成与重复花 API
    state.busy = true;
    try {
    showLoading(true, '正在读你的此刻…');
    const features = S.analyzeImage(img);
    const seed = S.hashStr(dataUrl.slice(-200) + Date.now());

    const judged = S.judgeEmotion(features, seed);
    let emotionId = judged.emotionId;
    let confidence = judged.confidence;
    const composed = S.compose(emotionId, features.hints, seed);
    let copy = composed.copy;
    let detail = composed.detail;
    let stickerKeys = S.stickersFor(emotionId, features, seed);
    let source = '本地分析';

    const st = state.settings;
    if (st.provider && st.provider !== 'off' && st.apiKey) {
      showLoading(true, '模型正在看这张照片…');
      const r = await S.callVLM(st, dataUrl, features);
      if (r && r.error) {
        toast('模型没接上，已用本地判断');
      } else if (r) {
        emotionId = r.emotionId; confidence = r.confidence;
        copy = r.copy; detail = r.detail;
        stickerKeys = [r.sticker];
        source = '模型识别';
      }
    }

    const placed = S.plan(features, stickerKeys, seed);

    /* 双通道之二：联网 AI 生成贴合此照片的专属贴纸（失败则降级本地图库） */
    let stickerImg = null;
    if (st.genOn && st.genKey) {
      showLoading(true, 'AI 正在为你画一张专属贴纸…');
      const g = await S.genSticker(st, dataUrl, S.EMOTION_MAP[emotionId].label, features.hints);
      if (g.img) stickerImg = g.img;
      else toast('AI 生成没接上，已用本地贴纸');
    }
    if (stickerImg) {
      placed[0] = { key: '__gen__', img: stickerImg, x: placed[0].x, y: placed[0].y, r: placed[0].r };
    }

    state.current = {
      id: S.uid(), ts: Date.now(), dataUrl,
      emotionId, confidence, copy, detail,
      stickers: stickerKeys, placed,
      style: state.settings.style,
      stickerImg,
      features
    };
    state.saved = false;
    renderResult();
    showLoading(false);
    } catch (err) {
      console.error(err);
      showLoading(false);
      toast('生成出了点问题，再试一次');
    } finally {
      state.busy = false;
    }
  }

  function pickAnchor(seed) {
    const r = S.seededRandom(seed);
    const a = S.ANCHORS[Math.floor(r() * S.ANCHORS.length)];
    return { x: a.x, y: a.y, r: a.r };
  }

  function renderResult() {
    const c = state.current;
    if (!c) return;
    const emo = S.EMOTION_MAP[c.emotionId];

    const photo = $('#resultPhoto');
    const holder = $('#stickerHolder');
    /* 只替换图片，保留注脚容器（其上的拖拽监听不能丢） */
    photo.querySelectorAll('img').forEach(n => n.remove());
    const im = new Image();
    im.src = c.dataUrl;
    im.alt = '';
    photo.insertBefore(im, holder);

    $('#result').hidden = false;
    $('#stage').classList.add('has-result');
    $('#emotionDot').style.background = emo.color;
    $('#emotionName').textContent = emo.label;
    $('#emotionConf').textContent = '情绪强度 ' + c.confidence;
    $('#emotionSource').textContent = c.source || '本地分析';
    $('#resultCopy').textContent = c.copy;
    $('#resultDetail').textContent = c.detail;
    $('#btnSave').disabled = false;
    $('#btnSave').textContent = state.saved ? '已存入今日档案' : '存入今日档案';

    applyGlow();
    buildStickerNodes();
    layoutSticker();
  }

  /* 情绪柔光：在照片上蒙一层极淡的情绪色，只做氛围，不改照片本身 */
  function applyGlow() {
    const c = state.current; if (!c) return;
    const tint = $('#photoTint'); if (!tint) return;
    const emo = S.EMOTION_MAP[c.emotionId];
    if (state.settings.glow) {
      const col = emo ? emo.color : '#C87B4A';
      tint.style.opacity = '1';
      tint.style.background =
        'radial-gradient(120% 85% at 50% 28%, ' + hexA(col, 0.24) + ' 0%, ' + hexA(col, 0) + ' 68%),' +
        'linear-gradient(0deg, ' + hexA(col, 0.16) + ' 0%, ' + hexA(col, 0) + ' 52%)';
    } else {
      tint.style.opacity = '0';
    }
  }

  function hexA(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return 'rgba(200,123,74,' + a + ')';
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* 根据 c.placed 构建可拖拽的贴纸节点（保留旧节点以复用拖拽监听） */
  function buildStickerNodes() {
    const c = state.current; if (!c) return;
    const holder = $('#stickerHolder');
    if (!holder) return;
    const want = (c.placed || []).length;
    const have = holder.children.length;
    if (have < want) {
      for (let i = have; i < want; i++) {
        const node = document.createElement('div');
        node.className = 'sticker-node';
        holder.appendChild(node);
      }
    } else if (have > want) {
      for (let i = want; i < have; i++) holder.removeChild(holder.lastChild);
    }
    (c.placed || []).forEach((p, i) => {
      const node = holder.children[i];
      if (!node) return;
      node.dataset.idx = i;
      node.innerHTML = '';
      if (p.img) {
        /* 联网生成的贴纸地址来自外部，用属性赋值而非拼进 innerHTML，避免注入 */
        const im = document.createElement('img');
        im.className = 'sticker-img';
        im.alt = '';
        im.src = p.img;
        node.appendChild(im);
      } else {
        node.innerHTML = S.stickerSVG(p.key, {
          size: 100, stamp: c.style === 'stamp', rotate: c.style === 'stamp' ? p.r : 0
        });
      }
    });
  }

  function layoutSticker() {
    const c = state.current;
    const holder = $('#stickerHolder');
    if (!c || !holder) return;
    const photo = $('#resultPhoto');
    const w = photo.clientWidth, h = photo.clientHeight;
    const size = Math.max(56, Math.min(w, h) * 0.20);
    (c.placed || []).forEach((p, i) => {
      const node = holder.children[i];
      if (!node) return;
      node.style.width = size + 'px';
      node.style.height = size + 'px';
      node.style.left = (p.x * w - size / 2) + 'px';
      node.style.top = (p.y * h - size / 2) + 'px';
      node.style.transform = 'rotate(' + p.r + 'deg)';
    });
  }

  /* 拖动注脚（事件委托，支持多贴纸各自拖拽） */
  (function enableDrag() {
    const holder = $('#stickerHolder');
    if (!holder) return;
    let dragging = false, idx = -1, startX = 0, startY = 0, origX = 0, origY = 0;
    holder.addEventListener('pointerdown', e => {
      const node = e.target.closest('.sticker-node'); if (!node) return;
      const c = state.current; if (!c) return;
      dragging = true; idx = +node.dataset.idx;
      node.classList.add('dragging');
      try { node.setPointerCapture(e.pointerId); } catch (err) {}
      startX = e.clientX; startY = e.clientY;
      const photo = $('#resultPhoto');
      origX = c.placed[idx].x * photo.clientWidth;
      origY = c.placed[idx].y * photo.clientHeight;
    });
    holder.addEventListener('pointermove', e => {
      if (!dragging) return;
      const c = state.current; if (!c) return;
      const photo = $('#resultPhoto');
      const nx = origX + (e.clientX - startX);
      const ny = origY + (e.clientY - startY);
      c.placed[idx].x = S.clamp(nx / photo.clientWidth, 0.06, 0.94);
      c.placed[idx].y = S.clamp(ny / photo.clientHeight, 0.06, 0.94);
      layoutSticker();
    });
    const end = e => {
      dragging = false;
      const n = e.target.closest && e.target.closest('.sticker-node');
      if (n) n.classList.remove('dragging');
    };
    holder.addEventListener('pointerup', end);
    holder.addEventListener('pointercancel', end);
  })();

  window.addEventListener('resize', () => { if (state.current) layoutSticker(); });

  /* 操作按钮 */
  $('#btnCopyAgain').addEventListener('click', () => {
    const c = state.current; if (!c) return;
    const seed = S.hashStr(c.copy + Date.now());
    const composed = S.compose(c.emotionId, c.features.hints, seed);
    c.copy = composed.copy;
    c.detail = composed.detail;
    $('#resultCopy').textContent = c.copy;
    $('#resultDetail').textContent = c.detail;
  });

  $('#btnStickerAgain').addEventListener('click', async () => {
    const c = state.current; if (!c) return;
    if (state.settings.genOn && state.settings.genKey) {
      showLoading(true, 'AI 重画中…');
      const g = await S.genSticker(state.settings, c.dataUrl, S.EMOTION_MAP[c.emotionId].label, c.features.hints);
      showLoading(false);
      if (g.img) {
        c.stickerImg = g.img;
        const r = c.placed[0] || { x: 0.18, y: 0.8, r: 0 };
        c.placed[0] = { key: '__gen__', img: g.img, x: r.x, y: r.y, r: r.r };
        buildStickerNodes(); layoutSticker();
        return;
      }
      toast('AI 没接上，换本地贴纸');
    }
    const seed = S.hashStr((c.stickers || []).join() + Date.now());
    c.stickers = S.stickersFor(c.emotionId, c.features, seed);
    c.placed = S.plan(c.features, c.stickers, seed);
    buildStickerNodes();
    layoutSticker();
  });

  function closeResult() {
    stopRead();
    state.current = null;
    state.saved = false;
    $('#result').hidden = true;
    $('#stage').classList.remove('has-result');
    startCamera();
  }

  $('#btnCloseResult').addEventListener('click', closeResult);

  $('#btnRetake').addEventListener('click', closeResult);

  $('#btnSave').addEventListener('click', async () => {
    const c = state.current; if (!c) return;
    const item = {
      id: c.id, ts: c.ts, dataUrl: c.dataUrl,
      emotionId: c.emotionId, confidence: c.confidence,
      copy: c.copy, detail: c.detail,
      stickers: c.stickers, placed: c.placed,
      style: c.style
    };
    await S.idbPut(item);
    state.moments = await S.idbAll();
    state.saved = true;
    $('#btnSave').textContent = '已存入今日档案';
    toast('已收进今天的档案');
    renderToday();
    updateBadge();
  });

  $('#btnExport').addEventListener('click', async () => {
    const c = state.current; if (!c) return;
    try {
      const url = await buildPoster(c);
      await shareOrDownload(url, '拾愈_' + S.dateKey(new Date(c.ts)) + '_' + c.id + '.png');
      toast('图片已就绪');
    } catch (e) { toast('导出失败'); }
  });

  /* 语音朗读（Web Speech，中文） */
  let reading = false;
  function pickZhVoice() {
    const vs = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    return vs.find(v => /zh|cmn|Chinese|中文/i.test(v.lang + ' ' + v.name)) || null;
  }
  function stopRead() {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    reading = false;
    const lbl = $('#btnReadLabel'); if (lbl) lbl.textContent = '读给我听';
  }
  $('#btnRead').addEventListener('click', () => {
    const c = state.current; if (!c) return;
    if (reading) { stopRead(); return; }
    if (!('speechSynthesis' in window)) { toast('当前设备暂不支持朗读'); return; }
    const u = new SpeechSynthesisUtterance(c.copy);
    u.lang = 'zh-CN';
    const v = pickZhVoice(); if (v) u.voice = v;
    u.rate = 0.92; u.pitch = 1.0;
    u.onend = stopRead; u.onerror = stopRead;
    reading = true;
    $('#btnReadLabel').textContent = '停止朗读';
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  });

  async function buildPoster(c) {
    const W = 1080, H = 1350, PH = 1080;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);

    const img = await new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = c.dataUrl;
    });
    const r = Math.max(W / img.width, PH / img.height);
    const dw = img.width * r, dh = img.height * r;
    ctx.drawImage(img, (W - dw) / 2, (PH - dh) / 2, dw, dh);

    /* 注脚（多贴纸，含 AI 生成的图片贴纸） */
    const size = Math.min(W, PH) * 0.16;
    const placed = c.placed && c.placed.length ? c.placed : [{ key: (c.stickers && c.stickers[0]) || 'spark', x: 0.18, y: 0.8, r: 0 }];
    for (const p of placed) {
      const src = p.img ? p.img
        : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.stickerSVG(p.key, { size: size * 2, stamp: c.style === 'stamp', rotate: 0 }));
      const svgImg = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i); i.onerror = rej;
        i.src = src;
      });
      const ax = p.x * W - size / 2;
      const ay = p.y * PH - size / 2;
      const ayClamped = Math.min(Math.max(ay, 8), PH - size - 8);
      ctx.save();
      ctx.translate(ax + size / 2, ayClamped + size / 2);
      ctx.rotate(p.r * Math.PI / 180);
      ctx.drawImage(svgImg, -size / 2, -size / 2, size, size);
      ctx.restore();
    }

    /* 文案 */
    const emo = S.EMOTION_MAP[c.emotionId];
    const grad = ctx.createLinearGradient(0, PH, 0, H);
    grad.addColorStop(0, '#FBF7F0'); grad.addColorStop(1, '#F4EDE2');
    ctx.fillStyle = grad; ctx.fillRect(0, PH, W, H - PH);

    ctx.fillStyle = emo.color;
    ctx.beginPath(); ctx.arc(64, PH + 54, 7, 0, Math.PI * 2); ctx.fill();
    ctx.font = '500 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#6E6558';
    ctx.fillText(emo.label + ' · ' + S.timeLabel(c.ts), 86, PH + 62);

    ctx.fillStyle = '#3A342C';
    ctx.font = '500 46px "Songti SC","SimSun","PingFang SC",serif';
    const lines = S.wrapText(ctx, c.copy, W - 128, 2);
    lines.forEach((t, i) => ctx.fillText(t, 64, PH + 134 + i * 66));

    ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#9A9082';
    ctx.fillText('拾愈 · ' + S.dateKey(new Date(c.ts)), 64, H - 44);

    return await new Promise(res => cv.toBlob(b => res(URL.createObjectURL(b)), 'image/png', 0.95));
  }

  function showLoading(on, text) {
    $('#loading').hidden = !on;
    if (text) $('#loadingText').textContent = text;
  }

  /* ---------------- 今日档案 ---------------- */
  async function renderToday() {
    state.moments = await S.idbAll();
    state.moments.sort((a, b) => b.ts - a.ts);
    const today = S.dateKey();
    const todayItems = state.moments.filter(m => S.dateKey(new Date(m.ts)) === today);

    /* 弧线 */
    const arc = $('#arcText');
    const bar = $('#arcBar');
    bar.innerHTML = '';
    if (!todayItems.length) {
      arc.textContent = '还没有留下瞬间。随手拍一张吧。';
    } else {
      const counts = {};
      todayItems.forEach(m => { counts[m.emotionId] = (counts[m.emotionId] || 0) + 1; });
      const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const main = S.EMOTION_MAP[entries[0][0]];
      const total = todayItems.length;
      const first = todayItems[todayItems.length - 1];
      const last = todayItems[0];

      let text;
      if (total === 1) {
        text = '今天留了一个瞬间。' + main.label + '的时候，也算被记下了。';
      } else if (entries.length === 1) {
        text = '今天所有的瞬间都是' + main.label + '。' + total + '次，都接住了。';
      } else {
        text = '今天有 ' + total + ' 个瞬间。' + main.label + '占得最多，另外还掺了 ' +
          entries.slice(1, 3).map(e => S.EMOTION_MAP[e[0]].label).join('和') + '。';
      }
      if (first && last && first.id !== last.id) {
        text += ' 从 ' + S.timeLabel(first.ts) + ' 到 ' + S.timeLabel(last.ts) + '。';
      }
      arc.textContent = text;

      const totalCount = entries.reduce((a, b) => a + b[1], 0);
      entries.forEach(([id, n]) => {
        const seg = document.createElement('span');
        seg.style.width = (n / totalCount * 100) + '%';
        seg.style.background = S.EMOTION_MAP[id].color;
        bar.appendChild(seg);
      });
    }

    /* 时间线 */
    const tl = $('#timeline');
    tl.innerHTML = '';
    if (!state.moments.length) {
      tl.classList.add('is-empty');
      tl.innerHTML = '<div class="empty-note">档案还是空的。<br>去拍一张，今天就会从这里开始生长。</div>';
      updateBadge();
      return;
    }
    tl.classList.remove('is-empty');

    const groups = {};
    state.moments.forEach(m => {
      const k = S.dateKey(new Date(m.ts));
      (groups[k] = groups[k] || []).push(m);
    });

    Object.keys(groups).sort().reverse().forEach(k => {
      const items = groups[k];
      const head = document.createElement('div');
      head.className = 'day-block-title';
      head.innerHTML = '<span>' + S.dayLabel(k) + '</span><em>' + items.length + ' 个瞬间</em>';
      tl.appendChild(head);

      items.forEach(m => {
        const emo = S.EMOTION_MAP[m.emotionId];
        const item = document.createElement('div');
        item.className = 'tl-item';
        item.innerHTML =
          '<span class="tl-dot" style="background:' + emo.color + '"></span>' +
          '<div class="tl-card">' +
            '<img class="tl-thumb" src="' + m.dataUrl + '" alt="">' +
            '<div class="tl-body">' +
              '<div class="tl-time">' + S.timeLabel(m.ts) + ' · ' + emo.label + '</div>' +
              '<p class="tl-copy">' + escapeHtml(m.copy) + '</p>' +
              '<div class="tl-meta">' + escapeHtml(m.detail || '') + '</div>' +
            '</div>' +
          '</div>';
        item.querySelector('.tl-card').addEventListener('click', () => openDay(k));
        tl.appendChild(item);
      });
    });
    updateBadge();
  }

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------- 抽屉：某日详情 ---------------- */
  function openDay(key) {
    const items = state.moments.filter(m => S.dateKey(new Date(m.ts)) === key);
    $('#daySheetTitle').textContent = S.dayLabel(key) + ' · ' + items.length + ' 个瞬间';
    const body = $('#daySheetBody');
    body.innerHTML = '<div class="day-thumbs">' + items.map(m =>
      '<div class="day-thumb"><img src="' + m.dataUrl + '" alt=""></div>').join('') + '</div>' +
      '<div style="margin-top:18px">' + items.map(m => {
        const emo = S.EMOTION_MAP[m.emotionId];
        return '<div class="tl-item"><span class="tl-dot" style="background:' + emo.color + '"></span>' +
          '<div class="tl-card"><img class="tl-thumb" src="' + m.dataUrl + '" alt="">' +
          '<div class="tl-body"><div class="tl-time">' + S.timeLabel(m.ts) + ' · ' + emo.label + '</div>' +
          '<p class="tl-copy">' + escapeHtml(m.copy) + '</p>' +
          '<div class="tl-meta">' + escapeHtml(m.detail || '') + '</div>' +
          '<div class="tl-del" data-del="' + m.id + '">删除这一个</div></div></div></div>';
      }).join('') + '</div>';
    body.querySelectorAll('[data-del]').forEach(el => {
      el.addEventListener('click', async e => {
        e.stopPropagation();
        await S.idbDel(el.dataset.del);
        state.moments = await S.idbAll();
        openDay(key);
        renderToday();
        renderMap();
        toast('已删除');
      });
    });
    $('#daySheet').hidden = false;
  }
  $('#daySheetClose').addEventListener('click', () => { $('#daySheet').hidden = true; });
  $('#daySheet').addEventListener('click', e => { if (e.target.id === 'daySheet') $('#daySheet').hidden = true; });

  /* ---------------- 治愈地图 ---------------- */
  async function renderMap() {
    state.moments = await S.idbAll();
    const byDay = {};
    state.moments.forEach(m => {
      const k = S.dateKey(new Date(m.ts));
      (byDay[k] = byDay[k] || []).push(m);
    });

    const y = state.mapMonth.getFullYear(), mo = state.mapMonth.getMonth();
    $('#mapTitle').textContent = y + ' 年 ' + (mo + 1) + ' 月';

    const first = new Date(y, mo, 1);
    const days = new Date(y, mo + 1, 0).getDate();
    const startPad = (first.getDay() + 6) % 7;

    const grid = $('#monthGrid');
    grid.innerHTML = '';
    for (let i = 0; i < startPad; i++) grid.appendChild(document.createElement('div'));

    const monthCount = {};
    let monthTotal = 0;
    for (let d = 1; d <= days; d++) {
      const key = y + '-' + S.pad(mo + 1) + '-' + S.pad(d);
      const items = byDay[key] || [];
      const cell = document.createElement('div');
      cell.className = 'day-cell';
      if (items.length) {
        const counts = {};
        items.forEach(m => { counts[m.emotionId] = (counts[m.emotionId] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
        cell.classList.add('has');
        cell.style.background = S.EMOTION_MAP[top].color;
        cell.innerHTML = '<span class="n">' + d + '</span><span class="c">' + items.length + '</span>';
        cell.addEventListener('click', () => openDay(key));
        monthCount[top] = (monthCount[top] || 0) + items.length;
        monthTotal += items.length;
      } else {
        cell.classList.add('is-empty');
        cell.innerHTML = '<span class="n">' + d + '</span>';
      }
      if (key === S.dateKey()) cell.classList.add('today');
      grid.appendChild(cell);
    }

    /* 图例 */
    const legend = $('#mapLegend');
    legend.innerHTML = S.EMOTIONS.map(e =>
      '<span><i style="background:' + e.color + '"></i>' + e.label + '</span>').join('');

    /* 统计 */
    const stats = $('#mapStats');
    if (monthTotal) {
      const ranked = Object.entries(monthCount).sort((a, b) => b[1] - a[1]);
      const top = S.EMOTION_MAP[ranked[0][0]];
      const daysActive = Object.keys(byDay).filter(k => k.startsWith(y + '-' + S.pad(mo + 1))).length;
      stats.innerHTML = '这个月留下 <strong>' + monthTotal + '</strong> 个瞬间，分布在 <strong>' + daysActive +
        '</strong> 天里。<br>出现最多的是 <strong style="color:' + top.color + '">' + top.label +
        '</strong>，' + top.note + '。';
    } else {
      stats.innerHTML = '这个月还是空白的。';
    }

    /* 明细 */
    const box = $('#mapDays');
    const keys = Object.keys(byDay).filter(k => k.startsWith(y + '-' + S.pad(mo + 1))).sort().reverse();
    if (!keys.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h3>这个月的瞬间</h3>';
    keys.forEach(k => {
      const items = byDay[k];
      const d = document.createElement('div');
      d.className = 'day-block';
      d.innerHTML = '<div class="day-block-title"><span>' + k.slice(5) + '</span><em>' + items.length + ' 个</em></div>' +
        '<div class="day-thumbs">' + items.map(m =>
          '<div class="day-thumb" data-open="' + k + '"><img src="' + m.dataUrl + '" alt=""></div>').join('') + '</div>';
      box.appendChild(d);
    });
    box.querySelectorAll('[data-open]').forEach(el =>
      el.addEventListener('click', () => openDay(el.dataset.open)));
  }

  $('#mapPrev').addEventListener('click', () => {
    state.mapMonth = new Date(state.mapMonth.getFullYear(), state.mapMonth.getMonth() - 1, 1);
    renderMap();
  });
  $('#mapNext').addEventListener('click', () => {
    state.mapMonth = new Date(state.mapMonth.getFullYear(), state.mapMonth.getMonth() + 1, 1);
    renderMap();
  });

  /* ---------------- 分享 / 复盘长图 ---------------- */
  async function shareOrDownload(url, filename) {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], filename, { type: blob.type || 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '拾愈' });
        return;
      }
    } catch (e) { /* 用户取消或不支持 → 走下载 */ }
    S.download(url, filename);
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src;
    });
  }

  async function buildRecap(monthDate) {
    const y = monthDate.getFullYear(), mo = monthDate.getMonth();
    const ym = y + '-' + S.pad(mo + 1);
    const items = state.moments
      .filter(m => S.dateKey(new Date(m.ts)).startsWith(ym))
      .sort((a, b) => a.ts - b.ts);
    if (!items.length) throw new Error('empty');

    const W = 1080, pad = 64;
    const picks = items.slice(-4);
    const H = Math.max(920, 670 + picks.length * 284 + 130);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#FBF7F0'; ctx.fillRect(0, 0, W, H);

    /* 头部 */
    let cy = 96;
    ctx.fillStyle = '#9A9082';
    ctx.font = '400 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('拾愈 · 月度复盘', pad, cy);
    cy += 76;
    ctx.fillStyle = '#3A342C';
    ctx.font = '500 56px "Songti SC","SimSun","PingFang SC",serif';
    ctx.fillText(y + ' 年 ' + (mo + 1) + ' 月', pad, cy);
    cy += 48;
    ctx.fillStyle = '#6E6558';
    ctx.font = '400 26px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('这个月，你留下了 ' + items.length + ' 个被接住的瞬间。', pad, cy);
    cy += 64;

    /* 统计三卡 */
    const byEmo = {};
    items.forEach(m => { byEmo[m.emotionId] = (byEmo[m.emotionId] || 0) + 1; });
    const ranked = Object.entries(byEmo).sort((a, b) => b[1] - a[1]);
    const topEmo = ranked[0] ? S.EMOTION_MAP[ranked[0][0]] : null;
    const daysActive = new Set(items.map(m => S.dateKey(new Date(m.ts)))).size;
    const cards = [
      { n: String(items.length), t: '个瞬间' },
      { n: String(daysActive), t: '天被记录' },
      { n: topEmo ? topEmo.label : '—', t: '出现最多' }
    ];
    const cw = (W - pad * 2 - 32) / 3;
    cards.forEach((c, i) => {
      const x = pad + i * (cw + 16);
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, x, cy, cw, 150, 20); ctx.fill();
      ctx.fillStyle = (topEmo && i === 2) ? topEmo.color : '#3A342C';
      ctx.font = '500 50px "Songti SC","SimSun",serif';
      ctx.fillText(c.n, x + 28, cy + 78);
      ctx.fillStyle = '#9A9082';
      ctx.font = '400 24px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(c.t, x + 28, cy + 122);
    });
    cy += 150 + 56;

    /* 情绪构成条 */
    ctx.fillStyle = '#3A342C';
    ctx.font = '500 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('情绪构成', pad, cy);
    cy += 26;
    const barH = 26, barW = W - pad * 2;
    let bx = pad;
    ranked.forEach(([id, n]) => {
      const w = n / items.length * barW;
      ctx.fillStyle = S.EMOTION_MAP[id].color;
      ctx.fillRect(bx, cy, Math.max(w - 3, 2), barH);
      bx += w;
    });
    if (!ranked.length) { ctx.fillStyle = '#E4DED2'; ctx.fillRect(pad, cy, barW, barH); }
    cy += barH + 22;
    ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
    let lx = pad;
    ranked.slice(0, 6).forEach(([id, n]) => {
      const e = S.EMOTION_MAP[id];
      ctx.fillStyle = e.color;
      ctx.beginPath(); ctx.arc(lx + 6, cy + 8, 6, 0, 7); ctx.fill();
      ctx.fillStyle = '#6E6558';
      const t = e.label + ' ' + n;
      ctx.fillText(t, lx + 20, cy + 15);
      lx += 26 + ctx.measureText(t).width + 30;
    });
    cy += 70;

    /* 最近的瞬间 */
    ctx.fillStyle = '#3A342C';
    ctx.font = '500 30px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('最近的瞬间', pad, cy);
    cy += 36;
    for (const m of picks) {
      const emo = S.EMOTION_MAP[m.emotionId];
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, pad, cy, W - pad * 2, 260, 22); ctx.fill();
      const img = await loadImage(m.dataUrl);
      const tw = 200, th = 220;
      ctx.save();
      roundRect(ctx, pad + 20, cy + 20, tw, th, 14); ctx.clip();
      const r = Math.max(tw / img.width, th / img.height);
      const dw = img.width * r, dh = img.height * r;
      ctx.drawImage(img, pad + 20 + (tw - dw) / 2, cy + 20 + (th - dh) / 2, dw, dh);
      ctx.restore();
      const tx = pad + 20 + tw + 32;
      ctx.fillStyle = '#9A9082';
      ctx.font = '400 22px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.fillText(S.timeLabel(m.ts) + ' · ' + emo.label, tx, cy + 58);
      ctx.fillStyle = '#3A342C';
      ctx.font = '500 30px "Songti SC","SimSun",serif';
      const lines = S.wrapText(ctx, m.copy, W - tx - pad - 12, 2);
      lines.forEach((t, i) => ctx.fillText(t, tx, cy + 112 + i * 48));
      ctx.fillStyle = '#9A9082';
      ctx.font = '400 20px "PingFang SC","Microsoft YaHei",sans-serif';
      const dl = S.wrapText(ctx, m.detail || '', W - tx - pad - 12, 1);
      if (dl[0]) ctx.fillText(dl[0], tx, cy + 216);
      if (m.placed && m.placed[0]) {
        try {
          const pm = m.placed[0];
          const src = pm.img ? pm.img
            : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(S.stickerSVG(pm.key, { size: 160 }));
          const si = await loadImage(src);
          ctx.drawImage(si, pad + 20 + tw - 26, cy + 8, 56, 56);
        } catch (e) {}
      }
      cy += 260 + 24;
    }

    /* 底部 */
    cy += 34;
    ctx.fillStyle = '#9A9082';
    ctx.font = '400 24px "PingFang SC","Microsoft YaHei",sans-serif';
    ctx.fillText('拾愈 · 随手一拍，治愈一整天', pad, cy);
    const today = S.dateKey(new Date());
    ctx.fillText(today, W - pad - ctx.measureText(today).width, cy);

    return await new Promise(res => cv.toBlob(b => res(URL.createObjectURL(b)), 'image/png', 0.95));
  }

  $('#btnRecap').addEventListener('click', async () => {
    const y = state.mapMonth.getFullYear(), mo = state.mapMonth.getMonth();
    try {
      showLoading(true, '正在生成本月复盘…');
      const url = await buildRecap(state.mapMonth);
      showLoading(false);
      await shareOrDownload(url, '拾愈复盘_' + y + '-' + S.pad(mo + 1) + '.png');
      toast('复盘长图已就绪');
    } catch (e) {
      showLoading(false);
      toast(e.message === 'empty' ? '这个月还没有瞬间' : '生成失败，再试一次');
    }
  });

  /* ---------------- 设置 ---------------- */
  function fillSettings() {
    const s = state.settings;
    $('#cfgProvider').value = s.provider;
    $('#cfgBase').value = s.baseUrl || '';
    $('#cfgModel').value = s.model || '';
    $('#cfgKey').value = s.apiKey || '';
    $('#cfgRemind').checked = !!s.remindOn;
    $('#cfgRemindHour').value = S.pad(s.remindHour) + ':00';
    $('#cfgGlow').checked = !!s.glow;
    $('#cfgGenOn').checked = !!s.genOn;
    $('#cfgGenProvider').value = s.genProvider || 'openai';
    $('#cfgGenBase').value = s.genBase || '';
    $('#cfgGenVision').value = s.genVision || '';
    $('#cfgGenImage').value = s.genImage || '';
    $('#cfgGenKey').value = s.genKey || '';
    $$('#segStyle .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.style === s.style));
  }

  $('#segStyle').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    state.settings.style = b.dataset.style;
    S.saveSettings(state.settings);
    $$('#segStyle .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
    if (state.current) { state.current.style = b.dataset.style; buildStickerNodes(); layoutSticker(); }
  });

  $('#cfgGlow').addEventListener('change', () => {
    state.settings.glow = $('#cfgGlow').checked;
    S.saveSettings(state.settings);
    applyGlow();
  });

  /* 选服务商后自动填网关/模型（国产优先），手动改过的值仍可被覆盖为用户意图——这里只在切换时填预设 */
  $('#cfgGenProvider').addEventListener('change', () => {
    const p = S.GEN_PRESETS[$('#cfgGenProvider').value] || S.GEN_PRESETS.openai;
    $('#cfgGenBase').value = p.base;
    $('#cfgGenVision').value = p.vision || '';
    $('#cfgGenImage').value = p.image || '';
    state.settings.genProvider = $('#cfgGenProvider').value;
    state.settings.genBase = p.base;
    state.settings.genVision = p.vision || '';
    state.settings.genImage = p.image || '';
    S.saveSettings(state.settings);
  });
  ['cfgGenBase', 'cfgGenVision', 'cfgGenImage', 'cfgGenKey'].forEach(id => {
    $('#' + id).addEventListener('change', () => {
      state.settings.genBase = $('#cfgGenBase').value.trim();
      state.settings.genVision = $('#cfgGenVision').value.trim();
      state.settings.genImage = $('#cfgGenImage').value.trim();
      state.settings.genKey = $('#cfgGenKey').value.trim();
      S.saveSettings(state.settings);
    });
  });
  $('#cfgGenOn').addEventListener('change', () => {
    state.settings.genOn = $('#cfgGenOn').checked;
    S.saveSettings(state.settings);
  });

  $('#btnTestGen').addEventListener('click', async () => {
    const st = {
      genOn: true, genProvider: $('#cfgGenProvider').value,
      genBase: $('#cfgGenBase').value.trim(), genVision: $('#cfgGenVision').value.trim(),
      genImage: $('#cfgGenImage').value.trim(), genKey: $('#cfgGenKey').value.trim()
    };
    const out = $('#genStatus');
    if (!st.genKey) { out.textContent = '请先填 API Key。'; return; }
    out.textContent = '生成中…';
    const tiny = document.createElement('canvas');
    tiny.width = 64; tiny.height = 64;
    const c2 = tiny.getContext('2d');
    c2.fillStyle = '#C8B49A'; c2.fillRect(0, 0, 64, 64);
    const r = await S.genSticker(st, tiny.toDataURL('image/jpeg', 0.8), '平静', ['光']);
    if (r.img) out.textContent = '连上了，已生成一张贴纸。';
    else out.textContent = '没接上：' + (r.error || '未知，检查地址/模型/Key');
  });

  /* VLM 选服务商后自动填网关与模型（国产优先），手动改的值以用户为准 */
  $('#cfgProvider').addEventListener('change', () => {
    const v = $('#cfgProvider').value;
    state.settings.provider = v;
    if (v && v !== 'off') {
      const p = S.GEN_PRESETS[v] || S.GEN_PRESETS.openai;
      $('#cfgBase').value = p.base;
      $('#cfgModel').value = p.vision || '';
      state.settings.baseUrl = p.base;
      state.settings.model = p.vision || '';
    }
    S.saveSettings(state.settings);
  });
  ['cfgBase', 'cfgModel', 'cfgKey'].forEach(id => {
    $('#' + id).addEventListener('change', () => {
      state.settings.baseUrl = $('#cfgBase').value.trim();
      state.settings.model = $('#cfgModel').value.trim();
      state.settings.apiKey = $('#cfgKey').value.trim();
      S.saveSettings(state.settings);
    });
  });

  $('#btnTestApi').addEventListener('click', async () => {
    const st = {
      provider: $('#cfgProvider').value,
      baseUrl: $('#cfgBase').value.trim(),
      model: $('#cfgModel').value.trim(),
      apiKey: $('#cfgKey').value.trim()
    };
    const out = $('#apiStatus');
    if (st.provider === 'off') { out.textContent = '当前为纯离线模式，本机分析即可使用。'; return; }
    if (!st.apiKey) { out.textContent = '请先填入 API Key。'; return; }
    out.textContent = '测试中…';
    const tiny = document.createElement('canvas');
    tiny.width = 64; tiny.height = 64;
    const c2 = tiny.getContext('2d');
    c2.fillStyle = '#C8B49A'; c2.fillRect(0, 0, 64, 64);
    const r = await S.callVLM(st, tiny.toDataURL('image/jpeg', 0.8), S.defaultFeatures());
    if (r && r.error) out.textContent = '没接上：' + r.error;
    else if (r) out.textContent = '连上了。模型返回：' + r.emotionId + ' / ' + r.copy;
    else out.textContent = '没有拿到有效返回，换个模型或接口地址再试。';
  });

  $('#cfgRemind').addEventListener('change', () => {
    state.settings.remindOn = $('#cfgRemind').checked;
    S.saveSettings(state.settings);
    scheduleRemind();
    if (state.settings.remindOn) toast('会在晚上提醒你回头看一眼');
  });

  $('#cfgRemindHour').addEventListener('change', () => {
    const v = $('#cfgRemindHour').value.split(':')[0];
    state.settings.remindHour = parseInt(v, 10) || 20;
    S.saveSettings(state.settings);
    scheduleRemind();
  });

  $('#btnExportAll').addEventListener('click', () => {
    const data = JSON.stringify(state.moments);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    S.download(url, '拾愈档案_' + S.dateKey() + '.json');
    toast('已导出');
  });

  $('#btnClearAll').addEventListener('click', async () => {
    if (!confirm('清除全部档案？照片和文案都会被删掉，无法恢复。')) return;
    const all = await S.idbAll();
    for (const m of all) await S.idbDel(m.id);
    state.moments = [];
    renderToday(); renderMap(); updateStat();
    toast('已清空');
  });

  async function updateStat() {
    const all = await S.idbAll();
    $('#dataStat').textContent = '当前存有 ' + all.length + ' 个瞬间。';
  }

  /* ---------------- 每日提醒 ---------------- */
  function scheduleRemind() {
    clearTimeout(state.remindTimer);
    if (!state.settings.remindOn) return;
    const now = new Date();
    const target = new Date(now);
    target.setHours(state.settings.remindHour, 0, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target - now;
    state.remindTimer = setTimeout(() => {
      const n = state.moments.filter(m => S.dateKey(new Date(m.ts)) === S.dateKey()).length;
      toast(n ? '今天留下了 ' + n + ' 个瞬间，去看看' : '今天还没拍，去留一个瞬间吧');
    }, Math.min(delay, 2147483647));
  }

  /* ---------------- 角标 & 品牌图形 ---------------- */
  function updateBadge() {
    const today = S.dateKey();
    const n = state.moments.filter(m => S.dateKey(new Date(m.ts)) === today).length;
    const t = $$('.tab').find(b => b.dataset.view === 'today');
    if (t) t.textContent = n ? '今日 ' + n : '今日';
  }

  function drawBrand() {
    $('#brandMark').innerHTML =
      '<svg viewBox="0 0 64 64"><g fill="none" stroke="#C87B4A" stroke-width="4" stroke-linecap="round">' +
      '<path d="M32 20.5c6.4 0 11.5 5.1 11.5 11.5S38.4 43.5 32 43.5 20.5 38.4 20.5 32 25.6 20.5 32 20.5Z"/>' +
      '<path d="M32 9v6M32 49v6M9 32h6M49 32h6"/></g></svg>';
    $('#emptyMark').innerHTML =
      '<svg viewBox="0 0 64 64"><g fill="none" stroke="#C87B4A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M32 20.5c6.4 0 11.5 5.1 11.5 11.5S38.4 43.5 32 43.5 20.5 38.4 20.5 32 25.6 20.5 32 20.5Z"/>' +
      '<path d="M32 9v6M32 49v6M9 32h6M49 32h6M15.7 15.7l4.3 4.3M43.9 43.9l4.3 4.3M48.3 15.7L44 20M20 44l-4.3 4.3"/>' +
      '</g></svg>';
  }

  /* ---------------- PWA ---------------- */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }

  /* ---------------- 启动 ---------------- */
  drawBrand();
  fillSettings();
  startCamera();
  if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }
  renderToday().then(() => { updateStat(); scheduleRemind(); });

  /* 页面隐藏时释放相机 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if ($('#view-shoot').classList.contains('is-on') && !state.current) startCamera();
  });

  window.SYAPP = { state, switchView, toast, generate, renderResult, startCamera, stopCamera, buildRecap, buildPoster };
})();
