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
  const url = self.YTB.captions.withJson3(rawUrl);
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) {
    throw new Error(`Caption request failed (${response.status})`);
  }
  const body = await response.text();
  return self.YTB.captions.parseTranscriptPayload(body);
}
