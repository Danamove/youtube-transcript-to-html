importScripts("lib/captions.js");

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "READ_PLAYER_RESPONSE") {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ ok: false, error: "Missing tab" });
      return false;
    }
    chrome.scripting
      .executeScript({
        target: { tabId },
        world: "MAIN",
        func: () =>
          typeof ytInitialPlayerResponse === "undefined"
            ? null
            : ytInitialPlayerResponse,
      })
      .then((results) =>
        sendResponse({ ok: true, payload: results?.[0]?.result || null })
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error?.message || "Could not read the player",
        })
      );
    return true;
  }

  if (message?.type !== "FETCH_TRANSCRIPT") return false;

  fetchTranscript(message.url)
    .then((transcript) => sendResponse({ ok: true, transcript }))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: error?.message || "Could not fetch captions",
      })
    );

  return true;
});

async function fetchTranscript(rawUrl) {
  if (!rawUrl) throw new Error("Missing caption URL");
  const urls = rawUrl.includes("fmt=")
    ? [rawUrl]
    : self.YTB.captions.captionFetchUrls(rawUrl);
  let lastError = "Empty caption response";
  for (const url of urls) {
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) {
      lastError = `Caption request failed (${response.status})`;
      continue;
    }
    const body = await response.text();
    if (!body.trim()) {
      lastError = "Empty caption response";
      continue;
    }
    try {
      return self.YTB.captions.parseTranscriptPayload(body);
    } catch (error) {
      lastError = error?.message || lastError;
    }
  }
  throw new Error(lastError);
}
