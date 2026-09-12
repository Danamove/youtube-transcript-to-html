# YouTube Brief Prompt

A Chrome extension that copies a Hebrew-brief prompt plus a YouTube caption transcript. Paste that payload into Claude Code or Codex and let that agent write the RTL HTML file.

The extension does not call an LLM and does not need an API key.

## Load unpacked

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this repository folder (the one that contains `manifest.json`)
4. Open a YouTube video that has captions
5. Click **Copy prompt + transcript** on the page (top-right) or in the extension popup
6. Paste into Claude Code or Codex

If the clipboard rejects a very long transcript, the extension downloads the same payload as a `.txt` file.

## What gets copied

1. The conversion prompt: Hebrew HTML brief, logical sections, **נקודות בולטות**, and **פרק בונוס — ליישום בעבודה**
2. Video title, URL, id, and which caption track was used
3. The full cleaned transcript

Hebrew captions are preferred, then English, then the first available track. Manual captions beat auto-captions when scores are close.

Videos with no captions show an error instead of copying an empty payload.

## Preview the target HTML

The agent should save a single RTL file, not dump HTML in chat. A sample of that format lives in [`preview/sample-brief.html`](preview/sample-brief.html).

```bash
python3 -m http.server 47291 --directory preview
```

Then open [http://127.0.0.1:47291](http://127.0.0.1:47291).

## Tests

```bash
node scripts/test-lib.js
```

## Permissions

- `clipboardWrite` — copy the payload
- `activeTab` / `scripting` — talk to the current YouTube tab from the popup
- Host access to YouTube — read caption tracks and fetch timed text
