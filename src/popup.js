const copyButton = document.getElementById("copy");
const statusEl = document.getElementById("status");

function setStatus(kind, text) {
  statusEl.className = `status ${kind}`;
  statusEl.textContent = text;
  copyButton.disabled = kind === "pending";
  copyButton.textContent =
    kind === "pending" ? "Copying…" : "Copy prompt + transcript";
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function isYouTubeWatch(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname;
    if (!host.endsWith("youtube.com")) return false;
    return (
      parsed.pathname === "/watch" ||
      parsed.pathname.startsWith("/watch") ||
      parsed.pathname.startsWith("/shorts/") ||
      parsed.pathname.startsWith("/live/")
    );
  } catch {
    return false;
  }
}

async function ensureContentScript(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "GET_WATCH_STATE" });
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: "MAIN",
      files: ["src/page-hook.js"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/lib/prompt.js", "src/lib/captions.js", "src/content.js"],
    });
    return chrome.tabs.sendMessage(tabId, { type: "GET_WATCH_STATE" });
  }
}

copyButton.addEventListener("click", async () => {
  setStatus("pending", "Fetching captions…");
  try {
    const tab = await getActiveTab();
    if (!tab?.id || !isYouTubeWatch(tab.url || "")) {
      throw new Error("Open a YouTube video first.");
    }
    await ensureContentScript(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, { type: "COPY_BRIEF" });
    if (!result?.ok) {
      throw new Error(result?.error || "Could not copy this video.");
    }
    setStatus("ok", result.message);
  } catch (error) {
    setStatus("error", error?.message || "Could not copy this video.");
  }
});

getActiveTab()
  .then((tab) => {
    if (!tab?.url) return;
    if (!isYouTubeWatch(tab.url)) {
      setStatus("", "Open a YouTube watch page, then copy from here or from the on-page button.");
    }
  })
  .catch(() => {});
