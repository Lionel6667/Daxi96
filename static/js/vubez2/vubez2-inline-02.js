(function () {
  window._daxiSyncClientMapsTheme = function (theme) {
    theme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
    if (typeof window._daxiApplyClientMapsTheme === 'function') {
      window._daxiApplyClientMapsTheme(theme);
    }
  };
})();
