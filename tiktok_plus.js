// ==UserScript==
// @name         TikTok Plus
// @name:zh-CN   TikTok Plus
// @namespace    https://github.com/nukewarrior/tiktok_plus
// @version      1.1.1
// @description  Keyboard shortcuts for TikTok playback, interaction, search, and fullscreen modes.
// @description:zh-CN  为 TikTok 添加键盘快捷键：播放控制、互动操作、搜索聚焦和快捷键帮助面板。
// @author       nukewarrior
// @license      MIT
// @match        https://www.tiktok.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const SCRIPT_VERSION = "1.1.1";
  const SEEK_SECONDS = 5;
  const SHORTCUT_GROUPS = [
    {
      title: "播放控制",
      items: [
        ["Space", "暂停 / 播放"],
        ["↑ / ↓", "上下切视频"],
        ["← / →", "快退 / 快进 5 秒"],
        ["H", "播放器全屏"],
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
      .filter(isVisible)
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
    clickable.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
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
    const clicked = direction > 0
      ? clickByPatterns([/next/i, /下一个|下一条|下滑|下个/], ['[data-e2e*="arrow"], [aria-label*="Next"]'])
      : clickByPatterns([/previous|prev/i, /上一个|上一条|上滑|上个/], ['[data-e2e*="arrow"], [aria-label*="Previous"]']);

    if (clicked) return;

    scrollFeed(direction);
  }

  async function togglePlayerFullscreen() {
    const video = getCurrentVideo();
    const root = getVideoRoot(video);
    const node = root || video || document.documentElement;

    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
      toast("Exit fullscreen");
      return;
    }

    if (node.requestFullscreen) {
      await node.requestFullscreen().catch(() => {});
      toast("Player fullscreen");
    } else {
      toast("Fullscreen not supported");
    }
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
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  }

  function onKeyDown(event) {
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

    if (editable) return;

    const actions = {
      ArrowUp: () => navigateVideo(-1),
      ArrowDown: () => navigateVideo(1),
      ArrowLeft: () => seekBy(-SEEK_SECONDS),
      ArrowRight: () => seekBy(SEEK_SECONDS),
      KeyH: togglePlayerFullscreen,
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
  document.addEventListener("keydown", onKeyDown, true);
})();
