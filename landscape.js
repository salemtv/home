function enforceLandscape() {
  const isPortrait = window.matchMedia("(orientation: portrait)").matches;

  // Crea una pantalla de aviso si está en vertical
  const overlayId = "orientation-lock";
  let overlay = document.getElementById(overlayId);

  if (isPortrait) {
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = overlayId;
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: black;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2rem;
        text-align: center;
        padding: 1rem;
        z-index: 9999;
      `;
      overlay.innerHTML = `
        <div>
          <p>🔄 Por favor gira tu dispositivo</p>
          <p>Esta app solo funciona en modo horizontal</p>
        </div>
      `;
      document.body.appendChild(overlay);
    }
  } else {
    // Quita el overlay si está horizontal
    if (overlay) overlay.remove();
  }
}

// Escucha cambios de orientación
window.addEventListener("orientationchange", enforceLandscape);
window.addEventListener("resize", enforceLandscape);

// Ejecuta al cargar
enforceLandscape();