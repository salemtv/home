function checkOrientation() {
  if (window.matchMedia("(orientation: portrait)").matches) {
    document.body.innerHTML = `
      <div style="
        display:flex;
        align-items:center;
        justify-content:center;
        height:100vh;
        text-align:center;
        color:white;
        background:black;
        padding:20px;
      ">
        <p>Por favor gira tu dispositivo a modo horizontal 📺</p>
      </div>`;
  } else {
    location.reload(); // o restaurar la interfaz
  }
}

window.addEventListener("orientationchange", checkOrientation);
checkOrientation();
