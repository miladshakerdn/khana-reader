(function () {
  'use strict';
  const K = window.KhanaShared;
  const KEY = 'khana';
  const $ = id => document.getElementById(id);

  let state = { settings: K.DEFAULTS, sites: {}, panels: {} };
  let host = '';
  let tabId = null;
  let focusOn = false;
  let reachable = false;

  function normalize(raw) {
    const r = raw || {};
    return {
      settings: Object.assign({}, K.DEFAULTS, r.settings || {}, {
        custom: Object.assign({}, K.DEFAULTS.custom, (r.settings && r.settings.custom) || {})
      }),
      sites: r.sites || {},
      panels: r.panels || {}
    };
  }

  function save() { chrome.storage.sync.set({ [KEY]: state }); }

  function sendTab(msg, cb) {
    if (tabId == null) return cb && cb(null);
    chrome.tabs.sendMessage(tabId, msg, res => {
      if (chrome.runtime.lastError) return cb && cb(null);
      cb && cb(res);
    });
  }

  function siteEnabled() {
    const v = state.sites[host];
    if (v === false) return false;
    return v === true || !!state.settings.everywhere;
  }

  const NUM = {
    fontSize:     v => v + 'px',
    lineHeight:   v => (+v).toFixed(1),
    maxWidth:     v => (+v > 0 ? v + 'px' : 'خاموش'),
    panelWidth:   v => v + '٪',
    paperAmount:  v => v + '٪',
    focusLines:   v => v,
    focusBlur:    v => v + 'px',
    focusDim:     v => v + '٪'
  };

  function render() {
    const s = state.settings;
    $('host').textContent = host || 'صفحهٔ پشتیبانی‌نشده';
    $('siteOn').checked = siteEnabled();
    $('siteOn').disabled = !host;
    $('appearance').classList.toggle('off', !siteEnabled());

    // themes
    const box = $('themes');
    box.innerHTML = '';
    Object.keys(K.THEMES).forEach(id => {
      const t = K.THEMES[id];
      const c = id === 'custom' ? s.custom : t;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (s.theme === id ? ' sel' : '');
      b.textContent = t.name;
      b.style.background = c.bg;
      b.style.color = c.fg;
      b.addEventListener('click', () => { s.theme = id; save(); render(); });
      box.appendChild(b);
    });
    $('customColors').hidden = s.theme !== 'custom';
    $('cBg').value = s.custom.bg; $('cFg').value = s.custom.fg; $('cLink').value = s.custom.link;

    // font
    const sel = $('font');
    if (!sel.options.length) {
      Object.keys(K.FONTS).forEach(id => {
        const o = document.createElement('option');
        o.value = id; o.textContent = K.FONTS[id].name; sel.appendChild(o);
      });
    }
    sel.value = s.font;
    $('customFont').hidden = s.font !== 'custom';
    $('customFont').value = s.customFont || '';

    // numeric sliders
    Object.keys(NUM).forEach(k => { $(k).value = s[k]; $(k + 'V').textContent = NUM[k](s[k]); });

    // selects + checks
    $('paper').value = s.paper;
    $('focusFollow').value = s.focusFollow;
    ['autoDir', 'codeStyle', 'justify', 'overrideBg', 'mainOnly', 'everywhere', 'liftParents']
      .forEach(k => { $(k).checked = !!s[k]; });

    // panel status
    const has = !!state.panels[host];
    $('clearPanel').hidden = !has;
    $('pick').textContent = has ? 'انتخاب دوباره…' : 'انتخاب ستون متن…';
    $('panelStatus').textContent = has
      ? 'یک بخش برای این سایت ذخیره شده است.'
      : 'روی «انتخاب» بزن، بعد روی ستون وسط صفحه کلیک کن.';
    $('pick').disabled = !host;

    // focus
    $('focusBtn').textContent = focusOn ? 'خاموش‌کردن حالت تمرکز' : 'روشن‌کردن حالت تمرکز';
    $('focusBtn').classList.toggle('on', focusOn);
    $('focusBtn').disabled = !reachable;
    $('pick').disabled = !host || !reachable;
    $('note').hidden = reachable || !host;
  }

  function bind() {
    $('siteOn').addEventListener('change', e => {
      if (!host) return;
      state.sites[host] = e.target.checked;
      save(); render();
    });
    $('font').addEventListener('change', e => { state.settings.font = e.target.value; save(); render(); });
    $('customFont').addEventListener('input', e => { state.settings.customFont = e.target.value; save(); });

    [['cBg', 'bg'], ['cFg', 'fg'], ['cLink', 'link']].forEach(([id, key]) => {
      $(id).addEventListener('input', e => { state.settings.custom[key] = e.target.value; save(); });
    });

    Object.keys(NUM).forEach(k => {
      $(k).addEventListener('input', e => { state.settings[k] = +e.target.value; save(); render(); });
    });

    ['paper', 'focusFollow'].forEach(k => {
      $(k).addEventListener('change', e => { state.settings[k] = e.target.value; save(); render(); });
    });

    ['autoDir', 'codeStyle', 'justify', 'overrideBg', 'mainOnly', 'everywhere', 'liftParents'].forEach(k => {
      $(k).addEventListener('change', e => { state.settings[k] = e.target.checked; save(); render(); });
    });

    $('pick').addEventListener('click', () => {
      sendTab({ type: 'pick' }, res => {
        if (res && res.ok) window.close();
        else { reachable = false; render(); }
      });
    });

    $('clearPanel').addEventListener('click', () => {
      delete state.panels[host];
      save(); render();
    });

    $('focusBtn').addEventListener('click', () => {
      sendTab({ type: 'focus', on: !focusOn }, res => {
        if (res) { focusOn = !!res.focusOn; render(); }
      });
    });

    $('reset').addEventListener('click', () => {
      state.settings = normalize({}).settings;
      save(); render();
    });
  }

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    const tab = tabs && tabs[0];
    tabId = tab ? tab.id : null;
    try {
      const u = new URL(tab.url);
      if (/^https?:$/.test(u.protocol)) host = u.hostname;
    } catch (e) { /* chrome:// pages etc. */ }
    chrome.storage.sync.get(KEY, res => {
      state = normalize(res[KEY]);
      bind();
      render();
      sendTab({ type: 'status' }, st => {
        reachable = !!st;
        focusOn = !!(st && st.focusOn);
        render();
      });
    });
  });
})();
