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
        top: 0;
        right: 0;
        left: 0;
        bottom: 0;
        inset: 0;
        background: black;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        text-align: center;
        font-size: var(--font);
        z-index: 99999;
      `;
      overlay.innerHTML = `
        <p><b>Esta app funciona solo en modo horizontal</b></p>
        <p>Por favor, gira tu dispositivo.</p>
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

//Pantalla encendida//
let wakeLock = null;

async function keepScreenAwake() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log("✅ Pantalla bloqueada encendida");
      // Si el bloqueo se libera (por ejemplo, al minimizar la app)
      wakeLock.addEventListener('release', () => {
        console.log("⚠️ WakeLock liberado");
      });
    } else {
      console.warn("WakeLock no soportado en este navegador");
    }
  } catch (err) {
    console.error("Error al solicitar WakeLock:", err);
  }
}

// Reactiva si vuelve a ser visible
document.addEventListener("visibilitychange", () => {
  if (wakeLock !== null && document.visibilityState === "visible") {
    keepScreenAwake();
  }
});

// Llamar una vez, después de interacción del usuario
document.addEventListener("click", keepScreenAwake, { once: true });