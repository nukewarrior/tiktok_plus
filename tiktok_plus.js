// ==UserScript==
// @name         TikTok Plus
// @name:zh-CN   TikTok Plus
// @namespace    https://github.com/nukewarrior/tiktok_plus
// @version      1.5.3
// @description  Keyboard shortcuts, individual and continuous comment translation for TikTok.
// @description:zh-CN  为 TikTok 添加键盘快捷键、评论逐条翻译和翻译全部。
// @author       nukewarrior
// @license      MIT
// @match        https://www.tiktok.com/*
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      translate.googleapis.com
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "1.5.3";
  const SEEK_SECONDS = 5;
  const COMMENT_SELECTOR = '[data-e2e="comment-level-1"], [data-e2e="comment-level-2"]';
  const INTERACTIVE_SELECTOR = 'button, a, [role="button"], [tabindex]';
  const FULLSCREEN_CONTROL_DATA = ["cinema-mode-entry", "cinema-mode-exit"];
  const FULLSCREEN_CONTROL_LABELS = [/full[\s-]?screen/i, /全屏/];
  // Cinema mode takes the whole document fullscreen instead of a single player card, so the
  // action bar and TikTok's portalled popovers stay inside the fullscreen subtree.
  const CINEMA_CLASS = "tiktok-plus-cinema-mode";
  const CINEMA_IDLE_CLASS = "tiktok-plus-cinema-mode-idle";
  const CINEMA_COMMENTS_CLASS = "tiktok-plus-cinema-mode-comments";
  const CINEMA_CARD_CLASS = "tiktok-plus-cinema-card";
  const CINEMA_BAR_CLASS = "tiktok-plus-cinema-bar";
  const CINEMA_CHROME_CLASS = "tiktok-plus-cinema-chrome";
  const CINEMA_ARTICLE_CLASS = "tiktok-plus-cinema-article";
  const CINEMA_FLEX_CLASS = "tiktok-plus-cinema-flex";
  const CINEMA_LIST_CLASS = "tiktok-plus-cinema-list";
  const CINEMA_MEDIA_CLASS = "tiktok-plus-cinema-media";
  const CINEMA_MEDIA_SELECTOR = '[data-e2e="feed-video"]';
  const CINEMA_ACTION_BAR_SELECTOR = '[class*="SectionActionBarContainer"]';
  const CINEMA_ACTION_BAR_FALLBACK_SELECTOR = '[data-e2e="like-icon"], [data-e2e="comment-icon"]';
  const CINEMA_COMMENT_PANEL_SELECTOR = '[class*="DivCommentListContainer"]';
  const CINEMA_RAIL_SELECTOR = '[class*="RightPanelContainer"], [class*="AsideOneColumnSidebar"]';
  const CINEMA_INFO_SELECTOR = '[class*="DivMediaCardOverlayBottom"]';
  const CINEMA_TOP_SELECTOR = '[class*="DivMediaCardOverlayTop"]';
  const CINEMA_PROGRESS_SELECTOR = '[class*="DivVideoProgressContainer"]';
  const CINEMA_POPUP_SELECTOR = '[class*="TUXPopover-popover--open"], [data-e2e="more-menu-popover"]';
  const CINEMA_IDLE_MS = 2400;
  const CINEMA_IDLE_RETRY_MS = 400;
  const cinemaState = {
    card: null,
    bar: null,
    article: null,
    flex: null,
    video: null,
    list: null,
    idleTimer: null,
    resizeObserver: null,
    mutationObserver: null,
    videoCleanup: null,
    barColorCleanup: null,
    listeners: null,
  };
  const commentStates = new WeakMap();
  const COMMENT_PANEL_SELECTOR = 'section[class*="SectionCommentSidebarContainer"]';
  const commentCache = new Map();
  const bulkQueue = new Set();
  let translationVideoKey = null;
  let bulkEnabled = false;
  let bulkPanel = null;
  let bulkControls = null;
  let bulkRunning = false;
  let bulkTimer = null;
  let bulkRateLimited = false;
  const bulkInFlight = new Set();
  let bulkGeneration = 0;
  const CACHE_KEY = "tiktok-plus:dict-chrome-ex:v1";
  const CACHE_TTL = 30 * 86400000;
  const MAX_CACHE = 500;
  const MAX_CACHE_CHARS = 500000;
  const TRANSLATION_RPM = 60;
  const TRANSLATION_CONCURRENT = 6;
  const translationCache = new Map();
  const pendingTranslations = new Map();
  const translationQueue = [];
  const translationStarts = [];
  const translationMetrics = { requests: 0, successes: 0, failures: 0, cacheHits: 0, rateLimits: 0 };
  let translationActive = 0, translationSeq = 0, translationWake = null;
  let translationCacheTimer = null, translationCooldown = 0, translationStrikes = 0, translationPaused = false;
  try {
    const records = GM_getValue(CACHE_KEY, []);
    if (Array.isArray(records)) for (const entry of records) {
      if (Array.isArray(entry) && typeof entry[0] === "string" &&
          typeof entry[1]?.text === "string" && entry[1].expires > Date.now()) {
        translationCache.set(entry[0], entry[1]);
      }
    }
  } catch (error) { console.warn("[TikTok Plus][translate] 缓存读取失败", error); }
  const SHORTCUT_GROUPS = [
    {
      title: "播放控制",
      items: [
        ["Space", "暂停 / 播放"],
        ["↑ / ↓", "上下切视频"],
        ["← / →", "快退 / 快进 5 秒"],
        ["H / F", "影院全屏（含工具栏）"],
        ["Esc", "退出全屏 / 关闭快捷键列表"],
      ],
    },
    {
      title: "互动操作",
      items: [
        ["Z", "点赞"],
        ["X", "评论区"],
        ["C", "收藏"],
        ["V", "复制口令"],
        ["B", "开关弹幕"],
        ["R", "不感兴趣"],
        ["G", "关注"],
      ],
    },
    {
      title: "搜索与帮助",
      items: [
        ["Shift + F", "聚焦搜索框"],
        ["Shift + ?", "显示 / 关闭快捷键列表"],
      ],
    },
  ];


  const css = `
    .tiktok-plus-original-hidden {
      display: none !important;
    }

    .tiktok-plus-comment-translation {
      display: block;
      color: var(--ui-text-1, inherit);
      font-size: 15px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .tiktok-plus-comment-translation[hidden] {
      display: none;
    }

    .tiktok-plus-translate-button {
      display: block;
      min-height: 24px;
      margin: 4px 0;
      padding: 2px 0;
      border: 0;
      background: transparent;
      color: var(--ui-text-2, inherit);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }

    .tiktok-plus-translate-button:hover {
      text-decoration: underline;
    }

    .tiktok-plus-translate-button:focus-visible {
      outline: 2px solid currentColor;
      outline-offset: 2px;
    }

    .tiktok-plus-translate-button:disabled {
      cursor: wait;
    }

    .tiktok-plus-bulk-controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 2px 8px;
      margin: 0 12px 0 auto;
      color: var(--ui-text-2, inherit);
      font-size: 12px;
    }

    .tiktok-plus-bulk-controls button {
      flex-shrink: 0;
      margin: 0;
      padding: 2px 4px;
    }

    /* Cinema mode fullscreens the whole document and re-lays out the page shell so the current
       card and its action bar sit centred on black. The card stays in normal flow: TikTok
       positions the more-menu popover from the button's flow coordinates, so a fixed-position
       card would leave the popover far off screen on a scrolled feed. */
    html.tiktok-plus-cinema-mode {
      background: #000 !important;
      overflow: hidden !important;
    }

    html.tiktok-plus-cinema-mode body {
      background: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
      max-width: none !important;
    }

    /* TikTok keeps several side-nav variants (loaded, placeholder, and loading skeleton), and the
       skeleton alone reserves 240px. Match the whole family plus the sidebar slot so the cinema
       layer really is the full width. The one-column sidebar also hosts comments, so its
       visibility is handled with the right rail below. */
    html.tiktok-plus-cinema-mode #app-header,
    html.tiktok-plus-cinema-mode #fixed-top-container,
    html.tiktok-plus-cinema-mode [class*="DivFixedTopContainer"],
    html.tiktok-plus-cinema-mode [class*="SideNav"],
    html.tiktok-plus-cinema-mode [class*="Aside"]:not([class*="AsideOneColumnSidebar"]) {
      display: none !important;
    }

    /* The right rail lives inside a wrapper row (StyledContentWrapper > DivVideoList...); hiding
       only the inner panel leaves that row reserving its width and pushes the player off centre,
       so hide the whole rail slot while comments are closed. */
    html.tiktok-plus-cinema-mode:not(.tiktok-plus-cinema-mode-comments) [class*="RightPanelContainer"],
    html.tiktok-plus-cinema-mode:not(.tiktok-plus-cinema-mode-comments) [class*="AsideOneColumnSidebar"],
    html.tiktok-plus-cinema-mode:not(.tiktok-plus-cinema-mode-comments) [class*="DivVideoListTabBarWrapper"],
    html.tiktok-plus-cinema-mode:not(.tiktok-plus-cinema-mode-comments) [class*="StyledContentWrapper"],
    html.tiktok-plus-cinema-mode:not(.tiktok-plus-cinema-mode-comments) [class*="DivRelatedTabContainer"] {
      display: none !important;
    }

    /* With comments open the rail wrapper comes back; strip its padding so the remaining area
       the player is centred in matches the rail's measured width exactly. */
    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-comments [class*="StyledContentWrapper"],
    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-comments [class*="DivVideoListTabBarWrapper"],
    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-comments [class*="AsideOneColumnSidebar"],
    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-comments [class*="RightPanelContainer"] {
      padding: 0 !important;
      margin: 0 !important;
    }

    /* TikTok nests these containers inside flex rows, so each one stretches to fill its parent
       rather than being pinned to the viewport. That way the whole column (and the player inside
       it) shrinks correctly when the comment rail opens. */
    html.tiktok-plus-cinema-mode #app,
    html.tiktok-plus-cinema-mode [class*="BaseBodyContainer"],
    html.tiktok-plus-cinema-mode [class*="DivMainContainer"],
    html.tiktok-plus-cinema-mode [class*="DivVideoDetailContainer"],
    html.tiktok-plus-cinema-mode [class*="DivContentContainer"],
    html.tiktok-plus-cinema-mode [class*="DivLeftContainer"] {
      flex: 1 1 auto !important;
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      box-sizing: border-box !important;
      /* Rounding at these nested widths can leave a hairline of the page surface visible
         next to the player; painting them black keeps the cinema frame seamless. */
      background: #000 !important;
    }

    /* Every feed item keeps the same viewport-sized slot, so changing the active card cannot
       shift later items or leave the feed snapped between two videos. */
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-list {
      position: relative !important;
      z-index: 1 !important;
      flex: 1 1 auto !important;
      width: auto !important;
      min-width: 0 !important;
      max-width: none !important;
      height: 100vh !important;
      min-height: 0 !important;
      max-height: 100vh !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow-y: auto !important;
      overflow-x: hidden !important;
      scroll-snap-type: y mandatory !important;
      scroll-padding: 0 !important;
      scroll-behavior: auto !important;
      background: transparent !important;
      /* Scrolling must stay available for ↑/↓ navigation, but the scrollbar gutter would draw
         a vertical line at the list edge, so hide the scrollbar itself. */
      scrollbar-width: none !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-list::-webkit-scrollbar {
      width: 0 !important;
      height: 0 !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-list article,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-article {
      position: relative !important;
      z-index: 1 !important;
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 100% !important;
      max-width: 100% !important;
      height: 100vh !important;
      min-height: 100vh !important;
      max-height: 100vh !important;
      flex: 0 0 auto !important;
      margin: 0 !important;
      padding: 0 16px !important;
      box-sizing: border-box !important;
      scroll-snap-align: start !important;
      scroll-snap-stop: always !important;
      scroll-margin: 0 !important;
      overflow: hidden !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-flex {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 16px !important;
      width: 100% !important;
      height: 100% !important;
    }

    /* The card and bar must not flex: TikTok gives the card flex: 1 1 auto, which would stretch
       it past the computed width and push the bar off screen. */
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-flex > .tiktok-plus-cinema-card,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-flex > .tiktok-plus-cinema-bar {
      flex: 0 0 auto !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card {
      position: relative !important;
      z-index: 2 !important;
      width: var(--tiktok-plus-cinema-width) !important;
      height: var(--tiktok-plus-cinema-height) !important;
      max-width: none !important;
      max-height: none !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      border-radius: 0 !important;
      background: #000 !important;
      aspect-ratio: auto !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-bar {
      position: relative !important;
      z-index: 2 !important;
      --ui-text-1: #fff;
      --ui-text-2: rgba(255, 255, 255, 0.9);
      --ui-text-3: rgba(255, 255, 255, 0.7);
      color: #fff !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-bar strong,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-bar [data-e2e$="-count"] {
      color: #fff !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-ink-color { color: #fff !important; }
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-ink-fill { fill: #fff !important; }
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-ink-stroke { stroke: #fff !important; }

    /* Player wrappers can retain pixel sizes or transforms from the normal feed layout. */
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-media,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card video {
      position: absolute !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      min-width: 0 !important;
      min-height: 0 !important;
      max-width: none !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      border-radius: 0 !important;
      aspect-ratio: auto !important;
    }

    /* TikTok paints frames on a super-resolution canvas layer and hides the <video> element.
       Showing the video layer back keeps the full frame visible while the card is in cinema. */
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card img,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card canvas,
    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card tt-vod-sr-wrap {
      display: none !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-card video,
    html.tiktok-plus-cinema-mode video.tiktok-plus-cinema-card {
      opacity: 1 !important;
      object-fit: contain !important;
    }

    html.tiktok-plus-cinema-mode .tiktok-plus-cinema-chrome {
      transition: opacity 200ms ease;
    }

    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-idle .tiktok-plus-cinema-chrome {
      opacity: 0 !important;
      pointer-events: none !important;
    }

    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-idle,
    html.tiktok-plus-cinema-mode.tiktok-plus-cinema-mode-idle * {
      cursor: none !important;
    }

    @media (prefers-reduced-motion: reduce) {
      html.tiktok-plus-cinema-mode .tiktok-plus-cinema-chrome {
        transition: none;
      }
    }

    .tiktok-plus-toast {
      position: fixed;
      left: 50%;
      top: 72px;
      z-index: 2147483647;
      max-width: min(520px, calc(100vw - 32px));
      transform: translateX(-50%);
      padding: 10px 14px;
      border-radius: 999px;
      color: #fff;
      background: rgba(15, 15, 18, 0.82);
      box-shadow: 0 12px 36px rgba(0, 0, 0, 0.24);
      font: 600 13px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.01em;
      opacity: 0;
      pointer-events: none;
      transition: opacity 150ms ease, transform 150ms ease;
      backdrop-filter: blur(14px);
    }

    .tiktok-plus-toast.is-visible {
      opacity: 1;
      transform: translateX(-50%) translateY(4px);
    }

    .tiktok-plus-help {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      display: grid;
      place-items: center;
      padding: 24px;
      color: #fff;
      background: rgba(0, 0, 0, 0.46);
      opacity: 0;
      pointer-events: none;
      transition: opacity 160ms ease;
      backdrop-filter: blur(10px);
    }

    .tiktok-plus-help.is-visible {
      opacity: 1;
      pointer-events: auto;
    }

    .tiktok-plus-help-panel {
      width: min(720px, 100%);
      max-height: min(760px, calc(100vh - 48px));
      overflow: auto;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 28px;
      background:
        radial-gradient(circle at 18% 0%, rgba(37, 244, 238, 0.20), transparent 34%),
        radial-gradient(circle at 96% 12%, rgba(254, 44, 85, 0.20), transparent 30%),
        rgba(18, 18, 22, 0.92);
      box-shadow: 0 30px 90px rgba(0, 0, 0, 0.48);
    }

    .tiktok-plus-help-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 16px;
      padding: 24px 26px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.10);
    }

    .tiktok-plus-help-title {
      margin: 0;
      font: 800 24px/1.1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: -0.03em;
    }

    .tiktok-plus-help-version {
      margin-top: 7px;
      color: rgba(255, 255, 255, 0.62);
      font: 600 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .tiktok-plus-help-close {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      border: 0;
      border-radius: 50%;
      color: #fff;
      background: rgba(255, 255, 255, 0.12);
      cursor: pointer;
      font: 800 20px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .tiktok-plus-help-body {
      display: grid;
      gap: 16px;
      padding: 20px 26px 26px;
    }

    .tiktok-plus-help-group h3 {
      margin: 0 0 10px;
      color: rgba(255, 255, 255, 0.72);
      font: 800 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .tiktok-plus-help-list {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin: 0;
    }

    .tiktok-plus-help-row {
      display: grid;
      grid-template-columns: minmax(112px, auto) 1fr;
      align-items: center;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.075);
    }

    .tiktok-plus-help-key {
      justify-self: start;
      padding: 5px 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 10px;
      color: #fff;
      background: rgba(0, 0, 0, 0.26);
      font: 800 12px/1.15 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      white-space: nowrap;
    }

    .tiktok-plus-help-desc {
      color: rgba(255, 255, 255, 0.82);
      font: 650 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    @media (max-width: 640px) {
      .tiktok-plus-help {
        padding: 14px;
      }

      .tiktok-plus-help-list {
        grid-template-columns: 1fr;
      }

      .tiktok-plus-help-row {
        grid-template-columns: minmax(96px, auto) 1fr;
      }
    }

  `;

  function installStyle() {
    if (document.getElementById("tiktok-plus-style")) return;
    const style = document.createElement("style");
    style.id = "tiktok-plus-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function toast(message) {
    installStyle();
    let node = document.querySelector(".tiktok-plus-toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "tiktok-plus-toast";
      document.documentElement.appendChild(node);
    }

    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(node._tiktokPlusTimer);
    node._tiktokPlusTimer = setTimeout(() => {
      node.classList.remove("is-visible");
    }, 1300);
  }


  // Inspired by Forum Translator: same Google provider, cache lifetime and quota.
  // Google does not publish limits for this unofficial endpoint.
  function translationKey(text) {
    return JSON.stringify(["google:dict-chrome-ex:v1", "zh-CN", text.trim()]);
  }

  function trimCachedTranslations() {
    let chars = 0;
    for (const [key, value] of translationCache) {
      if (value.expires <= Date.now()) translationCache.delete(key);
      else chars += value.text.length;
    }
    while (translationCache.size > MAX_CACHE || chars > MAX_CACHE_CHARS) {
      const key = translationCache.keys().next().value;
      if (key === undefined) break;
      chars -= translationCache.get(key).text.length;
      translationCache.delete(key);
    }
  }

  function cachedTranslation(text) {
    const key = translationKey(text);
    const value = translationCache.get(key);
    if (!value) return "";
    if (value.expires <= Date.now()) { translationCache.delete(key); return ""; }
    translationCache.delete(key);
    translationCache.set(key, value);
    translationMetrics.cacheHits++;
    return value.text;
  }

  function flushTranslationCache() {
    clearTimeout(translationCacheTimer);
    translationCacheTimer = null;
    trimCachedTranslations();
    try { GM_setValue(CACHE_KEY, [...translationCache]); }
    catch (error) { console.warn("[TikTok Plus][translate] 缓存写入失败", error); }
  }

  function saveTranslation(text, value) {
    const key = translationKey(text);
    translationCache.delete(key);
    translationCache.set(key, { text: value, expires: Date.now() + CACHE_TTL });
    trimCachedTranslations();
    if (!translationCacheTimer) translationCacheTimer = setTimeout(flushTranslationCache, 600);
  }

  function googleTranslate(text) {
    const url = new URL("https://translate.googleapis.com/translate_a/t");
    Object.entries({ client: "dict-chrome-ex", sl: "auto", tl: "zh-CN", q: text })
      .forEach(([key, value]) => url.searchParams.set(key, value));
    return new Promise((resolve, reject) => {
      let settled = false, handle;
      const finish = callback => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        callback();
      };
      const watchdog = setTimeout(() => {
        finish(() => {
          try { handle?.abort(); } catch (_) { /* ignore */ }
          reject(new Error("翻译超时（25 秒）"));
        });
      }, 25000);
      try {
        handle = GM_xmlhttpRequest({
          method: "GET", url: url.href, anonymous: true, timeout: 25000,
          onload(response) {
            finish(() => {
              if (response.status !== 200) {
                const error = new Error("Google 翻译 HTTP " + response.status);
                error.status = response.status;
                const after = response.responseHeaders?.match(/^Retry-After:\s*([^\r\n]+)/im)?.[1];
                if (after) {
                  const seconds = Number(after);
                  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - Date.now();
                  if (Number.isFinite(delay) && delay > 0) error.retryAfter = delay;
                }
                reject(error);
                return;
              }
              try {
                const data = JSON.parse(response.responseText);
                const translated = Array.isArray(data)
                  ? (Array.isArray(data[0]) ? data[0][0] : data[0]) : null;
                if (typeof translated !== "string" || !translated.trim()) {
                  throw new Error("Google 翻译响应格式错误");
                }
                resolve(translated.trim());
              } catch (error) { reject(error); }
            });
          },
          onerror: () => finish(() => reject(new Error("翻译网络错误"))),
          ontimeout: () => finish(() => reject(new Error("翻译超时"))),
          onabort: () => finish(() => reject(new Error("翻译请求中断"))),
        });
      } catch (error) { finish(() => reject(error)); }
    });
  }

  function translationLog(action, details = {}) {
    console.info("[TikTok Plus][translate]", action, {
      ...details, active: translationActive, queued: translationQueue.length,
      cooldownSeconds: Math.max(0, Math.ceil((translationCooldown - Date.now()) / 1000)),
      ...translationMetrics,
    });
  }

  function wakeTranslations(delay) {
    // Keep the earliest wake-up; repeated DOM scans must not postpone cooldown expiry.
    const at = Date.now() + Math.max(25, delay);
    if (translationWake && translationWake.at <= at) return;
    if (translationWake) clearTimeout(translationWake.id);
    const id = setTimeout(() => {
      translationWake = null;
      drainTranslations();
      updateBulkControls();
    }, Math.max(25, delay));
    translationWake = { id, at };
  }

  function completeTranslation(task, text, error) {
    pendingTranslations.delete(task.key);
    if (error) { translationMetrics.failures++; task.reject(error); }
    else { translationMetrics.successes++; saveTranslation(task.text, text); task.resolve(text); }
    updateBulkControls();
  }

  function drainTranslations() {
    if (translationPaused) return;
    const now = Date.now();
    if (translationCooldown > now) { wakeTranslations(translationCooldown - now); return; }
    while (translationStarts.length && translationStarts[0] <= Date.now() - 60000) translationStarts.shift();
    while (translationActive < TRANSLATION_CONCURRENT && translationQueue.length) {
      if (translationStarts.length >= TRANSLATION_RPM) {
        wakeTranslations(translationStarts[0] + 60001 - Date.now()); break;
      }
      translationQueue.sort((left, right) => left.priority - right.priority || left.seq - right.seq);
      const index = translationQueue.findIndex(task => task.readyAt <= Date.now());
      if (index < 0) {
        wakeTranslations(Math.min(...translationQueue.map(task => task.readyAt)) - Date.now());
        break;
      }
      const task = translationQueue.splice(index, 1)[0];
      translationActive++;
      task.attempts++;
      translationStarts.push(Date.now());
      translationMetrics.requests++;
      googleTranslate(task.text).then(value => {
        if (Date.now() >= translationCooldown) translationStrikes = 0;
        completeTranslation(task, value);
      }).catch(error => {
        if (error?.status === 429) {
          translationMetrics.rateLimits++;
          if (Date.now() >= translationCooldown) {
            translationStrikes++;
            const delay = [60000, 120000, 300000][Math.min(translationStrikes - 1, 2)];
            translationCooldown = Date.now() + Math.min(600000, Math.max(delay, error.retryAfter || 0));
            translationLog("HTTP 429", { attempts: task.attempts });
          }
          if (task.attempts < 3) {
            task.readyAt = translationCooldown;
            translationQueue.push(task);
          } else {
            translationPaused = true;
            bulkRateLimited = true;
            completeTranslation(task, null, error);
            translationLog("已暂停，需手动恢复");
          }
        } else if (task.attempts < 3 && /网络|超时|响应|HTTP (?:408|5\d\d)/.test(error?.message || "")) {
          task.readyAt = Date.now() + task.attempts * 1000;
          translationQueue.push(task);
        } else {
          completeTranslation(task, null, error);
        }
      }).finally(() => {
        translationActive--;
        drainTranslations();
        updateBulkControls();
      });
    }
  }

  function translateChunk(text, priority = 1) {
    const cached = cachedTranslation(text);
    if (cached) return Promise.resolve(cached);
    const key = translationKey(text);
    const active = pendingTranslations.get(key);
    if (active) {
      active.priority = Math.min(priority, active.priority);
      drainTranslations();
      return active.promise;
    }
    let resolve, reject;
    const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
    const task = { key, text, priority, resolve, reject, promise, attempts: 0, readyAt: 0, seq: translationSeq++ };
    pendingTranslations.set(key, task);
    translationQueue.push(task);
    drainTranslations();
    return promise;
  }

  function splitTranslationText(text, limit = 900) {
    const chunks = [];
    let chunk = "";
    // for...of walks Unicode code points; surrogate pairs are never split.
    for (const character of text) {
      if (chunk && chunk.length + character.length > limit) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += character;
    }
    if (chunk) chunks.push(chunk);
    return chunks;
  }

  function translateCommentText(text, priority = 1) {
    const cached = cachedTranslation(text);
    if (cached) return Promise.resolve(cached);
    const chunks = splitTranslationText(text);
    if (chunks.length <= 1) return translateChunk(text, priority);
    return Promise.all(chunks.map(chunk => translateChunk(chunk, priority))).then(translations => {
      const result = translations.join("");
      saveTranslation(text, result);
      return result;
    });
  }

  function promoteTranslation(text) {
    for (const part of splitTranslationText(text)) {
      const task = pendingTranslations.get(translationKey(part));
      if (task) task.priority = 0;
    }
    drainTranslations();
  }

  addEventListener("pagehide", flushTranslationCache);

  function getTranslationVideoKey() {
    return location.pathname.match(/\/video\/(\d+)/)?.[1] ||
      getCurrentVideo()?.closest('[id^="media-card-"]')?.id || location.pathname;
  }

  function syncTranslationVideo() {
    const key = getTranslationVideoKey();
    if (translationVideoKey === key) return false;
    const changed = translationVideoKey !== null;
    translationVideoKey = key;
    if (changed) {
      stopBulkTranslation(false);
      bulkRateLimited = false;
      commentCache.clear();
      document.querySelectorAll(COMMENT_SELECTOR).forEach(removeCommentTranslation);
    }
    return changed;
  }

  function commentIdentity(source) {
    const author = source.parentElement?.querySelector('[data-e2e^="comment-username"] a[href]');
    return JSON.stringify([translationVideoKey, author?.getAttribute("href"), source.innerHTML]);
  }

  function isCurrentComment(state) {
    syncTranslationVideo();
    return state.source.isConnected && state.source.matches(COMMENT_SELECTOR) &&
      state.controls.parentElement === state.source.parentElement &&
      commentStates.get(state.source) === state &&
      commentCache.get(state.identity) === state.entry && commentIdentity(state.source) === state.identity;
  }

  function renderCommentTranslation(state) {
    if (!isCurrentComment(state)) return;
    const { source, entry, translation, button } = state;
    const show = Boolean(entry.translation && !entry.original);
    if (translation.textContent !== entry.translation) translation.textContent = entry.translation;
    translation.hidden = !show;
    if (source.classList.contains("tiktok-plus-original-hidden") !== show) {
      source.classList.toggle("tiktok-plus-original-hidden", show);
    }
    button.disabled = Boolean(entry.pending);
    const label = entry.pending ? "翻译中…" : entry.translation ? (show ? "查看原文" : "查看译文") :
      entry.failed ? "翻译失败，重试" : "翻译";
    if (button.textContent !== label) button.textContent = label;
  }

  function showCommentTranslation(state, show) {
    state.entry.original = !show;
    renderCommentTranslation(state);
  }

  function requestCommentTranslation(state, priority = 0) {
    if (!isCurrentComment(state)) return Promise.resolve();
    const entry = state.entry;
    if (priority === 0 && translationPaused) {
      translationPaused = false;
      bulkRateLimited = false;
      translationLog("手动请求恢复队列");
      drainTranslations();
    }
    if (entry.pending) {
      if (priority === 0) promoteTranslation(state.source.textContent.trim());
      return entry.pending;
    }
    if (entry.translation) {
      showCommentTranslation(state, true);
      return Promise.resolve();
    }
    entry.original = false;
    entry.failed = false;
    entry.pending = translateCommentText(state.source.textContent.trim(), priority).then((result) => {
      syncTranslationVideo();
      if (commentCache.get(state.identity) === entry) entry.translation = result;
    }).catch((error) => {
      syncTranslationVideo();
      if (commentCache.get(state.identity) !== entry) return;
      entry.failed = true;
      if (error.status === 429) {
        bulkRateLimited = true;
        toast("Google 翻译请求受限，请稍后恢复");
      }
    }).finally(() => {
      entry.pending = null;
      // Virtualized rows may have been replaced while their shared request was running.
      document.querySelectorAll(COMMENT_SELECTOR).forEach((source) => {
        const current = commentStates.get(source);
        if (current?.entry === entry) renderCommentTranslation(current);
      });
      updateBulkControls();
    });
    renderCommentTranslation(state);
    return entry.pending;
  }

  function removeCommentTranslation(source) {
    const state = commentStates.get(source);
    if (!state) return;
    commentStates.delete(source);
    source.classList.remove("tiktok-plus-original-hidden");
    state.controls.remove();
  }

  function syncCommentTranslation(source) {
    syncTranslationVideo();
    const identity = commentIdentity(source);
    const previous = commentStates.get(source);
    if (previous && source.isConnected && source.matches(COMMENT_SELECTOR) &&
        previous.identity === identity && previous.controls.parentElement === source.parentElement) return;
    removeCommentTranslation(source);
    const text = source.textContent.trim();
    if (!source.isConnected || !source.matches(COMMENT_SELECTOR) || !/\p{L}/u.test(text)) return;

    const controls = document.createElement("div");
    controls.className = "tiktok-plus-comment-controls";
    const translation = document.createElement("span");
    translation.className = "tiktok-plus-comment-translation";
    translation.lang = "zh-CN";
    translation.hidden = true;
    const button = document.createElement("button");
    button.className = "tiktok-plus-translate-button";
    button.type = "button";
    button.textContent = "翻译";
    button.title = "使用 Google 翻译为简体中文";
    button.setAttribute("aria-live", "polite");
    controls.append(translation, button);
    source.after(controls);
    let entry = commentCache.get(identity);
    if (!entry) {
      entry = { translation: cachedTranslation(text), failed: false, pending: null, original: true, manualOriginal: false };
      commentCache.set(identity, entry);
    }
    const state = { source, identity, controls, translation, button, entry };
    commentStates.set(source, state);
    renderCommentTranslation(state);

    button.addEventListener("click", (event) => {
      event.stopPropagation();
      if (!isCurrentComment(state)) {
        syncCommentTranslation(source);
        return;
      }
      if (entry.pending) return;
      if (entry.translation) {
        entry.manualOriginal = !entry.original;
        showCommentTranslation(state, entry.original);
        return;
      }
      entry.manualOriginal = false;
      requestCommentTranslation(state);
    });
  }

  function stopBulkTranslation(restoreOriginal) {
    bulkGeneration++;
    bulkInFlight.clear();
    bulkEnabled = false;
    bulkQueue.clear();
    clearInterval(bulkTimer);
    bulkTimer = null;
    commentCache.forEach((entry) => {
      if (restoreOriginal || entry.pending) entry.original = true;
    });
    document.querySelectorAll(COMMENT_SELECTOR).forEach((source) => {
      const state = commentStates.get(source);
      if (state) renderCommentTranslation(state);
    });
    updateBulkControls();
  }

  function updateBulkControls() {
    if (!bulkControls) return;
    const button = bulkControls.querySelector("button");
    const label = translationPaused && bulkEnabled ? "恢复翻译" : bulkEnabled ? "全部查看原文" : "翻译全部";
    if (button.textContent !== label) button.textContent = label;
    button.setAttribute("aria-pressed", String(bulkEnabled));
    const status = bulkControls.querySelector('[role="status"]');
    const cooldown = Math.max(0, Math.ceil((translationCooldown - Date.now()) / 1000));
    const message = translationPaused ? "请求受限，已暂停 · 点击恢复" :
      cooldown ? `冷却中 ${String(Math.floor(cooldown / 60)).padStart(2, "0")}:${String(cooldown % 60).padStart(2, "0")}` :
      bulkRateLimited ? "请求受限，已暂停" :
      bulkEnabled ? (bulkInFlight.size || bulkQueue.size || translationQueue.length ? "翻译中…" : "自动翻译已开启") : "";
    if (status.textContent !== message) status.textContent = message;
  }

  function runBulkQueue() {
    if (!bulkEnabled || !bulkPanel || !isVisible(bulkPanel) || translationPaused) return;
    const generation = bulkGeneration;
    while (bulkEnabled && bulkQueue.size && bulkInFlight.size < TRANSLATION_CONCURRENT) {
      const state = bulkQueue.values().next().value;
      if (!state) break;
      bulkQueue.delete(state);
      if (!isCurrentComment(state) || !bulkPanel.contains(state.source) ||
          state.entry.failed || state.entry.manualOriginal || state.entry.pending) continue;
      const job = requestCommentTranslation(state, isVisible(state.source) ? 1 : 2);
      bulkInFlight.add(job);
      job.finally(() => {
        bulkInFlight.delete(job);
        if (bulkEnabled && bulkGeneration === generation) syncBulkTranslations();
        updateBulkControls();
      });
    }
    updateBulkControls();
  }

  function syncBulkTranslations() {
    const videoChanged = syncTranslationVideo();
    if (videoChanged) document.querySelectorAll(COMMENT_SELECTOR).forEach(syncCommentTranslation);
    const panel = document.querySelector(COMMENT_PANEL_SELECTOR);
    if (panel !== bulkPanel) {
      bulkQueue.clear();
      bulkControls?.remove();
      bulkControls = null;
      bulkPanel = panel;
    }
    if (!panel || !isVisible(panel)) {
      bulkQueue.clear();
      return;
    }
    const header = panel.querySelector('[class*="DivCommentHeader"]');
    const close = header?.querySelector('[class*="DivCloseButtonWrapper"]');
    if (!header || !close) {
      bulkQueue.clear();
      bulkControls?.remove();
      bulkControls = null;
      return;
    }
    if (bulkControls?.parentElement !== header) {
      bulkControls?.remove();
      bulkControls = document.createElement("div");
      bulkControls.className = "tiktok-plus-bulk-controls";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tiktok-plus-translate-button";
      button.title = "翻译已加载的评论和回复，并随阅读继续翻译";
      const status = document.createElement("span");
      status.setAttribute("role", "status");
      bulkControls.append(button, status);
      close.before(bulkControls);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (syncTranslationVideo()) {
          syncBulkTranslations();
          return;
        }
        if (translationPaused && bulkEnabled) {
          translationPaused = false;
          bulkRateLimited = false;
          commentCache.forEach(entry => { entry.failed = false; });
          translationLog("用户手动恢复");
          drainTranslations();
          syncBulkTranslations();
          return;
        }
        bulkRateLimited = false;
        if (bulkEnabled) {
          stopBulkTranslation(true);
          return;
        }
        if (translationPaused) {
          translationPaused = false;
          translationLog("启用批量翻译并恢复队列");
          drainTranslations();
        }
        bulkEnabled = true;
        commentCache.forEach((entry) => {
          entry.failed = false;
          entry.manualOriginal = false;
        });
        bulkTimer = setInterval(syncBulkTranslations, 500);
        syncBulkTranslations();
      });
    }
    if (bulkEnabled) {
      panel.querySelectorAll(COMMENT_SELECTOR).forEach((source) => {
        syncCommentTranslation(source);
        const state = commentStates.get(source);
        if (!state || state.entry.manualOriginal || state.entry.failed) return;
        if (state.entry.translation) showCommentTranslation(state, true);
        else if (!state.entry.pending) bulkQueue.add(state);
      });
    }
    updateBulkControls();
    runBulkQueue();
  }

  function observeCommentTranslations() {
    function visit(root, callback) {
      if (!(root instanceof Element)) return;
      if (root.matches(COMMENT_SELECTOR) || commentStates.has(root)) callback(root);
      root.querySelectorAll(COMMENT_SELECTOR).forEach(callback);
    }

    visit(document.body, syncCommentTranslation);
    syncBulkTranslations();
    new MutationObserver((records) => {
      const sources = new Set();
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.closest(".tiktok-plus-comment-controls, .tiktok-plus-bulk-controls")) continue;
        for (const removed of record.removedNodes) visit(removed, removeCommentTranslation);
        const source = target?.closest(COMMENT_SELECTOR);
        if (source) sources.add(source);
        const author = target?.closest('[data-e2e^="comment-username"]');
        if (author) visit(author.parentElement?.parentElement, (node) => sources.add(node));
        visit(target, (node) => sources.add(node));
      }
      sources.forEach(syncCommentTranslation);
      syncBulkTranslations();
    }).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-e2e", "href", "class", "style", "hidden"],
    });
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }

  function getHelpNode() {
    installStyle();

    let node = document.querySelector(".tiktok-plus-help");
    if (node) return node;

    node = document.createElement("div");
    node.className = "tiktok-plus-help";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "true");
    node.setAttribute("aria-label", "TikTok Plus 快捷键列表");
    node.innerHTML = `
      <section class="tiktok-plus-help-panel">
        <header class="tiktok-plus-help-header">
          <div>
            <h2 class="tiktok-plus-help-title">TikTok Plus 快捷键</h2>
            <div class="tiktok-plus-help-version">版本 ${escapeHtml(SCRIPT_VERSION)}</div>
          </div>
          <button class="tiktok-plus-help-close" type="button" aria-label="关闭快捷键列表">×</button>
        </header>
        <div class="tiktok-plus-help-body">
          ${SHORTCUT_GROUPS.map((group) => `
            <section class="tiktok-plus-help-group">
              <h3>${escapeHtml(group.title)}</h3>
              <dl class="tiktok-plus-help-list">
                ${group.items.map(([key, desc]) => `
                  <div class="tiktok-plus-help-row">
                    <dt class="tiktok-plus-help-key">${escapeHtml(key)}</dt>
                    <dd class="tiktok-plus-help-desc">${escapeHtml(desc)}</dd>
                  </div>
                `).join("")}
              </dl>
            </section>
          `).join("")}
        </div>
      </section>
    `;

    node.addEventListener("click", (event) => {
      if (event.target === node || event.target.closest(".tiktok-plus-help-close")) {
        hideShortcutHelp();
      }
    });
    document.documentElement.appendChild(node);
    return node;
  }

  function showShortcutHelp() {
    getHelpNode().classList.add("is-visible");
  }

  function hideShortcutHelp() {
    const node = document.querySelector(".tiktok-plus-help");
    if (node) node.classList.remove("is-visible");
  }

  function toggleShortcutHelp() {
    const node = getHelpNode();
    node.classList.toggle("is-visible");
  }

  function isShortcutHelpVisible() {
    return Boolean(document.querySelector(".tiktok-plus-help.is-visible"));
  }

  function isEditableTarget(target) {
    if (!(target instanceof Element)) return false;
    const editable = target.closest(
      'input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]'
    );
    return Boolean(editable);
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }

  function visibleScore(element) {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const right = Math.min(innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(innerHeight, rect.bottom);
    const visibleArea = Math.max(0, right - left) * Math.max(0, bottom - top);
    const centerDistance = Math.abs(rect.top + rect.height / 2 - innerHeight / 2);
    return visibleArea - centerDistance * 100;
  }

  function getCurrentVideo() {
    return [...document.querySelectorAll("video")]
      .filter((video) => {
        const style = window.getComputedStyle(video);
        const rect = video.getBoundingClientRect();
        return style.visibility !== "hidden" && style.display !== "none" &&
          rect.width > 1 && rect.height > 1 && rect.bottom > 0 && rect.right > 0 &&
          rect.top < innerHeight && rect.left < innerWidth;
      })
      .sort((a, b) => visibleScore(b) - visibleScore(a))[0] || null;
  }

  function getVideoRoot(video = getCurrentVideo()) {
    if (!video) return null;

    return (
      video.closest('[data-e2e*="feed"], [data-e2e*="recommend"], [data-e2e*="video"], article, section') ||
      video.closest("div") ||
      video.parentElement
    );
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function stopEvent(event) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  }

  function clickElement(element) {
    if (!element) return false;
    const clickable = element.closest("button, a, [role='button'], [tabindex]") || element;
    // The userscript sandbox's window wrapper is not a valid UIEvent.view.
    clickable.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  }

  function elementText(element) {
    const aria = element.getAttribute("aria-label") || "";
    const title = element.getAttribute("title") || "";
    const text = element.textContent || "";
    const data = [...element.attributes]
      .filter((attr) => attr.name.startsWith("data-"))
      .map((attr) => attr.value)
      .join(" ");
    return `${aria} ${title} ${text} ${data}`.trim();
  }

  function matchesAny(text, patterns) {
    return patterns.some((pattern) => pattern.test(text));
  }

  function candidatesNearCurrent(extraSelectors = []) {
    const root = getVideoRoot();
    const selectors = [
      "button",
      "a",
      "[role='button']",
      "[data-e2e]",
      "[aria-label]",
      ...extraSelectors,
    ].join(",");

    const scoped = root ? [...root.querySelectorAll(selectors)] : [];
    const global = [...document.querySelectorAll(selectors)];
    return [...new Set([...scoped, ...global])].filter(isVisible);
  }

  function clickByPatterns(patterns, extraSelectors = []) {
    const target = candidatesNearCurrent(extraSelectors).find((element) => {
      return matchesAny(elementText(element), patterns);
    });

    return clickElement(target);
  }

  function clickDataFirst(dataValues, labelPatterns) {
    const selector = dataValues.map((value) => `[data-e2e="${value}"], [data-e2e*="${value}"]`).join(",");
    const dataTarget = selector
      ? candidatesNearCurrent([selector]).find((element) => dataValues.some((value) => (element.getAttribute("data-e2e") || "").includes(value)))
      : null;

    if (clickElement(dataTarget)) return true;
    return clickByPatterns(labelPatterns);
  }

  function togglePlayback() {
    const video = getCurrentVideo();
    if (!video) {
      toast("No video found");
      return;
    }

    if (video.paused) {
      video.play().catch(() => clickElement(video));
      toast("Play");
    } else {
      video.pause();
      toast("Pause");
    }
  }

  function seekBy(seconds) {
    const video = getCurrentVideo();
    if (!video || Number.isNaN(video.duration)) {
      toast("No video found");
      return;
    }

    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration || Number.MAX_SAFE_INTEGER);
    toast(seconds > 0 ? `+${Math.abs(seconds)}s` : `-${Math.abs(seconds)}s`);
  }

  function getVideoList() {
    return [...document.querySelectorAll("video")]
      .filter((video) => {
        const rect = video.getBoundingClientRect();
        return rect.width > 1 && rect.height > 1;
      })
      .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
  }

  function getAdjacentVideo(direction) {
    const current = getCurrentVideo();
    if (!current) return null;

    const videos = getVideoList();
    const index = videos.indexOf(current);
    return index >= 0 ? videos[index + direction] || null : null;
  }

  function getScrollContainers(node) {
    const containers = [];
    for (let element = node; element && element !== document.documentElement; element = element.parentElement) {
      const style = window.getComputedStyle(element);
      const canScroll = element.scrollHeight > element.clientHeight + 4;
      const allowsScroll = /(auto|scroll|overlay)/.test(style.overflowY) || canScroll;
      if (canScroll && allowsScroll) containers.push(element);
    }

    const pageScroller = document.scrollingElement || document.documentElement;
    if (!containers.includes(pageScroller)) containers.push(pageScroller);
    return containers;
  }

  function scrollContainer(container, amount) {
    if (!container) return false;

    const isPage = container === document.scrollingElement || container === document.documentElement || container === document.body;
    const before = isPage ? window.scrollY : container.scrollTop;

    if (typeof container.scrollBy === "function") {
      container.scrollBy({ top: amount, behavior: "smooth" });
    } else if (isPage) {
      window.scrollBy({ top: amount, behavior: "smooth" });
    } else {
      container.scrollTop += amount;
    }

    // Some snapped feeds ignore scrollBy but still respond to wheel-style input.
    container.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: amount,
    }));

    const after = isPage ? window.scrollY : container.scrollTop;
    return before !== after;
  }

  function scrollFeed(direction) {
    const amount = direction * Math.round(innerHeight * 0.86);
    const current = getCurrentVideo();
    const targetVideo = getAdjacentVideo(direction);

    if (targetVideo) {
      targetVideo.scrollIntoView({ behavior: "smooth", block: "center" });
      return true;
    }

    const origin = getVideoRoot(current) || current || document.body;
    const containers = getScrollContainers(origin);
    const scrolled = containers.some((container) => scrollContainer(container, amount));

    window.dispatchEvent(new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: amount,
    }));

    if (!scrolled) {
      window.scrollBy({ top: amount, behavior: "smooth" });
    }

    return true;
  }

  function navigateVideo(direction) {
    if (isCinemaActive()) return scrollFeed(direction);
    const clicked = direction > 0
      ? clickByPatterns([/next/i, /下一个|下一条|下滑|下个/], ['[data-e2e*="arrow"], [aria-label*="Next"]'])
      : clickByPatterns([/previous|prev/i, /上一个|上一条|上滑|上个/], ['[data-e2e*="arrow"], [aria-label*="Previous"]']);

    if (clicked) return;

    scrollFeed(direction);
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  // The action bar is a sibling of the media card, and TikTok portals its popovers next to the
  // card's subtree root, so both only stay visible when the whole document is the fullscreen
  // element. Anchor the card and its bar onto black instead of fullscreening the card alone.
  function getCinemaCard(video = getCurrentVideo()) {
    if (!video) return null;
    // Some player variants put the feed-video hook on an inner node or the video itself.
    for (let card = video; card && card.tagName !== "ARTICLE"; card = card.parentElement) {
      if (findCinemaActionBar(card)) return card;
    }
    const card = video.closest(CINEMA_MEDIA_SELECTOR) || getVideoRoot(video);
    return card && card !== video ? card : video.parentElement;
  }

  function findCinemaActionBar(card) {
    if (!(card instanceof Element)) return null;
    const parent = card.parentElement;
    if (!parent) return null;

    // Scope to the current card's siblings; a feed page keeps several cards mounted at once.
    const siblings = [...parent.children].filter((element) => element !== card);
    return siblings.find((element) => element.matches(CINEMA_ACTION_BAR_SELECTOR)) ||
      siblings.find((element) => element.querySelector(CINEMA_ACTION_BAR_FALLBACK_SELECTOR)) ||
      null;
  }

  function setCinemaVariable(name, value) {
    document.documentElement.style.setProperty(`--tiktok-plus-cinema-${name}`, value);
  }

  function clearCinemaVariables() {
    ["width", "height"]
      .forEach((name) => document.documentElement.style.removeProperty(`--tiktok-plus-cinema-${name}`));
  }

  // Probe without our rail-hiding rule; a mounted comment list can also be hidden by TikTok.
  function cinemaCommentsOpen() {
    const panel = document.querySelector(CINEMA_COMMENT_PANEL_SELECTOR);
    if (!panel) return false;
    document.documentElement.classList.add(CINEMA_COMMENTS_CLASS);
    for (let element = panel; element && element !== document.documentElement; element = element.parentElement) {
      const style = getComputedStyle(element);
      if (element.hidden || element.getAttribute("aria-hidden") === "true" ||
          style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  }

  function cinemaRailWidth(open) {
    if (!open) return 0;
    const rail = document.querySelector(CINEMA_RAIL_SELECTOR);
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    return rect.width > 1 ? rect.width : 0;
  }

  // The card stays in normal flow so TikTok's own popover positioning keeps working. Only its
  // size is scripted; the article and flex row centre it with CSS.
  function layoutCinema() {
    const card = cinemaState.card;
    if (!card) return;

    // Toggle first so the rail is rendered and measurable, then read its width.
    const commentsOpen = cinemaCommentsOpen();
    document.documentElement.classList.toggle(CINEMA_COMMENTS_CLASS, commentsOpen);
    const railWidth = cinemaRailWidth(commentsOpen);

    const video = card.querySelector("video");
    const ratio = video && video.videoWidth > 0 && video.videoHeight > 0
      ? video.videoWidth / video.videoHeight
      : 9 / 16;
    const barWidth = cinemaState.bar ? cinemaState.bar.getBoundingClientRect().width : 0;
    const gap = 16;
    const padding = 16;
    const freeWidth = Math.max(1, innerWidth - railWidth);
    const availableWidth = Math.max(1, freeWidth - (barWidth ? barWidth + gap : 0) - padding * 2);
    const availableHeight = Math.max(1, innerHeight - padding * 2);

    let height = availableHeight;
    let width = height * ratio;
    if (width > availableWidth) {
      width = availableWidth;
      height = width / ratio;
    }

    setCinemaVariable("width", `${Math.round(width)}px`);
    setCinemaVariable("height", `${Math.round(height)}px`);
  }

  function markCinemaChrome() {
    document.querySelectorAll(`.${CINEMA_CHROME_CLASS}`)
      .forEach((element) => element.classList.remove(CINEMA_CHROME_CLASS));
    const card = cinemaState.card;
    if (!card) return;

    // Bottom info, top overlay and progress bar are TikTok's own nodes; the bar is the sibling.
    [card.querySelector(CINEMA_INFO_SELECTOR),
     card.querySelector(CINEMA_TOP_SELECTOR),
     card.querySelector(CINEMA_PROGRESS_SELECTOR),
     cinemaState.bar]
      .forEach((element) => element && element.classList.add(CINEMA_CHROME_CLASS));
  }

  function isCinemaActive() {
    return document.documentElement.classList.contains(CINEMA_CLASS);
  }

  function shouldCinemaIdle() {
    if (!cinemaState.card) return false;
    const video = cinemaState.card.querySelector("video");
    if (!video || video.paused) return false;

    // Keep the chrome up while a menu, the shortcut panel or a text field owns the interaction.
    if (document.querySelector(CINEMA_POPUP_SELECTOR)) return false;
    if (isShortcutHelpVisible()) return false;
    if (isEditableTarget(document.activeElement)) return false;

    return ![...document.querySelectorAll(`.${CINEMA_CHROME_CLASS}`)]
      .some((element) => element.matches(":hover"));
  }

  function revealCinemaChrome() {
    if (!isCinemaActive()) return;
    document.documentElement.classList.remove(CINEMA_IDLE_CLASS);
    scheduleCinemaIdle();
  }

  function scheduleCinemaIdle() {
    clearTimeout(cinemaState.idleTimer);
    cinemaState.idleTimer = setTimeout(settleCinemaChrome, CINEMA_IDLE_MS);
  }

  // Re-test soon instead of waiting a whole idle window when a menu or a hover still blocks
  // hiding; a paused video or an open text field keeps the chrome up until something changes.
  function settleCinemaChrome() {
    cinemaState.idleTimer = null;
    if (!isCinemaActive()) return;

    const card = cinemaState.card;
    const video = card && card.querySelector("video");
    if (!video) {
      // The card can be momentarily unset while the feed swaps videos; keep waiting rather than
      // dropping the timer, which would leave the chrome visible until the next pointer move.
      cinemaState.idleTimer = setTimeout(settleCinemaChrome, CINEMA_IDLE_RETRY_MS);
      return;
    }
    // A paused video keeps the chrome visible on purpose; the pause/play events re-arm this.
    if (video.paused) return;

    if (!shouldCinemaIdle()) {
      cinemaState.idleTimer = setTimeout(settleCinemaChrome, CINEMA_IDLE_RETRY_MS);
      return;
    }
    document.documentElement.classList.add(CINEMA_IDLE_CLASS);
  }

  function paintCinema(card = getCinemaCard()) {
    if (!card) return true;
    if (!isCinemaActive()) return true;

    const bar = findCinemaActionBar(card);
    const video = card.querySelector("video");
    if (card !== cinemaState.card || bar !== cinemaState.bar || video !== cinemaState.video) {
      teardownCinemaCard();
      cinemaState.card = card;
      cinemaState.bar = bar;
      cinemaState.video = video;
      cinemaState.flex = card.parentElement;
      cinemaState.article = card.closest("article") || cinemaState.flex;
      card.classList.add(CINEMA_CARD_CLASS);
      if (cinemaState.bar) cinemaState.bar.classList.add(CINEMA_BAR_CLASS);
      if (cinemaState.flex) cinemaState.flex.classList.add(CINEMA_FLEX_CLASS);
      if (cinemaState.article) cinemaState.article.classList.add(CINEMA_ARTICLE_CLASS);
      for (let element = video && video.parentElement; element && element !== card; element = element.parentElement) {
        element.classList.add(CINEMA_MEDIA_CLASS);
      }
      markCinemaChrome();
      watchCinemaCard(card);
    }

    layoutCinema();
    return true;
  }

  function teardownCinemaCard() {
    if (cinemaState.barColorCleanup) {
      cinemaState.barColorCleanup();
      cinemaState.barColorCleanup = null;
    }
    if (cinemaState.resizeObserver) {
      cinemaState.resizeObserver.disconnect();
      cinemaState.resizeObserver = null;
    }
    if (cinemaState.videoCleanup) {
      cinemaState.videoCleanup();
      cinemaState.videoCleanup = null;
    }
    document.querySelectorAll([
      `.${CINEMA_CARD_CLASS}`,
      `.${CINEMA_BAR_CLASS}`,
      `.${CINEMA_CHROME_CLASS}`,
      `.${CINEMA_FLEX_CLASS}`,
      `.${CINEMA_ARTICLE_CLASS}`,
      `.${CINEMA_MEDIA_CLASS}`,
    ].join(", ")).forEach((element) => element.classList.remove(
      CINEMA_CARD_CLASS, CINEMA_BAR_CLASS, CINEMA_CHROME_CLASS, CINEMA_FLEX_CLASS, CINEMA_ARTICLE_CLASS, CINEMA_MEDIA_CLASS));
    cinemaState.card = null;
    cinemaState.bar = null;
    cinemaState.flex = null;
    cinemaState.article = null;
    cinemaState.video = null;
  }

  function alignCinemaCard() {
    const { list, article } = cinemaState;
    if (list && article) {
      list.scrollTop += article.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }
  }

  function watchCinemaCard(card) {
    if (cinemaState.bar) watchCinemaBarColors(cinemaState.bar);
    const onChange = () => requestAnimationFrame(layoutCinema);
    if (typeof ResizeObserver === "function") {
      cinemaState.resizeObserver = new ResizeObserver(onChange);
      cinemaState.resizeObserver.observe(card);
      if (cinemaState.bar) cinemaState.resizeObserver.observe(cinemaState.bar);
    }

    const video = card.querySelector("video");
    // Video metadata arrives after the card is mounted; the ratio is unknown before that.
    if (video) {
      const refresh = () => onChange();
      video.addEventListener("loadedmetadata", refresh);
      cinemaState.videoCleanup = () => video.removeEventListener("loadedmetadata", refresh);
    }
  }

  function watchCinemaBarColors(bar) {
    const properties = ["color", "fill", "stroke"];
    const classes = properties.map(name => `tiktok-plus-cinema-ink-${name}`);
    const clear = () => bar.querySelectorAll("svg, svg *")
      .forEach(element => element.classList.remove(...classes));
    const refresh = () => {
      observer.disconnect();
      clear();
      const updates = [];
      bar.querySelectorAll("svg, svg *").forEach(element => {
        const style = getComputedStyle(element);
        properties.forEach((name, index) => {
          const color = style.getPropertyValue(name);
          if (!/^rgba?\(/.test(color)) return;
          const channels = color.match(/[\d.]+/g).map(Number);
          const rgb = channels.slice(0, 3);
          // Only lift dark neutral ink; colored state icons and transparent paints stay intact.
          if (channels[3] === 0 || Math.max(...rgb) >= 128 || Math.max(...rgb) - Math.min(...rgb) > 24) return;
          updates.push([element, classes[index]]);
        });
      });
      updates.forEach(([element, className]) => element.classList.add(className));
      observer.observe(bar, { childList: true, subtree: true, attributes: true });
    };
    const observer = new MutationObserver(refresh);
    cinemaState.barColorCleanup = () => { observer.disconnect(); clear(); };
    refresh();
  }

  function enterCinema() {
    const card = getCinemaCard();
    if (!card) return false;

    cinemaState.list = card.closest('[class*="DivColumnListContainer"]') ||
      getScrollContainers(card).find((element) => element !== document.scrollingElement &&
        element !== document.documentElement && element !== document.body) || null;
    if (cinemaState.list) cinemaState.list.classList.add(CINEMA_LIST_CLASS);
    document.documentElement.classList.add(CINEMA_CLASS);
    paintCinema(card);
    alignCinemaCard();

    const onScroll = () => requestAnimationFrame(() => paintCinema());
    const onResize = () => { layoutCinema(); alignCinemaCard(); };
    cinemaState.listeners = [
      ["scroll", onScroll, true],
      ["resize", onResize, false],
      ["pointermove", revealCinemaChrome, true],
      ["pointerdown", revealCinemaChrome, true],
      ["wheel", revealCinemaChrome, true],
      ["touchstart", revealCinemaChrome, true],
    ];
    cinemaState.listeners.forEach(([type, handler, capture]) => {
      (type === "resize" ? window : document).addEventListener(type, handler, capture);
    });

    if (typeof MutationObserver === "function") {
      // The comment rail mounts and unmounts as new nodes, but a theme or layout toggle can also
      // merely hide it, so watch attributes as well to keep the centering correct.
      cinemaState.mutationObserver = new MutationObserver(() => requestAnimationFrame(() => paintCinema()));
      cinemaState.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden"],
      });
    }

    revealCinemaChrome();
    return true;
  }

  function exitCinema() {
    const { list, article } = cinemaState;
    clearTimeout(cinemaState.idleTimer);
    cinemaState.idleTimer = null;

    if (cinemaState.mutationObserver) {
      cinemaState.mutationObserver.disconnect();
      cinemaState.mutationObserver = null;
    }
    if (cinemaState.listeners) {
      cinemaState.listeners.forEach(([type, handler, capture]) => {
        (type === "resize" ? window : document).removeEventListener(type, handler, capture);
      });
      cinemaState.listeners = null;
    }
    if (cinemaState.videoCleanup) {
      cinemaState.videoCleanup();
      cinemaState.videoCleanup = null;
    }

    teardownCinemaCard();
    if (cinemaState.list) cinemaState.list.classList.remove(CINEMA_LIST_CLASS);
    cinemaState.list = null;
    document.documentElement.classList.remove(CINEMA_CLASS, CINEMA_IDLE_CLASS, CINEMA_COMMENTS_CLASS);
    clearCinemaVariables();

    if (list && article && article.isConnected) {
      list.scrollTop += article.getBoundingClientRect().top - list.getBoundingClientRect().top;
    }
  }

  function requestElementFullscreen(element) {
    const request = element.requestFullscreen || element.webkitRequestFullscreen;
    if (!request) return Promise.resolve(false);
    return Promise.resolve(request.call(element)).then(() => true, () => false);
  }

  function exitElementFullscreen() {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!exit) return Promise.resolve(false);
    return Promise.resolve(exit.call(document)).then(() => true, () => false);
  }

  // TikTok has no stable fullscreen button in the current player, so native-element plain
  // fullscreen is the primary path and the legacy cinema-mode control is only a fallback.
  function clickFullscreenControl() {
    const candidates = fullscreenControlCandidates();
    const byData = candidates.find(hasFullscreenDataHook);
    if (clickElement(byData)) return true;

    const byLabel = candidates.find((element) => matchesAny(elementText(element), FULLSCREEN_CONTROL_LABELS));
    return clickElement(byLabel);
  }

  function fullscreenControlCandidates() {
    const dataSelector = FULLSCREEN_CONTROL_DATA
      .map((value) => `[data-e2e="${value}"], [data-e2e*="${value}"]`)
      .join(",");

    return candidatesNearCurrent([dataSelector]).filter((element) => {
      const control = element.closest(INTERACTIVE_SELECTOR);
      if (!control) return false;
      // The media card carries aria-label="Watch in full screen" and tabindex, but clicking it
      // only toggles playback, so it must never be picked as a fullscreen control.
      if ((control.getAttribute("data-e2e") || "") === "feed-video") return false;
      if (control.tagName === "SECTION" || control.tagName === "ARTICLE") return false;
      // A label match must land on a real button-like node; an explicit cinema-mode hook may
      // also be a plain container, which is still safe enough to click.
      if (control.matches('button, a, [role="button"]')) return true;
      return hasFullscreenDataHook(element) || hasFullscreenDataHook(control);
    });
  }

  function hasFullscreenDataHook(element) {
    const value = element.getAttribute("data-e2e") || "";
    return FULLSCREEN_CONTROL_DATA.some((name) => value.includes(name));
  }

  async function togglePlayerFullscreen() {
    const video = getCurrentVideo();
    if (!video) {
      toast("No video found");
      return;
    }

    if (getFullscreenElement() || isCinemaActive()) {
      exitCinema();
      const exited = await exitElementFullscreen();
      toast(exited || !getFullscreenElement() ? "Exit fullscreen" : "Exit fullscreen failed");
      return;
    }

    if (!getCinemaCard(video)) {
      toast("No video found");
      return;
    }

    // Apply the cinema layout before the request so the first painted frame is already correct.
    if (!enterCinema()) {
      toast("No video found");
      return;
    }

    if (await requestElementFullscreen(document.documentElement)) {
      toast("Cinema mode");
      return;
    }

    exitCinema();
    if (clickFullscreenControl()) {
      toast("Fullscreen toggled");
      return;
    }

    toast("Fullscreen not allowed");
  }

  function likeVideo() {
    const ok = clickDataFirst(
      ["like-icon", "browse-like", "like-button"],
      [/like/i, /喜欢|赞|点赞/]
    );
    toast(ok ? "Liked" : "Like button not found");
  }

  function openComments() {
    const ok = clickDataFirst(
      ["comment-icon", "browse-comment", "comment-button"],
      [/comment/i, /评论/]
    );
    toast(ok ? "Comments" : "Comment button not found");
  }

  function toggleFavorite() {
    const ok = clickDataFirst(
      ["favorite", "collect", "bookmark", "save"],
      [/favorite|favourite|bookmark|save/i, /收藏|保存/]
    );
    toast(ok ? "Favorite toggled" : "Favorite button not found");
  }

  async function copyCommand() {
    const title = document.title.replace(/\s*\|\s*TikTok\s*$/i, "").trim();
    const text = title ? `${title}\n${location.href}` : location.href;

    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch (error) {
      const input = document.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.cssText = "position:fixed;left:-9999px;top:-9999px;";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      toast("Copied");
    }
  }

  function toggleDanmaku() {
    const ok = clickByPatterns([
      /danmaku|bullet\s*comments?|floating\s*comments?/i,
      /弹幕|飘屏|浮动评论|评论显示|清屏/,
    ]);
    toast(ok ? "Danmaku toggled" : "Danmaku button not found");
  }

  function markNotInterested() {
    if (clickByPatterns([/not interested|not\s*for\s*me/i, /不感兴趣|不想看/])) {
      toast("Not interested");
      return;
    }

    const openedMenu = clickByPatterns([/more|share|menu/i, /更多|分享|菜单/], ['[data-e2e*="share"], [aria-label*="More"]']);
    if (!openedMenu) {
      toast("Not interested not found");
      return;
    }

    setTimeout(() => {
      const ok = clickByPatterns([/not interested|not\s*for\s*me/i, /不感兴趣|不想看/]);
      toast(ok ? "Not interested" : "Not interested not found");
    }, 180);
  }

  function followAuthor() {
    const ok = clickDataFirst(
      ["follow", "feed-follow", "browse-follow"],
      [/follow/i, /关注/]
    );
    toast(ok ? "Follow toggled" : "Follow button not found");
  }

  function focusSearch() {
    const focusSelectors = [
      'input[type="search"]',
      'input[data-e2e*="search"]',
      'input[placeholder*="Search"]',
      'input[placeholder*="搜索"]',
      '[role="search"] input',
      'form[action*="search"] input',
      '[contenteditable="true"][data-e2e*="search"]',
      '[contenteditable="true"][role="searchbox"]',
      '[role="combobox"]',
      '[role="textbox"]',
    ];
    const triggerSelectors = [
      '[data-e2e="nav-search"]',
      '[data-e2e*="search"]',
      '[role="searchbox"]',
    ];

    const focusable = focusSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .find(isVisible);

    if (focusSearchElement(focusable)) {
      toast("Search focused");
      return;
    }

    const trigger = triggerSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .find(isVisible);

    if (!trigger) {
      toast("Search box not found");
      return;
    }

    clickElement(trigger);
    setTimeout(() => {
      const openedInput = focusSelectors
        .flatMap((selector) => [...document.querySelectorAll(selector)])
        .find(isVisible);

      toast(focusSearchElement(openedInput) ? "Search focused" : "Search opened");
    }, 120);
  }

  function focusSearchElement(element) {
    if (!element) return false;
    element.focus();
    clickElement(element);
    if (typeof element.select === "function") element.select();
    return document.activeElement === element || element.matches(":focus-within");
  }

  async function exitFullscreenModes() {
    if (!getFullscreenElement() && !isCinemaActive()) return;
    exitCinema();
    await exitElementFullscreen();
  }

  // Browsers exit fullscreen on their own for Escape and for native controls, so the cinema
  // layout must also be torn down when the change was not initiated by us.
  function watchFullscreenChanges() {
    const sync = () => {
      if (!getFullscreenElement()) exitCinema();
    };
    document.addEventListener("fullscreenchange", sync, true);
    document.addEventListener("webkitfullscreenchange", sync, true);
  }

  // The card can be replaced while the video advances or the feed re-renders, so the cinema
  // layout re-anchors to whichever card is current.
  function watchCinemaVideoChanges() {
    const sync = () => {
      if (!isCinemaActive()) return;
      paintCinema();
      revealCinemaChrome();
    };
    document.addEventListener("loadedmetadata", sync, true);
    document.addEventListener("play", sync, true);
    document.addEventListener("pause", revealCinemaChrome, true);
  }

  function onKeyDown(event) {
    revealCinemaChrome();
    const key = event.key.toLowerCase();
    const code = event.code;
    const editable = isEditableTarget(event.target);

    if (code === "Escape") {
      if (isShortcutHelpVisible()) {
        hideShortcutHelp();
        stopEvent(event);
        return;
      }

      exitFullscreenModes();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (event.shiftKey && key === "f") {
      stopEvent(event);
      focusSearch();
      return;
    }

    if (event.shiftKey && (key === "?" || code === "Slash")) {
      stopEvent(event);
      toggleShortcutHelp();
      return;
    }

    // Space and Enter must retain native button activation for comment translation.
    if ((code === "Space" || code === "Enter") && event.target instanceof Element &&
        event.target.closest(".tiktok-plus-translate-button")) return;
    if (editable) return;

    const actions = {
      ArrowUp: () => navigateVideo(-1),
      ArrowDown: () => navigateVideo(1),
      ArrowLeft: () => seekBy(-SEEK_SECONDS),
      ArrowRight: () => seekBy(SEEK_SECONDS),
      KeyH: togglePlayerFullscreen,
      KeyF: togglePlayerFullscreen,
      KeyZ: likeVideo,
      KeyX: openComments,
      KeyC: toggleFavorite,
      KeyV: copyCommand,
      KeyB: toggleDanmaku,
      KeyR: markNotInterested,
      KeyG: followAuthor,
    };

    if (code === "Space") {
      stopEvent(event);
      if (event.repeat) return;
      togglePlayback();
      return;
    }

    const action = actions[code];
    if (!action) return;

    stopEvent(event);
    action();
  }

  installStyle();
  observeCommentTranslations();
  watchFullscreenChanges();
  watchCinemaVideoChanges();
  document.addEventListener("keydown", onKeyDown, true);
})();
