#!/usr/bin/env node
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const context = {
  URL,
  URLSearchParams,
  globalThis: {},
};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(
  fs.readFileSync(path.join(root, "src/lib/captions.js"), "utf8"),
  context
);
vm.runInContext(
  fs.readFileSync(path.join(root, "src/lib/prompt.js"), "utf8"),
  context
);

const { captions, buildPayload, BRIEF_PROMPT } = context.YTB;

const player = {
  videoDetails: {
    title: "How we ship add-ons",
    videoId: "dQw4w9wgGcQ",
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=dQw4w9wgGcQ&amp;lang=en",
          languageCode: "en",
          kind: "asr",
          name: { simpleText: "English" },
        },
        {
          baseUrl: "https://www.youtube.com/api/timedtext?v=dQw4w9wgGcQ&lang=he",
          languageCode: "he",
          name: { simpleText: "Hebrew" },
        },
      ],
    },
  },
};

const tracks = captions.listCaptionTracks(player);
assert.equal(tracks.length, 2);
assert.equal(tracks[0].baseUrl.includes("&amp;"), false);
assert.equal(captions.pickCaptionTrack(tracks).languageCode, "he");

const json3 = JSON.stringify({
  events: [
    { tStartMs: 0, dDurationMs: 900, segs: [{ utf8: "Hello " }, { utf8: "world" }] },
    { tStartMs: 4000, dDurationMs: 800, segs: [{ utf8: "Next idea" }] },
    { tStartMs: 5000, segs: [{ utf8: "\n" }] },
  ],
});
const transcript = captions.parseTranscriptPayload(json3);
assert.match(transcript, /Hello world/);
assert.match(transcript, /Next idea/);
assert.equal(transcript.includes("\n\n"), true);

const xml = `<transcript><text start="0">First &amp; last</text><text start="1">Second</text></transcript>`;
assert.equal(captions.xmlToTranscript(xml), "First & last\nSecond");

const html = `<script>var ytInitialPlayerResponse = ${JSON.stringify(player)};</script>`;
const parsed = captions.parsePlayerResponseFromScripts([{ textContent: html }]);
assert.equal(parsed.videoDetails.videoId, "dQw4w9wgGcQ");

const payload = buildPayload({
  title: "How we ship add-ons",
  url: "https://www.youtube.com/watch?v=dQw4w9wgGcQ",
  videoId: "dQw4w9wgGcQ",
  captionLanguage: "he",
  captionKind: "manual",
  transcript,
});
assert.equal(payload.includes(BRIEF_PROMPT), true);
assert.match(payload, /פרק בונוס/);
assert.match(payload, /dQw4w9wgGcQ/);
assert.match(payload, /Hello world/);
assert.match(captions.withJson3(tracks[1].baseUrl), /fmt=json3/);

const vtt = `WEBVTT

00:00:00.000 --> 00:00:01.200
Hello world

00:00:04.000 --> 00:00:05.000
Next idea
`;
assert.equal(captions.parseTranscriptPayload(vtt), "Hello world\nNext idea");
assert.equal(
  captions.linesToTranscript(["  Hello world ", "", "Next idea"]),
  "Hello world\nNext idea"
);
assert.equal(
  captions.transcriptButtonMatch("Show transcript"),
  true
);
assert.equal(
  captions.transcriptButtonMatch("הצגת תמליל"),
  true
);
assert.equal(captions.transcriptButtonMatch("Share"), false);

const iosBody = captions.buildInnertubePlayerBody("jNQXAC9IVRw", "IOS");
assert.equal(iosBody.videoId, "jNQXAC9IVRw");
assert.equal(iosBody.context.client.clientName, "IOS");

console.log("ok");
