// ---------- Modo mirada (eye tracking con la cámara web) ----------
// Usa WebGazer.js: estima hacia dónde miras en la pantalla.
// Al mantener la mirada sobre un enlace, botón o recuerdo, se activa solo.
// Todo se procesa en el navegador; no se guarda ni se envía ninguna imagen.
(() => {
  const WEBGAZER = 'https://cdn.jsdelivr.net/npm/webgazer@2.1.0/dist/webgazer.js';
  const PERMANENCIA = 1200;   // ms mirando un elemento para activarlo
  const SUAVIZADO = 8;        // nº de lecturas promediadas
  const CLICS_POR_PUNTO = 3;  // clics necesarios en cada punto de calibración
  const PUNTOS = [[10, 12], [50, 12], [90, 12], [10, 50], [50, 50], [90, 50], [10, 88], [50, 88], [90, 88]];
  const ACTIVABLES = 'a[href], button:not([disabled]), .nodo, [data-accion]';

  const boton = document.getElementById('mirada');
  if (!boton) return;

  let activo = false, cargando = null, calibrando = false;
  let lecturas = [], objetivo = null, inicioObjetivo = 0, enfriamiento = 0;
  let punto, capa;

  const avisar = msg => {
    const a = document.getElementById('aviso');
    if (a) { a.textContent = msg; a.classList.add('visible'); setTimeout(() => a.classList.remove('visible'), 3600); }
  };

  function cargarLibreria() {
    if (window.webgazer) return Promise.resolve();
    return cargando ||= new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = WEBGAZER;
      s.onload = ok;
      s.onerror = () => { cargando = null; mal(new Error('No se pudo cargar WebGazer')); };
      document.head.appendChild(s);
    });
  }

  function crearPunto() {
    punto = document.createElement('div');
    punto.className = 'mirada-punto';
    punto.setAttribute('aria-hidden', 'true');
    punto.innerHTML = '<svg viewBox="0 0 40 40"><circle class="mirada-anillo" cx="20" cy="20" r="17" pathLength="100"/></svg>';
    document.body.appendChild(punto);
  }

  function alMirar(datos) {
    if (!datos || !activo || calibrando) return;
    lecturas.push([datos.x, datos.y]);
    if (lecturas.length > SUAVIZADO) lecturas.shift();
    const x = lecturas.reduce((s, l) => s + l[0], 0) / lecturas.length;
    const y = lecturas.reduce((s, l) => s + l[1], 0) / lecturas.length;
    const cx = Math.min(innerWidth - 1, Math.max(0, x)), cy = Math.min(innerHeight - 1, Math.max(0, y));
    punto.style.transform = `translate(${cx}px, ${cy}px)`;

    const ahora = performance.now();
    const el = document.elementFromPoint(cx, cy)?.closest(ACTIVABLES);
    const valido = el && el !== boton ? el : null;
    if (valido !== objetivo) {
      objetivo?.classList.remove('mirada-foco');
      objetivo = valido;
      objetivo?.classList.add('mirada-foco');
      inicioObjetivo = ahora;
    }
    const progreso = objetivo && ahora > enfriamiento ? Math.min(1, (ahora - inicioObjetivo) / PERMANENCIA) : 0;
    punto.style.setProperty('--progreso', progreso);
    if (progreso >= 1) {
      const el = objetivo;
      objetivo.classList.remove('mirada-foco');
      objetivo = null;
      enfriamiento = ahora + 900;
      punto.style.setProperty('--progreso', 0);
      el.click();
    }
  }

  function calibrar() {
    calibrando = true;
    webgazer.showVideoPreview(true).showFaceOverlay(true).showFaceFeedbackBox(true);
    capa = document.createElement('div');
    capa.className = 'mirada-calibracion';
    capa.innerHTML = `
      <div class="mirada-instrucciones">
        <p class="antetitulo">Modo mirada · calibración</p>
        <p>Ubica tu cara dentro del recuadro de la cámara. Luego <strong>mira cada punto y haz clic en él ${CLICS_POR_PUNTO} veces</strong> hasta que se apague.</p>
        <button class="btn btn-texto" type="button" data-mirada="cancelar">Cancelar</button>
      </div>
      ${PUNTOS.map(([x, y]) => `<button type="button" class="mirada-objetivo" style="left:${x}%;top:${y}%" data-restantes="${CLICS_POR_PUNTO}" aria-label="Punto de calibración"></button>`).join('')}`;
    document.body.appendChild(capa);
    return new Promise(ok => {
      let pendientes = PUNTOS.length;
      capa.addEventListener('click', e => {
        if (e.target.closest('[data-mirada="cancelar"]')) return ok(false);
        const p = e.target.closest('.mirada-objetivo');
        if (!p || p.disabled) return;
        const r = +p.dataset.restantes - 1;
        p.dataset.restantes = r;
        p.style.setProperty('--hecho', 1 - r / CLICS_POR_PUNTO);
        if (r <= 0) { p.disabled = true; if (--pendientes === 0) ok(true); }
      });
    }).then(listo => {
      capa.remove(); capa = null; calibrando = false;
      webgazer.showVideoPreview(false).showFaceOverlay(false).showFaceFeedbackBox(false);
      return listo;
    });
  }

  async function encender() {
    boton.disabled = true;
    try {
      await cargarLibreria();
      webgazer.params.showVideoPreview = true;
      webgazer.saveDataAcrossSessions(false);
      await webgazer.setRegression('ridge').setGazeListener(alMirar).begin();
      webgazer.showPredictionPoints(false);
    } catch (e) {
      console.error(e);
      boton.disabled = false;
      try { window.webgazer?.end(); } catch {}
      return avisar('No se pudo usar la cámara. Revisa los permisos del navegador.');
    }
    boton.disabled = false;
    activo = true;
    boton.setAttribute('aria-pressed', 'true');
    document.documentElement.classList.add('con-mirada');
    if (!punto) crearPunto();
    if (!(await calibrar())) return apagar();
    lecturas = [];
    avisar('Modo mirada activo: mantén la vista sobre algo para abrirlo. Esc para salir.');
  }

  function apagar() {
    activo = false;
    calibrando = false;
    capa?.remove(); capa = null;
    objetivo?.classList.remove('mirada-foco'); objetivo = null;
    punto?.remove(); punto = null;
    try { webgazer.end(); } catch {}
    // Asegura que la cámara quede apagada
    document.querySelectorAll('#webgazerVideoFeed').forEach(v => v.srcObject?.getTracks().forEach(t => t.stop()));
    boton.setAttribute('aria-pressed', 'false');
    document.documentElement.classList.remove('con-mirada');
  }

  boton.addEventListener('click', () => (activo ? apagar() : encender()));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && activo) apagar(); });
})();
