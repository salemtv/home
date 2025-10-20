function openInstagram() {
  // Intentar abrir la app
  window.location = "instagram://user?username=yefrysammir";

  // Programamos el fallback
  const fallback = setTimeout(function () {
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      window.location = "https://apps.apple.com/app/instagram/id389801252";
    } else if (/Android/.test(navigator.userAgent)) {
      window.location = "https://play.google.com/store/apps/details?id=com.instagram.android";
    }
  }, 1500);

  // Si la página pierde visibilidad (porque se abrió la app), cancelamos el fallback
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      clearTimeout(fallback);
    }
  }, { once: true });
}
