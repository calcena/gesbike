const initDetalles = async () => {
  await getGrupos(2);
  sessionStorage.setItem("grupo_id", 5);
  sessionStorage.setItem("agrupador_id", 1);
  const btn = document.getElementById("grupo_select");
  const grupoId = sessionStorage.getItem("grupo_id");
  if (btn && grupoId && window.gruposData) {
    const g = window.gruposData.find(g => g.id == grupoId);
    if (g) btn.textContent = g.nombre;
  }
  await changeGrupos();
  await getKmsByGrupo();
};

const changeGrupos = async () => {
  await getKmsByGrupo();
  await getHistorico();
};

const openGrupoPicker = () => {
  const grupos = window.gruposData || [];
  const selectedId = sessionStorage.getItem("grupo_id");
  if (!grupos.length) {
    Swal.fire("Sin datos", "No hay grupos disponibles", "info");
    return;
  }

  const sorted = [...grupos].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const html = sorted.map((g) => {
    const isSelected = selectedId && g.id == selectedId;
    return `
    <div class="swal-grupo-item d-flex align-items-center p-2 border-bottom ${isSelected ? 'swal-grupo-selected' : ''}"
         style="cursor:pointer;gap:10px;"
         onclick="selectGrupo(${g.id}, ${g.agrupador_id || 0}, '${g.nombre.replace(/'/g, "\\'")}')">
      ${g.imagen ? `<img src="${cacheBustUrl(`../../assets/images/icons/Grupos/${g.imagen}`)}" style="width:32px;height:32px;object-fit:contain;">` : '<div style="width:32px;"></div>'}
      <span>${g.nombre}</span>
    </div>`;
  }).join("");

  Swal.fire({
    title: "Grupo",
    html: `<div style="max-height:60vh;overflow-y:auto;">${html}</div>`,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { title: "swal-title-small" },
  });
};

window.selectGrupo = (id, agrupadorId, nombre) => {
  sessionStorage.setItem("grupo_id", id);
  sessionStorage.setItem("agrupador_id", agrupadorId);
  const btn = document.getElementById("grupo_select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
  changeGrupos();
};

const getKmsByGrupo = async () => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    grupo_id: sessionStorage.getItem("grupo_id"),
    kms: sessionStorage.getItem("kms_actuales"),
  };
  try {
    const response = await axios.post(
      `../../api/mantenimientos/mantenimiento.php?getKmsByGrupo`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      document.getElementById("main_card_kms").innerHTML =
        await parseHtmlCardKms(response.data.content);
    }
  } catch (err) {
    console.log("applyKmsDetail", err);
  }
};

const parseHtmlCardKms = async (data) => {
  if (!data || data.length === 0) {
    return `<div class="text-center text-muted mt-3"><i class="fas fa-info-circle fa-2x"></i><p class="mt-2">Sin datos de mantenimiento para este grupo</p></div>`;
  }

  let html = `
    <div class="card mt-2 shadow-sm">
      <div class="card-body p-0">
        <table class="table table-sm mb-0" style="--bs-table-bg: transparent;">
          <thead class="header-table-mini text-muted">
            <tr style="height: 28px;">
              <th class="text-center" style="width: 36px;"></th>
              <th>Últ. km</th>
              <th>Realizados</th>
              <th>Últ. mant.</th>
              <th>Hace</th>
            </tr>
          </thead>
          <tbody>`;

  data.forEach((item) => {
    html += `
            <tr style="height: 32px;">
              <td class="text-center align-middle">
                <img src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${item.img_localizacion}`)}" alt="${item.localizacion}" title="${item.localizacion}" style="width: 24px; height: 24px; object-fit: contain;">
              </td>
              <td class="align-middle fw-bold">${Number(item.kms).toLocaleString()}</td>
              <td class="align-middle text-success fw-bold">+${Number(item.kms_realizados).toLocaleString()}</td>
              <td class="align-middle"><small>${formatFechaISO(item.ultima_fecha)}</small></td>
              <td class="align-middle"><small class="text-muted">${item.tiempo_transcurrido}</small></td>
            </tr>`;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>`;

  return html;
};

const getHistorico = async () => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    grupo_id: sessionStorage.getItem("grupo_id"),
    kms: sessionStorage.getItem("kms_actuales"),
  };
  try {
    const response = await axios.post(
      `../../api/mantenimientos/mantenimiento.php?getHistorico`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      document.getElementById("main_card_historico").innerHTML =
        await parseHtmlCardHistorico(response.data.content);
    }
  } catch (err) {
    console.log("applyKmsDetail", err);
  }
};

const parseHtmlCardHistorico = async (data) => {
  if (!data || data.length === 0) return "";

  const grupos = {};
  let colorIndex = 0;
  const colores = ["primary", "secondary", "success", "danger", "warning", "info", "dark"];

  data.forEach((item) => {
    if (!grupos[item.localizacion_id]) {
      grupos[item.localizacion_id] = {
        localizacion: item.localizacion,
        localizacion_imagen: item.localizacion_imagen,
        items: [],
        color: colores[colorIndex++ % colores.length],
        kms_min: item.kms,
        kms_max: item.kms,
      };
    }
    grupos[item.localizacion_id].items.push(item);
    grupos[item.localizacion_id].kms_min = Math.min(grupos[item.localizacion_id].kms_min, item.kms);
    grupos[item.localizacion_id].kms_max = item.kms;
  });

  let html = "";

  for (const locId in grupos) {
    const grupo = grupos[locId];
    const totalItems = grupo.items.length;
    const recorrido = grupo.kms_max - grupo.kms_min;

    html += `
      <div class="card mt-3 shadow-sm border-${grupo.color}">
        <div class="card-header p-2 bg-${grupo.color} text-light d-flex justify-content-between align-items-center">
          <span class="d-flex align-items-center gap-2">
            <img src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${grupo.localizacion_imagen}`)}" alt="" style="width:20px;height:20px;object-fit:contain;filter:brightness(0) invert(1);">
            <strong>${grupo.localizacion}</strong>
            <span class="badge bg-light text-dark" style="font-size:0.65rem;">${totalItems}</span>
          </span>
          <small style="font-size:0.7rem;">+${recorrido.toLocaleString()} km</small>
        </div>
        <div class="card-body p-2">`;

    grupo.items.forEach((item, idx) => {
      const duracionKms = Number(item.duracion_kms) || 0;
      const precio = Number(item.precio) || 0;
      const unidades = Number(item.unidades) || 1;

      html += `
          <div class="py-2 ${idx > 0 ? "border-top" : ""}">
            <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
              <span class="fw-bold" style="font-size:0.8rem;">${formatFechaISO(item.fecha)}</span>
              <span class="d-flex align-items-center gap-2">
                <span class="badge bg-info text-dark" style="font-size:0.68rem;">${Number(item.kms).toLocaleString()} km</span>
                <span class="text-success fw-bold" style="font-size:0.72rem;">+${duracionKms.toLocaleString()}</span>
                <span class="text-muted" style="font-size:0.68rem;">${item.duracion_tiempo}</span>
              </span>
            </div>
            <div class="d-flex align-items-center gap-2">
              <img src="${cacheBustUrl(`../../assets/images/icons/Operaciones/${item.operacion_imagen}`)}" alt="" style="width:14px;height:14px;object-fit:contain;flex-shrink:0;">
              <span class="text-truncate" style="font-size:0.75rem;">${item.recambio || "—"}</span>
              ${item.recambio_referencia ? `<small class="text-muted flex-shrink-0" style="font-size:0.65rem;">${item.recambio_referencia}</small>` : ""}
              ${precio ? `<small class="text-muted ms-auto flex-shrink-0" style="font-size:0.68rem;white-space:nowrap;">${precio.toFixed(2)}€${unidades > 1 ? ' ×'+unidades : ''}</small>` : ""}
              ${item.edad_vehiculo ? `<small class="text-muted flex-shrink-0" style="font-size:0.65rem;">(${item.edad_vehiculo})</small>` : ""}
            </div>
            ${item.observaciones ? `<div class="mt-1 ps-3"><small class="text-muted" style="font-size:0.7rem;"><em>${item.observaciones}</em></small></div>` : ""}
          </div>`;
    });

    html += `
        </div>
        <div class="card-footer p-2 text-end" style="font-size:0.72rem;">
          <span class="text-muted">Recorrido: </span>
          <span class="fw-bold">${recorrido.toLocaleString()} km</span>
          <span class="text-muted ms-1">(${totalItems} mant.)</span>
        </div>
      </div>`;
  }

  return html;
};

const gotoBackMantenimientos = async()=>{
  window.location.href = '../main.php'
}
