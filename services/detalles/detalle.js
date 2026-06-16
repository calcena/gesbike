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
  return data
    .map((item) => {
      return `
        <div class="card mt-2 shadow-sm">
          <div class="card-body p-2">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span class="fw-bold small">${formatFechaISO(item.ultima_fecha)}</span>
              <img class="icon-table" src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${item.img_localizacion}`)}" alt="">
            </div>
            <table class="table table-sm mb-0">
              <thead class="header-table-mini text-muted">
                <tr><th>Kms</th><th>Realizados</th><th>Tiempo</th></tr>
              </thead>
              <tbody>
                <tr class="body-table-mini">
                  <td class="fw-bold">${Number(item.kms).toLocaleString()}</td>
                  <td class="text-success fw-bold">+${Number(item.kms_realizados).toLocaleString()}</td>
                  <td>${item.tiempo_transcurrido}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    })
    .join("");
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
  const kmsActuales = Number(sessionStorage.getItem("kms_actuales")) || 0;

  for (const locId in grupos) {
    const grupo = grupos[locId];
    const totalItems = grupo.items.length;
    const recorrido = grupo.kms_max - grupo.kms_min;
    const desde = grupo.items[0].fecha;
    const hasta = grupo.items[totalItems - 1].fecha;

    html += `
      <div class="card mt-3 shadow-sm border-${grupo.color}">
        <div class="card-header p-2 bg-${grupo.color} text-light d-flex justify-content-between align-items-center">
          <span>
            <img class="icon-table me-1" src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${grupo.localizacion_imagen}`)}" alt="">
            <strong>${grupo.localizacion}</strong>
          </span>
          <small style="font-size:0.7rem;">${formatFechaISO(desde)} - ${formatFechaISO(hasta)}</small>
        </div>
        <div class="card-body p-0">`;

    grupo.items.forEach((item, idx) => {
      const duracionKms = Number(item.duracion_kms) || 0;
      const precio = Number(item.precio) || 0;
      const unidades = Number(item.unidades) || 1;

      html += `
        <div class="historico-item p-2 ${idx > 0 ? "border-top" : ""}">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span class="fw-bold small">${formatFechaISO(item.fecha)}</span>
              <span class="badge bg-info text-dark">${Number(item.kms).toLocaleString()} kms</span>
              ${precio ? `<span class="badge bg-light text-dark border">${precio.toFixed(2)}€</span>` : ""}
            </div>
            <small class="text-muted">${item.edad_vehiculo}</small>
          </div>

          <div class="d-flex align-items-center gap-2 mb-1">
            <img class="icon-table" src="${cacheBustUrl(`../../assets/images/icons/Operaciones/${item.operacion_imagen}`)}" alt="">
            <span class="small">${item.operacion_nombre}</span>
          </div>

          <div class="d-flex align-items-start gap-2 p-2 rounded" style="background:var(--card-bg);border:1px solid var(--border-color);">
            ${item.recambio_imagen
              ? `<img class="rounded" src="${cacheBustUrl(`../../assets/images/Recambios/${item.recambio_imagen}`)}" alt="" style="width:40px;height:40px;object-fit:cover;flex-shrink:0;">`
              : `<div style="width:40px;height:40px;flex-shrink:0;" class="rounded d-flex align-items-center justify-content-center bg-light text-muted"><i class="fas fa-cog"></i></div>`}
            <div class="flex-grow-1 min-w-0">
              <div class="fw-bold small">${item.recambio || "—"}</div>
              ${item.recambio_referencia ? `<small class="text-muted">Ref: ${item.recambio_referencia}</small>` : ""}
              <div class="d-flex gap-2 mt-1 flex-wrap">
                ${unidades > 1 ? `<small class="text-muted"><i class="fas fa-box me-1"></i>${unidades} uds.</small>` : ""}
                ${duracionKms ? `<small class="text-success"><i class="fas fa-road me-1"></i>+${duracionKms.toLocaleString()} kms</small>` : ""}
                ${item.duracion_tiempo ? `<small class="text-muted"><i class="far fa-clock me-1"></i>${item.duracion_tiempo}</small>` : ""}
              </div>
            </div>
          </div>

          ${item.observaciones ? `
          <div class="mt-1 small">
            <span class="text-muted">📝</span>
            <em>${item.observaciones}</em>
          </div>` : ""}
        </div>`;
    });

    html += `
        </div>
        <div class="card-footer p-1 text-end small bg-light">
          <span class="text-muted">Recorrido total: </span>
          <span class="fw-bold">${recorrido.toLocaleString()} kms</span>
          <span class="text-muted ms-2">(desde ${Number(grupo.kms_min).toLocaleString()} hasta ${Number(grupo.kms_max).toLocaleString()})</span>
        </div>
      </div>`;
  }

  return html;
};

const gotoBackMantenimientos = async()=>{
  window.location.href = '../main.php'
}
