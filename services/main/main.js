let hammerInstances = [];

const parseHtmlCardMantenimientos = (data) => {
  let tempFecha = "";
  let tempKms = 0;

  return data
    .map((item) => {
      const repeat = tempFecha === item.fecha && tempKms === item.kms;
      if (!repeat) {
        tempFecha = item.fecha;
        tempKms = item.kms;
      }

      const backgroundCard = repeat ? "repeat-card" : "";
      const iconSrc = repeat
        ? "../assets/images/icons/repeater.png"
        : `../assets/images/icons/Vehiculos/${item.puntero}`;

      return `
      <div class="col">
        <div
          class="card shadow-sm swipeable-card"
          data-mant-id="${item.id}"
          data-mant-fecha="${item.fecha}"
          data-mant-kms="${item.kms}"
        >
          <div
            class="card-body d-flex align-items-center p-2 ${backgroundCard}"
            onclick="editMantenimiento('${item.id}')"
          >
            <img class="me-2 p-1" src="${iconSrc}" alt="Vehículo" width="40">
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-baseline">
                <h6 class="mb-1 text-card-info">${
                  repeat ? "" : formatFechaISO(item.fecha)
                }</h6>
                <span name="kms" class="badge bg-primary">${
                  repeat ? "" : item.kms
                }</span>
              </div>
              <div class="mt-2 d-flex justify-content-around align-items-center flex-wrap">
                <img src="../assets/images/icons/Operaciones/${
                  item.img_operacion
                }" alt="Operación" class="icon-table">
                <img src="../assets/images/icons/Grupos/${
                  item.img_grupo
                }" alt="Grupo" class="icon-table">
                ${
                  item.img_localizacion
                    ? `<img src="../assets/images/icons/Localizaciones/${item.img_localizacion}" alt="Situación" class="icon-table">`
                    : ""
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    })
    .join("");
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
      const html = parseHtmlCardMantenimientos(response.data.content);
      document.getElementById("main-cards").innerHTML = html;
      await formatKilometersBadges();
    }
  } catch (error) {
    console.error("Error en getListMantenimientosByVehiculo:", error.message);
    Swal.fire("Error", "No se pudieron cargar los mantenimientos.", "error");
  }
};

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
  await getListMantenimientosByVehiculo();
  await getMotorVehiculo();
};

window.addEventListener("beforeunload", () => {
  hammerInstances.forEach((h) => h?.destroy?.());
});

const resetSessionStorage = async () => {
  sessionStorage.removeItem("mantenimiento_id");
};
