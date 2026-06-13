const THEME_KEY = "theme";

const getThemeBasePath = () => {
  const path = window.location.pathname;
  if (path.includes("/views/")) {
    return "../";
  }
  return "./";
};

const getTheme = () => {
  return sessionStorage.getItem(THEME_KEY) || "light";
};

const setTheme = (mode) => {
  sessionStorage.setItem(THEME_KEY, mode);
  document.documentElement.setAttribute("data-theme", mode);
  guardarPreferenciaTema(mode);
};

const toggleTheme = () => {
  const current = getTheme();
  const next = current === "dark" ? "light" : "dark";
  setTheme(next);
  actualizarIconoTema(next);
};

const actualizarIconoTema = (mode) => {
  const btn = document.getElementById("theme-toggle-btn");
  if (!btn) return;
  const icon = btn.querySelector("i");
  const label = btn.querySelector(".menu-text-option");
  if (mode === "dark") {
    icon.className = "fas fa-sun menu-icon";
    if (label) label.textContent = "Modo claro";
    btn.title = "Modo claro";
  } else {
    icon.className = "fas fa-moon menu-icon";
    if (label) label.textContent = "Modo oscuro";
    btn.title = "Modo oscuro";
  }
};

const guardarPreferenciaTema = async (mode) => {
  const usuarioId = sessionStorage.getItem("usuario_id");
  if (!usuarioId) return;
  const basePath = getThemeBasePath();
  try {
    await axios.post(
      `${basePath}api/login/login.php?setTheme`,
      { data: { usuario_id: usuarioId, theme: mode } },
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.log("Error guardando tema:", err);
  }
};

const initTheme = () => {
  const mode = getTheme();
  document.documentElement.setAttribute("data-theme", mode);
  actualizarIconoTema(mode);
  const btn = document.getElementById("theme-toggle-btn");
  if (btn) {
    btn.onclick = toggleTheme;
  }
};
