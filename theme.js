(() => {
  const storageKey = "openstart-theme";
  const root = document.documentElement;
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

  const savedTheme = () => {
    try {
      const value = localStorage.getItem(storageKey);
      return value === "light" || value === "dark" ? value : null;
    } catch {
      return null;
    }
  };

  const preferredTheme = () => savedTheme() || (systemDark.matches ? "dark" : "light");

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const toggle = document.querySelector("#theme-toggle");
    const icon = toggle?.querySelector(".theme-toggle-icon");
    const label = toggle?.querySelector(".theme-toggle-label");
    const next = theme === "dark" ? "light" : "dark";
    if (toggle) toggle.setAttribute("aria-label", `Switch to ${next} mode`);
    if (icon) icon.textContent = theme === "dark" ? "☀" : "☾";
    if (label) label.textContent = theme === "dark" ? "Light" : "Dark";
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#101713" : "#fffdf8");
  }

  applyTheme(preferredTheme());

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(preferredTheme());
    document.querySelector("#theme-toggle")?.addEventListener("click", () => {
      const next = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem(storageKey, next); } catch { /* Theme still works for this visit. */ }
      applyTheme(next);
    });
  });

  systemDark.addEventListener("change", () => {
    if (!savedTheme()) applyTheme(preferredTheme());
  });
})();
