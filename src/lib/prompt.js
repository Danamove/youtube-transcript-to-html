(function (global) {
  const BRIEF_PROMPT = `Convert a YouTube transcript or podcast transcript into a readable HTML document, written in HEBREW, optimized for reading instead of watching/scrolling the original.

Requirements:

Content:
- The entire output document must be in Hebrew: headings, TL;DR, body text, everything. Keep technical terms, product names, code, commands, and quoted prompts in their original language.
- Lead with a TL;DR ("תקציר") of 3-5 bullets: actual takeaways, not "the author discusses X".
- Then a structured breakdown with descriptive Hebrew section headers organized logically, not chronologically.
- Summarize, but don't lose information density. Preserve specific claims, numbers, names, examples, and any concrete prompts/code/commands verbatim: those are usually the highest-signal parts and summarization tends to flatten them.
- Cut filler, false starts, ads, sponsor reads, repetition, and throat-clearing.
- End with a "נקודות בולטות" (Notable) section: counterintuitive points, hot takes, surprising data, or memorable quotes.
- If the source has an FAQ or Q&A, preserve it as its own section, don't fold it into prose.
- Always include a final section titled "פרק בונוס — ליישום בעבודה": things I should implement from this video in my work, written from a tech add-on point of view. Sometimes that is a feature to build. Sometimes it is a theory, a decision question, or a thinking task. Do not invent a fake backlog if the video is conceptual — give me the thinking work.

Format: single HTML file using Tailwind via CDN:
- <script src="https://cdn.tailwindcss.com"></script> in the head.
- The document is in Hebrew, so it must be RTL: <html dir="rtl" lang="he"> and a layout that works correctly in RTL.
- Readable typography with a font stack that renders Hebrew well (system-ui, "Segoe UI", Arial), generous line-height (leading-relaxed or leading-7), max-w-3xl centered, prose-like spacing.
- Clear visual hierarchy: distinct heading sizes, subtle dividers between sections, callout boxes for the TL;DR, Notable, and bonus sections.
- Code blocks and example prompts in monospace with proper background and padding, wrapped in dir="ltr" inside the RTL page: they need to look quotable, not buried.
- Mobile responsive.
- No external images, no JS frameworks, no build step: pure HTML + Tailwind CDN + minimal vanilla JS only if a toggle needs it.

Behavior:
- Ask before starting if the source is unusually long, low-signal, or ambiguous in scope.
- Output the HTML as a file I can save, not inline in chat.`;

  function buildPayload({ title, url, videoId, captionLanguage, captionKind, transcript }) {
    const lines = [
      BRIEF_PROMPT,
      "",
      "---",
      "",
      "Source video",
      `Title: ${title || "(unknown title)"}`,
      `URL: ${url || "(unknown url)"}`,
      `Video ID: ${videoId || "(unknown)"}`,
      `Caption language: ${captionLanguage || "(unknown)"}`,
      `Caption kind: ${captionKind || "unknown"}`,
      "",
      "---",
      "",
      "Transcript",
      "",
      transcript.trim(),
      "",
    ];
    return lines.join("\n");
  }

  global.YTB = global.YTB || {};
  global.YTB.BRIEF_PROMPT = BRIEF_PROMPT;
  global.YTB.buildPayload = buildPayload;
})(typeof globalThis !== "undefined" ? globalThis : self);
