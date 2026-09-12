(() => {
  const HOST_ID = "ytb-copy-brief-host";
  let busy = false;

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
    status.className = `status show ${kind}`;
    status.textContent = text;
    button.disabled = kind === "pending";
    button.textContent =
      kind === "pending" ? "Copying…" : "Copy prompt + transcript";
  }

  function readPlayerFromScripts() {
    return window.YTB.captions.parsePlayerResponseFromScripts(document.scripts);
  }

  function readPlayerFromPage() {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (payload) => {
        if (settled) return;
        settled = true;
        window.removeEventListener("message", onMessage);
        resolve(payload || null);
      };
      const onMessage = (event) => {
        if (event.source !== window) return;
        if (event.data?.source !== "ytb-brief-prompt") return;
        if (event.data?.type !== "YTB_PLAYER_RESPONSE") return;
        finish(event.data.payload);
      };
      window.addEventListener("message", onMessage);
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("src/page-bridge.js");
      script.onload = () => script.remove();
      script.onerror = () => finish(null);
      (document.head || document.documentElement).appendChild(script);
      setTimeout(() => finish(null), 1200);
    });
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

  async function getPlayerResponse() {
    return (
      (await readPlayerFromMainWorld()) ||
      (await readPlayerFromPage()) ||
      readPlayerFromScripts()
    );
  }

  async function fetchTranscript(url) {
    try {
      const fromWorker = await chrome.runtime.sendMessage({
        type: "FETCH_TRANSCRIPT",
        url,
      });
      if (fromWorker?.ok && fromWorker.transcript) {
        return fromWorker.transcript;
      }
    } catch {
      // Fall through to a same-origin fetch from the watch page.
    }
    const sameOrigin = await fetch(window.YTB.captions.withJson3(url), {
      credentials: "include",
    });
    if (!sameOrigin.ok) {
      throw new Error(`Caption request failed (${sameOrigin.status})`);
    }
    return window.YTB.captions.parseTranscriptPayload(await sameOrigin.text());
  }

  async function collectPayload() {
    if (!isWatchPage()) {
      throw new Error("Open a YouTube video first.");
    }
    const player = await getPlayerResponse();
    if (!player) {
      throw new Error("Could not read this video. Refresh the page and try again.");
    }
    const meta = window.YTB.captions.metadataFromPlayer(player, location.href);
    const tracks = window.YTB.captions.listCaptionTracks(player);
    const track = window.YTB.captions.pickCaptionTrack(tracks);
    if (!track) {
      throw new Error("This video has no captions to copy.");
    }
    const transcript = await fetchTranscript(track.baseUrl);
    return window.YTB.buildPayload({
      title: meta.title,
      url: meta.url,
      videoId: meta.videoId,
      captionLanguage: track.languageCode || track.languageName,
      captionKind: track.kind === "asr" ? "auto-generated" : "manual",
      transcript,
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return "clipboard";
    } catch {
      const done = document.execCommand
        ? copyWithTextarea(text)
        : false;
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
      const message =
        via === "download"
          ? `Clipboard blocked a ${count}-character payload. Downloaded a .txt instead — paste that into Claude Code or Codex.`
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

  function mount() {
    if (isWatchPage()) ensureHost();
    else document.getElementById(HOST_ID)?.remove();
  }

  mount();
  document.addEventListener("yt-navigate-finish", mount);
  document.addEventListener("yt-page-data-updated", mount);
  window.addEventListener("popstate", () => setTimeout(mount, 50));
})();
