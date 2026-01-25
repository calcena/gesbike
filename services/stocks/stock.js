const initStock = async () => {
  await getVehiculosByUser(2);
  await selectVehiculo(sessionStorage.getItem("vehiculo_id"));
  await getListStocks();
};

const getListStocks = async () => {
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
  };
  try {
    const response = await axios.post(
      "../../api/stocks/stock.php?getStockByVehiculo",
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      document.getElementById("main-cards").innerHTML =
        await parseHtmlCardStock(response.data.content);
    }
  } catch (error) {
    console.error(error.message);
  }
};

const parseHtmlCardStock = async (data) => {

  pathGrupo = "../../assets/images/icons/Grupos/";
  const cards = data.map((item) => {
      vehiculoIcon = `../../assets/images/icons/Vehiculos/${item.bullet_vehiculo}`;
    return `
      <div class="col">
        <div class="card shadow-sm">
          <div class="card-body d-flex justify-content-between align-items-center" onclick="mostrarFotoRecambio('${item.recambio_imagen}')">
            <div class="flex-grow-1">
              <div class="d-flex justify-content-between align-items-start">
                <img src="${pathGrupo}${item.grupo_imagen}" alt="Grupo" class="icon-table">
                <span id="texto-referencia">${item.referencia}</span>
                <span class="badge bg-success">${item.unidades}</span>
              </div>
              <div class="mt-2 d-flex justify-content-around align-items-center flex-wrap">
                <span class="text-obs">${item.observaciones}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  return cards.join("");
};

const cambiarVehiculo = async (id) => {
  await setVehiculo(id);
  await getListStocks();
};

const mostrarFotoRecambio = async (nombreArchivo) => {
  if (nombreArchivo == "camara.png") {
    nombreArchivo = `../../assets/images/icons/${nombreArchivo}`;
  } else {
    nombreArchivo = `../../assets/images/Recambios/${nombreArchivo}`;
  }
  Swal.fire({
    imageUrl: nombreArchivo,
    imageWidth: 400,
    imageHeight: 200,
    showCloseButton: true,
  });
};

const showDescription = async () => {
  await Swal.fire({
    position: "center",
    icon: "info",
    title: "Your work has been saved",
    showConfirmButton: false,
    timer: 1500,
  });
};

const gotoBackMantenimientos = async() =>{
  window.location.href = '../main.php'
}