document.addEventListener("DOMContentLoaded", () => {
  const menuBtn = document.getElementById("menuBtn");
  const menuOverlay = document.getElementById("menuOverlay");
  const sideMenu = document.getElementById("sideMenu");

  if (!menuBtn || !menuOverlay || !sideMenu) return;

  function openMenu() {
    document.body.classList.add("menu-open");
  }

  function closeMenu() {
    document.body.classList.remove("menu-open");
  }

  menuBtn.addEventListener("click", openMenu);
  menuOverlay.addEventListener("click", closeMenu);

  // Fechar com ESC
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
});
