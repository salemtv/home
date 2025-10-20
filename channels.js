    function cambiarCanal(sel) {
      const canal = sel.value;
      localStorage.setItem('canalSeleccionado', canal);
      const iframe = document.getElementById('videoIframe');
      const loader = document.getElementById('loader');
      const badge = document.getElementById('liveBadge');
      loader.style.display = 'flex';
      badge.classList.remove('visible');
      iframe.src = `https://streamtp22.com/global1.php?stream=${canal}`;
    }

    function recargarIframe() {
      const iframe = document.getElementById('videoIframe');
      const loader = document.getElementById('loader');
      const badge = document.getElementById('liveBadge');
      loader.style.display = 'flex';
      badge.classList.remove('visible');
      iframe.src = iframe.src;
    }

    window.addEventListener('load', () => {
      const canalGuardado = localStorage.getItem('canalSeleccionado') || 'liga1max';
      document.getElementById('canalSelector').value = canalGuardado;
      const iframe = document.getElementById('videoIframe');
      const loader = document.getElementById('loader');
      const badge = document.getElementById('liveBadge');
      iframe.src = `https://streamtp22.com/global1.php?stream=${canalGuardado}`;

      iframe.onload = () => {
        loader.style.display = 'none';
        badge.classList.add('visible');
      };

      iframe.onerror = () => {
        loader.style.display = 'none';
        badge.classList.remove('visible');
      };
    });
