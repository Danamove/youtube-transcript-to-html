(function (global) {
  function decodeHtmlEntities(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"');
  }

  function extractBalancedObject(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }
      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }

  function parsePlayerResponseFromScripts(scripts) {
    for (const script of scripts) {
      const text = script.textContent || "";
      const keyIndex = text.indexOf("ytInitialPlayerResponse");
      if (keyIndex === -1) continue;
      const eq = text.indexOf("=", keyIndex);
      if (eq === -1) continue;
      const start = text.indexOf("{", eq);
      if (start === -1) continue;
      const json = extractBalancedObject(text, start);
      if (!json) continue;
      try {
        return JSON.parse(json);
      } catch {
        // Keep scanning other script tags.
      }
    }
    return null;
  }

  function watchUrlFromId(videoId) {
    return videoId ? `https://www.youtube.com/watch?v=${videoId}` : "";
  }

  function videoIdFromHref(href) {
    try {
      const url = new URL(href);
      if (url.searchParams.get("v")) return url.searchParams.get("v");
      const short = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (short) return short[1];
      const embed = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embed) return embed[1];
    } catch {
      return "";
    }
    return "";
  }

  function listCaptionTracks(playerResponse) {
    const tracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks ||
      [];
    return tracks
      .map((track) => ({
        baseUrl: decodeHtmlEntities(track.baseUrl || ""),
        languageCode: track.languageCode || "",
        languageName: track.name?.simpleText || track.languageCode || "",
        kind: track.kind || "standard",
      }))
      .filter((track) => track.baseUrl);
  }

  function scoreTrack(track) {
    const lang = (track.languageCode || "").toLowerCase();
    let score = 0;
    if (lang === "he" || lang === "iw" || lang.startsWith("he-")) score += 100;
    else if (lang === "en" || lang.startsWith("en-")) score += 50;
    if (track.kind !== "asr") score += 10;
    return score;
  }

  function pickCaptionTrack(tracks) {
    if (!tracks?.length) return null;
    return [...tracks].sort((a, b) => scoreTrack(b) - scoreTrack(a))[0];
  }

  function withFmt(url, fmt) {
    const parsed = new URL(url, "https://www.youtube.com");
    parsed.searchParams.set("fmt", fmt);
    return parsed.toString();
  }

  function withJson3(url) {
    return withFmt(url, "json3");
  }

  function captionFetchUrls(url) {
    return [withJson3(url), url, withFmt(url, "srv3")];
  }

  function linesToTranscript(lines) {
    return (lines || [])
      .map((line) => normalizeCueText(line))
      .filter(Boolean)
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function transcriptButtonMatch(label) {
    const text = String(label || "").toLowerCase();
    return (
      text.includes("transcript") ||
      text.includes("תמליל") ||
      text.includes("תמלול") ||
      text.includes("תמלול")
    );
  }

  const INNERTUBE_CLIENTS = {
    IOS: {
      clientName: "IOS",
      clientVersion: "20.10.38",
      deviceMake: "Apple",
      deviceModel: "iPhone16,2",
      osName: "iOS",
      osVersion: "18.2.1.22C161",
    },
    ANDROID: {
      clientName: "ANDROID",
      clientVersion: "20.10.38",
      androidSdkVersion: 34,
      osName: "Android",
      osVersion: "14",
    },
  };

  function buildInnertubePlayerBody(videoId, clientName) {
    const client = INNERTUBE_CLIENTS[clientName] || INNERTUBE_CLIENTS.IOS;
    return {
      context: { client: { ...client } },
      videoId,
    };
  }

  function normalizeCueText(text) {
    return decodeHtmlEntities(text)
      .replace(/\u200b/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function eventsToTranscript(events) {
    const chunks = [];
    let lastEnd = 0;
    for (const event of events || []) {
      if (!event?.segs) continue;
      const text = normalizeCueText(
        event.segs.map((seg) => seg.utf8 || "").join("")
      );
      if (!text) continue;
      const start = event.tStartMs || 0;
      if (chunks.length && start - lastEnd > 2200) chunks.push("");
      chunks.push(text);
      lastEnd = start + (event.dDurationMs || 0);
    }
    return chunks
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function xmlToTranscript(xml) {
    const texts = [...xml.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)];
    if (texts.length) {
      return linesToTranscript(texts.map((match) => match[1]));
    }
    const paragraphs = [...xml.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)];
    return linesToTranscript(
      paragraphs.map((match) => match[1].replace(/<[^>]+>/g, " "))
    );
  }

  function vttToTranscript(vtt) {
    const lines = [];
    for (const raw of String(vtt || "").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line === "WEBVTT" || line.startsWith("NOTE")) continue;
      if (/^\d+$/.test(line)) continue;
      if (line.includes("-->")) continue;
      lines.push(line);
    }
    return linesToTranscript(lines);
  }

  function parseTranscriptPayload(body) {
    const trimmed = String(body || "").trim();
    if (!trimmed) {
      throw new Error("Empty caption response");
    }
    if (trimmed.startsWith("{")) {
      const data = JSON.parse(trimmed);
      const transcript = eventsToTranscript(data.events);
      if (!transcript) throw new Error("Caption track had no text");
      return transcript;
    }
    if (trimmed.startsWith("WEBVTT")) {
      const transcript = vttToTranscript(trimmed);
      if (!transcript) throw new Error("Caption track had no text");
      return transcript;
    }
    const transcript = xmlToTranscript(trimmed);
    if (!transcript) throw new Error("Caption track had no text");
    return transcript;
  }

  function metadataFromPlayer(playerResponse, href) {
    const details = playerResponse?.videoDetails || {};
    const videoId = details.videoId || videoIdFromHref(href);
    return {
      title: details.title || "",
      videoId,
      url: watchUrlFromId(videoId) || href || "",
    };
  }

  global.YTB = global.YTB || {};
  global.YTB.captions = {
    extractBalancedObject,
    parsePlayerResponseFromScripts,
    listCaptionTracks,
    pickCaptionTrack,
    withJson3,
    withFmt,
    captionFetchUrls,
    parseTranscriptPayload,
    metadataFromPlayer,
    videoIdFromHref,
    watchUrlFromId,
    eventsToTranscript,
    xmlToTranscript,
    vttToTranscript,
    linesToTranscript,
    transcriptButtonMatch,
    buildInnertubePlayerBody,
    INNERTUBE_CLIENTS,
  };
})(typeof globalThis !== "undefined" ? globalThis : self);
