(() => {
  const HOST_ID = "ytb-copy-brief-host";
  let busy = false;
  let requestId = 0;

  function isWatchPage() {
    const path = location.pathname;
    return (
      path === "/watch" ||
      path.startsWith("/watch") ||
      path.startsWith("/shorts/") ||
      path.startsWith("/live/")
    );
  }

  function ensureHost() {
    if (!isWatchPage()) {
      document.getElementById(HOST_ID)?.remove();
      return null;
    }
    let host = document.getElementById(HOST_ID);
    if (host) return host;

    host = document.createElement("div");
    host.id = HOST_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .wrap {
          font-family: system-ui, "Segoe UI", Arial, sans-serif;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }
        button {
          appearance: none;
          border: 0;
          cursor: pointer;
          color: #fff;
          background: #0f172a;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 13px;
          font-weight: 650;
          letter-spacing: 0.01em;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.28);
        }
        button:hover { background: #1e293b; }
        button[disabled] { opacity: 0.65; cursor: wait; }
        .status {
          display: none;
          max-width: 280px;
          background: #fff;
          color: #0f172a;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.45;
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
        }
        .status.show { display: block; }
        .status.error { color: #991b1b; background: #fef2f2; border-color: #fecaca; }
        .status.ok { color: #14532d; background: #f0fdf4; border-color: #bbf7d0; }
      </style>
      <div class="wrap">
        <button type="button" id="copy">Copy prompt + transcript</button>
        <div class="status" id="status"></div>
      </div>
    `;
    shadow.getElementById("copy").addEventListener("click", () => {
      runCopy({ announce: true }).catch(() => {});
    });
    document.documentElement.appendChild(host);
    return host;
  }

  function setStatus(kind, text) {
    const host = document.getElementById(HOST_ID);
    const status = host?.shadowRoot?.getElementById("status");
    const button = host?.shadowRoot?.getElementById("copy");
    if (!status || !button) return;
    if (!kind && !text) {
      status.className = "status";
      status.textContent = "";
      button.disabled = false;
      button.textContent = "Copy prompt + transcript";
      return;
    }
    status.className = `status show ${kind}`;
    status.textContent = text;
    button.disabled = kind === "pending";
    button.textContent =
      kind === "pending" ? "Copying…" : "Copy prompt + transcript";
  }

  function currentVideoId() {
    return window.YTB.captions.videoIdFromHref(location.href);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function injectPageHook() {
    if (document.querySelector("script[data-ytb-hook='1']")) return;
    const script = document.createElement("script");
    script.src = chrome.runtime.getURL("src/page-hook.js");
    script.dataset.ytbHook = "1";
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function requestPage(action, extra = {}, timeoutMs = 8000) {
    const id = `ytb-${Date.now()}-${(requestId += 1)}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("YouTube page did not answer"));
      }, timeoutMs);
      const onMessage = (event) => {
        if (event.source !== window) return;
        if (event.data?.source !== "ytb-brief-prompt") return;
        if (event.data?.type !== "YTB_RESPONSE") return;
        if (event.data.id !== id) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data.payload);
      };
      window.addEventListener("message", onMessage);
      window.postMessage(
        { source: "ytb-brief-prompt", type: "YTB_REQUEST", id, action, ...extra },
        "*"
      );
    });
  }

  function readPlayerFromScripts(videoId) {
    return window.YTB.captions.parsePlayerResponseFromScripts(
      document.scripts,
      videoId
    );
  }

  async function readPlayerFromMainWorld() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "READ_PLAYER_RESPONSE",
      });
      if (result?.ok && result.payload) return result.payload;
    } catch {
      return null;
    }
    return null;
  }

  async function getPlayerResponse(videoId) {
    const fromPage = await readPlayerFromMainWorld();
    if (window.YTB.captions.playerMatchesVideo(fromPage, videoId)) {
      return fromPage;
    }
    const fromScripts = readPlayerFromScripts(videoId);
    if (window.YTB.captions.playerMatchesVideo(fromScripts, videoId)) {
      return fromScripts;
    }
    return (
      (videoId && fromPage) ||
      fromScripts ||
      fromPage ||
      null
    );
  }

  async function waitForCurrentPlayer(videoId) {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      if (currentVideoId() !== videoId) return null;
      const player = await getPlayerResponse(videoId);
      if (window.YTB.captions.playerMatchesVideo(player, videoId)) {
        return player;
      }
      await sleep(120);
    }
    return getPlayerResponse(videoId);
  }

  function parseCaptionBody(body) {
    if (!body || !String(body).trim()) return "";
    try {
      return window.YTB.captions.parseTranscriptPayload(body);
    } catch {
      return "";
    }
  }

  async function fetchCaptionUrls(url) {
    const urls = window.YTB.captions.captionFetchUrls(url);
    for (const candidate of urls) {
      try {
        const fromPage = await requestPage("fetch", { url: candidate });
        const transcript = parseCaptionBody(fromPage?.body);
        if (transcript) return transcript;
      } catch {
        // Try the next format / fetcher.
      }
      try {
        const fromWorker = await chrome.runtime.sendMessage({
          type: "FETCH_TRANSCRIPT",
          url: candidate,
        });
        if (fromWorker?.ok && fromWorker.transcript) {
          return fromWorker.transcript;
        }
      } catch {
        // Continue.
      }
    }
    return "";
  }

  function readTranscriptSegments() {
    const nodes = document.querySelectorAll(
      "ytd-transcript-segment-renderer yt-formatted-string.segment-text, ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-list-renderer .segment-text"
    );
    return window.YTB.captions.linesToTranscript(
      [...nodes].map((node) => node.textContent || "")
    );
  }

  function closeTranscriptPanel() {
    const selectors = [
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button',
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #dismiss-button button',
      "#panels ytd-engagement-panel-section-list-renderer[visibility] #visibility-button button",
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) {
        button.click();
        return true;
      }
    }
    return false;
  }

  function clickTranscriptButton() {
    document
      .querySelector(
        "tp-yt-paper-button#expand, #expand.ytd-text-inline-expander, ytd-text-inline-expander #expand"
      )
      ?.click();

    const buttons = [
      ...document.querySelectorAll(
        "button, yt-button-shape button, a, ytd-button-renderer, ytd-menu-service-item-renderer"
      ),
    ];
    const match = buttons.find((el) => {
      const label = [
        el.getAttribute("aria-label"),
        el.getAttribute("title"),
        el.textContent,
      ]
        .filter(Boolean)
        .join(" ");
      return window.YTB.captions.transcriptButtonMatch(label);
    });
    if (match) {
      match.click();
      return true;
    }
    return false;
  }

  async function transcriptFromPanel(videoId) {
    closeTranscriptPanel();
    await sleep(200);
    if (currentVideoId() !== videoId) return "";
    if (!clickTranscriptButton()) return "";
    const started = Date.now();
    while (Date.now() - started < 4500) {
      if (currentVideoId() !== videoId) return "";
      await sleep(150);
      const text = readTranscriptSegments();
      if (text) return text;
    }
    return "";
  }

  async function transcriptFromCache(videoId) {
    try {
      const cached = await requestPage("cache", { videoId }, 800);
      if (!window.YTB.captions.cacheMatches(cached, videoId)) return "";
      return parseCaptionBody(cached.body);
    } catch {
      return "";
    }
  }

  async function transcriptFromInnertube(videoId) {
    if (!videoId) return "";
    try {
      const result = await requestPage("innertube", { videoId }, 12000);
      const tracks = window.YTB.captions.listCaptionTracks(result.player);
      const track = window.YTB.captions.pickCaptionTrack(tracks);
      if (!track) return "";
      return fetchCaptionUrls(track.baseUrl);
    } catch {
      return "";
    }
  }

  async function collectTranscript(videoId, fallbackTrack) {
    const sources = [
      () => transcriptFromCache(videoId),
      () => transcriptFromInnertube(videoId),
      () => (fallbackTrack ? fetchCaptionUrls(fallbackTrack.baseUrl) : ""),
      () => transcriptFromPanel(videoId),
    ];
    for (const source of sources) {
      if (currentVideoId() !== videoId) {
        throw new Error("Video changed. Click copy again on this video.");
      }
      const transcript = await source();
      if (transcript) return transcript;
    }
    throw new Error(
      "YouTube blocked the caption file. Open the video’s transcript panel and try again."
    );
  }

  async function collectPayload() {
    if (!isWatchPage()) {
      throw new Error("Open a YouTube video first.");
    }
    const videoId = currentVideoId();
    if (!videoId) {
      throw new Error("Could not read this video id. Refresh and try again.");
    }
    injectPageHook();
    await sleep(80);
    const player = await waitForCurrentPlayer(videoId);
    if (!player || !window.YTB.captions.playerMatchesVideo(player, videoId)) {
      throw new Error("Still on the previous video data. Refresh this tab and try again.");
    }
    const meta = window.YTB.captions.metadataFromPlayer(player, location.href);
    const tracks = window.YTB.captions.listCaptionTracks(player);
    const track = window.YTB.captions.pickCaptionTrack(tracks);
    const transcript = await collectTranscript(videoId, track);
    return window.YTB.buildPayload({
      title: meta.title,
      url: meta.url,
      videoId,
      captionLanguage: track?.languageCode || track?.languageName || "unknown",
      captionKind: track?.kind === "asr" ? "auto-generated" : "manual",
      transcript,
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      const done = document.execCommand ? copyWithTextarea(text) : false;
      if (done) return "clipboard";
      downloadText(text);
      return "download";
    }
  }

  function copyWithTextarea(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function downloadText(text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const id = window.YTB.captions.videoIdFromHref(location.href) || "youtube";
    link.href = url;
    link.download = `${id}-brief-prompt.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function runCopy({ announce }) {
    if (busy) return { ok: false, error: "Already copying." };
    busy = true;
    if (announce) setStatus("pending", "Fetching captions…");
    try {
      const payload = await collectPayload();
      const via = await copyText(payload);
      const count = payload.length.toLocaleString();
      const condensed = payload.includes("[CONDENSED:");
      const message =
        via === "download"
          ? `Clipboard blocked a ${count}-character payload. Downloaded a .txt instead — paste that into Claude Code or Codex.`
          : condensed
            ? `Copied ${count} characters (shortened so Claude Code will not freeze). Paste into Claude Code or Codex.`
            : `Copied ${count} characters. Paste into Claude Code or Codex.`;
      if (announce) setStatus("ok", message);
      return { ok: true, via, characters: payload.length, message };
    } catch (error) {
      const message = error?.message || "Could not copy this video.";
      if (announce) setStatus("error", message);
      return { ok: false, error: message };
    } finally {
      busy = false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "COPY_BRIEF") {
      runCopy({ announce: true }).then(sendResponse);
      return true;
    }
    if (message?.type === "GET_WATCH_STATE") {
      sendResponse({
        ok: true,
        isWatchPage: isWatchPage(),
        href: location.href,
      });
      return false;
    }
    return false;
  });

  function resetForNavigation() {
    busy = false;
    setStatus("", "");
    closeTranscriptPanel();
  }

  function mount() {
    if (isWatchPage()) {
      injectPageHook();
      ensureHost();
    } else {
      document.getElementById(HOST_ID)?.remove();
    }
  }

  mount();
  document.addEventListener("yt-navigate-start", resetForNavigation);
  document.addEventListener("yt-navigate-finish", mount);
  document.addEventListener("yt-page-data-updated", mount);
  window.addEventListener("popstate", () => setTimeout(mount, 50));
})();
