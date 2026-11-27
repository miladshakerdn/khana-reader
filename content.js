(function () {
  'use strict';
  if (window.__khanaLoaded) return;
  window.__khanaLoaded = true;

  const K = window.KhanaShared;
  const HOST = location.hostname;
  const STORE_KEY = 'khana';

  let state = { settings: K.DEFAULTS, sites: {}, panels: {} };
  let active = false;
  let observer = null;
  let styleEl = null;
  const pending = new Set();
  let timer = null;

  /* ------------------------------------------------------------------ *
   *  Selectors / tag sets
   * ------------------------------------------------------------------ */
  const CAND = 'p,li,h1,h2,h3,h4,h5,h6,blockquote,td,th,dd,dt,figcaption,summary,label,legend,caption,div,ul,ol';
  const BLOCKISH = 'div,p,ul,ol,li,table,section,article,h1,h2,h3,h4,h5,h6,pre,blockquote,form,header,footer,nav,aside,main,details,figure';
  const SKIP = new Set(['script', 'style', 'noscript', 'pre', 'code', 'kbd', 'samp', 'textarea', 'input',
    'select', 'svg', 'math', 'canvas', 'iframe', 'video', 'audio', 'object', 'template', 'button']);
  const INLINE = new Set(['a', 'b', 'strong', 'em', 'i', 'u', 's', 'span', 'mark', 'small', 'sub', 'sup', 'del',
    'ins', 'cite', 'q', 'abbr', 'time', 'font', 'bdi', 'bdo', 'dfn', 'var']);

  function ownText(el, depth) {
    depth = depth || 0;
    let s = '';
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.nodeValue + ' ';
      else if (n.nodeType === 1 && depth < 6) {
        const t = n.localName;
        if (SKIP.has(t)) continue;
        if (INLINE.has(t)) s += ownText(n, depth + 1) + ' ';
      }
    }
    return s;
  }

  function listText(list) {
    let s = '', c = 0;
    for (const li of list.children) {
      if (li.localName !== 'li') continue;
      s += ownText(li) + ' ';
      if (++c >= 25) break;
    }
    return s;
  }

  /* ------------------------------------------------------------------ *
   *  Per-element processing
   * ------------------------------------------------------------------ */
  function processEl(el) {
    if (!el.isConnected || el.closest('pre,code,textarea,[data-rfx-ui]')) return;
    const tag = el.localName;
    let text;

    if (tag === 'ul' || tag === 'ol') {
      text = listText(el);
    } else {
      text = ownText(el);
      if (tag === 'div' && /\S/.test(text) && el.querySelector(BLOCKISH)) text = ''; // layout containers: leave alone
    }

    const hasText = /[\p{L}]/u.test(text);
    if (!hasText) {
      if (el.dataset.rfxT !== undefined) { delete el.dataset.rfxT; }
      return;
    }
    if (tag !== 'ul' && tag !== 'ol') el.dataset.rfxT = '1';

    if (!state.settings.autoDir) return;

    // li inherits the list direction
    if (tag === 'li') {
      const p = el.parentElement;
      if (p && p.dataset.rfxDir) { delete el.dataset.rfxDir; return; }
    }

    const dir = K.detectDir(text);
    if (!dir) return;
    if (el.dataset.rfxDir === undefined && el.dataset.rfxCenter === undefined) {
      try {
        if (getComputedStyle(el).textAlign === 'center') el.dataset.rfxCenter = '1';
      } catch (e) { /* ignore */ }
    }
    if (el.dataset.rfxDir !== dir) el.dataset.rfxDir = dir;
  }

  function processInputs(root) {
    const sel = 'input[type=text],input[type=search],input:not([type]),textarea,[contenteditable=""],[contenteditable="true"]';
    const list = root.matches && root.matches(sel) ? [root] : [];
    root.querySelectorAll(sel).forEach(e => list.push(e));
    for (const e of list) {
      if (!e.hasAttribute('dir')) { e.setAttribute('dir', 'auto'); e.dataset.rfxInp = '1'; }
    }
  }

  /* ---- Code blocks ---- */
  function copyText(text, btn) {
    const done = () => { btn.textContent = 'کپی شد ✓'; setTimeout(() => (btn.textContent = 'کپی'), 1400); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else fallbackCopy(text, done);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
    ta.remove();
  }

  function processPre(pre) {
    if (!pre.isConnected) return;
    const code = pre.querySelector(':scope > code');

    if (pre.dataset.rfxPre === undefined) {
      pre.dataset.rfxPre = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rfx-copy';
      btn.dataset.rfxUi = '1';
      btn.textContent = 'کپی';
      btn.addEventListener('click', ev => {
        ev.preventDefault(); ev.stopPropagation();
        const src = pre.querySelector(':scope > code') || pre;
        let text = '';
        if (src === pre) {
          for (const n of pre.childNodes) if (n !== btn) text += n.textContent;
        } else text = src.textContent;
        copyText(text.replace(/\n$/, ''), btn);
      });
      pre.appendChild(btn);
    }

    if (!code || typeof hljs === 'undefined') return;
    const text = code.textContent;
    if (code.dataset.rfxHl && code.dataset.rfxSrc === text && code.children.length) return;
    if (code.children.length && !code.dataset.rfxHl) return;   // the site already highlights it
    if (!text.trim() || text.length > 60000) return;

    const m = (code.className + ' ' + pre.className).match(/(?:language|lang)-([\w+#-]+)/i);
    const lang = m && hljs.getLanguage(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
    let res = null;
    try {
      if (lang) res = hljs.highlight(text, { language: lang, ignoreIllegals: true });
      else if (text.length >= 30) {
        const a = hljs.highlightAuto(text);
        if (a.relevance >= 5) res = a;
      }
    } catch (e) { res = null; }
    if (!res) return;
    code.dataset.rfxSrc = text;
    code.dataset.rfxHl = '1';
    code.classList.add('hljs');
    code.innerHTML = res.value;           // hljs escapes the source itself
  }

  /* ------------------------------------------------------------------ *
   *  Tree processing + observer
   * ------------------------------------------------------------------ */
  function processTree(root) {
    if (!root || root.nodeType !== 1 || !root.isConnected) return;
    if (root.closest && root.closest('[data-rfx-ui]')) return;
    if (root.matches(CAND)) processEl(root);
    root.querySelectorAll(CAND).forEach(processEl);
    if (state.settings.codeStyle) {
      if (root.matches('pre')) processPre(root);
      root.querySelectorAll('pre').forEach(processPre);
    }
    if (state.settings.autoDir) processInputs(root);
  }

  function schedule(node) {
    if (!node) return;
    if (node.nodeType === 3) node = node.parentElement;
    if (!node || node.nodeType !== 1) return;
    pending.add(node);
    if (!timer) timer = setTimeout(flush, 150);
  }

  function flush() {
    timer = null;
    const items = Array.from(pending);
    pending.clear();
    if (state.panels[HOST] && (!panelEl || !panelEl.isConnected)) resolvePanel();
    for (const n of items) {
      if (!n.isConnected) continue;
      const host = n.closest ? n.closest(CAND) : null;
      if (host && host !== n) processEl(host);
      processTree(n);
    }
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') {
          schedule(m.target);
          m.addedNodes.forEach(n => (n.nodeType === 1 || n.nodeType === 3) && schedule(n));
        } else if (m.type === 'characterData') schedule(m.target);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  /* ------------------------------------------------------------------ *
   *  CSS generation
   * ------------------------------------------------------------------ */
  function buildCSS() {
    const s = state.settings;
    const p = K.resolvePalette(s);
    const fontInfo = K.FONTS[s.font] || K.FONTS.vazirmatn;
    let stack = fontInfo.stack;
    if (s.font === 'custom') {
      const n = (s.customFont || '').replace(/["'\\;{}]/g, '').trim();
      stack = n ? `"${n}", system-ui, Tahoma, sans-serif` : K.FONTS.system.stack;
    }
    const mono = '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace';
    const size = +s.fontSize, lh = +s.lineHeight;
    const fontUrl = chrome.runtime.getURL('fonts/Vazirmatn.woff2');

    const textEls = 'p,li,td,th,dd,dt,blockquote,figcaption,h1,h2,h3,h4,h5,h6';
    const scope = s.mainOnly
      ? textEls.split(',').map(t => `html body ${t}[data-rfx-t]`).join(',')
      : 'html body [data-rfx-t]';
    const scopeKids = s.mainOnly
      ? textEls.split(',').map(t => `html body ${t}[data-rfx-t] :is(a,b,strong,em,u,mark,small,sub,sup,del,ins,cite,q,abbr)`).join(',')
      : 'html body [data-rfx-t] :is(a,b,strong,em,u,mark,small,sub,sup,del,ins,cite,q,abbr)';

    const hl = p.dark
      ? { kw: '#c792ea', str: '#a5d6a7', num: '#f6b26b', com: '#8a93a0', ttl: '#82aaff', attr: '#f07178', bi: '#7fdbca', del: '#ff7b72' }
      : { kw: '#8e24aa', str: '#2e7d32', num: '#b45309', com: '#7a7468', ttl: '#1565c0', attr: '#c62828', bi: '#00838f', del: '#c62828' };

    const textColorSel = 'p,li,h1,h2,h3,h4,h5,h6,td,th,dd,dt,span,div,label,blockquote,figcaption,summary,b,strong,em,i,small,legend,caption,section,article,main,header,footer,aside,nav,ul,ol,table';

    let css = `
@font-face{font-family:"Khana Vazirmatn";src:url("${fontUrl}") format("woff2");font-weight:100 900;font-display:swap;}
html{color-scheme:${p.dark ? 'dark' : 'light'};}
html,html body{background:${p.bg} !important;color:${p.fg} !important;}
`;
    if (s.overrideBg) {
      css += `html body :is(${textColorSel},form,tr,thead,tbody,tfoot,figure,details,fieldset):not(pre):not(pre *){background-color:${p.bg} !important;}\n`;
    }
    css += `html body :is(${textColorSel}):not(a):not(a *):not(pre):not(pre *){color:${p.fg} !important;}
html body a:not([role=button]){color:${p.link} !important;}
html body ::selection{background:${K.mix(p.bg, p.link, 0.35)} !important;}
`;

    // font / size / line-height
    css += `${scope},${scopeKids}{font-family:${stack} !important;}\n`;
    css += `${scope}{line-height:${lh} !important;}\n`;
    css += `${scope.split(',').filter(x => !/ h[1-6]\[/.test(x)).join(',')}{font-size:${size}px !important;}\n`;
    const hs = { h1: 1.7, h2: 1.45, h3: 1.25, h4: 1.12, h5: 1.05, h6: 1 };
    for (const h in hs) css += `html body ${h}[data-rfx-t]{font-size:${(size * hs[h]).toFixed(1)}px !important;line-height:${Math.max(1.4, lh - 0.4).toFixed(2)} !important;}\n`;
    css += `html body :is(sup,sub)[data-rfx-t]{font-size:.75em !important;}\n`;

    if (s.maxWidth > 0) {
      css += `html body :is(p,h1,h2,h3,h4,h5,h6,ul,ol,blockquote)[data-rfx-t],html body :is(ul,ol)[data-rfx-dir]{max-width:${+s.maxWidth}px !important;margin-left:auto !important;margin-right:auto !important;}\n`;
    }

    // direction
    css += `
html body [data-rfx-dir="rtl"]{direction:rtl !important;}
html body [data-rfx-dir="ltr"]{direction:ltr !important;}
html body [data-rfx-dir]:not([data-rfx-center]){text-align:start !important;}
html body :is(ul,ol)[data-rfx-dir]{padding-left:0 !important;padding-right:0 !important;padding-inline-start:1.6em !important;padding-inline-end:0 !important;}
html body :is(input:not([type]),input[type=text],input[type=search],textarea,[contenteditable]){text-align:start !important;unicode-bidi:plaintext;}
`;
    if (s.justify) css += `html body p[data-rfx-t]:not([data-rfx-center]){text-align:justify !important;text-justify:inter-word;}\n`;

    // code
    if (s.codeStyle) {
      css += `
html body :not(pre) > :is(code,kbd,samp){font-family:${mono} !important;font-size:.88em !important;background:${p.code} !important;color:${p.fg} !important;padding:.12em .42em !important;border-radius:6px !important;direction:ltr !important;unicode-bidi:isolate !important;text-align:left !important;white-space:pre-wrap;}
html body pre{background:${p.code} !important;color:${p.fg} !important;border:1px solid ${K.mix(p.bg, p.fg, 0.14)} !important;border-radius:10px !important;padding:14px 16px !important;margin:1em 0 !important;direction:ltr !important;text-align:left !important;unicode-bidi:isolate !important;font-family:${mono} !important;font-size:${Math.max(12, size - 4)}px !important;line-height:1.65 !important;tab-size:2;overflow:auto !important;position:relative !important;}
html body pre code,html body pre code *{font-family:inherit !important;font-size:inherit !important;line-height:inherit !important;background:transparent !important;padding:0 !important;border:0 !important;direction:ltr !important;text-align:left !important;unicode-bidi:isolate !important;}
html body pre code{color:inherit !important;display:block;}
html body pre .rfx-copy{position:absolute !important;top:8px;right:8px;left:auto;font:12px/1 ${K.FONTS.system.stack} !important;background:${p.bg} !important;color:${p.fg} !important;border:1px solid ${K.mix(p.bg, p.fg, 0.3)} !important;border-radius:6px;padding:4px 9px !important;cursor:pointer;opacity:0;transition:opacity .15s;user-select:none;-webkit-user-select:none;direction:rtl !important;}
html body pre:hover .rfx-copy,html body pre .rfx-copy:focus{opacity:.95;}
html body pre .hljs-keyword,html body pre .hljs-selector-tag,html body pre .hljs-literal,html body pre .hljs-section,html body pre .hljs-doctag,html body pre .hljs-name{color:${hl.kw} !important;}
html body pre .hljs-string,html body pre .hljs-regexp,html body pre .hljs-addition,html body pre .hljs-template-tag{color:${hl.str} !important;}
html body pre .hljs-number,html body pre .hljs-symbol,html body pre .hljs-bullet,html body pre .hljs-link{color:${hl.num} !important;}
html body pre .hljs-comment,html body pre .hljs-quote{color:${hl.com} !important;font-style:italic;}
html body pre .hljs-meta,html body pre .hljs-meta *{color:${hl.com} !important;}
html body pre .hljs-title,html body pre .hljs-title.function_,html body pre .hljs-title.class_{color:${hl.ttl} !important;}
html body pre .hljs-attr,html body pre .hljs-attribute,html body pre .hljs-variable,html body pre .hljs-template-variable,html body pre .hljs-property,html body pre .hljs-selector-class,html body pre .hljs-selector-id{color:${hl.attr} !important;}
html body pre .hljs-built_in,html body pre .hljs-type,html body pre .hljs-params{color:${hl.bi} !important;}
html body pre .hljs-deletion{color:${hl.del} !important;}
html body pre .hljs-emphasis{font-style:italic;}
html body pre .hljs-strong{font-weight:bold;}
`;
    }
    // selected reading column: wider than the site's 1/3 lock
    const pw = Math.min(100, Math.max(30, +s.panelWidth || 70));
    css += `
html body [data-rfx-anc]{max-width:none !important;min-width:0 !important;width:auto !important;}
html body [data-rfx-panel]{width:min(${pw}vw,calc(100vw - 32px)) !important;max-width:min(${pw}vw,calc(100vw - 32px)) !important;min-width:0 !important;margin-left:auto !important;margin-right:auto !important;box-sizing:border-box !important;flex:0 0 auto !important;justify-self:center !important;z-index:5;}
html body [data-rfx-panel][data-rfx-static]{position:relative !important;}
html body [data-rfx-pgrid]{margin-left:0 !important;margin-right:0 !important;}
`;

    // matte paper
    const mode = s.paper || 'off';
    if (mode !== 'off') {
      const noise = noiseURL(p.dark, +s.paperAmount);
      const blocks = `${textColorSel},form,tr,thead,tbody,tfoot,figure,details,fieldset`;
      const hasPanel = !!(state.panels && state.panels[HOST]);
      if (mode === 'bg' || (mode === 'panel' && !hasPanel)) {
        css += `html,html body{background-image:${noise} !important;}\n`;
        if (s.overrideBg) css += `html body :is(${blocks}):not(pre):not(pre *){background-image:${noise} !important;}\n`;
      } else if (mode === 'panel') {
        const sheet = p.dark ? K.mix(p.bg, '#ffffff', 0.06) : K.mix(p.bg, '#ffffff', 0.38);
        css += `html body [data-rfx-panel],html body [data-rfx-panel] :is(${blocks}):not(pre):not(pre *){background-color:${sheet} !important;background-image:${noise} !important;}
html body [data-rfx-panel]{border-radius:12px !important;box-shadow:0 10px 40px rgba(0,0,0,${p.dark ? '.5' : '.16'}) !important;padding-left:clamp(16px,3vw,40px) !important;padding-right:clamp(16px,3vw,40px) !important;}\n`;
      } else if (mode === 'all') {
        css += `html::after{content:"";position:fixed;inset:0;z-index:2147483646;pointer-events:none;background-image:${noise};}\n`;
      }
    }
    return css;
  }

  function noiseURL(dark, amount) {
    const a = (0.05 + Math.min(100, Math.max(0, amount)) / 100 * 0.2).toFixed(3);
    const c = dark ? 1 : 0;
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${c} 0 0 0 0 ${c} 0 0 0 0 ${c} ${a} ${a} ${a} 0 ${(-a * 1.2).toFixed(3)}'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  function applyStyle() {
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'khana-style';
      styleEl.dataset.rfxUi = '1';
    }
    styleEl.textContent = buildCSS();
    if (!styleEl.isConnected) (document.head || document.documentElement).appendChild(styleEl);
  }

  /* ------------------------------------------------------------------ *
   *  Enable / disable
   * ------------------------------------------------------------------ */
  function isEnabled() {
    const v = state.sites[HOST];
    if (v === false) return false;
    return v === true || !!state.settings.everywhere;
  }

  function enable() {
    active = true;
    applyStyle();
    const go = () => {
      if (!active) return;
      processTree(document.body);
      resolvePanel();
      startObserver();
    };
    if (document.body) go();
    else document.addEventListener('DOMContentLoaded', go, { once: true });
  }

  function reprocessAll() {
    // settings that affect marking (autoDir / codeStyle) changed: clean marks then redo
    cleanupMarks();
    if (document.body) processTree(document.body);
  }

  function cleanupMarks() {
    document.querySelectorAll('[data-rfx-dir],[data-rfx-t],[data-rfx-center]').forEach(e => {
      delete e.dataset.rfxDir; delete e.dataset.rfxT; delete e.dataset.rfxCenter;
    });
    document.querySelectorAll('[data-rfx-inp]').forEach(e => {
      e.removeAttribute('dir'); delete e.dataset.rfxInp;
    });
    document.querySelectorAll('code[data-rfx-hl]').forEach(c => {
      if (c.dataset.rfxSrc != null) c.textContent = c.dataset.rfxSrc;
      c.classList.remove('hljs'); delete c.dataset.rfxHl; delete c.dataset.rfxSrc;
    });
    document.querySelectorAll('.rfx-copy').forEach(b => b.remove());
    document.querySelectorAll('[data-rfx-pre]').forEach(p => delete p.dataset.rfxPre);
  }

  function disable() {
    active = false;
    if (observer) { observer.disconnect(); observer = null; }
    pending.clear();
    if (timer) { clearTimeout(timer); timer = null; }
    if (styleEl) styleEl.remove();
    cleanupMarks();
    unmarkPanel();
  }

  function sync(prev) {
    const should = isEnabled();
    if (should && !active) return enable();
    if (!should && active) return disable();
    if (should && active) {
      applyStyle();
      unmarkPanel();
      resolvePanel();
      scheduleFocus();
      const a = prev && prev.settings, b = state.settings;
      if (!a || a.autoDir !== b.autoDir || a.codeStyle !== b.codeStyle) reprocessAll();
    }
  }

  /* ------------------------------------------------------------------ *
   *  Storage
   * ------------------------------------------------------------------ */
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

  /* ------------------------------------------------------------------ *
   *  Selected reading column ("panel")
   * ------------------------------------------------------------------ */
  let panelEl = null;

  function unmarkPanel() {
    document.querySelectorAll('[data-rfx-panel],[data-rfx-anc]').forEach(e => {
      delete e.dataset.rfxPanel; delete e.dataset.rfxAnc; delete e.dataset.rfxSel; delete e.dataset.rfxStatic; delete e.dataset.rfxPgrid;
    });
    panelEl = null;
  }

  function resolvePanel() {
    const sel = state.panels[HOST];
    if (!active || !sel) { if (panelEl) unmarkPanel(); return; }
    if (panelEl && panelEl.isConnected && panelEl.dataset.rfxSel === sel) return;
    unmarkPanel();
    let el = null;
    try { el = document.querySelector(sel); } catch (e) { /* bad selector */ }
    if (!el || el === document.body || el === document.documentElement) return;
    panelEl = el;
    el.dataset.rfxPanel = '1';
    el.dataset.rfxSel = sel;
    try {
      if (getComputedStyle(el).position === 'static') el.dataset.rfxStatic = '1';
      const pd = el.parentElement && getComputedStyle(el.parentElement).display;
      if (pd && pd.indexOf('grid') >= 0) el.dataset.rfxPgrid = '1';
    } catch (e) { /* ignore */ }
    if (state.settings.liftParents) {
      let p = el.parentElement;
      while (p && p !== document.body && p !== document.documentElement) {
        p.dataset.rfxAnc = '1';
        p = p.parentElement;
      }
    }
  }

  function buildSelector(el) {
    const esc = s => (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/[^\w-]/g, '\\$&');
    const seg = n => {
      if (n.id && document.querySelectorAll('#' + esc(n.id)).length === 1) return { s: '#' + esc(n.id), id: true };
      let s = n.localName;
      const cls = Array.from(n.classList)
        .filter(c => c.length <= 28 && !/\d{3,}/.test(c) && !/^(rfx|hljs)/.test(c)).slice(0, 2);
      s += cls.map(c => '.' + esc(c)).join('');
      const par = n.parentElement;
      if (par) {
        try {
          if (par.querySelectorAll(':scope > ' + s).length > 1) {
            const idx = Array.from(par.children).filter(x => x.localName === n.localName).indexOf(n) + 1;
            s += ':nth-of-type(' + idx + ')';
          }
        } catch (e) { /* ignore */ }
      }
      return { s, id: false };
    };
    const parts = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const g = seg(n);
      parts.unshift(g.s);
      const sel = parts.join(' > ');
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (e) { /* ignore */ }
      if (g.id) break;
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  /* ------------------------------------------------------------------ *
   *  Shadow-DOM UI (picker overlay + focus veils)
   * ------------------------------------------------------------------ */
  let ui = null;
  function getUI() {
    if (ui && ui.host.isConnected) return ui;
    const host = document.createElement('div');
    host.id = 'khana-ui';
    host.dataset.rfxUi = '1';
    host.style.cssText = 'all:initial;position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>
      .veil{position:fixed;left:0;right:0;display:none;pointer-events:none;background:var(--veil,rgba(0,0,0,.4));
        backdrop-filter:blur(var(--blur,5px));-webkit-backdrop-filter:blur(var(--blur,5px));}
      #vt{top:0;height:0;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 24px),transparent);}
      #vb{bottom:0;top:100%;-webkit-mask-image:linear-gradient(to top,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(to top,#000 calc(100% - 24px),transparent);}
      #box{position:fixed;display:none;border:2px solid #2E7D6E;background:rgba(46,125,110,.14);border-radius:6px;pointer-events:none;}
      #hint{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);display:none;background:#243238;color:#fff;
        font:13px/1.7 Tahoma,sans-serif;padding:9px 16px;border-radius:10px;direction:rtl;box-shadow:0 6px 24px rgba(0,0,0,.35);white-space:nowrap;}
    </style><div class="veil" id="vt"></div><div class="veil" id="vb"></div><div id="box"></div><div id="hint"></div>`;
    document.documentElement.appendChild(host);
    ui = { host, root, el: id => root.getElementById(id) };
    return ui;
  }

  /* ---- Element picker ---- */
  let picking = null;
  function startPicker() {
    if (picking) return;
    const u = getUI();
    const box = u.el('box'), hint = u.el('hint');
    hint.textContent = 'روی بخش اصلی صفحه کلیک کن  •  ↑ / ↓ برای انتخاب والد یا فرزند  •  Esc برای لغو';
    hint.style.display = 'block';
    const st = { base: null, up: 0, cur: null };
    picking = st;

    const climb = () => {
      let el = st.base, n = 0;
      while (n < st.up && el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
        el = el.parentElement; n++;
      }
      st.up = n;
      return el;
    };
    const draw = () => {
      if (!st.base) return;
      st.cur = climb();
      const r = st.cur.getBoundingClientRect();
      Object.assign(box.style, { display: 'block', left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    };
    const onMove = e => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === document.body || el === document.documentElement) return;
      if (el !== st.base) { st.base = el; st.up = 0; }
      draw();
    };
    const eat = e => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
    const onClick = e => { eat(e); confirm(); };
    const onKey = e => {
      if (e.key === 'Escape') { eat(e); stop(); }
      else if (e.key === 'ArrowUp') { eat(e); st.up++; draw(); }
      else if (e.key === 'ArrowDown') { eat(e); st.up = Math.max(0, st.up - 1); draw(); }
    };
    const swallow = ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'dblclick'];
    const stop = () => {
      picking = null;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', draw, true);
      swallow.forEach(t => window.removeEventListener(t, eat, true));
      box.style.display = 'none';
      hint.style.display = 'none';
    };
    const confirm = () => {
      if (!st.cur) return;
      const sel = buildSelector(st.cur);
      stop();
      state = Object.assign({}, state, {
        panels: Object.assign({}, state.panels, { [HOST]: sel }),
        sites: Object.assign({}, state.sites, { [HOST]: true })
      });
      chrome.storage.sync.set({ [STORE_KEY]: state });
      if (!active) sync(null);
    };
    window.addEventListener('mousemove', onMove, true);
    window.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', draw, true);
    swallow.forEach(t => window.addEventListener(t, eat, true));
  }

  /* ---- Focus mode: a clear reading band, frosted glass above and below ---- */
  let focusOn = false, mouseY = null, focusRaf = 0;

  function parseRGB(str) {
    const m = /rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[,/ ]+([\d.]+))?/.exec(str || '');
    return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]] : null;
  }
  function pageBgRGB() {
    if (active) return K.hexToRgb(K.resolvePalette(state.settings).bg);
    for (const el of [document.body, document.documentElement]) {
      if (!el) continue;
      const c = parseRGB(getComputedStyle(el).backgroundColor);
      if (c && c[3] > 0.5) return c.slice(0, 3);
    }
    return [255, 255, 255];
  }
  function currentLinePx(y) {
    const s = state.settings;
    if (active) return Math.max(16, s.fontSize * s.lineHeight);
    try {
      const el = document.elementFromPoint(innerWidth / 2, y);
      if (el) {
        const cs = getComputedStyle(el);
        const lh = parseFloat(cs.lineHeight);
        if (lh > 0) return lh;
        const fs = parseFloat(cs.fontSize);
        if (fs > 0) return fs * 1.5;
      }
    } catch (e) { /* ignore */ }
    return 28;
  }
  function updateFocus() {
    focusRaf = 0;
    if (!focusOn) return;
    const u = getUI(), s = state.settings;
    const y = (s.focusFollow === 'fixed' || mouseY == null) ? innerHeight * 0.42 : mouseY;
    const H = Math.max(1, +s.focusLines || 3) * currentLinePx(y);
    const top = H >= innerHeight ? 0 : Math.max(0, Math.min(innerHeight - H, y - H / 2));
    u.el('vt').style.height = top + 'px';
    u.el('vb').style.top = (top + H) + 'px';
    const c = pageBgRGB();
    u.host.style.setProperty('--veil', `rgba(${c[0]},${c[1]},${c[2]},${(+s.focusDim / 100).toFixed(2)})`);
    u.host.style.setProperty('--blur', (+s.focusBlur) + 'px');
  }
  function scheduleFocus() { if (focusOn && !focusRaf) focusRaf = requestAnimationFrame(updateFocus); }
  function setFocus(on) {
    focusOn = !!on;
    const u = getUI();
    u.el('vt').style.display = u.el('vb').style.display = focusOn ? 'block' : 'none';
    if (focusOn) updateFocus();
  }

  document.addEventListener('mousemove', e => { mouseY = e.clientY; scheduleFocus(); }, { passive: true, capture: true });
  addEventListener('resize', scheduleFocus);
  // Alt+Shift+F toggles focus mode on this tab
  addEventListener('keydown', e => {
    if (e.altKey && e.shiftKey && e.code === 'KeyF') { e.preventDefault(); setFocus(!focusOn); }
  }, true);

  chrome.runtime.onMessage.addListener((msg, sender, send) => {
    if (!msg) return;
    if (msg.type === 'pick') { startPicker(); send({ ok: true }); }
    else if (msg.type === 'focus') { setFocus(msg.on); send({ focusOn }); }
    else if (msg.type === 'status') { send({ focusOn, active, hasPanel: !!state.panels[HOST] }); }
  });

  chrome.storage.sync.get(STORE_KEY, res => {
    state = normalize(res[STORE_KEY]);
    sync(null);
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes[STORE_KEY]) return;
    const prev = state;
    state = normalize(changes[STORE_KEY].newValue);
    sync(prev);
  });
})();
