/* Shared between content script and popup: defaults, themes, direction detection. */
(function (root) {
  'use strict';

  const THEMES = {
    sepia:  { name: 'کاغذی گرم',    bg: '#F4ECD8', fg: '#3B3226', link: '#8A4B08', code: '#EADFC4' },
    paper:  { name: 'خاکستری ملایم', bg: '#E9E7E2', fg: '#2B2B2B', link: '#1B5E9B', code: '#DCD9D2' },
    green:  { name: 'سبز کم‌رنگ',    bg: '#DDE8D5', fg: '#263326', link: '#1F6F4A', code: '#CFDDC5' },
    soft:   { name: 'تیرهٔ نرم',     bg: '#2B2B2B', fg: '#D6D6D6', link: '#8AB4F8', code: '#363636' },
    night:  { name: 'شب آبی',        bg: '#1F2733', fg: '#CBD5E1', link: '#7DD3FC', code: '#2A3445' },
    custom: { name: 'دلخواه',        bg: '#F4ECD8', fg: '#2E2A24', link: '#0B6E99', code: null }
  };

  const FONTS = {
    vazirmatn: { name: 'وزیرمتن (داخلی)', stack: '"Khana Vazirmatn", "Vazirmatn", Tahoma, sans-serif' },
    system:    { name: 'فونت سیستم',      stack: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif' },
    tahoma:    { name: 'Tahoma',          stack: 'Tahoma, "Segoe UI", sans-serif' },
    segoe:     { name: 'Segoe UI',        stack: '"Segoe UI", Tahoma, sans-serif' },
    naskh:     { name: 'Noto Naskh Arabic', stack: '"Noto Naskh Arabic", "Traditional Arabic", serif' },
    sans:      { name: 'Noto Sans Arabic', stack: '"Noto Sans Arabic", "Segoe UI", Tahoma, sans-serif' },
    serif:     { name: 'Serif',           stack: 'Georgia, "Times New Roman", serif' },
    custom:    { name: 'فونت دلخواه (نام)', stack: null }
  };

  const DEFAULTS = {
    everywhere: false,
    theme: 'sepia',
    custom: { bg: '#F4ECD8', fg: '#2E2A24', link: '#0B6E99' },
    overrideBg: true,
    font: 'vazirmatn',
    customFont: '',
    fontSize: 18,
    lineHeight: 2,
    maxWidth: 0,
    mainOnly: true,
    justify: false,
    autoDir: true,
    codeStyle: true,
    // selected reading column
    panelWidth: 70,        // % of viewport width
    liftParents: true,
    // matte paper: off | bg | panel | all
    paper: 'off',
    paperAmount: 45,
    // focus mode
    focusLines: 3,
    focusBlur: 5,
    focusDim: 45,
    focusFollow: 'mouse'   // mouse | fixed
  };

  /* ---- Direction detection ----
     Counts words, not first letter: a paragraph that starts in English but is
     mostly Persian gets RTL; an English paragraph with a few Persian words stays LTR. */
  const RTL_RE = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
  const LTR_RE = /[A-Za-zÀ-ʯͰ-ϿЀ-ӿ]/;
  const RTL_THRESHOLD = 0.35;

  function detectDir(text) {
    if (!text) return null;
    text = text.replace(/https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g, ' ');
    const words = text.split(/[\s‌‎‏ ]+/);
    let r = 0, l = 0;
    for (const w of words) {
      if (!w) continue;
      if (RTL_RE.test(w)) r++;
      else if (LTR_RE.test(w)) l++;
    }
    if (!r && !l) return null;
    return r / (r + l) >= RTL_THRESHOLD ? 'rtl' : 'ltr';
  }

  /* ---- Color helpers ---- */
  function hexToRgb(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(a) {
    return '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(h1, h2, t) {
    const a = hexToRgb(h1), b = hexToRgb(h2);
    return rgbToHex(a.map((v, i) => v + (b[i] - v) * t));
  }
  function luminance(h) {
    const [r, g, b] = hexToRgb(h).map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  function resolvePalette(s) {
    const t = THEMES[s.theme] || THEMES.sepia;
    const c = s.theme === 'custom' ? s.custom : t;
    const bg = c.bg, fg = c.fg, link = c.link;
    const code = t.code || mix(bg, fg, 0.07);
    return { bg, fg, link, code, dark: luminance(bg) < 0.4 };
  }

  const api = { THEMES, FONTS, DEFAULTS, detectDir, mix, luminance, hexToRgb, resolvePalette, RTL_THRESHOLD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KhanaShared = api;
})(typeof self !== 'undefined' ? self : this);
