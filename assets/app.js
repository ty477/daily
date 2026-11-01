/* 日子 · 日常相册 —— 时间流 / 条目页 / 管理页 */
(function () {
  'use strict';

  var app = document.getElementById('app');
  var store = {
    site: null,
    years: [],          // 有数据的年份（降序）
    entries: [],        // 已加载的条目（全部年份合并池）
    loadedYears: {},    // year -> true
    pollTimer: null,
    navToken: 0
  };
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------- 小工具 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return MiniMD.esc(String(s == null ? '' : s)); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function jget(url) {
    return fetch(url + (url.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now()).then(function (r) {
      if (!r.ok) throw new Error('加载失败 ' + r.status);
      return r.json();
    });
  }
  function toast(msg, ms) {
    var root = document.getElementById('toast-root');
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    root.appendChild(t);
    setTimeout(function () { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, ms || 2600);
    setTimeout(function () { t.remove(); }, (ms || 2600) + 350);
  }
  function modal(html) {
    var root = document.getElementById('modal-root');
    root.innerHTML = '<div class="modal-mask"><div class="modal">' + html + '</div></div>';
    var mask = root.firstChild;
    mask.addEventListener('click', function (e) { if (e.target === mask) closeModal(); });
    return mask;
  }
  function closeModal() { document.getElementById('modal-root').innerHTML = ''; }
  function parseDate(d) {
    var m = String(d || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3], week: WEEK[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] };
  }
  function todayStr() {
    var n = new Date();
    return n.getFullYear() + '-' + pad2(n.getMonth() + 1) + '-' + pad2(n.getDate());
  }
  function nowTime() {
    var n = new Date();
    return pad2(n.getHours()) + ':' + pad2(n.getMinutes());
  }

  /* ---------- 图片压缩（主图 + 缩略图） ---------- */
  async function compressImage(file, maxSide, quality) {
    maxSide = maxSide || 2560;
    quality = quality == null ? 0.86 : quality;
    if (!/^image\//.test(file.type)) throw new Error('「' + file.name + '」不是图片文件');
    if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
      throw new Error('「' + file.name + '」是 HEIC 格式，浏览器无法处理。iPhone 请到 设置→相机→格式 选「兼容性最佳」后重拍。');
    }
    var bmp = await createImageBitmap(file);
    var w = bmp.width, h = bmp.height;
    var scale = Math.min(1, maxSide / Math.max(w, h));
    var cv = document.createElement('canvas');
    cv.width = Math.round(w * scale);
    cv.height = Math.round(h * scale);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close && bmp.close();
    var blob = await new Promise(function (res) { cv.toBlob(res, 'image/jpeg', quality); });
    if (!blob) throw new Error('图片处理失败');
    return blob;
  }
  async function fileB64(blob, name) {
    return Gh.b64FromFile(new File([blob], name, { type: 'image/jpeg' }));
  }

  /* ---------- 数据 ---------- */
  function sortedEntries() {
    return store.entries.slice().sort(function (a, b) {
      var ka = a.date + ' ' + (a.time || '');
      var kb = b.date + ' ' + (b.time || '');
      return kb.localeCompare(ka);
    });
  }
  function loadYear(year) {
    return jget('content/' + year + '.json').then(function (j) {
      (j.entries || []).forEach(function (e) {
        if (!store.entries.some(function (x) { return x.id === e.id; })) store.entries.push(e);
      });
      store.loadedYears[year] = true;
    }).catch(function () {
      store.loadedYears[year] = true;
    });
  }
  function pendingEntries() {
    return store.entries.filter(function (e) { return e.status === 'pending'; });
  }
  function startPoll(onDone) {
    if (store.pollTimer) clearInterval(store.pollTimer);
    if (!pendingEntries().length) return;
    store.pollTimer = setInterval(async function () {
      var pend = pendingEntries();
      if (!pend.length) { clearInterval(store.pollTimer); store.pollTimer = null; return; }
      var years = {};
      pend.forEach(function (e) { years[e.date.slice(0, 4)] = true; });
      for (var y in years) {
        try {
          var j = await jget('content/' + y + '.json');
          (j.entries || []).forEach(function (e) {
            var k = store.entries.findIndex(function (x) { return x.id === e.id; });
            if (k >= 0) store.entries[k] = e;
          });
        } catch (_) {}
      }
      if (!pendingEntries().length) {
        clearInterval(store.pollTimer); store.pollTimer = null;
        toast('AI 写好了新的生活注脚 ✨');
      }
      onDone && onDone();
    }, 15000);
  }

  /* ---------- 路由 ---------- */
  function route() {
    store.navToken++;
    if (store.pollTimer) { clearInterval(store.pollTimer); store.pollTimer = null; }
    closeLightbox();
    document.getElementById('modal-root').innerHTML = '';
    var h = location.hash || '#/';
    var m = h.match(/^#\/entry\/([\w-]+)/);
    setNav(h);
    if (m) { viewEntry(decodeURIComponent(m[1])); return; }
    if (h.indexOf('#/admin') === 0) { viewAdmin(); return; }
    viewFeed();
  }
  function setNav(h) {
    document.querySelectorAll('.site-nav a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-nav') === (h.indexOf('#/admin') === 0 ? 'admin' : 'feed'));
    });
  }
  window.addEventListener('hashchange', route);

  /* ---------- 首页 · 时间流 ---------- */
  function monthTitle(y, m) { return y + ' 年 ' + m + ' 月'; }

  function feedHTML(entries, shownYears) {
    if (!entries.length) {
      return '<div class="no-entry">还没有记录。<br>从今天的一件小事开始吧。</div>';
    }
    var html = '';
    var lastMonth = '';
    entries.forEach(function (e) {
      var d = parseDate(e.date);
      if (!d) return;
      var mk = d.y + '-' + d.m;
      if (mk !== lastMonth) {
        lastMonth = mk;
        html += '<div class="month-head"><h2>' + monthTitle(d.y, d.m) + '</h2><span>' +
          entries.filter(function (x) { var dd = parseDate(x.date); return dd && dd.y === d.y && dd.m === d.m; }).length +
          ' 条记录</span></div>';
      }
      html += entryCard(e, d);
    });
    if (shownYears.length < store.years.length) {
      html += '<button class="load-more" id="load-more">更早的日子 ↓</button>';
    }
    return html;
  }

  function entryCard(e, d) {
    var photos = e.photos || [];
    var grid = '';
    if (photos.length) {
      var n = Math.min(photos.length, 3);
      var cls = 'e-photos n' + n;
      grid = '<div class="' + cls + '">' + photos.slice(0, 3).map(function (ph, i) {
        var more = (i === 2 && photos.length > 3) ? '<span class="more-badge">+' + (photos.length - 3) + '</span>' : '';
        return '<div class="' + (more ? 'e-more-photos' : '') + '"><img src="' + esc(ph.thumb || ph.file) +
          '" alt="" loading="lazy" data-belongs="' + esc(e.id) + '" data-pi="' + i + '">' + more + '</div>';
      }).join('') + '</div>';
    }
    return '<article class="entry">' +
      '<aside class="e-date"><b>' + d.d + '</b><span>' + d.week + '</span></aside>' +
      '<div class="e-body">' +
        '<div class="e-top"><span class="e-time">' + esc(e.time || '—') + '</span>' +
          (e.status === 'pending' ? '<span class="e-status"><span class="spin"></span>AI 正在写注脚</span>' : '') +
        '</div>' +
        grid +
        '<p class="e-text">' + (e.status === 'pending' ? '（注脚生成中，一会儿自动出现）' : esc(e.aiText || '')) + '</p>' +
        (e.feelings ? '<p class="e-feel">' + esc(e.feelings) + '</p>' : '') +
        '<a class="e-page" href="#/entry/' + e.id + '">翻到这一页 →</a>' +
      '</div>' +
    '</article>';
  }

  function bindFeedEvents() {
    document.querySelectorAll('.e-photos img').forEach(function (img) {
      img.addEventListener('click', function () {
        var id = img.getAttribute('data-belongs');
        var e = store.entries.find(function (x) { return x.id === id; });
        if (!e) return;
        var files = (e.photos || []).map(function (ph) { return ph.file; });
        openLightbox(files, parseInt(img.getAttribute('data-pi'), 10), e.date);
      });
    });
    var lm = document.getElementById('load-more');
    if (lm) lm.addEventListener('click', function () {
      loadOlder().then(function () { viewFeed(true); });
    });
  }

  async function loadOlder() {
    var next = store.years.find(function (y) { return !store.loadedYears[y]; });
    if (!next) return;
    lmBusy = true;
    await loadYear(next);
    lmBusy = false;
  }
  var lmBusy = false;

  async function viewFeed(keepScroll) {
    store.view = 'feed';
    var tk = store.navToken;
    if (!store.entries.length) app.innerHTML = '<div class="loading">正在翻开日子 …</div>';
    if (store.years.length && !store.years.every(function (y) { return store.loadedYears[y]; })) {
      var latestYear = store.years[0];
      if (!store.loadedYears[latestYear]) await loadYear(latestYear);
    }
    if (tk !== store.navToken) return;
    var entries = sortedEntries();
    var shownYears = store.years.filter(function (y) { return store.loadedYears[y]; });
    var months = {};
    entries.forEach(function (e) { months[e.date.slice(0, 7)] = true; });
    var nPhotos = 0;
    entries.forEach(function (e) { nPhotos += (e.photos || []).length; });

    app.innerHTML =
      '<div class="feed-wrap">' +
        '<header class="feed-hero">' +
          '<h1>' + esc((store.site && store.site.title) || '日子，也在熠熠生辉——日常相册') + '</h1>' +
          '<p>' + esc((store.site && store.site.subtitle) || '平常日子，也在发光') + '</p>' +
          '<div class="feed-stats"><span><b>' + entries.length + '</b>条记录</span><span><b>' + nPhotos + '</b>张照片</span><span><b>' + Object.keys(months).length + '</b>个月份</span></div>' +
        '</header>' +
        feedHTML(entries, shownYears) +
      '</div>';
    bindFeedEvents();
    startPoll(function () { viewFeed(true); });
    if (!keepScroll) window.scrollTo(0, 0);
  }

  /* ---------- 条目页 ---------- */
  async function findEntry(id) {
    var e = store.entries.find(function (x) { return x.id === id; });
    if (e) return e;
    var y = id.slice(0, 4);
    if (!store.loadedYears[y]) await loadYear(y);
    return store.entries.find(function (x) { return x.id === id; }) || null;
  }

  async function viewEntry(id) {
    store.view = 'entry';
    var tk = store.navToken;
    app.innerHTML = '<div class="loading">正在翻到这一页 …</div>';
    var e = await findEntry(id);
    if (tk !== store.navToken) return;
    if (!e) {
      app.innerHTML = '<div class="notfound"><p class="muted">没有找到这条记录。<a href="#/">回到日常</a></p></div>';
      return;
    }
    renderEntryPage(e);
  }

  function renderEntryPage(e) {
    var d = parseDate(e.date) || { y: '', m: '', d: '', week: '' };
    var photos = e.photos || [];
    app.innerHTML =
      '<div class="entry-wrap">' +
        '<div class="backline"><a href="#/">← 回到日常</a></div>' +
        '<header class="entry-head">' +
          '<h1 class="date-line">' + d.y + ' 年 ' + d.m + ' 月 ' + d.d + ' 日</h1>' +
          '<div class="meta-line">' + d.week + ' · ' + esc(e.time || '') + (photos.length ? ' · ' + photos.length + ' 张照片' : '') + '</div>' +
        '</header>' +
        (photos.length ?
          '<div class="entry-photos">' + photos.map(function (ph, i) {
            return '<img src="' + esc(ph.thumb || ph.file) + '" loading="lazy" data-pi="' + i + '" alt="">';
          }).join('') + '</div>' : '') +
        '<div class="note-box">' +
          '<h3><span class="dot"></span>生活注脚</h3>' +
          (e.status === 'pending'
            ? '<p class="note-text muted"><span class="spin" style="display:inline-block;vertical-align:-2px;margin-right:8px"></span>AI 正在写这一页的注脚 …</p>'
            : '<p class="note-text">' + esc(e.aiText || '—') + '</p>') +
        '</div>' +
        '<div class="note-box feel-box">' +
          '<h3><span class="dot" style="background:var(--green)"></span>我只想说<a class="btn ghost small" style="margin-left:auto" id="edit-feel">✍️ 写两句</a></h3>' +
          (e.feelings ? '<p class="note-text">' + esc(e.feelings) + '</p>' : '<p class="feel-empty">这一栏留给你——多年后翻到这里，你会想说点什么？</p>') +
        '</div>' +
      '</div>';

    document.querySelectorAll('.entry-photos img').forEach(function (img) {
      img.addEventListener('click', function () {
        openLightbox(photos.map(function (ph) { return ph.file; }), parseInt(img.getAttribute('data-pi'), 10), e.date);
      });
    });
    $('#edit-feel').addEventListener('click', function () { editFeelings(e); });
    startPoll(function () { viewEntry(e.id); });
  }

  function editFeelings(e) {
    if (!Gh.ready()) { needSetup(); return; }
    modal(
      '<h3>写下这一页的感受</h3>' +
      '<p class="muted small" style="margin-top:-6px">' + e.date + ' · ' + esc(e.time || '') + '　保存后几秒生效。</p>' +
      '<div class="field"><textarea id="feel-text" style="min-height:130px"></textarea></div>' +
      '<div class="modal-actions"><button class="btn ghost" id="feel-cancel">取消</button><button class="btn" id="feel-save">保存</button></div>'
    );
    var ta = $('#feel-text');
    ta.value = e.feelings || '';
    ta.focus();
    $('#feel-cancel').addEventListener('click', closeModal);
    $('#feel-save').addEventListener('click', async function () {
      var btn = this;
      btn.disabled = true; btn.textContent = '保存中…';
      try {
        var y = e.date.slice(0, 4);
        var jf = await Gh.getJSON('content/' + y + '.json');
        var entry = jf.data.entries.find(function (x) { return x.id === e.id; });
        if (!entry) throw new Error('条目不存在');
        entry.feelings = ta.value.trim();
        await Gh.putJSON('content/' + y + '.json', jf.data, '写下 ' + e.date + ' 的感受');
        var k = store.entries.findIndex(function (x) { return x.id === e.id; });
        if (k >= 0) store.entries[k] = entry;
        closeModal();
        toast('已保存 ✅（如未立刻更新，稍等或强刷）');
        renderEntryPage(entry);
      } catch (err) {
        btn.disabled = false; btn.textContent = '保存';
        toast('保存失败：' + err.message, 4200);
      }
    });
  }

  function needSetup() {
    modal(
      '<h3>还差一步：连接 GitHub</h3>' +
      '<p class="muted" style="font-size:14.5px">写入需要在这台设备的「管理」页填一次令牌，之后一切都在浏览器里完成。</p>' +
      '<div class="modal-actions"><a class="btn" href="#/admin" onclick="document.getElementById(\'modal-root\').innerHTML=\'\'">去设置</a></div>'
    );
  }

  /* ---------- 灯箱 ---------- */
  var lbState = null;
  function openLightbox(files, idx, cap) {
    lbState = { files: files, idx: idx };
    var lb = document.getElementById('lightbox');
    lb.hidden = false;
    document.body.style.overflow = 'hidden';
    lb.innerHTML =
      '<span class="lb-count"></span><button class="lb-close">✕</button>' +
      '<button class="lb-btn lb-prev">‹</button><img alt=""><button class="lb-btn lb-next">›</button>' +
      '<div class="lb-cap"></div>';
    function render() {
      lb.querySelector('img').src = lbState.files[lbState.idx];
      lb.querySelector('.lb-count').textContent = (lbState.idx + 1) + ' / ' + lbState.files.length;
      lb.querySelector('.lb-cap').textContent = cap || '';
      lb.querySelector('.lb-prev').style.visibility = lbState.files.length > 1 ? 'visible' : 'hidden';
      lb.querySelector('.lb-next').style.visibility = lbState.files.length > 1 ? 'visible' : 'hidden';
    }
    lb.querySelector('.lb-close').addEventListener('click', closeLightbox);
    lb.querySelector('.lb-prev').addEventListener('click', function (e) { e.stopPropagation(); lbState.idx = (lbState.idx - 1 + lbState.files.length) % lbState.files.length; render(); });
    lb.querySelector('.lb-next').addEventListener('click', function (e) { e.stopPropagation(); lbState.idx = (lbState.idx + 1) % lbState.files.length; render(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) closeLightbox(); });
    lb._render = render;
    render();
  }
  function closeLightbox() {
    var lb = document.getElementById('lightbox');
    if (lb.hidden) return;
    lb.hidden = true;
    lb.innerHTML = '';
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeLightbox(); }
    if (!lbState || document.getElementById('lightbox').hidden) return;
    if (e.key === 'ArrowLeft') { lbState.idx = (lbState.idx - 1 + lbState.files.length) % lbState.files.length; document.getElementById('lightbox')._render(); }
    if (e.key === 'ArrowRight') { lbState.idx = (lbState.idx + 1) % lbState.files.length; document.getElementById('lightbox')._render(); }
  });

  /* ---------- 管理页 ---------- */
  function viewAdmin() {
    store.view = 'admin';
    var cfg = Gh.cfg();
    var det = Gh.detect();
    var recent = sortedEntries().slice(0, 8);
    var rows = recent.map(function (e) {
      var badge = e.status === 'ready' ? '<span class="badge ready">完成</span>'
        : e.status === 'pending' ? '<span class="badge pending">生成中</span>'
        : '<span class="badge failed">失败</span>';
      return '<tr><td><a href="#/entry/' + e.id + '">' + e.date + ' ' + esc(e.time || '') + '</a></td><td class="muted">' + (e.photos || []).length + ' 张</td><td>' + badge + '</td></tr>';
    }).join('');

    app.innerHTML =
      '<div class="admin-wrap">' +
        '<h1>管理</h1>' +
        '<p class="admin-sub">发一条日常、查看生成状态。</p>' +

        '<div class="panel">' +
          '<h3><span class="dot"></span>连接 GitHub</h3>' +
          (det ? '<div class="callout ok">仓库已自动识别：' + esc(det.owner + '/' + det.repo) + '</div>' : '') +
          '<div class="form-row">' +
            '<div class="field"><label>仓库所有者</label><input id="gh-owner" value="' + esc(cfg.owner || (det ? det.owner : '')) + '"></div>' +
            '<div class="field"><label>仓库名</label><input id="gh-repo" value="' + esc(cfg.repo || (det ? det.repo : '')) + '"></div>' +
          '</div>' +
          '<div class="field"><label>GitHub 令牌（Fine-grained PAT，需授权 daily 仓库的 Contents 读写）</label>' +
            '<input id="gh-token" type="password" value="' + esc(cfg.token) + '">' +
            '<span class="tip">只存在这台浏览器里。与旅行相册是同一个令牌也可以——只要它授权了两个仓库。</span></div>' +
          '<div style="display:flex;gap:10px;align-items:center">' +
            '<button class="btn" id="btn-gh-save">保存并测试连接</button><span id="gh-status" class="small muted"></span>' +
          '</div>' +
        '</div>' +

        '<div class="panel">' +
          '<h3><span class="dot"></span>发一条日常</h3>' +
          '<div class="form-row">' +
            '<div class="field"><label>日期</label><input id="ne-date" type="date" value="' + todayStr() + '"></div>' +
            '<div class="field"><label>时间</label><input id="ne-time" type="time" value="' + nowTime() + '"></div>' +
          '</div>' +
          '<div class="field"><label>一句话（可选，AI 会为它润色成一段注脚）</label>' +
            '<textarea id="ne-note" placeholder="比如：今天下班路上看到银杏黄了"></textarea></div>' +
          '<div class="dropzone" id="dz"><span class="dz-icon">📷</span>点击选择照片，或拖到这里' +
            '<div class="dz-hint">可多选 · 自动压缩并生成缩略图 · iPhone 请用 JPG</div></div>' +
          '<div class="thumb-list" id="thumbs"></div>' +
          '<ul class="upload-list" id="ul-list" hidden></ul>' +
          '<div style="margin-top:16px;display:flex;gap:10px;align-items:center">' +
            '<button class="btn" id="btn-publish">发布</button><span id="np-status" class="small muted"></span>' +
          '</div>' +
        '</div>' +

        '<div class="panel">' +
          '<h3><span class="dot"></span>最近记录</h3>' +
          (recent.length ? '<table class="status-table"><tr><th>记录</th><th>照片</th><th>注脚</th></tr>' + rows + '</table>'
            : '<p class="muted small">还没有记录。</p>') +
        '</div>' +

        '<div class="panel guide">' +
          '<h3><span class="dot"></span>说明</h3>' +
          '<details><summary>为什么这里也要填令牌？</summary><div class="gd-body">令牌保存在每个浏览器自己的存储里（安全设计）。' +
            '如果每天主要在手机上发，就在手机浏览器里填一次；和旅行相册用的同一个令牌即可，只要它授权了 daily 和 xingzhilu 两个仓库。</div></details>' +
          '<details><summary>AI 注脚是什么？</summary><div class="gd-body">发布后约 1 分钟，GitHub 上的自动任务会用你的一句话题写 60–120 字的生活注脚。' +
            '不写那句话也能发布，AI 会写一段克制的小字。</div></details>' +
          '<details><summary>页面没更新？</summary><div class="gd-body">GitHub Pages 有约 10 分钟 CDN 缓存，列表数据带时间戳绕缓存，首页 HTML 强刷（Ctrl+F5）即可。</div></details>' +
        '</div>' +
      '</div>';

    /* 连接设置 */
    $('#btn-gh-save').addEventListener('click', async function () {
      var btn = this, st = $('#gh-status');
      Gh.setCfg({
        owner: $('#gh-owner').value.trim(),
        repo: $('#gh-repo').value.trim(),
        token: $('#gh-token').value.trim()
      });
      btn.disabled = true; st.textContent = '测试中…'; st.style.color = '';
      try {
        var full = await Gh.test();
        st.textContent = '✅ 已连接 ' + full; st.style.color = 'var(--green)';
      } catch (e) {
        st.textContent = '❌ ' + e.message; st.style.color = '#b3402e';
      }
      btn.disabled = false;
    });

    /* 选照片 */
    var picked = [];
    var dz = $('#dz'), thumbList = $('#thumbs');
    function renderThumbs() {
      thumbList.innerHTML = picked.map(function (f) {
        return '<img class="thumb" src="' + URL.createObjectURL(f) + '">';
      }).join('');
    }
    function addFiles(list) {
      Array.prototype.forEach.call(list, function (f) { if (/^image\//.test(f.type)) picked.push(f); });
      renderThumbs();
    }
    dz.addEventListener('click', function () {
      var inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/jpeg,image/png,image/webp'; inp.multiple = true;
      inp.addEventListener('change', function () { addFiles(inp.files); });
      inp.click();
    });
    ['dragover', 'dragenter'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('drag'); }); });
    dz.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

    /* 发布 */
    $('#btn-publish').addEventListener('click', async function () {
      var btn = this, st = $('#np-status');
      var date = $('#ne-date').value.trim();
      if (!date) { toast('先选日期'); return; }
      if (!Gh.ready()) { toast('请先在上方面板完成 GitHub 连接'); return; }
      var files = picked.slice();
      var note = $('#ne-note').value.trim();
      btn.disabled = true;
      var year = date.slice(0, 4);

      var ul = $('#ul-list');
      ul.hidden = !files.length;
      var log = function (i, s, txt) {
        var li = ul.children[i];
        if (!li) {
          li = document.createElement('li');
          li.innerHTML = '<span>📷 ' + esc(files[i].name) + '</span><span class="st doing">等待</span>';
          ul.appendChild(li);
        }
        var el = li.querySelector('.st');
        el.className = 'st ' + s;
        el.textContent = txt;
      };

      try {
        // 1. 读取该年数据，生成新条目 id（同日序号）
        var jf = await Gh.getJSON('content/' + year + '.json');
        var data = jf ? jf.data : { entries: [] };
        data.entries = data.entries || [];
        var seq = data.entries.filter(function (x) { return x.date === date; }).length + 1;
        var id = date + '-' + pad2(seq);

        // 2. 上传照片（主图 + 缩略图）
        var photos = [];
        for (var i = 0; i < files.length; i++) {
          log(i, 'doing', '压缩中');
          try {
            var main = await compressImage(files[i]);
            var thumb = await compressImage(files[i], 900, 0.76);
            var name = pad2(i + 1) + '.jpg';
            var path = 'photos/' + id + '/' + name;
            log(i, 'doing', '上传中');
            await Gh.put(path, await fileB64(main, name), '日常照片 ' + path);
            var tpath = 'photos/' + id + '/' + pad2(i + 1) + 's.jpg';
            var thumbOK = false;
            try { await Gh.put(tpath, await fileB64(thumb, name.replace('.jpg', 's.jpg')), '缩略图 ' + tpath); thumbOK = true; } catch (_) {}
            photos.push({ file: path, thumb: thumbOK ? tpath : undefined });
            log(i, 'ok', '完成');
          } catch (e) {
            log(i, 'err', '失败');
            toast('上传失败：' + e.message, 5000);
          }
        }

        // 3. 写入条目（pending → Actions 写注脚）
        var entry = {
          id: id, date: date, time: $('#ne-time').value.trim(),
          note: note, aiText: '', feelings: '', photos: photos, status: 'pending'
        };
        data.entries.push(entry);
        await Gh.putJSON('content/' + year + '.json', data, '日常记录 ' + id);

        // 4. 更新年份索引
        var yj = await Gh.getJSON('content/years.json');
        var years = yj ? yj.data : { years: [] };
        if (years.years.indexOf(year) < 0) {
          years.years.unshift(year);
          await Gh.putJSON('content/years.json', years, '新增年份 ' + year);
        }
        store.years = years.years.slice().sort().reverse();
        store.entries.push(entry);
        store.loadedYears[year] = true;

        st.innerHTML = '✅ 已发布！<a href="#/entry/' + id + '">查看这一条</a>（AI 注脚约 1 分钟写好）';
        toast('已发布，AI 开始写注脚 ✍️');
        $('#ne-note').value = '';
        picked = []; renderThumbs();
      } catch (e) {
        st.textContent = '';
        toast('发布失败：' + e.message, 5200);
      }
      btn.disabled = false;
    });
  }

  /* ---------- 启动 ---------- */
  Promise.all([
    jget('content/site.json').then(function (s) {
      store.site = s;
      document.title = s.title;
      $('[data-role="site-title"]').textContent = s.title;
      if (s.quote) $('[data-role="site-quote"]').textContent = s.quote;
    }).catch(function () {}),
    jget('content/years.json').then(function (j) {
      store.years = (j.years || []).slice().sort().reverse();
    }).catch(function () { store.years = []; })
  ]).then(function () {
    if (!store.years.length) {
      var thisYear = String(new Date().getFullYear());
      store.years = [];
    }
    // 自愈：修复早期版本错存的仓库名
    var c = Gh.cfg();
    var det = Gh.detect();
    if (det && c.repo === c.owner + '.github.io' && det.repo !== c.repo) {
      Gh.setCfg({ owner: det.owner, repo: det.repo });
    }
    route();
  }).catch(route);
})();