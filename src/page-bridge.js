(function () {
  window.postMessage(
    {
      source: "ytb-brief-prompt",
      type: "YTB_PLAYER_RESPONSE",
      payload: window.ytInitialPlayerResponse || null,
    },
    "*"
  );
})();
