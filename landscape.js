function enforceLandscape() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;

  const overlayId = "orientation-lock";
  let overlay = document.getElementById(overlayId);

  if (isPortrait) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = overlayId;
      overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: black;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        text-align: center;
        font-size: 1.2rem;
        z-index: 99999;
      `;
      overlay.innerHTML = `
        <p>📺 Esta app funciona solo en modo horizontal</p>
        <p>Gira tu dispositivo, por favor</p>
      `;
      document.body.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

// Verifica al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {
  enforceLandscape();
  // Revalida tras un breve retardo (soluciona bug de inicio en vertical)
  setTimeout(enforceLandscape, 400);
});

// Escucha rotaciones y redimensionamiento
window.addEventListener("orientationchange", enforceLandscape);
window.addEventListener("resize", enforceLandscape);