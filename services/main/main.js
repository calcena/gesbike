let hammerInstances = [];

// Variables de paginación
const REGISTROS_POR_PAGINA = 10;
window.paginaActual = 1;
window.totalPaginas = 1;

const parseHtmlCardMantenimientos = (data) => {
  // Agrupar registros por fecha y kms
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

  // Generar HTML para cada grupo
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
  const LONG_PRESS_DURATION = 800; // milisegundos
  let pressTimer;
  let isPressing = false;
  let currentCard = null;
  let longPressTriggered = false;
  let progressBar = null;
  let progressInterval = null;

  // Función para crear barra de progreso
  const createProgressBar = (card) => {
    const bar = document.createElement('div');
    bar.className = 'long-press-progress';
    card.appendChild(bar);
    return bar;
  };

  // Función para iniciar la pulsación
  const startPress = (card, e) => {
    if (!card.classList.contains('has-related')) return; // Solo para cards con relacionados
    
    if (e.button !== 0 && e.type === 'mousedown') return; // Solo click izquierdo
    
    isPressing = true;
    longPressTriggered = false;
    currentCard = card;
    
    // Crear barra de progreso
    progressBar = createProgressBar(card);
    
    // Animar barra de progreso
    setTimeout(() => {
      if (progressBar) {
        progressBar.style.width = '100%';
        progressBar.style.transition = `width ${LONG_PRESS_DURATION}ms linear`;
      }
    }, 10);
    
    // Feedback visual - cambiar apariencia
    card.style.transform = 'scale(0.98)';
    card.style.transition = 'transform 0.2s';
    
    pressTimer = setTimeout(() => {
      if (isPressing && currentCard === card) {
        // Pulsación larga completada
        isPressing = false;
        longPressTriggered = true;
        card.style.transform = 'scale(1)';
        
        // Eliminar barra de progreso
        if (progressBar) {
          progressBar.remove();
          progressBar = null;
        }
        
        // Expandir/colapsar
        card.classList.toggle('expanded');
        
        // Vibración en móviles (si está disponible)
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, LONG_PRESS_DURATION);
  };

  // Función para cancelar la pulsación
  const cancelPress = (card) => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    isPressing = false;
    currentCard = null;
    card.style.transform = 'scale(1)';
    
    // Eliminar barra de progreso
    if (progressBar) {
      progressBar.remove();
      progressBar = null;
    }
  };

  // Configurar eventos para todas las cards
  const cards = document.querySelectorAll('.mantenimiento-card');
  cards.forEach(card => {
    // Click simple para edición del mantenimiento principal
    // Solo si no fue long press y no se hizo click en una fila relacionada
    card.addEventListener('click', (e) => {
      // Verificar si el click fue en una fila relacionada
      if (e.target.closest('.related-row')) {
        return; // No hacer nada, la fila relacionada tiene su propio onclick
      }
      
      if (!longPressTriggered) {
        const mantId = card.dataset.mantId;
        editMantenimiento(mantId);
      }
      longPressTriggered = false; // Resetear para próxima vez
    });

    // Solo configurar long press si tiene registros relacionados
    if (card.classList.contains('has-related')) {
      // Mouse events
      card.addEventListener('mousedown', (e) => startPress(card, e));
      card.addEventListener('mouseup', () => cancelPress(card));
      card.addEventListener('mouseleave', () => cancelPress(card));
      
      // Touch events (para móviles)
      card.addEventListener('touchstart', (e) => {
        startPress(card, e);
      }, { passive: true });
      card.addEventListener('touchend', () => cancelPress(card));
      card.addEventListener('touchcancel', () => cancelPress(card));
      card.addEventListener('touchmove', () => cancelPress(card)); // Cancelar si se mueve el dedo
      
      // Prevenir el menú contextual en móviles
      card.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  });
}

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
      // Calcular paginación
      window.totalPaginas = Math.ceil(response.data.content.length / REGISTROS_POR_PAGINA);
      if (window.paginaActual > window.totalPaginas) {
        window.paginaActual = window.totalPaginas || 1;
      }

      // Obtener registros de la página actual
      const inicio = (window.paginaActual - 1) * REGISTROS_POR_PAGINA;
      const fin = inicio + REGISTROS_POR_PAGINA;
      const mantenimientosPagina = response.data.content.slice(inicio, fin);

      const html = parseHtmlCardMantenimientos(mantenimientosPagina);
      document.getElementById("main-cards").innerHTML = html;
      await formatKilometersBadges();
      configurarLongPressMantenimientos(); // Configurar pulsación larga
      renderizarControlesPaginacionMain();
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
  sessionStorage.setItem("mantenimiento_id", id);
  window.location.href = "mantenimientos/mantenimiento.php";
};

const initMain = async () => {
  await resetSessionStorage();
  await getVehiculosByUser();
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
