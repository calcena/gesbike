const initDetalles = async () => {
  await getGrupos(2);
  selectContainsText("grupo_select", "pastillas");
  sessionStorage.setItem(
    "grupo_id",
    document.getElementById("grupo_select").value
  );
  await changeGrupos();
  await getKmsByGrupo();
};

const changeGrupos = async () => {
  const [primero, segundo] = document
    .getElementById("grupo_select")
    .value.split("-")
    .map(Number);
  sessionStorage.setItem("grupo_id", primero);
  sessionStorage.setItem("agrupador_id", segundo);
  await getKmsByGrupo();
  await getHistorico();
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
              <img class="icon-table" src="../../assets/images/icons/Localizaciones/${item.img_localizacion}" alt="">
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
            <img class="icon-table me-1" src="../../assets/images/icons/Localizaciones/${grupo.localizacion_imagen}" alt="">
            <strong>${grupo.localizacion}</strong>
            <span class="badge bg-light text-dark ms-2">${totalItems} registro${totalItems !== 1 ? "s" : ""}</span>
          </span>
          <small class="opacity-75">${formatFechaISO(desde)} - ${formatFechaISO(hasta)}</small>
        </div>
        <div class="card-body p-0">`;

    grupo.items.forEach((item, idx) => {
      const primerItem = idx === 0;
      const ultimoItem = idx === totalItems - 1;
      const duracionKms = Number(item.duracion_kms) || 0;
      const precio = Number(item.precio) || 0;
      const unidades = Number(item.unidades) || 1;

      html += `
        <div class="historico-item p-2 ${idx > 0 ? "border-top" : ""}">
          <div class="d-flex justify-content-between align-items-start mb-1">
            <div class="d-flex align-items-center gap-2">
              <span class="badge rounded-pill bg-light text-dark border">#${item.fila_num}</span>
              <span class="fw-bold small">${formatFechaISO(item.fecha)}</span>
              <span class="badge bg-info text-dark">${Number(item.kms).toLocaleString()} kms</span>
            </div>
            <small class="text-muted">${item.edad_vehiculo}</small>
          </div>

          <div class="row g-1 small">
            <div class="col-6">
              <span class="text-muted">Operación:</span>
              <div class="d-flex align-items-center gap-1">
                <img class="icon-table" src="../../assets/images/icons/${item.operacion_imagen}" alt="">
                <span>${item.operacion_nombre}</span>
              </div>
            </div>
            <div class="col-6">
              <span class="text-muted">Recambio:</span>
              <div class="d-flex align-items-center gap-1">
                ${item.recambio_imagen ? `<img class="rounded" src="../../assets/images/Recambios/${item.recambio_imagen}" alt="" style="width:24px;height:24px;object-fit:cover;">` : ""}
                <span class="fw-bold">${item.recambio}</span>
              </div>
              ${item.recambio_referencia ? `<small class="text-muted ms-3">Ref: ${item.recambio_referencia}</small>` : ""}
            </div>
          </div>

          <div class="row g-1 small mt-1">
            <div class="col-4">
              <span class="text-muted">Duración:</span>
              <span class="text-success fw-bold">+${duracionKms.toLocaleString()} kms</span>
            </div>
            <div class="col-4">
              <span class="text-muted">Periodo:</span>
              <span>${item.duracion_tiempo}</span>
            </div>
            <div class="col-2">
              <span class="text-muted">Precio:</span>
              <span>${precio.toFixed(2)}€</span>
            </div>
            <div class="col-2">
              <span class="text-muted">Ud.:</span>
              <span>${unidades}</span>
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
