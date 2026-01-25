// VARIABLES GLOBALES
let selectedRecambioId = null;
let modo = null;

/*
Validar campos olbigatorios
*/
const validarFormulario = () => {
  let esValido = true;
  // Seleccionamos todos los campos marcados como obligatorios
  const campos = document.querySelectorAll(".field-required");

  campos.forEach((campo) => {
    // Si el valor está vacío (quitando espacios)
    if (!campo.value.trim()) {
      campo.classList.add("is-invalid"); // Clase de Bootstrap para error
      esValido = false;
    } else {
      campo.classList.remove("is-invalid"); // Quitamos el error si ya tiene contenido
      campo.classList.add("is-valid"); // Opcional: marca en verde que está ok
    }
  });

  return esValido;
};

/**
 * Inicialización al cargar la página
 */
const initRecambios = async () => {
  await getVehiculosByUser(2);
  await selectVehiculo(2);
  await getAllRecambios();
};

const initRecambiosNuevoEdit = async () => {
  modo = document.getElementById("mainBody").dataset.modo;
  const data = {};
  try {
    const response = await axios.post(
      `../../api/grupos/grupo.php?getListGrupos`,
      { data }
    );
    if (response.data.success) {
      console.log(response.data.content);
      document.getElementById("recambio_grupo").innerHTML =
        await parseHtmlSelector(response.data.content);
    }
  } catch (err) {
    console.error("getAllRecambios", err);
  }
  if (modo == "editar") {
    console.log(modo);
    const data = {
      recambio_id: sessionStorage.getItem("recambio_id"),
    };
    try {
      const response = await axios.post(
        `../../api/recambios/recambio.php?getRecambioById`,
        { data }
      );
      if (response.data.success) {
        const imgPreview = document.getElementById("img_preview");
        if (response.data.content.imagen != null) {
          sessionStorage.setItem(
            "recambio_imagen_name",
            response.data.content.imagen
          );
          imgPreview.src = `../../assets/images/Recambios/${response.data.content.imagen}`;
          imgPreview.classList.remove("invisible");
        }
        document.getElementById("recambio_grupo").value =
          response.data.content.grupo_id;
        document.getElementById("recambio_nombre").value =
          response.data.content.nombre;
        document.getElementById("recambio_referencia").value =
          response.data.content.referencia;
        document.getElementById("recambio_observaciones").value =
          response.data.content.observaciones;
      }
    } catch (err) {
      console.error("getAllRecambios", err);
    }
  } else {
    console.log(modo);
  }
};

const parseHtmlSelector = async (data) => {
  return data
    .map((item) => {
      return `<option value="${item.id}">${item.nombre}</option>`;
    })
    .join("");
};

/**
 * Obtiene todos los recambios según el vehículo seleccionado
 */
const getAllRecambios = async (stockZero = false) => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    incluye_zeros: stockZero,
  };
  try {
    const response = await axios.post(
      `../../api/recambios/recambio.php?getListAllRecambios`,
      { data }
    );
    if (response.data.success) {
      document.getElementById("main_cards").innerHTML =
        await parseHtmlCardRecambios(response.data.content);
    }
  } catch (err) {
    console.error("getAllRecambios", err);
  }
};

/**
 * Genera el HTML de las tarjetas de recambios
 */
const parseHtmlCardRecambios = async (data) => {
  if (!data || data.length === 0)
    return '<p class="text-center mt-3">No hay datos</p>';

  return data
    .map((item) => {
      const recambioImg = item.imagen
        ? `<img height="40px" src="../../assets/images/Recambios/${item.imagen}">`
        : "";

      return `
        <div class="row my-1">
            <div class="col w-100">
                <div class="card shadow-sm" data-item="${item.id}" onclick="handleClick(this, event)">
                    <div class="card-body p-2">
                        <div class="d-flex align-items-center justify-content-between">
                            <div class="d-flex align-items-center gap-3 flex-grow-1">
                                <img height="40px" src="../../assets/images/icons/Grupos/${item.img_grupo}">
                                ${recambioImg}
                                <span class="ref-text text-truncate">${item.referencia}</span>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-primary">${item.stock}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>`;
    })
    .join("");
};

/**
 * Maneja el click en la tarjeta para abrir el menú
 */
const handleClick = (element, event) => {
  event.preventDefault();
  selectedRecambioId = element.getAttribute("data-item");
  sessionStorage.setItem("recambio_id", selectedRecambioId);

  const myOffcanvas = document.getElementById("menuRecambio");
  const bsOffcanvas = new bootstrap.Offcanvas(myOffcanvas);
  bsOffcanvas.show();
};

/**
 * Acciones del menú lateral
 */
const accionMenu = async (accion) => {
  const instance = bootstrap.Offcanvas.getInstance(
    document.getElementById("menuRecambio")
  );
  if (instance) instance.hide();

  switch (accion) {
    case "nuevo":
      window.location.href = `./recambio.php?modo=${accion}`;
      break;
    case "editar":
      window.location.href = `./recambio.php?modo=${accion}`;
      break;
    case "comprar":
      window.location.href = `../compras/compra.php?modo=nuevo`;
      break;
    case "ver_compras":
      window.location.href = `../compras/main.php`;
      break;
    case "eliminar":
      await elminarRecambio();
      break;
  }
};

/**
 * Listado de compras de un recambio
 */
const getListAllCompras = async () => {
  const data = { recambio_id: sessionStorage.getItem("recambio_id") };
  try {
    const response = await axios.post(
      `../../api/recambios/compra.php?getListAllCompras`,
      { data }
    );
    if (response.data.success) {
      const container = document.getElementById("main_compras_cards");
      if (container)
        container.innerHTML = await parseHtmlCardCompras(response.data.content);
    }
  } catch (err) {
    console.error(err);
  }
};

/**
 * Utilidades
 */
const showDescription = async (valor) => {
  await Swal.fire({ text: valor, showConfirmButton: true });
};

const includeZeroStock = async (value) => {
  await getAllRecambios(value);
};

const selectRecambios = async (selectIds, stockZero = false) => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    incluye_zeros: stockZero,
  };
  try {
    const response = await axios.post(
      `../../api/helpers/helper.php?getRecambiosByVehiculo`,
      { data }
    );
    if (response.data.success) {
      const ids = Array.isArray(selectIds) ? selectIds : [selectIds];
      ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.innerHTML = response.data.content
            .map((i) => `<option value="${i.id}">${i.nombre}</option>`)
            .join("");
        }
      });
      await getAllRecambios();
    }
  } catch (e) {
    console.error(e);
  }
};

const uploadImage = async (input) => {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const imgPreview = document.getElementById("img_preview");
    if (imgPreview) {
      imgPreview.classList.remove("invisible");
      imgPreview.src = URL.createObjectURL(file);
      imgPreview.onload = () => {
        URL.revokeObjectURL(imgPreview.src);
      };
    }
    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("vehiculo_id", sessionStorage.getItem("vehiculo_id"));
    formData.append("source", "recambio");
    try {
      const response = await axios.post(
        `../../api/recambios/recambio.php?uploadRecambioImage`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        }
      );
      if (response.data.success) {
        sessionStorage.setItem(
          "recambio_imagen_ruta",
          response.data.data.file_path
        );
        sessionStorage.setItem("recambio_imagen_name", response.data.data.file);
      } else {
        Swal.fire(
          "Error",
          response.data.message || "No se pudo subir",
          "error"
        );
      }
    } catch (err) {
      console.error("Error al subir imagen:", err);
      Swal.fire("Error", "Error de conexión con el servidor", "error");
    }
  }
};

const saveRecambioData = async () => {
  if (!validarFormulario()) {
    Swal.fire(
      "Atención",
      "Por favor, completa los campos marcados en rojo.",
      "warning"
    );
    return;
  }
  const data = {
    fecha: await loadDefaultDate(),
    imagen: sessionStorage.getItem("recambio_imagen_name"),
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    grupo_id: document.getElementById("recambio_grupo").value,
    nombre: document.getElementById("recambio_nombre").value,
    referencia: document.getElementById("recambio_referencia").value,
    observaciones: document.getElementById("recambio_observaciones").value,
  };
  if (modo == "editar") {
    data.recambio_id = sessionStorage.getItem("recambio_id");
    basseUrl = `../../api/recambios/recambio.php?editarRecambio`;
  } else {
    basseUrl = `../../api/recambios/recambio.php?nuevoRecambio`;
  }
  try {
    const response = await axios.post(basseUrl, { data });
    if (response.data.success) {
      sessionStorage.removeItem("recambio_imagen_name");
      sessionStorage.removeItem("recambio_imagen_ruta"),
        (window.location.href = "main.php");
      await crearBackup();
    }
  } catch (err) {
    Swal.fire("Error", err);
  }
};

const cancelRecambioData = async () => {
  sessionStorage.removeItem("recambio_imagen_name");
  sessionStorage.removeItem("recambio_imagen_ruta"),
    (window.location.href = "main.php");
};

/*
Eliminar el recambio con is_active = false y las compras relacionadas is_active = false
*/
const elminarRecambio = async () => {
  // 1. Lanzamos la alerta de confirmación
  const result = await Swal.fire({
    html: "<h4>Esta acción desactivará el recambio y todas sus compras asociadas.</h4>",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  // 2. Si el usuario confirma, procedemos con el Axios
  if (result.isConfirmed) {
    const data = {
      fecha: await loadDefaultDate(),
      recambio_id: sessionStorage.getItem("recambio_id"),
    };

    try {
      // Mostramos un pequeño cargando
      Swal.showLoading();

      const response = await axios.post(
        `../../api/recambios/recambio.php?eliminarRecambio`,
        { data }
      );

      if (response.data.success) {
        await Swal.fire({
          title: "Eliminado",
          html: "<h4>El recambio y sus movimientos han sido desactivados</h4>",
          icon: "success",
        });
        await getAllRecambios();
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

const gotoBackMantenimientos = async () => {
  window.location.href = "../main.php";
};
