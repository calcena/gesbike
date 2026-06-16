async function showLateralMenu() {
  document.getElementById("lateral-menu").classList.add("open");
  document.getElementById("menu-overlay").classList.add("active");
  document.body.style.overflow = "hidden";
  await Promise.all([getKmsDetail(), updateAgendaBadges()]);
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
    case "vehiculos":
      window.location.href = `${basePath}/vehiculos/vehiculo.php`;
      break;
    case "grupos":
      window.location.href = `${basePath}/grupos/main.php`;
      break;
    case "stock":
      window.location.href = `${basePath}/stocks/stock.php`;
      break;
    case "agendas":
      window.location.href = `${basePath}/agendas/main.php`;
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

async function deleteKmsDetail() {
  document.getElementById("kms_realizados").value = null;
  await applyKmsDetail(document.getElementById("kms_realizados").value);
}

async function applyKmsDetail(kms) {
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

async function getKmsDetail() {
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

window.updateAgendaBadge = (vencidos, pendientes) => {
  const badgeV = document.getElementById("agenda-badge-vencidos");
  const badgeP = document.getElementById("agenda-badge-pendientes");
  if (badgeV) {
    if (vencidos > 0) {
      badgeV.textContent = vencidos;
      badgeV.classList.remove("d-none");
    } else {
      badgeV.classList.add("d-none");
    }
  }
  if (badgeP) {
    if (pendientes > 0) {
      badgeP.textContent = pendientes;
      badgeP.classList.remove("d-none");
    } else {
      badgeP.classList.add("d-none");
    }
  }
};

async function updateAgendaBadges() {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) {
    updateAgendaBadge(0, 0);
    return;
  }
  // Verificar que el vehículo esté activo
  const vehActivo = window.vehiculosData
    ? window.vehiculosData.some(v => v.id == vehiculoId && v.is_active == 1)
    : true;
  if (!vehActivo) {
    updateAgendaBadge(0, 0);
    return;
  }
  const basePath = window.location.href.includes("views/main.php") ? ".." : "../..";
  try {
    const [agendaResp, kmsResp] = await Promise.all([
      axios.post(
        `${basePath}/api/programaciones/programacion.php?getTodasPredicciones`,
        { data: { vehiculo_id: vehiculoId } },
        { headers: { "Content-Type": "application/json" } }
      ),
      axios.post(
        `${basePath}/api/helpers/helper.php?getKilometrosByVehiculo`,
        { data: { vehiculo_id: vehiculoId } },
        { headers: { "Content-Type": "application/json" } }
      )
    ]);
    if (agendaResp.data.success) {
      const currentKms = kmsResp.data.success && kmsResp.data.content.kms != null
        ? parseFloat(kmsResp.data.content.kms) || 0
        : 0;
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      let v = 0, p = 0;
      (agendaResp.data.content || []).forEach(item => {
        const fechaPasada = item.proxima_fecha
          ? new Date(item.proxima_fecha + "T00:00:00") < hoy
          : false;
        const kmsExcedidos = item.proximos_kms != null && currentKms > 0
          ? currentKms >= item.proximos_kms
          : false;
        if (!item.proxima_fecha && item.proximos_kms == null) return;
        if (fechaPasada || kmsExcedidos) v++; else p++;
      });
      updateAgendaBadge(v, p);
    } else {
      updateAgendaBadge(0, 0);
    }
  } catch (e) {
    updateAgendaBadge(0, 0);
  }
}

document.addEventListener("DOMContentLoaded", updateAgendaBadges);
