let modo = null;

const initCompras = async () => {
  await getListAllCompras();
};

const updatePrecioUnitario = () => {
  const unds = parseInt(document.getElementById("compra_unds").value) || 0;
  const precio = parseFloat(document.getElementById("compra_precio").value) || 0;
  const campo = document.getElementById("compra_precio_unitario");
  if (campo) {
    campo.value = unds > 0 ? (precio / unds).toFixed(2).replace(".", ",") : "";
  }
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
  updatePrecioUnitario();

  const undsInput = document.getElementById("compra_unds");
  const precioInput = document.getElementById("compra_precio");
  if (undsInput) {
    undsInput.addEventListener("input", updatePrecioUnitario);
  }
  if (precioInput) {
    precioInput.addEventListener("input", updatePrecioUnitario);
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

const transferCompraData = async () => {
  const compra_id = sessionStorage.getItem("compra_id");
  const recambio_id = sessionStorage.getItem("recambio_id");
  const unidadesOriginales = parseInt(document.getElementById("compra_unds").value);
  const precioOriginal = parseFloat(document.getElementById("compra_precio").value);

  if (!compra_id) {
    Swal.fire("Error", "No se ha identificado la compra.", "error");
    return;
  }
  if (unidadesOriginales <= 0) {
    Swal.fire("Error", "No hay unidades para transferir.", "error");
    return;
  }

  let vehiculos = [];
  let vehiculoActualId = null;
  let recambioReferencia = "";
  let recambioGrupoId = null;
  let recambioNombre = "";
  let recambioObservaciones = "";
  let recambioImagen = "";

  try {
    const recambioResp = await axios.post(
      `../../api/recambios/recambio.php?getRecambioById`,
      { data: { recambio_id } }
    );
    if (recambioResp.data.success && recambioResp.data.content) {
      const rec = recambioResp.data.content;
      vehiculoActualId = rec.vehiculo_id;
      recambioReferencia = rec.referencia || "";
      recambioGrupoId = rec.grupo_id;
      recambioNombre = rec.nombre || "";
      recambioObservaciones = rec.observaciones || "";
      recambioImagen = rec.imagen || "";
    }
  } catch (err) {
    console.error("getRecambioById", err);
  }

  try {
    const response = await axios.post(
      `../../api/vehiculos/vehiculo.php?getAllVehiculos`,
      { data: {} },
      {
        headers: { "Content-Type": "application/json" },
      }
    );
    if (response.data.success) {
      vehiculos = response.data.content;
    }
  } catch (err) {
    console.error("getAllVehiculos", err);
  }

  const vehiculosFiltrados = vehiculoActualId
    ? vehiculos.filter((v) => v.id !== vehiculoActualId)
    : vehiculos;

  const vehiculoOptions = vehiculosFiltrados
    .map(
      (v) =>
        `<option value="${v.id}">${v.nombre} - ${v.usuario_nombre || ""}</option>`
    )
    .join("");

  const { value: formValues } = await Swal.fire({
    title: "Transferencia de compra",
    html: `
      <div class="mt-2">
        <label for="transfer-vehiculo" class="form-label">Vehículo destino</label>
        <select id="transfer-vehiculo" class="form-select">
          <option value="">Selecciona...</option>
          ${vehiculoOptions}
        </select>
      </div>
      <div class="mt-2">
        <label for="transfer-unds" class="form-label">Unidades a transferir</label>
        <input id="transfer-unds" type="number" class="form-control" min="1" max="${unidadesOriginales}" value="1" />
      </div>
    `,
    showCancelButton: true,
    confirmButtonText: "Transferir",
    cancelButtonText: "Cancelar",
    preConfirm: () => {
      const vehiculoId = document.getElementById("transfer-vehiculo").value;
      const transferUnds = parseInt(
        document.getElementById("transfer-unds").value
      );
      if (!vehiculoId) {
        Swal.showValidationMessage("Selecciona un vehículo");
        return false;
      }
      if (!transferUnds || transferUnds <= 0) {
        Swal.showValidationMessage("Indica una cantidad válida");
        return false;
      }
      if (transferUnds > unidadesOriginales) {
        Swal.showValidationMessage("No hay suficientes unidades");
        return false;
      }
      return { vehiculoId, transferUnds };
    },
  });

  if (formValues) {
    const { vehiculoId, transferUnds } = formValues;
    const vehiculoSeleccionado = vehiculosFiltrados.find(
      (v) => v.id === parseInt(vehiculoId)
    );
    const nombreVehiculo = vehiculoSeleccionado
      ? vehiculoSeleccionado.nombre
      : vehiculoId;

    const { isConfirmed } = await Swal.fire({
      title: "Confirmar transferencia",
      text: `¿Traspasar ${transferUnds} unidad(es) al vehículo "${nombreVehiculo}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Sí, transferir",
      cancelButtonText: "Cancelar",
    });

    if (!isConfirmed) {
      return;
    }

    const precioUnitario = precioOriginal / unidadesOriginales;
    const precioTransferido = Math.round(precioUnitario * transferUnds * 100) / 100;
    const precioRestante = Math.round((precioOriginal - precioTransferido) * 100) / 100;
    const unidadesRestantes = unidadesOriginales - transferUnds;

    try {
      let targetRecambioId = recambio_id;

      const recambiosResp = await axios.post(
        `../../api/recambios/recambio.php?getListAllRecambios`,
        { data: { vehiculo_id: vehiculoId } }
      );

      if (recambiosResp.data.success) {
        const recambios = recambiosResp.data.content;
        const recambioExistente = recambios.find(
          (r) => r.referencia === recambioReferencia
        );
        if (recambioExistente) {
          targetRecambioId = recambioExistente.id;
        }
      }

      if (!targetRecambioId || targetRecambioId === recambio_id) {
        const nuevoRecambioData = {
          vehiculo_id: vehiculoId,
          grupo_id: recambioGrupoId,
          referencia: recambioReferencia,
          nombre: recambioNombre,
          observaciones: recambioObservaciones,
          imagen: recambioImagen || "",
          fecha: document.getElementById("compra_fecha").value,
        };
        try {
          const nuevoRecambioResp = await axios.post(
            `../../api/recambios/recambio.php?nuevoRecambio`,
            { data: nuevoRecambioData }
          );
          if (nuevoRecambioResp.data.success) {
            targetRecambioId = nuevoRecambioResp.data.content.id;
          }
        } catch (err) {
          console.error("nuevoRecambio", err);
        }
      }

      if (unidadesRestantes === 0) {
        const deleteData = { compra_id: compra_id };
        await axios.post(
          `../../api/compras/compra.php?deleteCompra`,
          { data: deleteData }
        );
      } else {
        const updateData = {
          compra_id: compra_id,
          fecha: document.getElementById("compra_fecha").value,
          proveedor: document.getElementById("compra_proveedor").value,
          unidades: unidadesRestantes,
          precio: precioRestante.toFixed(2),
          observaciones: document.getElementById("compra_observaciones").value,
        };
        await axios.post(
          `../../api/compras/compra.php?editarCompra`,
          { data: updateData }
        );
      }

      const newCompraData = {
        recambio_id: targetRecambioId,
        fecha: document.getElementById("compra_fecha").value,
        proveedor: document.getElementById("compra_proveedor").value,
        unidades: transferUnds,
        precio: precioTransferido.toFixed(2),
        observaciones: document.getElementById("compra_observaciones").value,
      };
      const newResponse = await axios.post(
        `../../api/compras/compra.php?nuevaCompra`,
        { data: newCompraData }
      );

        if (newResponse.data.success) {
          Swal.fire({
            title: "Transferencia completada",
            text: "La compra se ha traspasado correctamente.",
            icon: "success",
            toast: true,
            position: "top-end",
            showConfirmButton: false,
            timer: 5000,
            timerProgressBar: true,
          });
          await crearBackup();
          window.location.reload();
        } else {
        Swal.fire(
          "Error",
          "No se pudo crear la nueva compra.",
          "error"
        );
      }
    } catch (err) {
      console.error("transferCompraData", err);
      Swal.fire("Error", "Error al realizar la transferencia.", "error");
    }
  }
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
