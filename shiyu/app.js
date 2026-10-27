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
    remindTimer: null
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
    showLoading(true, '正在读你的此刻…');
    const features = S.analyzeImage(img);
    const seed = S.hashStr(dataUrl.slice(-200) + Date.now());

    const judged = S.judgeEmotion(features, seed);
    let emotionId = judged.emotionId;
    let confidence = judged.confidence;
    const composed = S.compose(emotionId, features.hints, seed);
    let copy = composed.copy;
    let detail = composed.detail;
    let sticker = S.pickSticker(emotionId, seed);
    let source = '本地分析';

    const st = state.settings;
    if (st.provider && st.provider !== 'off' && st.apiKey) {
      showLoading(true, '模型正在看这张照片…');
      const r = await S.callVLM(st, dataUrl, features);
      if (r && r.error) {
        toast('模型没接上，已用本地判断');
      } else if (r) {
        emotionId = r.emotionId; confidence = r.confidence;
        copy = r.copy; detail = r.detail; sticker = r.sticker;
        source = '模型识别';
      }
    }

    state.current = {
      id: S.uid(), ts: Date.now(), dataUrl,
      emotionId, confidence, copy, detail, sticker,
      style: state.settings.style,
      anchor: pickAnchor(seed), features
    };
    state.saved = false;
    renderResult();
    showLoading(false);
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

    layoutSticker();
  }

  function layoutSticker() {
    const c = state.current;
    const holder = $('#stickerHolder');
    if (!c || !holder) return;
    const photo = $('#resultPhoto');
    const w = photo.clientWidth, h = photo.clientHeight;
    const size = Math.max(64, Math.min(w, h) * 0.22);
    holder.style.width = size + 'px';
    holder.style.height = size + 'px';
    holder.style.left = (c.anchor.x * w - size / 2) + 'px';
    holder.style.top = (c.anchor.y * h - size / 2) + 'px';
    holder.style.transform = 'rotate(' + c.anchor.r + 'deg)';
    holder.innerHTML = S.stickerSVG(c.sticker, {
      size: size,
      color: emoInk(c.emotionId),
      stamp: c.style === 'stamp',
      rotate: c.style === 'stamp' ? c.anchor.r : 0
    });
  }

  function emoInk(id) {
    const map = {
      tired: '#5C6577', calm: '#54766C', happy: '#B8762C', sad: '#5A6B85',
      anxious: '#8A6248', hope: '#5C8249', lonely: '#645F7A', warm: '#A85F33'
    };
    return map[id] || '#3A342C';
  }

  /* 拖动注脚 */
  (function enableDrag() {
    const holder = $('#stickerHolder');
    if (!holder) return;
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    holder.addEventListener('pointerdown', e => {
      const c = state.current; if (!c) return;
      dragging = true;
      holder.classList.add('dragging');
      holder.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      const photo = $('#resultPhoto');
      origX = c.anchor.x * photo.clientWidth;
      origY = c.anchor.y * photo.clientHeight;
    });
    holder.addEventListener('pointermove', e => {
      if (!dragging) return;
      const c = state.current;
      const photo = $('#resultPhoto');
      const nx = origX + (e.clientX - startX);
      const ny = origY + (e.clientY - startY);
      c.anchor.x = S.clamp(nx / photo.clientWidth, 0.08, 0.92);
      c.anchor.y = S.clamp(ny / photo.clientHeight, 0.08, 0.92);
      layoutSticker();
    });
    const end = () => { dragging = false; holder.classList.remove('dragging'); };
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

  $('#btnStickerAgain').addEventListener('click', () => {
    const c = state.current; if (!c) return;
    c.sticker = S.pickSticker(c.emotionId, S.hashStr(c.sticker + Date.now()), c.sticker);
    layoutSticker();
  });

  function closeResult() {
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
      copy: c.copy, detail: c.detail, sticker: c.sticker,
      style: c.style, anchor: c.anchor
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
      S.download(url, '拾愈_' + S.dateKey(new Date(c.ts)) + '_' + c.id + '.png');
      toast('已保存图片');
    } catch (e) { toast('导出失败'); }
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

    /* 注脚 */
    const size = Math.min(W, PH) * 0.20;
    const svg = S.stickerSVG(c.sticker, { size: size * 2, color: emoInk(c.emotionId), stamp: c.style === 'stamp', rotate: 0 });
    const svgImg = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
    const ax = c.anchor.x * W - size / 2;
    const ay = c.anchor.y * PH - size / 2;
    ctx.save();
    ctx.translate(ax + size / 2, ay + size / 2);
    ctx.rotate(c.anchor.r * Math.PI / 180);
    ctx.drawImage(svgImg, -size / 2, -size / 2, size, size);
    ctx.restore();

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

  /* ---------------- 设置 ---------------- */
  function fillSettings() {
    const s = state.settings;
    $('#cfgProvider').value = s.provider;
    $('#cfgBase').value = s.baseUrl || '';
    $('#cfgModel').value = s.model || '';
    $('#cfgKey').value = s.apiKey || '';
    $('#cfgRemind').checked = !!s.remindOn;
    $('#cfgRemindHour').value = S.pad(s.remindHour) + ':00';
    $$('#segStyle .seg-btn').forEach(b => b.classList.toggle('is-on', b.dataset.style === s.style));
  }

  $('#segStyle').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    state.settings.style = b.dataset.style;
    S.saveSettings(state.settings);
    $$('#segStyle .seg-btn').forEach(x => x.classList.toggle('is-on', x === b));
    if (state.current) { state.current.style = b.dataset.style; layoutSticker(); }
  });

  ['cfgProvider', 'cfgBase', 'cfgModel', 'cfgKey'].forEach(id => {
    $('#' + id).addEventListener('change', () => {
      state.settings.provider = $('#cfgProvider').value;
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
  renderToday().then(() => { updateStat(); scheduleRemind(); });

  /* 页面隐藏时释放相机 */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopCamera();
    else if ($('#view-shoot').classList.contains('is-on') && !state.current) startCamera();
  });

  window.SYAPP = { state, switchView, toast, generate, renderResult, startCamera, stopCamera };
})();
