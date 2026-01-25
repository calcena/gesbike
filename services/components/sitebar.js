async function showLateralMenu() {
  document.getElementById("lateral-menu").classList.add("open");
  document.getElementById("menu-overlay").classList.add("active");
  document.body.style.overflow = "hidden";
  await getKmsDetail();
}

function hideLateralMenu() {
  document.getElementById("lateral-menu").classList.remove("open");
  document.getElementById("menu-overlay").classList.remove("active");
  document.body.style.overflow = ""; // Restaura scroll
}

function menuAction(action, deep) {
  hideLateralMenu();
  var basePath = ".";
  if (deep == 1) {
    basePath = "..";
  } else if (deep == 2) {
    basePath = "../..";
  } else if (deep == 3) {
    basePath = "../../..";
  }
  // Aquí puedes redirigir, cargar contenido, etc.
  switch (action) {
    case "inicio":
      window.location.href = `${basePath}/main.php`;
      break;
    case "mantenimiento":
      window.location.href = `${basePath}/mantenimientos/mantenimiento.php`;
      break;
    case "vehiculo":
      window.location.href = `${basePath}/vehiculos/vehiculo.php`;
      break;
    case "stock":
      window.location.href = `${basePath}/stocks/stock.php`;
      break;
    case "rutas":
      window.location.href = `${basePath}/rutas/ruta.php`;
      break;
    case "recambios":
      window.location.href = `${basePath}/recambios/main.php`;
      break;
    case "salir":
      window.location.href = `${basePath}/../index.php`;
      break;
    // Añade más casos según necesites
    default:
      alert('Función "' + action + '" no implementada aún.');
  }
}

// Cerrar menú al pulsar Escape
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    hideLateralMenu();
  }
});

const deleteKmsDetail = async () => {
  document.getElementById("kms_realizados").value = null;
  await applyKmsDetail(document.getElementById("kms_realizados").value);
};

const applyKmsDetail = async (kms) => {
  sessionStorage.setItem("kms_actuales", kms);
  if (window.location.href.includes("detalle.php")) {
    basePath = "../..";
  } else {
    basePath = "..";
  }
  if (kms.replace(/\s/g, "").length > 0) {
    const data = {
      vehiculo_id: sessionStorage.getItem("vehiculo_id"),
      kms: kms,
    };
    try {
      const response = await axios.post(
        `${basePath}/api/helpers/helper.php?setKilometrosByVehiculo`,
        { data },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (response.data.success) {
      }
    } catch (err) {
      console.log("applyKmsDetail", err);
    }

    if (window.location.href.includes("detalle.php")) {
      window.location.href = "./detalle.php";
    }
    if (!window.location.href.includes("main.php")) {
      window.location.href = "../detalles/detalle.php";
    } else {
      window.location.href = "../views/detalles/detalle.php";
    }
  }
};

const getKmsDetail = async () => {
  if (window.location.href.includes("views/main.php")) {
    basePath = "..";
  } else {
    basePath = "../..";
  }
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
  };
  try {
    const response = await axios.post(
      `${basePath}/api/helpers/helper.php?getKilometrosByVehiculo`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      if (response.data.content.kms != undefined)
        document.getElementById("kms_realizados").value =
          response.data.content.kms;
    }
  } catch (err) {
    console.log("getKmsDetail", err.response.data.error);
  }
};
