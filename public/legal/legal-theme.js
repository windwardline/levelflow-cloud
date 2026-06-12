(() => {
  const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");

  function storedMode() {
    try {
      const value = window.localStorage.getItem("levelflow-theme");
      return value === "light" || value === "dark" || value === "system" ? value : "system";
    } catch {
      return "system";
    }
  }

  function applyTheme() {
    const mode = storedMode();
    document.documentElement.dataset.themeMode = mode;
    document.documentElement.dataset.theme = mode === "system" ? (themeQuery.matches ? "dark" : "light") : mode;
  }

  applyTheme();
  if (typeof themeQuery.addEventListener === "function") {
    themeQuery.addEventListener("change", applyTheme);
  } else if (typeof themeQuery.addListener === "function") {
    themeQuery.addListener(applyTheme);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === "levelflow-theme") {
      applyTheme();
    }
  });
})();
