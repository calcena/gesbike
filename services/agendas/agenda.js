const initAgendas = async () => {
  await getVehiculosByUser(2);
  await selectVehiculo(2);
  await loadAgenda();
};

const toggleAgendaGroup = (id, header) => {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle("show");
  if (header) {
    const expanded = el.classList.contains("show");
    header.setAttribute("aria-expanded", expanded);
  }
};

const countVencidosPendientes = (data, currentKms = 0) => {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  let v = 0, p = 0;
  (data || []).forEach(item => {
    const fechaPasada = item.proxima_fecha
      ? new Date(item.proxima_fecha + "T00:00:00") < hoy
      : false;
    const kmsExcedidos = item.proximos_kms != null && currentKms > 0
      ? currentKms >= item.proximos_kms
      : false;
    if (!item.proxima_fecha && item.proximos_kms == null) return;
    if (fechaPasada || kmsExcedidos) v++; else p++;
  });
  return { vencidos: v, pendientes: p };
};

const loadAgenda = async () => {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) {
    updateAgendaBadge(0, 0);
    return;
  }

  // No mostrar contenido si el vehículo está inactivo
  const veh = window.vehiculosData && window.vehiculosData.find(v => v.id == vehiculoId);
  if (veh && veh.is_active == 0) {
    document.getElementById("main-cards").innerHTML = "";
    updateAgendaBadge(0, 0);
    return;
  }

  try {
    const [agendaResp, kmsResp] = await Promise.all([
      axios.post(
        "../../api/programaciones/programacion.php?getTodasPredicciones",
        { data: { vehiculo_id: vehiculoId } },
        { headers: { "Content-Type": "application/json" } }
      ),
      axios.post(
        "../../api/helpers/helper.php?getKilometrosByVehiculo",
        { data: { vehiculo_id: vehiculoId } },
        { headers: { "Content-Type": "application/json" } }
      )
    ]);

    if (agendaResp.data.success) {
      const content = agendaResp.data.content;
      const currentKms = kmsResp.data.success && kmsResp.data.content.kms != null
        ? parseFloat(kmsResp.data.content.kms) || 0
        : 0;
      document.getElementById("main-cards").innerHTML =
        parseHtmlAgenda(content, currentKms);
      const counts = countVencidosPendientes(content, currentKms);
      updateAgendaBadge(counts.vencidos, counts.pendientes);

      const params = new URLSearchParams(window.location.search);
      const section = params.get('section');
      if (section === 'vencidos' || section === 'pendientes') {
        const openId = section === 'vencidos' ? 'collapseVencidos' : 'collapsePendientes';
        const closeId = section === 'vencidos' ? 'collapsePendientes' : 'collapseVencidos';
        [openId, closeId].forEach(id => {
          const el = document.getElementById(id);
          if (!el) return;
          const shouldShow = id === openId;
          el.classList.toggle('show', shouldShow);
          const header = el.closest('.col-12')?.querySelector('.agenda-group-header');
          if (header) header.setAttribute('aria-expanded', shouldShow);
        });
      }
    } else {
      updateAgendaBadge(0, 0);
    }
  } catch (err) {
    console.log("loadAgenda", err);
  }
};

window.selectVehiculoPicker = (id, nombre) => {
  sessionStorage.setItem("vehiculo_id", id);
  const btn = document.getElementById("vehiculo-select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
  loadAgenda();
};

const formatDaysToText = (fechaStr) => {
  if (!fechaStr) return "";
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(fechaStr + "T00:00:00");
  const diff = Math.round((fecha - hoy) / 86400000);
  if (diff < 0) return `${Math.abs(diff)} días`;
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return `En ${diff} días`;
};

const renderAgendaCard = (item, currentKms) => {
  const opImg = item.operacion_imagen
    ? cacheBustUrl(`../../assets/images/icons/Operaciones/${item.operacion_imagen}`)
    : "";
  const grpImg = item.grupo_imagen
    ? cacheBustUrl(`../../assets/images/icons/Grupos/${item.grupo_imagen}`)
    : "";
  const locImg = item.localizacion_imagen
    ? cacheBustUrl(`../../assets/images/icons/Localizaciones/${item.localizacion_imagen}`)
    : "";

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const fechaVencida = item.proxima_fecha
    ? new Date(item.proxima_fecha + "T00:00:00") < hoy
    : false;
  const kmsVencido = item.proximos_kms != null && currentKms > 0
    ? currentKms > item.proximos_kms
    : false;

  const fechaClass = fechaVencida ? "agenda-text-red" : "";
  const kmsClass = kmsVencido ? "agenda-text-red" : "";
  const vencido = fechaVencida || kmsVencido;

  let badgeText, badgeClass;
  if (item.dias_usuario) {
    badgeText = formatDaysToText(item.proxima_fecha);
    badgeClass = vencido ? "bg-danger"
      : badgeText === "Hoy" || badgeText === "Mañana" ? "bg-warning text-dark"
      : "bg-success";
  } else if (item.km_usuario && item.proximos_kms != null) {
    const kmRestantes = item.proximos_kms - currentKms;
    if (kmRestantes <= 0) {
      badgeText = `${Math.abs(kmRestantes)} km`;
      badgeClass = "bg-danger";
    } else {
      badgeText = `${kmRestantes} km`;
      badgeClass = "bg-success";
    }
  } else {
    badgeText = formatDaysToText(item.proxima_fecha);
    badgeClass = vencido ? "bg-danger"
      : badgeText === "Hoy" || badgeText === "Mañana" ? "bg-warning text-dark"
      : "bg-success";
  }

  const kmsDiff = item.proximos_kms
    ? `${item.proximos_kms} km`
    : "—";

  return `
    <div class="col-12">
      <div class="card shadow-sm agenda-card">
        <div class="card-body">
          <div class="d-flex align-items-center gap-2">
            ${opImg ? `<img src="${opImg}" class="agenda-icon" alt="${item.operacion_nombre}">` : ""}
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-center">
                <strong>${item.operacion_nombre}</strong>
                <span class="badge ${badgeClass}">${badgeText}</span>
              </div>
              <div class="d-flex align-items-center gap-3 mt-1">
                <small class="text-muted">${grpImg ? `<img src="${grpImg}" class="agenda-icon-sm me-1" alt="${item.grupo_nombre}">` : '<i class="fas fa-tag me-1"></i>'}${item.grupo_nombre}</small>
                ${item.localizacion_nombre ? `<small class="text-muted"><i class="fas fa-map-marker-alt me-1"></i>${item.localizacion_nombre}</small>` : ""}
              </div>
            </div>
          </div>
          <div class="row mt-2 g-1">
            <div class="col-6">
              <div class="agenda-label">Próxima fecha</div>
              <div class="agenda-proxima-fecha ${fechaClass}">
                ${item.proxima_fecha ? `<i class="far fa-calendar-alt me-1"></i>${formatFechaISO(item.proxima_fecha)}` : "—"}
              </div>
            </div>
            <div class="col-6">
              <div class="agenda-label">Próximos kms</div>
              <div class="agenda-proxima-kms ${kmsClass}">
                <i class="fas fa-tachometer-alt me-1"></i>${kmsDiff}
              </div>
            </div>
          </div>
          ${item.dias_usuario || item.km_usuario ? `
          <div class="mt-1">
            <small class="agenda-pref-text">
              <i class="fas fa-user-cog me-1"></i>Pref.: ${item.dias_usuario ? `${item.dias_usuario} días${item.proxima_fecha ? ` → ${formatFechaISO(item.proxima_fecha)}` : ""}` : ""}${item.dias_usuario && item.km_usuario ? " / " : ""}${item.km_usuario ? `${item.km_usuario} km${item.proximos_kms ? ` → ${item.proximos_kms} km` : ""}` : ""}
            </small>
          </div>` : ""}
        </div>
      </div>
    </div>`;
};

const parseHtmlAgenda = (data, currentKms = 0) => {
  if (!data || data.length === 0) {
    return '<p class="text-center text-muted mt-4">No hay próximos mantenimientos previstos</p>';
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const vencidos = data.filter(item => {
    const fechaPasada = item.proxima_fecha
      ? new Date(item.proxima_fecha + "T00:00:00") <= hoy
      : false;
    const kmsExcedidos = item.proximos_kms != null && currentKms > 0
      ? currentKms >= item.proximos_kms
      : false;
    return fechaPasada || kmsExcedidos;
  });

  const pendientes = data.filter(item => {
    const fechaPasada = item.proxima_fecha
      ? new Date(item.proxima_fecha + "T00:00:00") <= hoy
      : false;
    const kmsExcedidos = item.proximos_kms != null && currentKms > 0
      ? currentKms >= item.proximos_kms
      : false;
    return !fechaPasada && !kmsExcedidos;
  });

  let html = "";

  if (vencidos.length > 0) {
    html += `<div class="col-12 mb-2">
      <div class="agenda-group-header agenda-group-danger" onclick="toggleAgendaGroup('collapseVencidos', this)" aria-expanded="false">
        <i class="fas fa-exclamation-triangle me-1"></i> Vencidos <span class="badge bg-light text-danger badge-num ms-1">${vencidos.length}</span>
        <i class="fas fa-chevron-down ms-auto"></i>
      </div>
      <div class="agenda-group-collapse" id="collapseVencidos"><div class="row g-2">${vencidos.map(i => renderAgendaCard(i, currentKms)).join("")}</div></div>
    </div>`;
  }

  if (pendientes.length > 0) {
    html += `<div class="col-12">
      <div class="agenda-group-header agenda-group-success" onclick="toggleAgendaGroup('collapsePendientes', this)" aria-expanded="false">
        <i class="fas fa-clock me-1"></i> Futuros <span class="badge bg-light text-success badge-num ms-1">${pendientes.length}</span>
        <i class="fas fa-chevron-down ms-auto"></i>
      </div>
      <div class="agenda-group-collapse" id="collapsePendientes"><div class="row g-2">${pendientes.map(i => renderAgendaCard(i, currentKms)).join("")}</div></div>
    </div>`;
  }

  return html;
};

const openConfiguracion = async () => {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) {
    Swal.fire("Atención", "Selecciona un vehículo primero", "warning");
    return;
  }

  try {
    const response = await axios.post(
      "../../api/programaciones/programacion.php?getConfiguracionCombinaciones",
      { data: { vehiculo_id: vehiculoId } },
      { headers: { "Content-Type": "application/json" } }
    );

    if (!response.data.success || !response.data.content.length) {
      Swal.fire("Sin datos", "No hay combinaciones de mantenimiento para este vehículo", "info");
      return;
    }

    const combos = response.data.content;
    const inputs = {};

    let html = `<div class="config-scroll">`;

    combos.forEach((c, i) => {
      const prefix = `c${i}`;
      const opImg = c.operacion_imagen
        ? `<img src="${cacheBustUrl(`../../assets/images/icons/Operaciones/${c.operacion_imagen}`)}" class="config-icon">`
        : "";
      const grpImg = c.grupo_imagen
        ? `<img src="${cacheBustUrl(`../../assets/images/icons/Grupos/${c.grupo_imagen}`)}" class="config-icon">`
        : "";
      const locImg = c.localizacion_imagen
        ? `<img src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${c.localizacion_imagen}`)}" class="config-icon">`
        : "";

      const sysDias = c.avg_dias != null ? `${c.avg_dias} días` : "—";
      const sysKm = c.avg_km != null ? `${c.avg_km} km` : "—";
      const badgeClass = c.total_registros < 2 ? "bg-warning text-dark" : "bg-primary";
      const badgeText = c.total_registros < 2 ? "pocos" : `${c.total_registros} reg.`;

      html += `<div class="config-card">
        <div class="config-header">
          <div class="config-icons">${opImg}${grpImg}${locImg}</div>
          <div class="config-title">${c.operacion_nombre}</div>
          <span class="badge ${badgeClass} config-badge">${badgeText}</span>
        </div>
        <div class="config-subtitle">${c.grupo_nombre} · ${c.localizacion_nombre}</div>
        <div class="config-sistema">
          <i class="fas fa-calculator me-1"></i>Sistema: <strong>${sysDias}</strong> · <strong>${sysKm}</strong>
        </div>
        <div class="config-user">
          <label class="config-user-label">Mis días</label>
          <input id="${prefix}_dias" class="config-input" type="number" min="0" value="${c.dias_usuario || ""}">
          <label class="config-user-label">Mis km</label>
          <input id="${prefix}_km" class="config-input" type="number" min="0" value="${c.km_usuario || ""}">
        </div>
      </div>`;

      inputs[prefix] = {
        vehiculo_id: vehiculoId,
        operacion_id: c.operacion_id,
        grupo_id: c.grupo_id,
        localizacion_id: c.localizacion_id,
      };
    });

    html += `</div>`;

    const result = await Swal.fire({
      title: 'Preferencias',
      html,
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      customClass: { popup: 'config-popup' },
      preConfirm: () => {
        const saves = [];
        Object.keys(inputs).forEach(prefix => {
          const diasRaw = document.getElementById(`${prefix}_dias`).value;
          const kmRaw = document.getElementById(`${prefix}_km`).value;
          const diasVal = diasRaw ? parseInt(diasRaw) : null;
          const kmVal = kmRaw ? parseInt(kmRaw) : null;
          const diasSave = diasVal > 0 ? diasVal : null;
          const kmSave = kmVal > 0 ? kmVal : null;
          saves.push({
            ...inputs[prefix],
            dias_usuario: diasSave,
            km_usuario: kmSave,
          });
        });
        return saves;
      }
    });

    if (result.isConfirmed && result.value.length > 0) {
      for (const data of result.value) {
        await axios.post(
          "../../api/programaciones/programacion.php?saveProgramacion",
          { data },
          { headers: { "Content-Type": "application/json" } }
        );
      }
      Swal.fire("Guardado", "Preferencias actualizadas correctamente", "success");
      loadAgenda();
    }
  } catch (err) {
    console.log("openConfiguracion", err);
    Swal.fire("Error", "No se pudieron cargar las configuraciones", "error");
  }
};

const gotoBack = async () => {
  window.location.href = "../main.php";
};
