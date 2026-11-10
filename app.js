/* Memento — prototipo.
   Este archivo no tiene textos: todo lo que se lee en la página está en index.html
   (las páginas, el bloque "TEXTOS QUE APARECEN" y los "PERFILES DE EJEMPLO").
   Aquí solo se muestra la vista según la URL, se rellenan las plantillas y se maneja la interacción. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 9);
const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const clon = id => $('#' + id).content.firstElementChild.cloneNode(true);
const leer = k => { try { return localStorage.getItem(k); } catch { return null; } };
const escribir = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
const modoPruebasLocal = (location.hostname === 'miacunaparra.github.io' && location.pathname.startsWith('/gruta/'))
  || new URLSearchParams(location.search).get('modo') === 'pruebas';
const claveDatosPrueba = 'memento.gruta.pruebas.v1';
const configSupabase = window.MEMENTO_SUPABASE_CONFIG;
const clienteSupabase = !modoPruebasLocal && configSupabase?.url && configSupabase?.anonKey && window.supabase
  ? window.supabase.createClient(configSupabase.url, configSupabase.anonKey)
  : null;

// ---------- Textos (vienen del bloque #textos del HTML) ----------
// texto('pista-seleccion', { nombre: 'Carta' }) → "Elige otro recuerdo para unirlo con «Carta»."
const texto = (clave, datos = {}) =>
  ($(`#textos [data-texto="${clave}"]`)?.textContent.trim() ?? clave).replace(/\{(\w+)\}/g, (_, k) => datos[k] ?? '');
const cuenta = (n, clave) => texto(`${clave}-${n === 1 ? 'uno' : 'varios'}`, { n });
const tituloBase = document.title;

// ---------- Datos (los ejemplos vienen del bloque #ejemplos del HTML) ----------
const limpio = el => (el ? el.textContent.replace(/\s+/g, ' ').trim() : '');
const dato = (el, nombre) => limpio($(`:scope > [data-dato="${nombre}"]`, el));
const ejemplos = $('#ejemplos').content;
// Si alguien edita los ejemplos en el HTML, la firma cambia y se vuelven a cargar.
const firma = [...$('#ejemplos').innerHTML].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);

function semilla() {
  const perfiles = $$('article', ejemplos).map(a => ({
    id: a.dataset.codigo, hue: +a.dataset.tono || 30, foto: a.dataset.foto || '',
    direccion: a.dataset.direccion || '',
    latitud: a.dataset.latitud || '', longitud: a.dataset.longitud || '',
    nombre: dato(a, 'nombre'), relacion: dato(a, 'relacion'), nacimiento: dato(a, 'nacimiento'),
    partida: dato(a, 'partida'), frase: dato(a, 'frase'), bio: dato(a, 'bio'),
    objetos: $$('.recuerdo', a).map(r => ({
      id: r.dataset.codigo, tipo: r.dataset.tipo, x: +r.dataset.x || 50, y: +r.dataset.y || 50, foto: r.dataset.foto || '',
      nombre: dato(r, 'nombre'), fecha: dato(r, 'fecha'), lugar: dato(r, 'lugar'), descripcion: dato(r, 'descripcion'),
      historia: $$('[data-dato=historia] p', r).map(limpio).join('\n\n')
    })),
    conexiones: $$('.hilo', a).map((h, i) => {
      const [uno, otro] = h.dataset.une.trim().split(/\s+/);
      return { id: `${a.dataset.codigo}-${i}`, a: uno, b: otro, nota: limpio(h) };
    })
  }));
  return { firma, perfiles };
}

const referencias = semilla().perfiles.map(p => ({ ...p, soloLectura: true }));
let estado = null, usuarioActual = null, errorRespaldo = false, authLista = false, errorCarga = '';
let colaRespaldo = Promise.resolve();

let actual = {}, modo = leer('memento.modo') || 'constelacion', uniendo = false, seleccion = null;

const perfilesVisibles = () => [...(estado?.perfiles || []), ...referencias];
const perfilValido = p => p && typeof p.id === 'string' && typeof p.nombre === 'string'
  && Array.isArray(p.objetos) && p.objetos.every(o => o && typeof o.id === 'string')
  && Array.isArray(p.conexiones) && p.conexiones.every(c => c && typeof c.a === 'string' && typeof c.b === 'string');

if (modoPruebasLocal) {
  try {
    const guardado = leer(claveDatosPrueba);
    if (guardado) {
      const datos = JSON.parse(guardado);
      if (datos.version !== 1 || !Array.isArray(datos.perfiles) || datos.perfiles.some(p => !perfilValido(p))) {
        throw new Error('Los datos de prueba guardados no tienen el formato esperado.');
      }
      estado = { firma, perfiles: datos.perfiles };
    } else {
      estado = { firma, perfiles: [] };
    }
    $('#estado-respaldo').textContent = 'Modo de prueba: los cambios se guardan solo en este navegador.';
  } catch (error) {
    console.error('No se pudieron cargar los datos locales de prueba.', error);
    errorCarga = 'No se pudieron cargar los datos de prueba de este navegador.';
    $('#estado-respaldo').textContent = errorCarga;
  }
}

let recuerdosAlbum = [], indiceAlbum = 0, albumCargando = false, albumListo = false, albumPromesa, albumTimer;

const mezclar = elementos => {
  const resultado = [...elementos];
  for (let i = resultado.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [resultado[i], resultado[j]] = [resultado[j], resultado[i]];
  }
  return resultado;
};

function guardar() {
  if (!estado) return;
  const respaldo = { version: 1, perfiles: JSON.parse(JSON.stringify(estado.perfiles)) };
  if (modoPruebasLocal) {
    const guardado = escribir(claveDatosPrueba, JSON.stringify(respaldo));
    errorRespaldo = !guardado;
    $('#estado-respaldo').textContent = guardado
      ? 'Modo de prueba: los cambios se guardaron en este navegador.'
      : 'No se pudieron guardar los datos de prueba. Libera espacio e inténtalo de nuevo.';
    $('#reintentar-respaldo').hidden = guardado;
    if (!guardado) aviso('No se pudieron guardar los datos de prueba.');
    return Promise.resolve();
  }
  if (!usuarioActual || !clienteSupabase) return;
  const userId = usuarioActual.id;
  $('#estado-respaldo').textContent = 'Guardando respaldo…';
  errorRespaldo = false;
  colaRespaldo = colaRespaldo.then(async () => {
    if (usuarioActual?.id !== userId) return;
    const { error } = await clienteSupabase.from('user_backups').upsert({
      user_id: userId, payload: respaldo, updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
    if (usuarioActual?.id === userId) {
      errorRespaldo = false;
      $('#estado-respaldo').textContent = 'Respaldo actualizado.';
      $('#reintentar-respaldo').hidden = true;
    }
  }).catch(error => {
    console.error('No se pudo guardar el respaldo de la cuenta.', error);
    if (usuarioActual?.id === userId) {
      errorRespaldo = true;
      $('#estado-respaldo').textContent = 'No se pudo actualizar el respaldo. Revisa tu conexión e inténtalo de nuevo.';
      $('#reintentar-respaldo').hidden = false;
      aviso('No se pudo actualizar el respaldo.');
    }
  });
  return colaRespaldo;
}

const importacionesLocales = new Set();
function perfilesLegado() {
  const valor = leer('memento.v1');
  if (!valor) return [];
  try {
    const legado = JSON.parse(valor);
    if (!Array.isArray(legado.perfiles) || legado.perfiles.some(p => !perfilValido(p))) {
      throw new Error('Los datos locales no tienen el formato esperado.');
    }
    return legado.perfiles;
  } catch (error) {
    console.error('No se pudieron leer los datos anteriores de este navegador.', error);
    return [];
  }
}

function actualizarImportacionLocal() {
  const importacionId = `memento.importado.${usuarioActual?.id}`;
  const yaImportado = importacionesLocales.has(importacionId) || leer(importacionId) === 'si';
  $('#importar-datos-locales').hidden = yaImportado || perfilesLegado().length === 0;
}

async function importarDatosLocales() {
  if (!estado || !usuarioActual) return;
  const perfiles = perfilesLegado();
  if (!perfiles.length) {
    $('#importar-datos-locales').hidden = true;
    return;
  }
  const confirmado = window.confirm(
    `Se copiarán ${perfiles.length} altares guardados en este navegador a la cuenta ${usuarioActual.email}. `
    + 'La copia puede incluir los perfiles de ejemplo guardados localmente. Los datos locales no se borrarán. ¿Continuar?'
  );
  if (!confirmado) return;

  const boton = $('#importar-datos-locales');
  const userId = usuarioActual.id;
  const estadoCuenta = estado;
  const anteriores = estado.perfiles;
  boton.disabled = true;
  $('#cerrar-sesion').disabled = true;
  try {
    const copias = perfiles.map(perfil => {
      const copia = JSON.parse(JSON.stringify(perfil));
      const idsObjetos = new Map(copia.objetos.map(objeto => [objeto.id, uid()]));
      copia.id = uid();
      copia.objetos.forEach(objeto => { objeto.id = idsObjetos.get(objeto.id); });
      copia.conexiones = copia.conexiones
        .filter(conexion => idsObjetos.has(conexion.a) && idsObjetos.has(conexion.b))
        .map(conexion => ({
          ...conexion, id: uid(), a: idsObjetos.get(conexion.a), b: idsObjetos.get(conexion.b)
        }));
      delete copia.velas;
      delete copia.soloLectura;
      return copia;
    });
    estado.perfiles = [...anteriores, ...copias];
    render();
    await guardar();
    await colaRespaldo;
    if (estado !== estadoCuenta || usuarioActual?.id !== userId) return;
    if (errorRespaldo) {
      estado.perfiles = anteriores;
      render();
      return;
    }
    const clave = `memento.importado.${userId}`;
    importacionesLocales.add(clave);
    if (!escribir(clave, 'si')) {
      $('#estado-respaldo').textContent = 'Importación respaldada. No pudimos registrar en este navegador que ya se importó; evita repetirla.';
    }
    actualizarImportacionLocal();
    aviso('Los altares anteriores ya están respaldados en esta cuenta.');
  } catch (error) {
    if (estado === estadoCuenta) {
      estado.perfiles = anteriores;
      render();
    }
    console.error('No se pudieron importar los datos anteriores.', error);
    aviso('No se pudieron importar los datos anteriores.');
  } finally {
    boton.disabled = false;
    $('#cerrar-sesion').disabled = false;
  }
}

const fecha = v => {
  const [a, m, d] = (v || '').split('-');
  return d ? new Date(a, m - 1, d).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' }) : v || '';
};
function coordenada(valor, limite) {
  if (valor === '' || valor === null || valor === undefined) return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && Math.abs(numero) <= limite ? numero : null;
}
const anio = v => (v || '').slice(0, 4);
const rango = (p, formato) => {
  const a = formato(p.nacimiento), b = formato(p.partida);
  return a && b && a !== b ? texto('rango', { desde: a, hasta: b }) : b || a;
};
const ordenados = p => [...p.objetos].sort((a, b) => (a.fecha || '9').localeCompare(b.fecha || '9'));
const rutaObjeto = (p, o) => `#/perfil/${p.id}/objeto/${o.id}`;

// Pone texto en cada [data-campo] del bloque; si queda vacío, lo oculta.
function llenar(raiz, datos) {
  for (const el of $$('[data-campo]', raiz)) {
    if (!(el.dataset.campo in datos)) continue;
    const v = datos[el.dataset.campo] ?? '';
    el.textContent = v;
    el.hidden = v === '';
  }
}
function visual(el, o) {
  const icono = ['zapatito', 'osito', 'mechon', 'pulsera', 'chupete', 'foto', 'ecografia', 'carta', 'dibujo', 'vhs', 'cajita', 'mantita', 'autito', 'flor', 'diente', 'sonajero'].includes(o.tipo)
    ? o.tipo : 'cajita';
  el.innerHTML = o.foto ? '<img alt="">' : `<svg class="icono" viewBox="0 0 64 64"><use href="#i-${icono}"/></svg>`;
  if (o.foto) el.firstChild.src = o.foto;
}
function retrato(el, p) {
  el.innerHTML = p.foto ? '<img alt="">' : '<span class="inicial" aria-hidden="true"></span>';
  el.firstChild[p.foto ? 'src' : 'textContent'] = p.foto || p.nombre.charAt(0);
}

// ---------- Vistas ----------
function render(nueva) {
  const [, v, pid, , oid] = location.hash.split('/');
  const p = perfilesVisibles().find(x => x.id === pid);
  const o = p?.objetos.find(x => x.id === oid);
  const vista = !v ? 'inicio' : v === 'coleccion' || v === 'explorar' ? v : o ? 'objeto' : p && !oid ? 'perfil' : 'nada';
  actual = { p, o };

  $$('[data-vista]').forEach(s => (s.hidden = s.dataset.vista !== vista));
  if (vista === 'coleccion') pintarColeccion();
  if (vista === 'explorar') pintarExplorar();
  if (vista === 'perfil') pintarPerfil();
  if (vista === 'objeto') pintarObjeto();

  document.title = [o?.nombre || p?.nombre, tituloBase].filter(Boolean).join(' · ');
  const navActual = vista === 'inicio' ? 'inicio' : vista === 'explorar' ? 'explorar' : 'coleccion';
  $$('[data-nav]').forEach(a => a.dataset.nav === navActual
    ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  if (!modoPruebasLocal && authLista && vista === 'coleccion' && !usuarioActual && !$('#acceso').open) {
    mostrarAcceso(!clienteSupabase
      ? 'Falta configurar Supabase para entrar a Mi altar. Sigue las instrucciones de mixi-app/SUPABASE.md.'
      : errorCarga);
  }
  if (nueva) {
    scrollTo(0, 0);
    $('#vista').animate([{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }],
      { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }
}

function pintarColeccion() {
  const lista = $('#perfiles');
  $('.perfil-tarjeta.nueva', lista).hidden = (!usuarioActual && !modoPruebasLocal) || !estado;
  $$('.perfil-tarjeta:not(.nueva)', lista).forEach(n => n.remove());
  lista.prepend(...perfilesVisibles().map(p => {
    const n = clon('t-perfil');
    n.href = '#/perfil/' + p.id;
    n.style.setProperty('--h', p.hue);
    n.classList.toggle('referencia', !!p.soloLectura);
    retrato($('.retrato', n), p);
    llenar(n, {
      nombre: p.nombre, anios: rango(p, anio), frase: p.frase,
      recuerdos: cuenta(p.objetos.length, 'recuerdos'),
      referencia: p.soloLectura ? 'Ejemplo de referencia · solo lectura' : ''
    });
    return n;
  }));
}

function pintarExplorar() {
  if (!albumListo && !albumPromesa) albumPromesa = cargarAlbum();
}

function recuerdosDeEjemplo() {
  return referencias.filter(p => !p.privado).flatMap(p => p.objetos.map(o => ({
    altar: p.nombre, nombre: o.nombre, tipo: o.tipo, fecha: o.fecha,
    descripcion: o.descripcion, historia: o.historia, foto: o.foto
  })));
}

async function cargarAlbum() {
  albumCargando = true;
  $('#album-mensaje').textContent = 'Reuniendo recuerdos publicados…';
  $('#album-mezclar').disabled = true;
  const ejemplos = recuerdosDeEjemplo();
  let publicados = [];
  try {
    if (!clienteSupabase) {
      $('#album-mensaje').textContent = 'Se muestran recuerdos de ejemplo. La colección compartida estará disponible al configurar el servicio.';
    } else {
      const { data, error } = await clienteSupabase.rpc('get_public_memories');
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error('El servicio devolvió un formato de recuerdos no válido.');
      publicados = data.filter(recuerdo => recuerdo && typeof recuerdo.nombre === 'string').map(recuerdo => ({
        altar: typeof recuerdo.altar === 'string' ? recuerdo.altar : 'Un altar',
        nombre: recuerdo.nombre,
        tipo: typeof recuerdo.tipo === 'string' ? recuerdo.tipo : '',
        fecha: typeof recuerdo.fecha === 'string' ? recuerdo.fecha : '',
        descripcion: typeof recuerdo.descripcion === 'string' ? recuerdo.descripcion : '',
        historia: typeof recuerdo.historia === 'string' ? recuerdo.historia : '',
        foto: typeof recuerdo.foto === 'string' ? recuerdo.foto : ''
      }));
      $('#album-mensaje').textContent = publicados.length
        ? 'Se mezclan recuerdos de ejemplo con recuerdos publicados en altares no privados.'
        : ejemplos.length
          ? 'Aún no hay recuerdos publicados en altares no privados; se muestran los recuerdos de ejemplo.'
          : 'Aún no hay recuerdos publicados en altares no privados.';
    }
  } catch (error) {
    console.error('No se pudieron cargar los recuerdos publicados para el álbum.', error);
    $('#album-mensaje').textContent = 'No se pudieron cargar todos los recuerdos publicados. Mostramos los ejemplos disponibles.';
  }
  recuerdosAlbum = mezclar([...ejemplos, ...publicados]);
  indiceAlbum = 0;
  albumListo = true;
  albumCargando = false;
  $('#album-mezclar').disabled = false;
  pintarPaginas();
}

function fuenteImagenPublica(foto) {
  if (/^data:image\/(?:jpeg|png|webp);base64,[a-z\d+/]+=*$/i.test(foto)) return foto;
  if (foto.startsWith('files/') && !foto.split('/').some(parte => !parte || parte === '.' || parte === '..')) {
    const url = new URL(foto, document.baseURI);
    if (url.protocol === 'https:' || url.protocol === 'file:') return url.href;
  }
  try {
    const url = new URL(foto);
    return url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

function paginaAlbum(recuerdo, posicion) {
  const pagina = document.createElement('article');
  pagina.className = 'album-pagina';
  pagina.setAttribute('aria-label', recuerdo ? `Recuerdo ${posicion + 1}` : 'Página vacía');
  if (!recuerdo) return pagina;

  const marco = document.createElement('div');
  marco.className = 'album-marco';
  const fuente = fuenteImagenPublica(recuerdo.foto);
  if (fuente) {
    const foto = document.createElement('img');
    foto.className = 'album-foto';
    foto.src = fuente;
    foto.alt = `${recuerdo.nombre}, recuerdo del altar de ${recuerdo.altar}`;
    foto.loading = 'lazy';
    marco.append(foto);
  } else {
    const sello = document.createElement('div');
    sello.className = 'album-sello';
    const iconos = ['zapatito', 'osito', 'mechon', 'pulsera', 'chupete', 'foto', 'ecografia', 'carta', 'dibujo', 'vhs', 'cajita', 'mantita', 'autito', 'flor', 'diente', 'sonajero'];
    const icono = iconos.includes(recuerdo.tipo?.toLowerCase()) ? recuerdo.tipo.toLowerCase() : 'cajita';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'icono');
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${icono}`);
    svg.append(use);
    sello.append(svg);
    marco.append(sello);
  }

  const pie = document.createElement('div');
  pie.className = 'album-pie';
  const altar = document.createElement('p');
  altar.className = 'album-altar';
  altar.textContent = recuerdo.altar;
  const nombre = document.createElement('h2');
  nombre.textContent = recuerdo.nombre;
  const tipoFecha = document.createElement('p');
  tipoFecha.className = 'album-meta';
  tipoFecha.textContent = [recuerdo.tipo ? nombreTipo(recuerdo.tipo) : '', recuerdo.fecha ? fecha(recuerdo.fecha) : ''].filter(Boolean).join(' · ');
  pie.append(altar, nombre);
  if (tipoFecha.textContent) pie.append(tipoFecha);
  const textoRecuerdo = recuerdo.descripcion || recuerdo.historia;
  if (textoRecuerdo) {
    const descripcion = document.createElement('p');
    descripcion.className = 'album-descripcion';
    descripcion.textContent = textoRecuerdo;
    pie.append(descripcion);
  }
  pagina.append(marco, pie);
  return pagina;
}

function pintarPaginas() {
  const izquierda = recuerdosAlbum[indiceAlbum];
  const derecha = recuerdosAlbum[indiceAlbum + 1];
  const paginaIzquierda = paginaAlbum(izquierda, indiceAlbum);
  paginaIzquierda.id = 'pagina-izquierda';
  $('#pagina-izquierda').replaceWith(paginaIzquierda);
  const paginaDerecha = paginaAlbum(derecha, indiceAlbum + 1);
  paginaDerecha.id = 'pagina-derecha';
  $('#pagina-derecha').replaceWith(paginaDerecha);
  $('#album-estado').textContent = recuerdosAlbum.length
    ? `${indiceAlbum + 1}–${Math.min(indiceAlbum + 2, recuerdosAlbum.length)} de ${recuerdosAlbum.length} recuerdos`
    : 'Sin recuerdos';
  $('#album-anterior').disabled = albumCargando || indiceAlbum === 0;
  $('#album-siguiente').disabled = albumCargando || indiceAlbum + 2 >= recuerdosAlbum.length;
  $('#album-mezclar').disabled = albumCargando || recuerdosAlbum.length < 2;
}

function pasarPagina(direccion) {
  if (albumCargando || !recuerdosAlbum.length) return;
  const siguiente = indiceAlbum + direccion * 2;
  if (siguiente < 0 || siguiente >= recuerdosAlbum.length) return;
  albumCargando = true;
  const hoja = $('#album-hoja');
  const frente = $('#album-frente');
  const reverso = $('#album-reverso');
  const anterior = recuerdosAlbum[indiceAlbum + (direccion > 0 ? 1 : 0)];
  const nueva = recuerdosAlbum[siguiente + (direccion > 0 ? 0 : 1)];
  frente.replaceChildren(paginaAlbum(anterior, indiceAlbum + (direccion > 0 ? 1 : 0)));
  reverso.replaceChildren(paginaAlbum(nueva, siguiente + (direccion > 0 ? 0 : 1)));
  hoja.className = `album-hoja ${direccion > 0 ? 'pasar-siguiente' : 'pasar-anterior'}`;
  hoja.hidden = false;
  $('#album-anterior').disabled = true;
  $('#album-siguiente').disabled = true;
  $('#album-mezclar').disabled = true;
  clearTimeout(albumTimer);
  albumTimer = setTimeout(() => {
    indiceAlbum = siguiente;
    hoja.hidden = true;
    albumCargando = false;
    pintarPaginas();
  }, 720);
}

function mezclarAlbum() {
  if (albumCargando || recuerdosAlbum.length < 2) return;
  recuerdosAlbum = mezclar(recuerdosAlbum);
  indiceAlbum = 0;
  pintarPaginas();
}

$('#album-anterior').addEventListener('click', () => pasarPagina(-1));
$('#album-siguiente').addEventListener('click', () => pasarPagina(1));
$('#album-mezclar').addEventListener('click', mezclarAlbum);
document.addEventListener('keydown', e => {
  if (location.hash !== '#/explorar' || e.altKey || e.ctrlKey || e.metaKey
    || e.target.closest('input, textarea, select, button, a, [contenteditable=true]')) return;
  if (e.key === 'ArrowLeft') pasarPagina(-1);
  if (e.key === 'ArrowRight') pasarPagina(1);
});

function pintarPerfil() {
  const { p } = actual, sec = $('[data-vista=perfil]'), hay = p.objetos.length;
  sec.style.setProperty('--h', p.hue);
  retrato($('.retrato', sec), p);
  llenar(sec, { nombre: p.nombre, relacion: p.relacion || texto('relacion-vacia'), fechas: rango(p, fecha) || texto('fechas-vacias'), frase: p.frase, bio: p.bio });
  $('#perfil-referencia').hidden = !p.soloLectura;
  $('.perfil-cabecera .acciones', sec).hidden = !!p.soloLectura;
  $('.archivo-barra .herramientas', sec).hidden = !!p.soloLectura;
  $('#vacio [data-accion="nuevo-objeto"]').hidden = !!p.soloLectura;
  $$('[data-modo]').forEach(b => b.setAttribute('aria-pressed', b.dataset.modo === modo));
  const unir = $('#btn-unir');
  unir.hidden = modo !== 'constelacion' || hay < 2;
  unir.setAttribute('aria-pressed', uniendo);
  $('span', unir).textContent = texto(uniendo ? 'terminar-unir' : 'unir');

  const pista = $('#pista'), sel = p.objetos.find(o => o.id === seleccion);
  pista.textContent = p.soloLectura ? 'Este altar es un ejemplo de referencia y no se puede editar.'
    : modo === 'vitrina' ? texto('pista-vitrina') : !uniendo ? texto('pista-normal')
      : sel ? texto('pista-seleccion', { nombre: sel.nombre }) : texto('pista-uniendo');
  pista.classList.toggle('activa', uniendo);
  $('#vacio').hidden = hay > 0;

  const cons = $('#constelacion');
  cons.hidden = !hay || modo !== 'constelacion';
  cons.classList.toggle('uniendo', uniendo);
  $$('.nodo', cons).forEach(n => n.remove());
  cons.append(...p.objetos.map(o => {
    const n = clon('t-nodo');
    n.dataset.oid = o.id;
    n.style.left = o.x + '%';
    n.style.top = o.y + '%';
    n.setAttribute('aria-label', o.nombre);
    n.classList.toggle('seleccionado', o.id === seleccion);
    visual($('.nodo-visual', n), o);
    llenar(n, { nombre: o.nombre });
    return n;
  }));
  dibujarHilos();

  const vit = $('#vitrina');
  vit.hidden = !hay || modo !== 'vitrina';
  vit.replaceChildren(...ordenados(p).map(o => {
    const n = clon('t-pieza');
    n.href = rutaObjeto(p, o);
    visual($('.pieza-visual', n), o);
    llenar(n, { nombre: o.nombre, fecha: fecha(o.fecha) || texto('sin-fecha') });
    return n;
  }));
}

function pintarObjeto() {
  const { p, o } = actual, sec = $('[data-vista=objeto]'), lista = ordenados(p), i = lista.indexOf(o), n = lista.length;
  llenar(sec, {
    nombre: o.nombre, perfil: p.nombre, tipo: nombreTipo(o.tipo) || texto('tipo-desconocido'),
    fecha: fecha(o.fecha) || texto('sin-fecha'), lugar: o.lugar || texto('sin-lugar'), descripcion: o.descripcion,
    historia: o.historia || texto('sin-historia'), posicion: texto('posicion', { n: i + 1, total: n })
  });
  $('#enlace-perfil').href = '#/perfil/' + p.id;
  visual($('#pedestal'), o);
  $('#pedestal').classList.toggle('con-foto', !!o.foto);
  $('.objeto-nav', sec).hidden = n < 2;
  $('#anterior').href = rutaObjeto(p, lista[(i - 1 + n) % n]);
  $('#siguiente').href = rutaObjeto(p, lista[(i + 1) % n]);
  $('#foto-texto').textContent = texto(o.foto ? 'foto-cambiar' : 'foto-subir');
  $('.objeto-texto .acciones', sec).hidden = !!p.soloLectura;

  const uniones = p.conexiones.filter(c => c.a === o.id || c.b === o.id).map(c => {
    const otro = p.objetos.find(x => x.id === (c.a === o.id ? c.b : c.a)), el = clon('t-union');
    el.href = rutaObjeto(p, otro);
    visual($('.union-visual', el), otro);
    llenar(el, { nombre: otro.nombre, nota: c.nota });
    return el;
  });
  $('#uniones').replaceChildren(...uniones);
  $('#sin-uniones').hidden = uniones.length > 0;
  if (!uniones.length) $('#sin-uniones').textContent = p.soloLectura
    ? 'Este ejemplo de referencia es de solo lectura.'
    : 'Aún no está unido a otros recuerdos. Puedes tender hilos desde la constelación.';
}

const tiposLegado = {
  zapatito: 'Zapatito', osito: 'Peluche', mechon: 'Mechón de pelo', pulsera: 'Pulsera',
  chupete: 'Chupete', foto: 'Fotografía', ecografia: 'Ecografía', carta: 'Carta',
  dibujo: 'Dibujo', vhs: 'Cassette', cajita: 'Cajita', mantita: 'Mantita',
  autito: 'Juguete', flor: 'Flor', diente: 'Diente de leche', sonajero: 'Sonajero'
};
function nombreTipo(tipo) {
  return tiposLegado[tipo] || tipo;
}

// ---------- Constelación: arrastrar, unir y dibujar hilos ----------
const cons = $('#constelacion');
let arrastre = null;

function dibujarHilos() {
  const { p } = actual, w = cons.clientWidth, h = cons.clientHeight;
  if (!p || !w) return;
  $('#hilos').setAttribute('viewBox', `0 0 ${w} ${h}`);
  $('#hilos').innerHTML = p.conexiones.map(c => {
    const a = p.objetos.find(o => o.id === c.a), b = p.objetos.find(o => o.id === c.b);
    if (!a || !b) return '';
    const x1 = a.x * w / 100, y1 = a.y * h / 100, x2 = b.x * w / 100, y2 = b.y * h / 100;
    const cx = (x1 + x2) / 2 - (y2 - y1) * 0.12, cy = (y1 + y2) / 2 + (x2 - x1) * 0.12; // curva suave
    const d = `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
    return `<g class="hilo" data-cid="${c.id}"><path class="hilo-toque" d="${d}"/><path class="hilo-linea" d="${d}"/>
      <text x="${(x1 + 2 * cx + x2) / 4}" y="${(y1 + 2 * cy + y2) / 4 - 6}" text-anchor="middle">${esc(c.nota)}</text></g>`;
  }).join('');
}

cons.addEventListener('pointerdown', e => {
  const nodo = e.target.closest('.nodo');
  if (!nodo || e.button !== 0 || actual.p?.soloLectura) return;
  arrastre = { nodo, x: e.clientX, y: e.clientY, movio: false };
  nodo.setPointerCapture(e.pointerId);
});
cons.addEventListener('pointermove', e => {
  if (!arrastre || (!arrastre.movio && Math.hypot(e.clientX - arrastre.x, e.clientY - arrastre.y) < 5)) return;
  const { nodo } = arrastre, r = cons.getBoundingClientRect(), o = actual.p.objetos.find(x => x.id === nodo.dataset.oid);
  arrastre.movio = true;
  nodo.classList.add('arrastrando');
  o.x = +Math.min(93, Math.max(7, (e.clientX - r.left) / r.width * 100)).toFixed(1);
  o.y = +Math.min(84, Math.max(10, (e.clientY - r.top) / r.height * 100)).toFixed(1);
  nodo.style.left = o.x + '%';
  nodo.style.top = o.y + '%';
  dibujarHilos();
});
cons.addEventListener('pointerup', () => {
  if (!arrastre) return;
  const { nodo, movio } = arrastre;
  arrastre = null;
  nodo.classList.remove('arrastrando');
  movio ? guardar() : tocarNodo(nodo.dataset.oid);
});
cons.addEventListener('pointercancel', () => { arrastre?.nodo.classList.remove('arrastrando'); arrastre = null; guardar(); });
cons.addEventListener('click', e => {
  const hilo = e.target.closest('.hilo'), nodo = e.target.closest('.nodo');
  if (hilo && !actual.p?.soloLectura) abrirHilo(actual.p.conexiones.find(c => c.id === hilo.dataset.cid));
  else if (nodo && e.detail === 0) tocarNodo(nodo.dataset.oid); // Enter / Espacio con el teclado
});
new ResizeObserver(dibujarHilos).observe(cons);

function tocarNodo(oid) {
  const { p } = actual;
  if (p.soloLectura) return (location.hash = rutaObjeto(p, { id: oid }));
  if (!uniendo) return (location.hash = rutaObjeto(p, { id: oid }));
  if (!seleccion || seleccion === oid) {
    seleccion = seleccion === oid ? null : oid;
    return pintarPerfil();
  }
  const par = [seleccion, oid];
  seleccion = null;
  abrirHilo(p.conexiones.find(c => par.includes(c.a) && par.includes(c.b)) || { id: uid(), a: par[0], b: par[1], nota: '' });
}

// ---------- Ventanas ----------
// Rellena el formulario, lo abre y al cerrarse llama a alCerrar(datos, botón que se usó).
function abrir(d, valores, alCerrar) {
  const f = $('form', d);
  f.reset();
  for (const el of f.elements) {
    if (!el.name || el.type === 'file') continue;
    if (el.type === 'radio') el.checked = el.value === valores[el.name];
    else if (el.type === 'checkbox') el.checked = Boolean(valores[el.name]);
    else el.value = valores[el.name] ?? '';
  }
  $$('[type=file]', f).forEach(mostrarArchivo);
  d.returnValue = '';
  d.onclose = async () => {
    const datos = Object.fromEntries(new FormData(f));
    for (const el of $$('input[type=checkbox][name]', f)) datos[el.name] = el.checked;
    if (datos.foto?.size) datos.foto = await leerFoto(datos.foto);
    else delete datos.foto;
    alCerrar(datos, d.returnValue);
  };
  d.showModal();
}
function mostrarArchivo(input) {
  input.nextElementSibling.textContent = input.files[0]?.name || texto('elegir-imagen');
}
function leerFoto(archivo) {
  return new Promise(listo => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = img.width * k;
      c.height = img.height * k;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      listo(c.toDataURL('image/jpeg', 0.8));
    };
    img.src = URL.createObjectURL(archivo);
  });
}
// clave = comienzo de los textos "-titulo", "-texto" y "-boton" del bloque de textos.
function confirmar(clave, datos, accion) {
  const d = $('#d-confirmar');
  $('h2', d).textContent = texto(clave + '-titulo', datos);
  $('p', d).textContent = texto(clave + '-texto', datos);
  $('[value=ok]', d).textContent = texto(clave + '-boton', datos);
  abrir(d, {}, (_, valor) => valor === 'ok' && accion());
}

function formPerfil(p) {
  const d = $('#d-perfil');
  $('h2', d).textContent = texto(p ? 'perfil-editar' : 'perfil-nuevo');
  const formulario = $('form', d), direccion = $('[name=direccion]', formulario);
  const ubicacionEstado = $('#ubicacion-estado');
  abrir(d, p || {}, (datos, valor) => {
    if (valor !== 'ok') return;
    const tonos = [350, 20, 42, 95, 150, 190, 215, 260, 300];
    if (!p) estado.perfiles.push(p = { id: uid(), hue: tonos[Math.random() * tonos.length | 0], foto: '', privado: false, objetos: [], conexiones: [] });
    Object.assign(p, datos);
    guardar();
    ir('#/perfil/' + p.id);
  });
  const botonGuardar = $('[value=ok]', formulario);
  botonGuardar.disabled = false;
  d.oncancel = e => { if (botonGuardar.disabled) e.preventDefault(); };
  ubicacionEstado.textContent = '';
  ubicacionEstado.hidden = true;
  delete ubicacionEstado.dataset.error;
  formulario.onsubmit = async e => {
    e.preventDefault();
    const textoDireccion = direccion.value.trim();
    const latitud = $('[name=latitud]', formulario), longitud = $('[name=longitud]', formulario);
    const privado = $('[name=privado]', formulario).checked;
    botonGuardar.disabled = true;
    delete ubicacionEstado.dataset.error;
    ubicacionEstado.textContent = textoDireccion ? 'Buscando dirección…' : '';
    ubicacionEstado.hidden = !textoDireccion;
    try {
      if (textoDireccion && !privado) {
        const mismaDireccion = textoDireccion === p?.direccion
          && coordenada(p.latitud, 90) !== null && coordenada(p.longitud, 180) !== null;
        const ubicacion = mismaDireccion
          ? { latitud: p.latitud, longitud: p.longitud }
          : await buscarDireccion(textoDireccion);
        if (!ubicacion) {
          ubicacionEstado.textContent = 'No encontramos esa dirección. Prueba agregar comuna y país.';
          ubicacionEstado.dataset.error = 'true';
          ubicacionEstado.hidden = false;
          botonGuardar.disabled = false;
          return;
        }
        latitud.value = ubicacion.latitud;
        longitud.value = ubicacion.longitud;
      } else if (!textoDireccion || textoDireccion !== p?.direccion) {
        latitud.value = '';
        longitud.value = '';
      }
      direccion.value = textoDireccion;
      ubicacionEstado.textContent = '';
      d.close('ok');
    } catch (error) {
      console.error('No se pudo ubicar la dirección con OpenStreetMap Nominatim.', error);
      ubicacionEstado.textContent = 'No se pudo buscar la dirección. Revisa la conexión e inténtalo de nuevo.';
      ubicacionEstado.dataset.error = 'true';
      ubicacionEstado.hidden = false;
      botonGuardar.disabled = false;
    }
  };
}

let ultimaConsultaGeocodificador = 0;
const cacheDirecciones = new Map();
async function buscarDireccion(direccion) {
  const clave = direccion.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  if (cacheDirecciones.has(clave)) return cacheDirecciones.get(clave);

  const espera = Math.max(0, 1100 - (Date.now() - ultimaConsultaGeocodificador));
  if (espera) await new Promise(resolve => setTimeout(resolve, espera));
  ultimaConsultaGeocodificador = Date.now();

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.search = new URLSearchParams({ format: 'jsonv2', limit: '1', q: direccion });
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 10000);
  try {
    const respuesta = await fetch(url, { headers: { 'Accept-Language': 'es' }, signal: controlador.signal });
    if (!respuesta.ok) throw new Error(`Geocodificador respondió con HTTP ${respuesta.status}.`);
    const resultados = await respuesta.json();
    if (!Array.isArray(resultados)) throw new Error('Respuesta inválida del geocodificador.');
    const resultado = resultados[0];
    if (!resultado) return null;
    const latitud = coordenada(resultado.lat, 90), longitud = coordenada(resultado.lon, 180);
    if (latitud === null || longitud === null) throw new Error('El geocodificador devolvió coordenadas inválidas.');
    const ubicacion = { latitud, longitud };
    cacheDirecciones.set(clave, ubicacion);
    return ubicacion;
  } finally {
    clearTimeout(temporizador);
  }
}

function formObjeto(o) {
  const { p } = actual, d = $('#d-objeto');
  $('h2', d).textContent = texto(o ? 'recuerdo-editar' : 'recuerdo-nuevo');
  abrir(d, { ...o, tipo: nombreTipo(o?.tipo || '') }, (datos, valor) => {
    if (valor !== 'ok') return;
    if (!o) p.objetos.push(o = { id: uid(), foto: '', ...posicionLibre(p) });
    Object.assign(o, datos);
    guardar();
    render();
    aviso(texto('aviso-guardado'));
  });
}

// Busca un lugar de la constelación lejos de los demás recuerdos.
function posicionLibre(p) {
  let mejor, distancia = -1;
  for (let i = 0; i < 40; i++) {
    const x = 14 + Math.random() * 72, y = 16 + Math.random() * 62;
    const d = Math.min(...p.objetos.map(o => Math.hypot(o.x - x, o.y - y)));
    if (d > distancia) { distancia = d; mejor = { x: +x.toFixed(1), y: +y.toFixed(1) }; }
  }
  return mejor;
}

function abrirHilo(c) {
  const { p } = actual, d = $('#d-hilo'), existe = p.conexiones.includes(c);
  const nombre = id => p.objetos.find(o => o.id === id).nombre;
  $('.intro', d).textContent = texto('hilo-entre', { a: nombre(c.a), b: nombre(c.b) });
  $('[value=deshacer]', d).hidden = !existe;
  abrir(d, c, (datos, valor) => {
    if (valor) {
      p.conexiones = p.conexiones.filter(x => x !== c);
      if (valor === 'ok') p.conexiones.push({ ...c, nota: datos.nota.trim() });
      guardar();
    }
    pintarPerfil();
  });
}

// ---------- Botones con data-accion ----------
const acciones = {
  'nuevo-perfil': () => formPerfil(),
  'editar-perfil': () => formPerfil(actual.p),
  'eliminar-perfil': () => confirmar('borrar-perfil', { nombre: actual.p.nombre }, () => {
      estado.perfiles = estado.perfiles.filter(x => x !== actual.p);
      guardar();
      ir('#/coleccion');
    }),
  'modo': el => { modo = el.dataset.modo; escribir('memento.modo', modo); uniendo = false; seleccion = null; pintarPerfil(); },
  'unir': () => { uniendo = !uniendo; seleccion = null; pintarPerfil(); },
  'nuevo-objeto': () => formObjeto(),
  'editar-objeto': () => formObjeto(actual.o),
  'eliminar-objeto': () => {
    const { p, o } = actual;
    confirmar('borrar-recuerdo', { nombre: o.nombre }, () => {
      p.objetos = p.objetos.filter(x => x !== o);
      p.conexiones = p.conexiones.filter(c => c.a !== o.id && c.b !== o.id);
      guardar();
      ir('#/perfil/' + p.id);
    });
  },
};

document.addEventListener('click', e => {
  if (e.target.matches('dialog') || e.target.closest('[data-cerrar]')) {
    const dialog = e.target.closest('dialog');
    if (dialog.querySelector('[value=ok]')?.disabled) return;
    return dialog.close();
  }
  const el = e.target.closest('[data-accion]');
  if (!el) return;
  const soloLectura = new Set(['editar-perfil', 'eliminar-perfil', 'unir', 'nuevo-objeto', 'editar-objeto', 'eliminar-objeto']);
  if (actual.p?.soloLectura && soloLectura.has(el.dataset.accion)) return;
  acciones[el.dataset.accion]?.(el);
});
document.addEventListener('change', e => {
  if (e.target.closest('.campo-imagen')) mostrarArchivo(e.target);
});
$('#foto-objeto').addEventListener('change', async e => {
  if (actual.p?.soloLectura) return;
  actual.o.foto = await leerFoto(e.target.files[0]);
  e.target.value = '';
  guardar();
  render();
  aviso(texto('aviso-foto'));
});

// ---------- Navegación ----------
const ir = h => (location.hash === h ? render() : (location.hash = h));
addEventListener('hashchange', () => {
  if (location.hash && !location.hash.startsWith('#/')) return; // anclas internas como #apoyo
  uniendo = false;
  seleccion = null;
  render(true);
});

// ---------- Aviso ----------
let avisoTimer;
function aviso(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.add('visible');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => a.classList.remove('visible'), 3200);
}

// ---------- Modo día / noche ----------
const raiz = document.documentElement;
let colorPolvo = getComputedStyle(raiz).getPropertyValue('--mota');
$('#tema').addEventListener('click', () => {
  raiz.dataset.theme = getComputedStyle(raiz).colorScheme === 'dark' ? 'light' : 'dark';
  escribir('memento.tema', raiz.dataset.theme);
  colorPolvo = getComputedStyle(raiz).getPropertyValue('--mota');
});

let sesionActual = null, modoRecuperacion = false, modoRegistro = false;
let cargaCuentaId = null, cargaCuentaPromesa = null;

function mostrarAcceso(mensaje = '') {
  $('#form-acceso').hidden = !clienteSupabase;
  if (!$('#acceso').open) $('#acceso').showModal();
  $('#acceso-mensaje').textContent = mensaje;
}

function mostrarSitio() {
  authLista = true;
  errorCarga = '';
  $('#cuenta-correo').textContent = usuarioActual.email || '';
  $('#cuenta-correo').hidden = false;
  $('#cerrar-sesion').hidden = false;
  $('#seguir-explorando').hidden = false;
  if ($('#acceso').open) $('#acceso').close();
  render(true);
}

async function cargarCuenta(session) {
  if (!session) {
    sesionActual = null;
    usuarioActual = null;
    estado = null;
    modoRecuperacion = false;
    modoRegistro = false;
    $('#form-acceso').hidden = false;
    $('#form-nueva-clave').hidden = true;
    $('#crear-cuenta').hidden = false;
    $('#crear-cuenta').textContent = 'Crear cuenta';
    $('#recuperar-clave').hidden = false;
    $('#entrar').textContent = 'Iniciar sesión';
    $('#acceso h1').textContent = 'Iniciar sesión';
    $('#reintentar-carga').hidden = true;
    $('#cerrar-sesion-acceso').hidden = true;
    $('#cuenta-correo').hidden = true;
    $('#cerrar-sesion').hidden = true;
    authLista = true;
    errorCarga = '';
    if ($('#acceso').open && !modoRecuperacion) $('#acceso').close();
    render(true);
    return;
  }
  sesionActual = session;
  usuarioActual = session.user;
  if (modoRecuperacion) return;
  if (estado && estado.usuarioId === session.user.id) return;
  if (cargaCuentaId === session.user.id) return cargaCuentaPromesa;

  const userId = session.user.id;
  cargaCuentaId = userId;
  if (location.hash === '#/coleccion' || $('#acceso').open) {
    mostrarAcceso('Cargando tu respaldo…');
    $('#form-acceso').hidden = true;
    $('#reintentar-carga').hidden = true;
  }
  cargaCuentaPromesa = (async () => {
    try {
      const { data, error } = await clienteSupabase.from('user_backups')
        .select('payload').eq('user_id', userId).maybeSingle();
      if (error) throw error;
      if (sesionActual?.user?.id !== userId) return;
      let perfiles;
      if (data) {
        if (data.payload?.version !== 1 || !Array.isArray(data.payload.perfiles)
          || data.payload.perfiles.some(p => !perfilValido(p))) {
          throw new Error('El respaldo de esta cuenta tiene un formato que no se reconoce.');
        }
        perfiles = data.payload.perfiles;
      } else {
        perfiles = [];
        const { error: errorInicial } = await clienteSupabase.from('user_backups').upsert({
          user_id: userId,
          payload: { version: 1, perfiles },
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (errorInicial) throw errorInicial;
      }
      if (sesionActual?.user?.id !== userId) return;
      estado = { firma, usuarioId: userId, perfiles };
      authLista = true;
      errorRespaldo = false;
      $('#estado-respaldo').textContent = 'Respaldo sincronizado.';
      actualizarImportacionLocal();
      mostrarSitio();
    } catch (error) {
      console.error('No se pudo cargar el respaldo de la cuenta.', error);
      if (sesionActual?.user?.id === userId) {
        estado = null;
        authLista = true;
        errorCarga = 'No se pudo cargar el respaldo. Revisa la conexión y vuelve a intentarlo.';
        if ($('#acceso').open || location.hash === '#/coleccion') {
          mostrarAcceso(errorCarga);
          $('#reintentar-carga').hidden = false;
          $('#cerrar-sesion-acceso').hidden = false;
        } else render(true);
      }
    } finally {
      if (cargaCuentaId === userId) {
        cargaCuentaId = null;
        cargaCuentaPromesa = null;
      }
    }
  })();
  return cargaCuentaPromesa;
}

function mostrarErrorAcceso(error) {
  console.error('Falló la operación de cuenta.', error);
  $('#acceso-mensaje').textContent = error.message || 'No se pudo completar la operación. Inténtalo de nuevo.';
}

if (!clienteSupabase) {
  authLista = true;
  $('#form-acceso').hidden = true;
  $('#reintentar-carga').hidden = true;
  if (modoPruebasLocal && !errorCarga) {
    $('#estado-respaldo').textContent = 'Modo de prueba: los cambios se guardan solo en este navegador.';
  }
  render(true);
} else {
  clienteSupabase.auth.getSession().then(({ data, error }) => {
    if (error) throw error;
    return cargarCuenta(data.session);
  }).catch(error => {
    mostrarErrorAcceso(error);
    errorCarga = error.message || 'No se pudo comprobar la sesión. Inténtalo de nuevo.';
    authLista = true;
    render(true);
  });

  clienteSupabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION') return;
    if (event === 'PASSWORD_RECOVERY') {
      modoRecuperacion = true;
      sesionActual = session;
      usuarioActual = session?.user || null;
      estado = null;
      mostrarAcceso('Escribe una nueva contraseña para tu cuenta.');
      $('#form-acceso').hidden = true;
      $('#form-nueva-clave').hidden = false;
      $('#seguir-explorando').hidden = true;
      return;
    }
    if (event === 'SIGNED_OUT') {
      void cargarCuenta(null);
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      setTimeout(() => { void cargarCuenta(session); }, 0);
    }
  });
}

$('#crear-cuenta').addEventListener('click', () => {
  modoRegistro = !modoRegistro;
  $('#entrar').textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  $('#crear-cuenta').textContent = modoRegistro ? 'Ya tengo una cuenta' : 'Crear cuenta';
  $('#recuperar-clave').hidden = modoRegistro;
  $('#campo-clave input').autocomplete = modoRegistro ? 'new-password' : 'current-password';
  $('#acceso h1').textContent = modoRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  $('#acceso-mensaje').textContent = modoRegistro ? 'Usa una contraseña de al menos 8 caracteres.' : '';
});

$('#form-acceso').addEventListener('submit', async e => {
  e.preventDefault();
  if (!clienteSupabase) return;
  const formulario = e.currentTarget;
  const email = formulario.elements.email.value.trim();
  const password = formulario.elements.password.value;
  const boton = $('#entrar');
  boton.disabled = true;
  try {
    if (modoRegistro) {
      const { data, error } = await clienteSupabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: location.origin + location.pathname }
      });
      if (error) throw error;
      if (data.session) await cargarCuenta(data.session);
      else $('#acceso-mensaje').textContent = 'Cuenta creada. Revisa tu correo para confirmar el registro e iniciar sesión.';
    } else {
      const { data, error } = await clienteSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      await cargarCuenta(data.session);
    }
  } catch (error) {
    mostrarErrorAcceso(error);
  } finally {
    boton.disabled = false;
  }
});

$('#recuperar-clave').addEventListener('click', async () => {
  if (!clienteSupabase) return;
  const email = $('#form-acceso').elements.email.value.trim();
  if (!email) {
    $('#acceso-mensaje').textContent = 'Escribe tu correo electrónico y vuelve a intentarlo.';
    $('#form-acceso').elements.email.focus();
    return;
  }
  try {
    const { error } = await clienteSupabase.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname
    });
    if (error) throw error;
    $('#acceso-mensaje').textContent = 'Si existe una cuenta con ese correo, recibirás instrucciones para recuperar el acceso.';
  } catch (error) {
    mostrarErrorAcceso(error);
  }
});

$('#form-nueva-clave').addEventListener('submit', async e => {
  e.preventDefault();
  if (!clienteSupabase) return;
  try {
    const password = e.currentTarget.elements.password.value;
    const { data, error } = await clienteSupabase.auth.updateUser({ password });
    if (error) throw error;
    modoRecuperacion = false;
    $('#form-acceso').hidden = false;
    $('#form-nueva-clave').hidden = true;
    await cargarCuenta(data.session || sesionActual);
  } catch (error) {
    mostrarErrorAcceso(error);
  }
});

$('#reintentar-carga').addEventListener('click', async () => {
  if (!clienteSupabase) return;
  try {
    const { data, error } = await clienteSupabase.auth.getSession();
    if (error) throw error;
    await cargarCuenta(data.session);
  } catch (error) {
    mostrarErrorAcceso(error);
  }
});

$('#cerrar-sesion').addEventListener('click', async () => {
  if (!clienteSupabase) return;
  if (estado) {
    await guardar();
    await colaRespaldo;
    if (errorRespaldo) return;
  }
  try {
    location.hash = '#/explorar';
    const { error } = await clienteSupabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('No se pudo cerrar la sesión.', error);
    aviso('No se pudo cerrar la sesión. Inténtalo de nuevo.');
  }
});

$('#cerrar-sesion-acceso').addEventListener('click', async () => {
  try {
    const { error } = await clienteSupabase.auth.signOut();
    if (error) throw error;
  } catch (error) {
    console.error('No se pudo cerrar la sesión.', error);
    $('#acceso-mensaje').textContent = error.message || 'No se pudo cerrar la sesión. Inténtalo de nuevo.';
  }
});

$('#reintentar-respaldo').addEventListener('click', () => { void guardar(); });
$('#importar-datos-locales').addEventListener('click', () => { void importarDatosLocales(); });

$('#seguir-explorando').addEventListener('click', () => {
  location.hash = '#/explorar';
  $('#acceso').close();
});
$('#acceso').addEventListener('cancel', e => {
  if (modoRecuperacion) e.preventDefault();
});
$('#acceso').addEventListener('close', () => {
  $('#seguir-explorando').hidden = false;
  if (!modoPruebasLocal && !usuarioActual && location.hash === '#/coleccion') location.hash = '#/explorar';
});
