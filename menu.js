(function () {
  const CONTAINER_ID = "menu-container";
  const MENU_URL = "menu.html";

  function openMenu() {
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
  }

  async function ensureMenuLoaded() {
    const container = document.getElementById(CONTAINER_ID);
    if (!container) return;

    if (container.dataset.loaded === "1") return;

    const res = await fetch(MENU_URL, { cache: "no-store" });
    const html = await res.text();
    container.innerHTML = html;
    container.dataset.loaded = "1";
  }

  document.addEventListener("DOMContentLoaded", () => {
    ensureMenuLoaded().catch(console.error);
  });

  document.addEventListener("click", async (e) => {
    if (e.target.closest("[data-menu-open]")) {
      await ensureMenuLoaded().catch(console.error);
      openMenu();
      return;
    }

    if (e.target.closest("[data-menu-close]")) {
      closeMenu();
      return;
    }

    const link = e.target.closest("#" + CONTAINER_ID + " nav a");
    if (link) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
})();
