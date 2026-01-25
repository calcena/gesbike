let modo = null;

const initCompras = async () => {
  await getListAllCompras();
};

const initCompraNuevoEdit = async () => {
  modo = document.getElementById("mainBody").dataset.modo;

  if (modo == "editar") {
    const data = {
      compra_id: sessionStorage.getItem("compra_id"),
    };
    try {
      const response = await axios.post(
        `../../api/compras/compra.php?getCompraById`,
        { data }
      );
      if (response.data.success) {
        document.getElementById("compra_fecha").value =
          response.data.content.fecha;
        document.getElementById("compra_proveedor").value =
          response.data.content.proveedor;
        document.getElementById("compra_unds").value =
          response.data.content.unidades;
        document.getElementById("compra_precio").value =
          response.data.content.precio;
        document.getElementById("compra_observaciones").value =
          response.data.content.observaciones;
      }
    } catch (err) {
      console.error("getCompraById", err);
    }
  } else {
    document.getElementById("compra_fecha").value = await loadDefaultDate();
  }
};

const gotoBackRecambios = async () => {
  window.location.href = `../recambios/main.php`;
};

const gotoBackCompras = async () => {
  window.location.href = `../compras/main.php`;
};

const getListAllCompras = async () => {
  const data = {
    recambio_id: sessionStorage.getItem("recambio_id"),
  };

  try {
    const response = await axios.post(
      `../../api/compras/compra.php?getListAllCompras`,
      { data }
    );
    if (response.data.success) {
      document.getElementById("main_cards").innerHTML =
        await parseHtmlCardCompras(response.data.content);
    }
  } catch (err) {
    console.error(err);
  }
};

const parseHtmlCardCompras = async (data) => {
  return data
    .map(
      (item) => `
    <div class="card shadow-sm mt-2">
        <div class="card-body d-flex align-items-center justify-content-around p-2" onclick="getCompra(${item.id})">
            <span class="date-text">${formatFechaISO(item.fecha)}</span>
            <span class="supplier-text">${item.proveedor}</span>
            <span class="price-text">${item.precio} €</span>
            <span class="und-text">${item.unidades}</span>
        </div>
    </div>`
    )
    .join("");
};

/**
 * Guardar o Actualizar Compra
 */
const saveCompraData = async () => {
  const data = {
    recambio_id: sessionStorage.getItem("recambio_id"),
    fecha: document.getElementById("compra_fecha").value,
    proveedor: document.getElementById("compra_proveedor").value,
    unidades: document.getElementById("compra_unds").value,
    precio: document.getElementById("compra_precio").value,
    observaciones: document.getElementById("compra_observaciones").value,
  };
  if (modo == "nuevo") {
    baseUrl = `../../api/compras/compra.php?nuevaCompra`;
  } else {
    baseUrl = `../../api/compras/compra.php?editarCompra`;
    data.compra_id = sessionStorage.getItem("compra_id");
  }
  try {
    const response = await axios.post(baseUrl, { data });
    if (response.data.success) {
      window.location.href = "./main.php";
      await getListAllCompras();
      await crearBackup();
    }
  } catch (err) {
    console.error(err);
  }
};

const getCompra = async (compraId) => {
  sessionStorage.setItem("compra_id", compraId);
  window.location.href = "./compra.php?modo=editar";
};

const cancelCompraData = async () => {
  window.location.href = "./main.php";
};

const deleteCompraData = async () => {
  const result = await Swal.fire({
    title: "¿Eliminar esta compra?",
    text: "Esta acción no se puede deshacer.",
    icon: "warning",
    showCancelButton: true,
    confirmButtonColor: "#d33",
    cancelButtonColor: "#3085d6",
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
  });
  if (result.isConfirmed) {
    const data = {
      compra_id: sessionStorage.getItem("compra_id"),
    };
    const baseUrl = `../../api/compras/compra.php?deleteCompra`;
    try {
      const response = await axios.post(baseUrl, { data });
      if (response.data.success) {
        window.location.href = "./main.php";
      } else {
        Swal.fire(
          "Error",
          response.data.message || "No se pudo eliminar",
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Error de conexión con el servidor", "error");
    }
  }
};
