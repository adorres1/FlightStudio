export async function installThemeUI() {
  let theme = "light";
  try { theme = localStorage.getItem("flightstudio-theme") || theme; } catch {}
  try { theme = await window.flightStudioPrefs?.getTheme() || theme; } catch {}
  const selector = document.getElementById("theme");
  const apply = (value) => {
    theme = value === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    selector.value = theme;
  };
  apply(theme);
  selector.onchange = async () => {
    apply(selector.value);
    try { localStorage.setItem("flightstudio-theme", theme); } catch {}
    try { await window.flightStudioPrefs?.setTheme(theme); } catch {}
  };
}
