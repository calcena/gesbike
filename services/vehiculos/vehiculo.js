let selectedVehiculoId = null;
let modo = null;
let vehiculoImagenName = null;

const gotoBack = () => {
  window.location.href = "../main.php";
};

const initVehiculos = async () => {
  await getVehiculosList();
};

const getVehiculosList = async () => {
  const data = {
    usuario_id: sessionStorage.getItem("usuario_id"),
  };
  try {
    const response = await axios.post(
      `../../api/vehiculos/vehiculo.php?getVehiculos`,
      { data }
    );
    if (response.data.success) {
      const container = document.getElementById("vehiculos-container");
      container.innerHTML = "";
      const totalKm = response.data.content.reduce(
        (sum, v) => sum + parseInt(v.kms_actuales || v.kms_inicio || 0), 0
      );
      if (response.data.content.length > 0 && totalKm > 0) {
        container.innerHTML = `
          <div class="col-12 mb-3">
            <div class="total-km-card">
              <i class="fas fa-tachometer-alt"></i>
              <span class="total-km-label">Total km</span>
              <span class="total-km-value">${totalKm.toLocaleString("es")}</span>
            </div>
          </div>
        `;
      }
      container.innerHTML += parseHtmlVehiculos(response.data.content);
    }
  } catch (err) {
    console.error("getVehiculosList", err);
  }
};

const parseHtmlVehiculos = (data) => {
  if (!data || data.length === 0) {
    return `
      <div class="col-12 text-center mt-5">
        <p class="text-muted">No hay vehículos registrados</p>
        <p class="text-muted">Toca el botón + para añadir uno</p>
      </div>
    `;
  }

  return data
    .map((item) => {
      const imgSrc = item.imagen
        ? cacheBustUrl(`../../assets/images/Vehiculos/${item.imagen}`)
        : cacheBustUrl(`../../assets/images/icons/vehiculos_ico.png`);
      const isInactive = item.is_active == 0;
      const cardClass = isInactive ? "card vehiculo-card inactive" : "card vehiculo-card";

      return `
        <div class="col-12 mb-2">
          <div class="${cardClass}" data-id="${item.id}" onclick="onVehiculoClick(this)">
            <div class="card-body p-2">
              <div class="d-flex align-items-center">
                <div class="vehiculo-card-img me-3">
                  <img src="${imgSrc}" alt="${item.nombre}" class="rounded">
                </div>
                <div class="flex-grow-1">
                  <div class="d-flex justify-content-between align-items-start">
                    <div>
                      <h6 class="mb-0">${item.nombre}</h6>
                      <small class="text-muted">${item.anagrama || ''}</small>
                    </div>
                    <span class="badge ${isInactive ? 'bg-danger' : 'bg-success'}">${isInactive ? 'Inactivo' : 'Activo'}</span>
                  </div>
                  <div class="d-flex mt-1 gap-3 small text-muted">
                    <span><i class="far fa-calendar-alt"></i> ${formatFechaISO(item.fecha_compra) || item.fecha_compra}</span>
                    <span><i class="fas fa-tachometer-alt"></i> ${(item.kms_actuales || item.kms_inicio || 0).toLocaleString("es")} km</span>
                  </div>
                  ${item.categoria ? `<span class="badge bg-info mt-1">${item.categoria}</span>` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

const onVehiculoClick = (element) => {
  selectedVehiculoId = element.getAttribute("data-id");
  sessionStorage.setItem("vehiculo_id", selectedVehiculoId);

  const offcanvas = document.getElementById("menuVehiculo");
  const bsOffcanvas = new bootstrap.Offcanvas(offcanvas);
  bsOffcanvas.show();
};

const accionMenu = async (accion) => {
  const instance = bootstrap.Offcanvas.getInstance(
    document.getElementById("menuVehiculo")
  );
  if (instance) instance.hide();

  switch (accion) {
    case "editar":
      window.location.href = `./form.php?modo=editar`;
      break;
    case "eliminar":
      await eliminarVehiculo();
      break;
  }
};

const nuevoVehiculo = () => {
  window.location.href = "./form.php?modo=nuevo";
};

let currentMotor = null;
let allMotors = [];

const initVehiculoForm = async () => {
  modo = document.getElementById("mainBody").dataset.modo;
  document.getElementById("vehiculo_categoria").addEventListener("change", checkMotor);

  if (modo === "editar") {
    await cargarDatosVehiculo();
    await checkMotor();
  } else {
    document.getElementById("vehiculo_fecha_compra").value =
      await loadDefaultDate();
  }
};

const checkMotor = async () => {
  const categoria = document.getElementById("vehiculo_categoria").value;
  const fab = document.getElementById("fab-motor");
  if (categoria !== "electrica") {
    fab.classList.add("d-none");
    return;
  }
  fab.classList.remove("d-none");
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) return;
  try {
    const [activeResp, allResp] = await Promise.all([
      axios.post(`../../api/vehiculos/vehiculo.php?getMotorVehiculo`, { data: { vehiculo_id: vehiculoId } }),
      axios.post(`../../api/vehiculos/vehiculo.php?getAllMotores`, { data: { vehiculo_id: vehiculoId } }),
    ]);
    if (activeResp.data.success) currentMotor = activeResp.data.content;
    if (allResp.data.success) allMotors = allResp.data.content || [];
  } catch (e) {
    currentMotor = null;
    allMotors = [];
  }
};

const cargarDatosVehiculo = async () => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
  };
  try {
    const response = await axios.post(
      `../../api/vehiculos/vehiculo.php?getVehiculoById`,
      { data }
    );
    if (response.data.success) {
      const v = response.data.content;
      if (!v) return;

      if (v.imagen) {
        vehiculoImagenName = v.imagen;
        mostrarPreviewImagen(
          `../../assets/images/Vehiculos/${v.imagen}`
        );
      }

      document.getElementById("vehiculo_nombre").value = v.nombre || "";
      document.getElementById("vehiculo_anagrama").value = v.anagrama || "";
      document.getElementById("vehiculo_fecha_compra").value =
        v.fecha_compra || "";
      document.getElementById("vehiculo_kms_inicio").value =
        v.kms_inicio || 0;
      document.getElementById("vehiculo_categoria").value =
        v.categoria || "";
      document.getElementById("vehiculo_observaciones").value =
        v.observaciones || "";
    }
  } catch (err) {
    console.error("cargarDatosVehiculo", err);
  }
};

const uploadImage = async (input) => {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    mostrarPreviewImagen(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("vehiculo_id", sessionStorage.getItem("vehiculo_id") || "0");
    formData.append("source", "vehiculo");
    try {
      const response = await axios.post(
        `../../api/vehiculos/vehiculo.php?uploadVehiculoImage`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      if (response.data.success) {
        vehiculoImagenName = response.data.data.file;
      } else {
        Swal.fire(
          "Error",
          response.data.message || "No se pudo subir la imagen",
          "error"
        );
      }
    } catch (err) {
      console.error("Error al subir imagen:", err);
      Swal.fire("Error", "Error de conexión con el servidor", "error");
    }
  }
};

const mostrarPreviewImagen = (src) => {
  const preview = document.getElementById("img_preview");
  const placeholder = document.getElementById("img_placeholder");
  preview.src = src;
  preview.classList.remove("d-none");
  placeholder.classList.add("d-none");
};

const validarFormulario = () => {
  let valido = true;
  const campos = document.querySelectorAll(".field-required");
  campos.forEach((campo) => {
    if (!campo.value.trim()) {
      campo.classList.add("is-invalid");
      valido = false;
    } else {
      campo.classList.remove("is-invalid");
      campo.classList.add("is-valid");
    }
  });
  return valido;
};

const guardarVehiculo = async () => {
  if (!validarFormulario()) {
    Swal.fire(
      "Atención",
      "Por favor, completa los campos marcados en rojo.",
      "warning"
    );
    return;
  }

  const data = {
    fecha_compra: document.getElementById("vehiculo_fecha_compra").value,
    anagrama: document.getElementById("vehiculo_anagrama").value,
    nombre: document.getElementById("vehiculo_nombre").value,
    kms_inicio: parseInt(
      document.getElementById("vehiculo_kms_inicio").value || "0"
    ),
    imagen: vehiculoImagenName || "",
    observaciones: document.getElementById("vehiculo_observaciones").value,
    categoria: document.getElementById("vehiculo_categoria").value,
    usuario_id: sessionStorage.getItem("usuario_id"),
  };

  let url = `../../api/vehiculos/vehiculo.php?nuevoVehiculo`;
  if (modo === "editar") {
    data.vehiculo_id = sessionStorage.getItem("vehiculo_id");
    url = `../../api/vehiculos/vehiculo.php?editarVehiculo`;
  }

  try {
    const response = await axios.post(url, { data });
    if (response.data.success) {
      vehiculoImagenName = null;
      window.location.href = "./vehiculo.php";
    } else {
      Swal.fire(
        "Error",
        response.data.message || "No se pudo guardar",
        "error"
      );
    }
  } catch (err) {
    console.error("Error al guardar:", err);
    Swal.fire("Error", "Error de conexión con el servidor", "error");
  }
};

const eliminarVehiculo = async () => {
  const result = await Swal.fire({
    html: "<h4>Esta acción desactivará el vehículo.</h4>",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (result.isConfirmed) {
    const data = {
      vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    };
    try {
      Swal.showLoading();
      const response = await axios.post(
        `../../api/vehiculos/vehiculo.php?eliminarVehiculo`,
        { data }
      );
      if (response.data.success) {
        await Swal.fire({
          title: "Eliminado",
          html: "<h4>El vehículo ha sido desactivado</h4>",
          icon: "success",
        });
        await getVehiculosList();
      } else {
        Swal.fire(
          "Error",
          response.data.message || "No se pudo eliminar",
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      Swal.fire(
        "Error",
        "Hubo un problema con la conexión al servidor",
        "error"
      );
    }
  }
};

const cancelarFormulario = () => {
  vehiculoImagenName = null;
  window.location.href = "./vehiculo.php";
};

const toDmy = (d) => {
  if (!d) return "—";
  const parts = d.split(" ")[0].split("-");
  if (parts.length !== 3) return d;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
};

const formatMotorRow = (m) => {
  const activeTag = m.is_active == 1
    ? '<span class="badge bg-success badge-num ms-1" style="width:auto;height:auto;border-radius:4px;padding:0 6px;font-size:0.65rem;">Activo</span>'
    : '<span class="badge bg-secondary ms-1" style="font-size:0.65rem;">Inactivo</span>';
  return `<div style="border-bottom:1px solid var(--border-color,#ddd);padding:6px 0;">
    <div class="d-flex justify-content-between align-items-center">
      <strong>${m.Kms || 0} km</strong> ${activeTag}
    </div>
    <div class="text-muted small">${toDmy(m.fecha)} ${m.observaciones ? "· " + m.observaciones : ""}</div>
    <div class="text-muted" style="font-size:0.7rem;">${m.created_at ? "Creado: " + toDmy(m.created_at) : ""}${m.deleted_at ? " · Baja: " + toDmy(m.deleted_at) : ""}</div>
  </div>`;
};

const openMotorPopup = async () => {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");

  let motorHtml = '<div style="text-align:left;font-size:0.85rem;max-height:50vh;overflow-y:auto;">';
  if (allMotors.length > 0) {
    motorHtml += allMotors.map(formatMotorRow).join("");
  } else {
    motorHtml += "<p class='text-muted'>No hay motores registrados</p>";
  }
  motorHtml += "</div>";

  const result = await Swal.fire({
    title: "Historial de Motores",
    html: motorHtml,
    showConfirmButton: true,
    showDenyButton: true,
    showCancelButton: false,
    confirmButtonText: "🔄 Reemplazar",
    denyButtonText: "➕ Nuevo motor",
    footer: '<button id="btn-cerrar-motor" class="btn btn-secondary swal-footer-btn">Cerrar</button>',
    reverseButtons: true,
    confirmButtonColor: "#dc3545",
    denyButtonColor: "#28a745",
    customClass: {
      confirmButton: "swal-half-btn",
      denyButton: "swal-half-btn",
      actions: "swal-actions-row",
    },
    didOpen: () => {
      document.getElementById("btn-cerrar-motor")?.addEventListener("click", () => Swal.close());
    },
  });

  if (result.isConfirmed) {
    await bajaYNuevoMotor(vehiculoId);
  } else if (result.isDenied) {
    await nuevoMotorPopup(vehiculoId);
  }
};

const bajaYNuevoMotor = async (vehiculoId) => {
  if (!currentMotor || !currentMotor.id) {
    await nuevoMotorPopup(vehiculoId);
    return;
  }
  try {
    await axios.post(
      `../../api/vehiculos/vehiculo.php?bajaMotor`,
      { data: { motor_id: currentMotor.id } }
    );
  } catch (e) {
    Swal.fire("Error", "No se pudo dar de baja el motor", "error");
    return;
  }
  await nuevoMotorPopup(vehiculoId);
};

const nuevoMotorPopup = async (vehiculoId) => {
  const { value: form } = await Swal.fire({
    title: "Nuevo motor",
    html: `
      <div style="text-align:left;font-size:0.9rem;">
        <label class="form-label">Kms del motor</label>
        <input id="motor-kms" class="form-control mb-2" type="number" value="0">
        <label class="form-label">Fecha instalación</label>
        <input id="motor-fecha" class="form-control mb-2" type="date" value="${new Date().toISOString().split("T")[0]}">
        <label class="form-label">Observaciones</label>
        <textarea id="motor-obs" class="form-control" rows="2"></textarea>
      </div>`,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    preConfirm: () => {
      return {
        kms: document.getElementById("motor-kms").value || 0,
        fecha: document.getElementById("motor-fecha").value || "",
        observaciones: document.getElementById("motor-obs").value || "",
      };
    },
  });

  if (form) {
    try {
      const resp = await axios.post(
        `../../api/vehiculos/vehiculo.php?nuevoMotor`,
        {
          data: {
            vehiculo_id: vehiculoId,
            kms: form.kms,
            fecha: form.fecha,
            observaciones: form.observaciones,
          },
        }
      );
      if (resp.data.success) {
        await Swal.fire("Correcto", "Motor registrado correctamente", "success");
        await checkMotor();
      } else {
        Swal.fire("Error", "No se pudo registrar el motor", "error");
      }
    } catch (e) {
      Swal.fire("Error", "No se pudo registrar el motor", "error");
    }
  }
};
