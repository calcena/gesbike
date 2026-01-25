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
                        <div class="card mt-2">
                            <div class="card-body">
                                <div class="row align-items-center w-100">
                                    <div class="col-6 text-start date-card-style">
                                        ${formatFechaISO(item.ultima_fecha)}
                                    </div>

                                    <div class="col-6 text-end">
                                        <img class="icon-table"
                                            src="../../assets/images/icons/Localizaciones/${
                                              item.img_localizacion
                                            }"
                                            alt="">
                                    </div>
                                </div>
                                <div class="row d-flex justify-content-end align-content-center w-100">
                                <table class="table mt-2">
                                    <thead class="header-table-mini">
                                    <th>Ultimos kms</th>
                                    <th>Kms realizados</th>
                                    <th>Tiempo</th>
                                    </thead>
                                    <tbody>
                                        <tr class="body-table-mini">
                                            <td>${item.kms}</td>
                                            <td>${item.kms_realizados}</td>
                                            <td>${item.tiempo_transcurrido}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                </div>
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

  const primerId = data[0].localizacion_id;

  return data
    .map((item) => {
      const kmsCalculados = item.diferencia_kms;

      const colorBackground =
        item.localizacion_id === primerId ? "primary" : "danger";

      return `
        <div class="card mt-2 shadow-sm">
            <div class="card-header p-1 m-0 bg-${colorBackground} text-light fw-bold d-flex justify-content-between align-items-center">
                <span>${item.localizacion}</span>
                <small>${formatFechaISO(item.fecha)}</small>
            </div>
            <div class="card-body p-0">
                <div class="row w-100 m-0">
                    <div class="col-12 text-start p-1">
                        <span class="body-table-mini fw-bold">${item.recambio}</span>
                    </div>
                </div>
                <div class="row m-0 w-100">
                    <table class="table table-sm mt-1 mb-1">
                        <thead class="header-table-mini text-muted">
                            <tr>
                                <th>Kms Total</th>
                                <th>Duración Pieza</th> <th>Tiempo</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="body-table-mini">
                                <td class="fw-bold">${item.kms.toLocaleString()}</td>
                                <td class="text-success fw-bold">+ ${kmsCalculados.toLocaleString()}</td>
                                <td>${item.diferencia_tiempo}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      `;
    })
    .join("");
};

const gotoBackMantenimientos = async()=>{
  window.location.href = '../main.php'
}
