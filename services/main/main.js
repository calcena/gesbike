let hammerInstances = [];

// Variables de paginación
const REGISTROS_POR_PAGINA = 6;
window.paginaActual = 1;
window.totalPaginas = 1;

// Clave para sessionStorage
const SESSION_KEY_PAGE = 'main_pagina_actual';
const SESSION_KEY_EXPANDED = 'main_cards_expandidos';
const SESSION_KEY_VEHICULO = 'main_vehiculo_id';

const parseHtmlCardMantenimientos = (grupos) => {
  // Generar HTML para cada grupo (grupos ya vienen paginados)
  return grupos
    .map((grupo, index) => {
      const item = grupo.principal;
      const tieneRelacionados = grupo.relacionados.length > 0;
      const iconSrc = `../assets/images/icons/Vehiculos/${item.puntero}`;

      // Generar filas para registros relacionados (cada uno es clicable)
      const filasRelacionados = grupo.relacionados
        .map((rel) => `
          <div class="related-row" style="justify-content: space-around; cursor: pointer;"
               data-rel-id="${rel.id}"
               onclick="editMantenimiento('${rel.id}')">
            <img src="../assets/images/icons/Operaciones/${rel.img_operacion}" alt="Operación" class="icon-table">
            <img src="../assets/images/icons/Grupos/${rel.img_grupo}" alt="Grupo" class="icon-table">
            ${rel.img_localizacion
              ? `<img src="../assets/images/icons/Localizaciones/${rel.img_localizacion}" alt="Situación" class="icon-table">`
              : ""
            }
          </div>
        `)
        .join("");

      return `
      <div class="col-12">
        <div
          class="card shadow-sm mantenimiento-card ${tieneRelacionados ? 'has-related' : ''}"
          data-mant-id="${item.id}"
          data-mant-fecha="${item.fecha}"
          data-mant-kms="${item.kms}"
          ${tieneRelacionados ? 'title="Mantenga pulsado para expandir"' : ''}
        >
          <div class="card-body main-record d-flex align-items-center p-2">
            <img class="me-2 p-1" src="${iconSrc}" alt="Vehículo" width="40">
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-center">
                <div class="d-flex align-items-center">
                  <h6 class="mb-0 text-card-info">${formatFechaISO(item.fecha)}</h6>
                  ${tieneRelacionados ? '<span class="expand-indicator"><i class="fas fa-chevron-down"></i></span>' : ''}
                </div>
                <span name="kms" class="badge bg-primary">${item.kms}</span>
              </div>
              <div class="mt-2 d-flex justify-content-around align-items-center flex-wrap">
                <img src="../assets/images/icons/Operaciones/${item.img_operacion}" alt="Operación" class="icon-table">
                <img src="../assets/images/icons/Grupos/${item.img_grupo}" alt="Grupo" class="icon-table">
                ${item.img_localizacion
                  ? `<img src="../assets/images/icons/Localizaciones/${item.img_localizacion}" alt="Situación" class="icon-table">`
                  : ""
                }
              </div>
            </div>
          </div>
          ${tieneRelacionados ? `
          <div class="related-records">
            ${filasRelacionados}
          </div>
          ` : ''}
        </div>
      </div>
    `;
    })
    .join("");
};

// Configurar eventos de pulsación larga para cards de mantenimiento
function configurarLongPressMantenimientos() {
  const LONG_PRESS_DURATION = 800;
  const container = document.getElementById('main-cards');

  if (!container) return;

  // Limpiar listeners anteriores clonando el contenedor
  const newContainer = container.cloneNode(true);
  container.parentNode.replaceChild(newContainer, container);

  // Estado para cada card individual (usando WeakMap)
  const cardStates = new WeakMap();

  const getCardState = (card) => {
    if (!cardStates.has(card)) {
      cardStates.set(card, {
        pressTimer: null,
        isPressing: false,
        longPressTriggered: false,
        progressBar: null
      });
    }
    return cardStates.get(card);
  };

  const createProgressBar = (card) => {
    const existing = card.querySelector('.long-press-progress');
    if (existing) existing.remove();

    const bar = document.createElement('div');
    bar.className = 'long-press-progress';
    card.appendChild(bar);
    return bar;
  };

  const startPress = (card, state) => {
    if (!card.classList.contains('has-related')) return;

    // Limpiar timer previo
    if (state.pressTimer) {
      clearTimeout(state.pressTimer);
    }
    if (state.progressBar) {
      state.progressBar.remove();
    }

    state.isPressing = true;
    state.longPressTriggered = false;
    state.progressBar = createProgressBar(card);

    // Forzar reflow
    void state.progressBar.offsetWidth;

    state.progressBar.style.width = '100%';
    state.progressBar.style.transition = `width ${LONG_PRESS_DURATION}ms linear`;

    card.style.transform = 'scale(0.98)';
    card.style.transition = 'transform 0.2s';

    state.pressTimer = setTimeout(() => {
      if (state.isPressing) {
        state.isPressing = false;
        state.longPressTriggered = true;
        card.style.transform = 'scale(1)';

        if (state.progressBar) {
          state.progressBar.remove();
          state.progressBar = null;
        }

        card.classList.toggle('expanded');

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, LONG_PRESS_DURATION);
  };

  const cancelPress = (card, state) => {
    if (state.pressTimer) {
      clearTimeout(state.pressTimer);
      state.pressTimer = null;
    }
    state.isPressing = false;
    card.style.transform = 'scale(1)';

    if (state.progressBar) {
      state.progressBar.remove();
      state.progressBar = null;
    }
  };

  // Event delegation en el contenedor
  newContainer.addEventListener('mousedown', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card || e.button !== 0) return;

    const state = getCardState(card);
    startPress(card, state);
  });

  newContainer.addEventListener('mouseup', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    cancelPress(card, state);
  });

  newContainer.addEventListener('mouseleave', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    cancelPress(card, state);
  });

  // Touch events
  newContainer.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    startPress(card, state);
  }, { passive: true });

  newContainer.addEventListener('touchend', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    cancelPress(card, state);
  });

  newContainer.addEventListener('touchcancel', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    cancelPress(card, state);
  });

  newContainer.addEventListener('touchmove', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    const state = getCardState(card);
    cancelPress(card, state);
  });

  // Click handler con verificación de long press
  newContainer.addEventListener('click', (e) => {
    const card = e.target.closest('.mantenimiento-card');
    if (!card) return;

    // Ignorar clicks en filas relacionadas (tienen su propio onclick)
    if (e.target.closest('.related-row')) {
      return;
    }

    const state = getCardState(card);

    // Si fue long press, ignorar y resetear
    if (state.longPressTriggered) {
      e.preventDefault();
      e.stopPropagation();
      state.longPressTriggered = false;
      return;
    }

    // Click normal - abrir edición
    const mantId = card.dataset.mantId;
    if (mantId) {
      editMantenimiento(mantId);
    }
  });

  // Prevenir menú contextual en cards con related
  newContainer.addEventListener('contextmenu', (e) => {
    const card = e.target.closest('.mantenimiento-card.has-related');
    if (card) {
      e.preventDefault();
    }
  });
}

// Función para agrupar mantenimientos por fecha y kms
const agruparMantenimientos = (data) => {
  const grupos = [];
  let grupoActual = null;

  data.forEach((item) => {
    const esNuevoGrupo = !grupoActual ||
                         grupoActual.fecha !== item.fecha ||
                         grupoActual.kms !== item.kms;

    if (esNuevoGrupo) {
      grupoActual = {
        fecha: item.fecha,
        kms: item.kms,
        principal: item,
        relacionados: []
      };
      grupos.push(grupoActual);
    } else {
      grupoActual.relacionados.push(item);
    }
  });

  return grupos;
};

const getListMantenimientosByVehiculo = async () => {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) return;

  try {
    const response = await axios.post(
      "../api/mantenimientos/mantenimiento.php?getListMantenimientos",
      { data: { vehiculo_id: vehiculoId } },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.success) {
      // Agrupar todos los mantenimientos primero
      const todosLosGrupos = agruparMantenimientos(response.data.content);

      // Calcular paginación basada en GRUPOS, no en registros individuales
      window.totalPaginas = Math.ceil(todosLosGrupos.length / REGISTROS_POR_PAGINA);
      if (window.paginaActual > window.totalPaginas) {
        window.paginaActual = window.totalPaginas || 1;
      }

      // Obtener GRUPOS de la página actual
      const inicio = (window.paginaActual - 1) * REGISTROS_POR_PAGINA;
      const fin = inicio + REGISTROS_POR_PAGINA;
      const gruposPagina = todosLosGrupos.slice(inicio, fin);

      const html = parseHtmlCardMantenimientos(gruposPagina);
      document.getElementById("main-cards").innerHTML = html;
      await formatKilometersBadges();
      configurarLongPressMantenimientos();
      renderizarControlesPaginacionMain();

      // Restaurar cards expandidos
      restaurarCardsExpandidos();
    }
  } catch (error) {
    console.error("Error en getListMantenimientosByVehiculo:", error.message);
    Swal.fire("Error", "No se pudieron cargar los mantenimientos.", "error");
  }
};

// Función para renderizar controles de paginación
function renderizarControlesPaginacionMain() {
  const container = document.getElementById("main-cards");
  const paginacionExistente = document.getElementById("paginacion-container-main");
  if (paginacionExistente) {
    paginacionExistente.remove();
  }

  if (window.totalPaginas <= 1) return;

  const controlesHTML = `
    <div id="paginacion-container-main" class="col-12 mt-1 mb-1">
      <div class="d-flex justify-content-center align-items-center" style="gap: 15px;">
        <button
          class="btn btn-sm btn-outline-secondary ${window.paginaActual === 1 ? 'disabled' : ''}"
          onclick="cambiarPaginaMain(${window.paginaActual - 1})"
          ${window.paginaActual === 1 ? 'disabled' : ''}>
          <i class="fas fa-chevron-left"></i>
        </button>
        <span class="text-muted">
          Página ${window.paginaActual} de ${window.totalPaginas}
        </span>
        <button
          class="btn btn-sm btn-outline-secondary ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}"
          onclick="cambiarPaginaMain(${window.paginaActual + 1})"
          ${window.paginaActual === window.totalPaginas ? 'disabled' : ''}>
          <i class="fas fa-chevron-right"></i>
        </button>
      </div>
    </div>
  `;

  container.insertAdjacentHTML('beforeend', controlesHTML);

  // Restaurar estado expandido de cards
  restaurarCardsExpandidos();
}

// Función para restaurar cards expandidos
function restaurarCardsExpandidos() {
  const cardsExpandidosStr = sessionStorage.getItem(SESSION_KEY_EXPANDED);
  if (!cardsExpandidosStr) return;

  try {
    const cardsExpandidos = JSON.parse(cardsExpandidosStr);
    const vehiculoGuardado = sessionStorage.getItem(SESSION_KEY_VEHICULO);
    const vehiculoActual = sessionStorage.getItem("vehiculo_id");

    // Solo restaurar si es el mismo vehículo
    if (vehiculoGuardado === vehiculoActual) {
      cardsExpandidos.forEach(mantId => {
        const card = document.querySelector(`.mantenimiento-card[data-mant-id="${mantId}"]`);
        if (card && card.classList.contains('has-related')) {
          card.classList.add('expanded');
        }
      });
    }

    // Limpiar el storage después de restaurar (para no mantenerlo indefinidamente)
    sessionStorage.removeItem(SESSION_KEY_EXPANDED);
  } catch (e) {
    console.error('Error al restaurar cards expandidos:', e);
  }
}

// Función para cambiar de página
function cambiarPaginaMain(nuevaPagina) {
  if (nuevaPagina < 1 || nuevaPagina > window.totalPaginas) return;
  window.paginaActual = nuevaPagina;
  getListMantenimientosByVehiculo();
}

const showObservacionesMantenimiento = (valor) => {
  Swal.fire({
    position: "center",
    html: `<p>${valor}</p>`,
    showConfirmButton: true,
    confirmButtonText: "Cerrar",
  });
};

const editMantenimiento = async (id) => {
  // Guardar estado actual antes de navegar
  sessionStorage.setItem("mantenimiento_id", id);
  sessionStorage.setItem(SESSION_KEY_PAGE, window.paginaActual);
  sessionStorage.setItem(SESSION_KEY_VEHICULO, sessionStorage.getItem("vehiculo_id"));

  // Guardar IDs de cards expandidos
  const cardsExpandidos = [];
  document.querySelectorAll('.mantenimiento-card.expanded').forEach(card => {
    cardsExpandidos.push(card.dataset.mantId);
  });
  sessionStorage.setItem(SESSION_KEY_EXPANDED, JSON.stringify(cardsExpandidos));

  window.location.href = "mantenimientos/mantenimiento.php";
};

const initMain = async () => {
  await resetSessionStorage();
  await getVehiculosByUser();

  // Restaurar página guardada si estamos volviendo del detalle
  const paginaGuardada = sessionStorage.getItem(SESSION_KEY_PAGE);
  const vehiculoGuardado = sessionStorage.getItem(SESSION_KEY_VEHICULO);
  const vehiculoActual = sessionStorage.getItem("vehiculo_id");

  // Solo restaurar página si es el mismo vehículo
  if (paginaGuardada && vehiculoGuardado === vehiculoActual) {
    window.paginaActual = parseInt(paginaGuardada);
  }

  if (sessionStorage.getItem("login_parent") === "true") {
    sessionStorage.setItem("login_parent", "false");
    setTimeout(async () => {
      await setVehiculo();
      await getListMantenimientosByVehiculo();
      await getMotorVehiculo();
    }, 50);
  } else {
    await selectVehiculo();
    await getListMantenimientosByVehiculo();
  }
};

const cambiarVehiculo = async (id) => {
  await setVehiculo(id);
  // Resetear paginación al cambiar de vehículo
  window.paginaActual = 1;
  await getListMantenimientosByVehiculo();
  await getMotorVehiculo();
};

window.addEventListener("beforeunload", () => {
  hammerInstances.forEach((h) => h?.destroy?.());
});

const resetSessionStorage = async () => {
  sessionStorage.removeItem("mantenimiento_id");
};
