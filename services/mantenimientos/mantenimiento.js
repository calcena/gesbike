var editMode = false;

const initMantenimientos = async () => {
  await getVehiculosByUser(2);
  await selectVehiculo(2);
  await getOperaciones(2);
  await getGrupos(2);
  await getLocalizaciones(2);
  document.getElementById("fecha_mantenimiento").value =
    await loadDefaultDate();
  // comprobamos si tenemos mantenimiento id, entonces es edición
  if ("mantenimiento_id" in sessionStorage) {
    await editMantenimiento();
  } else {
    ["operacion_id", "localizacion_id", "recambio_id"].forEach(k => sessionStorage.removeItem(k));
    await getKmsDetail();
    const kmsInput = document.getElementById("kms_realizados");
    document.getElementById("kms_mantenimiento").value =
      kmsInput && kmsInput.value ? kmsInput.value : 0;
  }
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
         onclick="selectGrupo(${g.id}, ${g.agrupador_id || 0}, '${g.nombre}')">
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

const openOperacionPicker = () => {
  const items = window.operacionesData || [];
  const selectedId = sessionStorage.getItem("operacion_id");
  if (!items.length) {
    Swal.fire("Sin datos", "No hay operaciones disponibles", "info");
    return;
  }

  const sorted = [...items].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const html = sorted.map((item) => {
    const isSelected = selectedId && item.id == selectedId;
    return `
    <div class="swal-grupo-item d-flex align-items-center p-2 border-bottom ${isSelected ? 'swal-grupo-selected' : ''}"
         style="cursor:pointer;gap:10px;"
         onclick="selectOperacion(${item.id}, '${item.nombre}')">
      ${item.imagen ? `<img src="${cacheBustUrl(`../../assets/images/icons/Operaciones/${item.imagen}`)}" style="width:32px;height:32px;object-fit:contain;">` : '<div style="width:32px;"></div>'}
      <span>${item.nombre}</span>
    </div>`;
  }).join("");

  Swal.fire({
    title: "Operación",
    html: `<div style="max-height:60vh;overflow-y:auto;">${html}</div>`,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { title: "swal-title-small" },
  });
};

window.selectOperacion = (id, nombre) => {
  sessionStorage.setItem("operacion_id", id);
  const btn = document.getElementById("operacion_select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
  changeOperaciones(id);
};

const openLocalizacionPicker = () => {
  const items = window.localizacionesData || [];
  const selectedId = sessionStorage.getItem("localizacion_id");
  if (!items.length) {
    Swal.fire("Sin datos", "No hay localizaciones disponibles", "info");
    return;
  }

  const sorted = [...items].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const html = sorted.map((item) => {
    const isSelected = selectedId && item.id == selectedId;
    return `
    <div class="swal-grupo-item d-flex align-items-center p-2 border-bottom ${isSelected ? 'swal-grupo-selected' : ''}"
         style="cursor:pointer;gap:10px;"
         onclick="selectLocalizacion(${item.id}, '${item.nombre}')">
      ${item.imagen ? `<img src="${cacheBustUrl(`../../assets/images/icons/Localizaciones/${item.imagen}`)}" style="width:32px;height:32px;object-fit:contain;">` : '<div style="width:32px;"></div>'}
      <span>${item.nombre}</span>
    </div>`;
  }).join("");

  Swal.fire({
    title: "Localización",
    html: `<div style="max-height:60vh;overflow-y:auto;">${html}</div>`,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { title: "swal-title-small" },
  });
};

window.selectLocalizacion = (id, nombre) => {
  sessionStorage.setItem("localizacion_id", id);
  const btn = document.getElementById("localizacion_select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
};

const openRecambioPicker = () => {
  const items = window.recambiosData || [];
  const selectedId = sessionStorage.getItem("recambio_id");
  if (!items.length) {
    Swal.fire("Sin datos", "No hay recambios disponibles para este grupo", "info");
    return;
  }

  const sorted = [...items].sort((a, b) => a.nombre.localeCompare(b.nombre));
  const html = sorted.map((item) => {
    const isSelected = selectedId && item.id == selectedId;
    return `
    <div class="swal-grupo-item d-flex align-items-center p-2 border-bottom ${isSelected ? 'swal-grupo-selected' : ''}"
         style="cursor:pointer;gap:10px;"
         onclick="selectRecambio(${item.id}, '${item.nombre}')">
      ${item.imagen ? `<img src="${cacheBustUrl(`../../assets/images/Recambios/${item.imagen}`)}" style="width:32px;height:32px;object-fit:cover;border-radius:4px;">` : '<div style="width:32px;"></div>'}
      <div>
        <span>${item.nombre}</span>
        <small class="text-muted ms-1">(stock: ${item.stock})</small>
        ${item.referencia ? `<br><small class="text-muted">Ref: ${item.referencia}</small>` : ""}
      </div>
    </div>`;
  }).join("");

  Swal.fire({
    title: "Recambio",
    html: `<div style="max-height:60vh;overflow-y:auto;">${html}</div>`,
    showConfirmButton: false,
    showCloseButton: true,
    customClass: { title: "swal-title-small" },
  });
};

window.selectRecambio = (id, nombre) => {
  sessionStorage.setItem("recambio_id", id);
  const btn = document.getElementById("recambio_select");
  if (btn) {
    btn.textContent = nombre;
    btn.dataset.selected = id;
  }
  Swal.close();
};

const gotoMain = () => {
  window.location.href = "../main.php";
};

const changeOperaciones = async (value) => {
  sessionStorage.removeItem("recambio_id");
  const btn = document.getElementById("recambio_select");
  if (btn) {
    btn.textContent = "Selecciona...";
    delete btn.dataset.selected;
  }
  if (value == 5) {
    document.getElementById("precio_mantenimiento").value = "";
    document.getElementById("precio_mantenimiento").removeAttribute("disabled");
  } else if (value == 3) {
    document.getElementById("precio_mantenimiento").value = "";
    document
      .getElementById("precio_mantenimiento")
      .setAttribute("disabled", "");
    await getRecambios(2);
  } else {
    document.getElementById("precio_mantenimiento").value = "";
    document
      .getElementById("precio_mantenimiento")
      .setAttribute("disabled", "");
  }
};

const changeGrupos = async () => {
  const grupoId = sessionStorage.getItem("grupo_id");
  const agrupadorId = sessionStorage.getItem("agrupador_id");
  if (!grupoId) return;
  sessionStorage.removeItem("localizacion_id");
  sessionStorage.removeItem("recambio_id");
  await getLocalizaciones(2);
  if (sessionStorage.getItem("operacion_id") == 3) {
    await getRecambios(2);
  }
};

const changeRecambio = async (valueId) => {
  sessionStorage.setItem("recambio_id", valueId);
};

const validateMantenimiento = async () => {
  if (
    document
      .getElementById("validate_save_icon")
      .src.includes("guardar_icon.png")
  ) {
    // crear nuevo mantenimiento
    const data = {
      vehiculo_id: sessionStorage.getItem("vehiculo_id"),
      motor_id: sessionStorage.getItem("motor_id"),
      fecha: document.getElementById("fecha_mantenimiento").value,
      operacion_id: sessionStorage.getItem("operacion_id") || 0,
      grupo_id: sessionStorage.getItem("grupo_id"),
      localizacion_id: sessionStorage.getItem("localizacion_id") || 0,
      recambio_id: sessionStorage.getItem("recambio_id") || 0,
      kms: document.getElementById("kms_mantenimiento").value,
      und: document.getElementById("unds_mantenimiento").value ?? 0,
      precio:
        parseFloat(document.getElementById("precio_mantenimiento").value) ||
        0.0,
      observaciones: document.getElementById("observaciones_mantenimiento")
        .value,
    };

    if (sessionStorage.getItem("mantenimiento_id")) {
      data.mantenimiento_id = sessionStorage.getItem("mantenimiento_id");
      console.log(data);
      baseUrl =
        "../../api/mantenimientos/mantenimiento.php?editarMantenimiento";
    } else {
      baseUrl =
        "../../api/mantenimientos/mantenimiento.php?createNewMantenimiento";
    }
    try {
      const response = await axios.post(
        baseUrl,
        { data },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (response.data.success) {
        await crearBackup();
      }
    } catch (error) {
      console.error(error);
    }
    document.getElementById("cancel_icon").classList.add("d-none");
    document.getElementById("tab3-tab").classList.remove("disabled");
    document.getElementById("validate_save_icon").src =
      "../../assets/images/icons/validate_icon.png";
  } else {
    window.location.href = "../main.php";
  }
};

async function handleFileUpload(files) {
  if (!files || files.length === 0) return;

  if (!sessionStorage.getItem("mantenimiento_id")) {
    Swal.fire(
      "Error",
      "No se ha guardado correctamente el mantenimiento.",
      "error"
    );
    return;
  }

  const file = files[0];

  if (!file.type.startsWith("image/")) {
    Swal.fire("Error", "Solo se permiten imágenes.", "error");
    return;
  }

  if (file.size > 8 * 1024 * 1024) {
    Swal.fire("Error", "La imagen no debe superar los 8 MB.", "error");
    return;
  }

  const preview = document.getElementById("img_preview_adjunto");
  const placeholder = document.getElementById("img_placeholder_adjunto");
  if (preview && placeholder) {
    preview.src = URL.createObjectURL(file);
    preview.classList.remove("d-none");
    placeholder.classList.add("d-none");
  }

  await uploadFileToServer(file);
}

// Función común para subir archivos al servidor
async function uploadFileToServer(file) {
  const formData = new FormData();
  formData.append("source", "adjunto");
  formData.append("archivo", file);
  formData.append("vehiculo_id", sessionStorage.getItem("vehiculo_id"));
  formData.append(
    "mantenimiento_id",
    sessionStorage.getItem("mantenimiento_id")
  );

  try {
    const response = await axios.post(
      "../../api/helpers/helper.php?uploadFile",
      formData,
      {
        headers: {
          "Content-Type": "multipart/form-data",
        },
        timeout: 30000,
      }
    );

    if (response.data.success) {
      Swal.fire({
        icon: "success",
        title: "¡Imagen subida!",
        text: "La imagen se ha guardado correctamente.",
        timer: 1500,
        showConfirmButton: false,
      });
      await getListadoAdjuntos();
    } else {
      Swal.fire(
        "Error",
        response.data.message || "No se pudo subir la imagen",
        "error"
      );
    }
  } catch (error) {
    console.error("Error al subir archivo:", error);
    let msg = "Error de conexión";
    if (error.response) {
      msg = error.response.data?.message || `Error ${error.response.status}`;
    } else if (error.request) {
      msg = "No se recibió respuesta del servidor";
    }
    Swal.fire("Error", msg, "error");
  }
}

const getListadoAdjuntos = async () => {
  console.log("getListadoAdjuntos");
  const data = {
    mantenimiento_id: sessionStorage.getItem("mantenimiento_id"),
  };

  try {
    const response = await axios.post(
      "../../api/mantenimientos/mantenimiento.php?getListAttachments",
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      console.log("getListadoAdjuntos", response.data.content);
      document.getElementById("main_cards").innerHTML =
        await parseHtmlCardsAdjuntos(response.data.content);
    }
  } catch (error) {
    console.error("Error al obtener adjuntos:", error);
  }
};

const parseHtmlCardsAdjuntos = async (data) => {
  return data
    .map((item) => {
      return `
            <div class="col-md-6">
                <div class="card shadow-sm h-100">
                    <div class="card-body d-flex align-items-center p-2">
                        <h6 class="mb-0 text-card-info flex-grow-1">${item.ruta}</h6>
                        <img src="../../assets/images/icons/ver_archivo.png" alt="Ver"
                            class="icon-card p-1 me-1" onclick="verArchivoAdjunto('${item.ruta}')">
                        <img src="../../assets/images/icons/papelera.png" alt="Eliminar" class="icon-card" onclick="eliminarAdjunto(${item.id}, '${item.ruta}')">
                    </div>
                </div>
              </div>
    `;
    })
    .join("");
};

const verArchivoAdjunto = async (archivo) => {
  console.log("verArchivoAdjunto", archivo);
  const extension = archivo.split(".").pop().toLowerCase();
  const extensionesImagen = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg"];
  if (extensionesImagen.includes(extension)) {
    // Es una imagen - mostrarla en SweetAlert
    let currentScale = 1;
    Swal.fire({
      html: `
        <div id="zoom-container" style="overflow: auto; max-height: 95vh; width: 100%; position: relative;">
          <div id="zoom-controls" style="position: absolute; top: 10px; right: 40px; z-index: 1000; display: flex; gap: 5px;">
            <button class="btn btn-sm btn-light shadow-sm" onclick="window.adjustZoom(0.2)" title="Aumentar">➕</button>
            <button class="btn btn-sm btn-light shadow-sm" onclick="window.adjustZoom(-0.2)" title="Disminuir">➖</button>
            <button class="btn btn-sm btn-light shadow-sm" onclick="window.resetZoom()" title="Resetear">🔄</button>
          </div>
          <div class="text-center" id="img-wrapper" style="transition: transform 0.2s ease-out; transform-origin: top center;">
            <img id="preview-img" src="../../attachments/${archivo}" alt="${archivo}" style="max-width: 100%; display: block; margin: 0 auto;">
          </div>
        </div>
      `,
      showCloseButton: true,
      showConfirmButton: false,
      width: "100%",
      padding: "0",
      background: "rgba(0,0,0,0.8)",
      customClass: {
        popup: "bg-transparent border-0 shadow-none",
      },
      didOpen: () => {
        const wrapper = document.getElementById("img-wrapper");
        const container = document.getElementById("zoom-container");

        window.adjustZoom = (delta) => {
          currentScale = Math.max(0.5, Math.min(4, currentScale + delta));
          wrapper.style.transform = `scale(${currentScale})`;
          if (currentScale > 1) {
            container.style.overflow = "auto";
          } else {
            container.style.overflow = "hidden";
          }
        };

        window.resetZoom = () => {
          currentScale = 1;
          wrapper.style.transform = `scale(1)`;
          container.style.overflow = "hidden";
        };
      },
      willClose: () => {
        delete window.adjustZoom;
        delete window.resetZoom;
      },
    });
  } else {
    // No es una imagen - mostrar información del archivo
    Swal.fire({
      title: "Archivo Adjunto",
      text: "El archivo no es una imagen",
      icon: "warning",
      confirmButtonText: "Cerrar",
    });
  }
};

// Función para eliminar adjunto
const eliminarAdjunto = async (id, archivo) => {
  const result = await Swal.fire({
    title: "¿Eliminar archivo?",
    text: "Esta acción no se puede deshacer",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });
  const data = {
    adjunto_id: id,
    nombre_archivo: archivo,
  };
  if (result.isConfirmed) {
    try {
      const response = await axios.post(
        "../../api/mantenimientos/mantenimiento.php?deleteAttachment",
        { data },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.success) {
        Swal.fire({
          icon: "success",
          title: "¡Archivo eliminado!",
          timer: 1500,
          showConfirmButton: false,
        });
        await getListadoAdjuntos();
      }
    } catch (error) {
      console.error("Error al eliminar archivo:", error);
      Swal.fire("Error", "No se pudo eliminar el archivo", "error");
    }
  }
};

const editMantenimiento = async () => {
  console.log("editMantenimiento");
  const data = {
    mantenimiento_id: sessionStorage.getItem("mantenimiento_id"),
  };
  try {
    const response = await axios.post(
      "../../api/mantenimientos/mantenimiento.php?getMantenimientosById",
      { data },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.success) {
      console.log(response.data.content);
      document.getElementById("fecha_mantenimiento").value =
        response.data.content.fecha;
      sessionStorage.setItem("operacion_id", response.data.content.operacion_id);
      const opBtn = document.getElementById("operacion_select");
      if (opBtn) {
        const op = (window.operacionesData || []).find(o => o.id == response.data.content.operacion_id);
        opBtn.textContent = op ? op.nombre : response.data.content.operacion_id;
        opBtn.dataset.selected = response.data.content.operacion_id;
      }
      sessionStorage.setItem(
        "agrupador_id",
        response.data.content.agrupador_id
      );
      sessionStorage.setItem("grupo_id", response.data.content.grupo_id);
      const grupoBtn = document.getElementById("grupo_select");
      if (grupoBtn) {
        const g = (window.gruposData || []).find(g => g.id == response.data.content.grupo_id);
        grupoBtn.textContent = g ? g.nombre : response.data.content.grupo_id;
        grupoBtn.dataset.selected = response.data.content.grupo_id;
      }
      await getLocalizaciones(2);
      sessionStorage.setItem("localizacion_id", response.data.content.localizacion_id);
      const locBtn = document.getElementById("localizacion_select");
      if (locBtn) {
        const loc = (window.localizacionesData || []).find(l => l.id == response.data.content.localizacion_id);
        locBtn.textContent = loc ? loc.nombre : response.data.content.localizacion_id;
        locBtn.dataset.selected = response.data.content.localizacion_id;
      }
      document.getElementById("kms_mantenimiento").value =
        response.data.content.kms;
      if (response.data.content.recambio_id) {
        sessionStorage.setItem("recambio_id", response.data.content.recambio_id);
        const recBtn = document.getElementById("recambio_select");
        if (recBtn) {
          recBtn.textContent = response.data.content.nombre_recambio || `ID ${response.data.content.recambio_id}`;
          recBtn.dataset.selected = response.data.content.recambio_id;
          recBtn.disabled = true;
        }
      }
      document.getElementById("unds_mantenimiento").value =
        response.data.content.Unidades;
      document.getElementById("precio_mantenimiento").value =
        response.data.content.Precio;
      document.getElementById("observaciones_mantenimiento").value =
        response.data.content.observaciones;
      document.getElementById("tab3-tab").classList.remove("disabled");
      document.getElementById("papelera_icon").classList.remove("d-none");
    }
  } catch (error) {
    Swal.fire("Error", "No se pudieron cargar los mantenimientos.", "error");
  }
};

const cancelMantenimiento = async () => {
  window.location.href = "../main.php";
};

const deleteMantenimiento = async () => {
  const data = {
    mantenimiento_id: sessionStorage.getItem("mantenimiento_id"),
  };
  try {
    const response = await axios.post(
      "../../api/mantenimientos/mantenimiento.php?deleteMantenimiento",
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    console.log(response.data);
    if (response.data) {
      Swal.fire({
        icon: "success",
        title: "¡Archivo eliminado!",
        timer: 1500,
        showConfirmButton: false,
      });
      setInterval(async () => {
        await cancelMantenimiento();
      }, 1000);
    }
  } catch (error) {
    console.error("Error al eliminar archivo:", error);
    Swal.fire("Error", "No se pudo eliminar el archivo", "error");
  }
};

const gotoBackMantenimientos = async () => {
  window.location.href = "../main.php";
};
