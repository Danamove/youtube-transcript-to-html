(function () {
  if (window.__ytbBriefHook) return;
  window.__ytbBriefHook = true;

  const cacheByVideo = {};

  function videoIdFromUrl(url) {
    try {
      return new URL(url, location.origin).searchParams.get("v") || "";
    } catch {
      return "";
    }
  }

  function maybeStore(url, body) {
    const href = String(url || "");
    const text = String(body || "");
    if (!href.includes("/api/timedtext") || !text.trim()) return;
    const videoId = videoIdFromUrl(href);
    if (!videoId) return;
    cacheByVideo[videoId] = { videoId, body: text, url: href };
  }

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await origFetch.apply(this, args);
    try {
      const request = args[0];
      const url =
        typeof request === "string"
          ? request
          : request && request.url
            ? request.url
            : "";
      if (String(url).includes("/api/timedtext")) {
        maybeStore(url, await response.clone().text());
      }
    } catch {
      // Never break YouTube's own fetch.
    }
    return response;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__ytbUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      maybeStore(this.__ytbUrl, this.responseText);
    });
    return origSend.apply(this, args);
  };

  async function fetchText(url) {
    const response = await origFetch.call(window, url, {
      credentials: "include",
    });
    const body = await response.text();
    maybeStore(url, body);
    return { ok: response.ok, status: response.status, body };
  }

  async function innertubePlayer(videoId) {
    const clients = [
      {
        clientName: "IOS",
        clientVersion: "20.10.38",
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        osName: "iOS",
        osVersion: "18.2.1.22C161",
      },
      {
        clientName: "ANDROID",
        clientVersion: "20.10.38",
        androidSdkVersion: 34,
        osName: "Android",
        osVersion: "14",
      },
    ];
    let lastError = "Innertube returned no captions";
    for (const client of clients) {
      const response = await origFetch.call(
        window,
        "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            context: { client },
            videoId,
          }),
        }
      );
      const data = await response.json();
      const tracks =
        data?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      if (tracks.length) {
        return { player: data, tracks };
      }
      lastError =
        data?.playabilityStatus?.reason ||
        data?.playabilityStatus?.status ||
        lastError;
    }
    throw new Error(lastError);
  }

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== "ytb-brief-prompt") return;
    if (event.data?.type !== "YTB_REQUEST") return;
    const { id, action } = event.data;
    const reply = (payload, error) => {
      window.postMessage(
        {
          source: "ytb-brief-prompt",
          type: "YTB_RESPONSE",
          id,
          payload,
          error,
        },
        "*"
      );
    };
    try {
      if (action === "cache") {
        const videoId = event.data.videoId || "";
        reply(cacheByVideo[videoId] || { videoId: "", body: "", url: "" });
        return;
      }
      if (action === "clear") {
        const videoId = event.data.videoId;
        if (videoId) delete cacheByVideo[videoId];
        reply({ ok: true });
        return;
      }
      if (action === "fetch") {
        reply(await fetchText(event.data.url));
        return;
      }
      if (action === "innertube") {
        reply(await innertubePlayer(event.data.videoId));
        return;
      }
      reply(null, "Unknown action");
    } catch (error) {
      reply(null, error?.message || "Page hook failed");
    }
  });
})();
