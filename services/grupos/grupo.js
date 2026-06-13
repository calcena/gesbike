let selectedGrupoId = null;
let modo = null;

const gotoBack = () => {
  window.location.href = "../main.php";
};

const cancelarFormulario = () => {
  selectedGrupoId = null;
  window.location.href = "./main.php";
};

const initGrupos = async () => {
  await getGruposList();
};

const initGrupoForm = async () => {
  modo = document.getElementById("mainBody").dataset.modo;
  await cargarIconos();
  await cargarAgrupadores();
  if (modo === "editar") {
    selectedGrupoId = sessionStorage.getItem("grupo_id");
    if (selectedGrupoId) {
      await cargarDatosGrupo(selectedGrupoId);
    }
  }
};

const getGruposList = async () => {
  const data = {};
  try {
    const response = await axios.post(
      `../../api/grupos/grupo.php?getListGrupos`,
      { data },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.success) {
      document.getElementById("grupos-container").innerHTML =
        await parseHtmlGrupos(response.data.content);
    }
  } catch (err) {
    console.log("getGruposList", err);
  }
};

const parseHtmlGrupos = async (data) => {
  if (!data || data.length === 0) {
    return `<div class="col-12 text-center text-muted mt-5"><p>No hay grupos disponibles</p></div>`;
  }
  return data
    .map((item) => {
      const iconPath = `../../assets/images/icons/Grupos/${item.imagen}`;
      return `
        <div class="col-6 col-md-4 col-lg-3 mb-3">
          <div class="card grupo-card h-100" onclick="onGrupoClick(${item.id})">
            <div class="card-body text-center">
              <img src="${iconPath}" alt="${item.nombre}" class="grupo-card-img">
              <h6 class="mt-2 mb-0">${item.nombre}</h6>
              <small class="text-muted">${item.trazabilidad ? "Trazabilidad sí" : "Sin trazabilidad"}</small>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
};

const onGrupoClick = (id) => {
  selectedGrupoId = id;
  sessionStorage.setItem("grupo_id", id);
  const menu = new bootstrap.Offcanvas(document.getElementById("menuGrupo"));
  menu.show();
};

const accionMenu = (accion) => {
  const menu = bootstrap.Offcanvas.getInstance(
    document.getElementById("menuGrupo")
  );
  if (menu) menu.hide();

  switch (accion) {
    case "editar":
      window.location.href = `./form.php?modo=editar`;
      break;
    case "eliminar":
      eliminarGrupo();
      break;
  }
};

const nuevoGrupo = () => {
  window.location.href = "./form.php?modo=nuevo";
};

const cargarDatosGrupo = async (id) => {
  const data = { id };
  try {
    const response = await axios.post(
      `../../api/grupos/grupo.php?getGrupoById`,
      { data },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.success) {
      const grupo = response.data.content;
      document.getElementById("grupo_nombre").value = grupo.nombre;
      document.getElementById("grupo_imagen").value = grupo.imagen;
      document.getElementById("grupo_agrupador").value = grupo.agrupador_id;
      document.getElementById("grupo_trazabilidad").checked =
        grupo.trazabilidad == 1;
      document.getElementById("grupo_vista_resumen").checked =
        grupo.vista_resumen == 1;
      marcarIconoSeleccionado(grupo.imagen);
    }
  } catch (err) {
    console.log("cargarDatosGrupo", err);
  }
};

const cargarIconos = async () => {
  const iconos = [
    "bateria.png", "cadena.png", "camara.png", "desviador.png",
    "discos.png", "frenos.png", "hidraulico.png", "horquilla.png",
    "llanta.png", "manetas.png", "manillar.png", "motor.png",
    "neumatico.png", "pedales.png", "pinyonera.png", "pistones.png",
    "plato.png", "punyos.png", "rodamientos.png", "roldanas.png",
    "suspension.png", "tornilleria.png",
  ];

  const grid = document.getElementById("icon-grid");
  grid.innerHTML = iconos
    .map(
      (icono) => `
    <div class="icon-option" data-icono="${icono}" onclick="seleccionarIcono(this)">
      <img src="../../assets/images/icons/Grupos/${icono}" alt="${icono}">
    </div>
  `
    )
    .join("");
};

const seleccionarIcono = (el) => {
  document.querySelectorAll(".icon-option").forEach((opt) => opt.classList.remove("selected"));
  el.classList.add("selected");
  document.getElementById("grupo_imagen").value = el.dataset.icono;
};

const marcarIconoSeleccionado = (icono) => {
  document.querySelectorAll(".icon-option").forEach((opt) => {
    if (opt.dataset.icono === icono) {
      opt.classList.add("selected");
    }
  });
};

const cargarAgrupadores = async () => {
  const data = {};
  try {
    const response = await axios.post(
      `../../api/grupos/grupo.php?getListGrupos`,
      { data },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.success) {
      const select = document.getElementById("grupo_agrupador");
      response.data.content.forEach((g) => {
        const opt = document.createElement("option");
        opt.value = g.id;
        opt.textContent = g.nombre;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.log("cargarAgrupadores", err);
  }
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

const guardarGrupo = async () => {
  if (!validarFormulario()) {
    Swal.fire("Atención", "Completa los campos obligatorios.", "warning");
    return;
  }

  const data = {
    nombre: document.getElementById("grupo_nombre").value.trim(),
    imagen: document.getElementById("grupo_imagen").value || "neumatico.png",
    agrupador_id: parseInt(document.getElementById("grupo_agrupador").value) || 0,
    trazabilidad: document.getElementById("grupo_trazabilidad").checked ? 1 : 0,
    vista_resumen: document.getElementById("grupo_vista_resumen").checked ? 1 : 0,
  };

  try {
    let response;
    if (modo === "editar" && selectedGrupoId) {
      data.id = selectedGrupoId;
      response = await axios.post(
        `../../api/grupos/grupo.php?editarGrupo`,
        { data },
        { headers: { "Content-Type": "application/json" } }
      );
    } else {
      response = await axios.post(
        `../../api/grupos/grupo.php?nuevoGrupo`,
        { data },
        { headers: { "Content-Type": "application/json" } }
      );
    }

    if (response.data.success) {
      Swal.fire({
        icon: "success",
        title: modo === "editar" ? "Grupo actualizado" : "Grupo creado",
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        window.location.href = "./main.php";
      });
    } else {
      Swal.fire("Error", response.data.error || "No se pudo guardar", "error");
    }
  } catch (err) {
    console.error("guardarGrupo", err);
    Swal.fire("Error", "Error de conexión con el servidor", "error");
  }
};

const eliminarGrupo = async () => {
  const result = await Swal.fire({
    title: "¿Eliminar grupo?",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });

  if (!result.isConfirmed) return;

  const data = { id: selectedGrupoId };
  try {
    const response = await axios.post(
      `../../api/grupos/grupo.php?eliminarGrupo`,
      { data },
      { headers: { "Content-Type": "application/json" } }
    );

    if (response.data.success) {
      Swal.fire({
        icon: "success",
        title: "Grupo eliminado",
        timer: 1500,
        showConfirmButton: false,
      }).then(() => {
        selectedGrupoId = null;
        getGruposList();
      });
    } else {
      Swal.fire("Error", response.data.error || "No se pudo eliminar", "error");
    }
  } catch (err) {
    console.error("eliminarGrupo", err);
    Swal.fire("Error", "Error de conexión con el servidor", "error");
  }
};
