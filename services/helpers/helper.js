const loadDefaultDate = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // +1 porque getMonth() es 0-11
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatFechaISO = (fecha) => {
  const [year, month, day] = fecha.split("-").map(Number);
  if (!year || !month || !day || isNaN(year) || isNaN(month) || isNaN(day)) {
    return "";
  }
  const dia = String(day).padStart(2, "0");
  const mes = String(month).padStart(2, "0");
  return `${dia}/${mes}/${year}`;
};

const formatFechaTimeISO = (fecha) => {
  if (!fecha) return "";

  try {
    const dateObj = new Date(fecha);
    if (isNaN(dateObj.getTime())) {
      return "";
    }
    const dia = String(dateObj.getDate()).padStart(2, "0");
    const mes = String(dateObj.getMonth() + 1).padStart(2, "0"); // Los meses van de 0-11
    const año = dateObj.getFullYear();
    const horas = String(dateObj.getHours()).padStart(2, "0");
    const minutos = String(dateObj.getMinutes()).padStart(2, "0");
    return `${dia}/${mes}/${año} ${horas}:${minutos}`;
  } catch (error) {
    console.error("Error formateando fecha:", error);
    return "";
  }
};

const setVehiculo = async (id) => {
  if (id !== undefined) {
    await sessionStorage.setItem("vehiculo_id", id);
  } else {
    document.getElementById("vehiculo-select").selectedIndex = 0;
    await sessionStorage.setItem(
      "vehiculo_id",
      document.getElementById("vehiculo-select").value
    );
  }
};

const selectVehiculo = async (deep) => {
  document.getElementById("vehiculo-select").value =
    await sessionStorage.getItem("vehiculo_id");
  await getMotorVehiculo(deep);
};

const getMotorVehiculo = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
  };
  try {
    const response = await axios.post(
      `${baseUrl}/api/vehiculos/vehiculo.php?getMotorVehiculo`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      sessionStorage.setItem("motor_id", response.data.content.motor_id);
    }
  } catch (err) {
    console.log("getMotorVehiculo", err);
  }
};

function selectContainsText(selectId, subcadena) {
  const select = document.getElementById(selectId);
  const textoBuscado = subcadena.trim().toLowerCase(); // normalizado para búsqueda insensible a mayúsculas

  for (let i = 0; i < select.options.length; i++) {
    const textoOpcion = select.options[i].textContent.trim().toLowerCase();
    if (textoOpcion.includes(textoBuscado)) {
      select.selectedIndex = i;
      return;
    }
  }

  console.warn(`No se encontró ninguna opción que contenga: "${subcadena}"`);
}

const getVehiculosByUser = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {
    usuario_id: sessionStorage.getItem("usuario_id"),
  };
  try {
    const response = await axios.post(
      `${baseUrl}/api/helpers/helper.php?getVehiculosByUser`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      const select = document.getElementById("vehiculo-select");
      select.innerHTML =
        '';

      // Creamos el grupo solo para los inactivos
      const grupoInactivos = document.createElement("optgroup");
      grupoInactivos.label = "Vehículos Inactivos";

      response.data.content.forEach((element) => {
        const option = document.createElement("option");
        option.value = element.id;
        option.textContent = element.nombre;

        if (element.is_active == 0) {
          option.textContent = `🚫 ${element.nombre}`;
          grupoInactivos.appendChild(option);
        } else {
          // Si es activo, lo añadimos directamente al select (sin label/grupo)
          select.appendChild(option);
        }
      });

      // Al final, si el grupo de inactivos tiene elementos, lo añadimos al select
      if (grupoInactivos.children.length > 0) {
        select.appendChild(grupoInactivos);
      }
    }
  } catch (err) {
    console.log("getVehiculosByUser", err.response.data.error);
  }
};

const getOperaciones = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {};
  try {
    const response = await axios.post(
      `${baseUrl}/api/helpers/helper.php?getOperacion`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      window.operacionesData = response.data.content;
      const btn = document.getElementById("operacion_select");
      if (btn && btn.tagName === "BUTTON") {
        if (!btn.dataset.selected) {
          btn.textContent = "Selecciona...";
        }
      } else if (btn) {
        btn.innerHTML = null;
        const option = document.createElement("option");
        option.value = 0;
        option.textContent = "Selecciona...";
        btn.appendChild(option);
        response.data.content.forEach((element) => {
          const option = document.createElement("option");
          option.value = element.id;
          option.textContent = element.nombre;
          btn.appendChild(option);
        });
      }
    }
  } catch (err) {
    console.log("getVehiculosByUser", err.response.data.error);
  }
};

const getGrupos = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {};
  try {
    const response = await axios.post(
      `${baseUrl}/api/helpers/helper.php?getGrupos`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      window.gruposData = response.data.content;
      const btn = document.getElementById("grupo_select");
      if (btn && btn.tagName === "BUTTON") {
        if (!btn.dataset.selected) {
          btn.textContent = "Selecciona...";
        }
      } else if (btn) {
        btn.innerHTML = null;
        const option = document.createElement("option");
        option.value = 0;
        option.textContent = "Selecciona...";
        btn.appendChild(option);
        response.data.content.forEach((element) => {
          const option = document.createElement("option");
          option.value = `${element.id}-${element.agrupador_id}`;
          option.textContent = element.nombre;
          btn.appendChild(option);
        });
        sessionStorage.setItem(
          "agrupador_id",
          document.getElementById("grupo_select").value
        );
      }
    }
  } catch (err) {
    console.log("getVehiculosByUser", err.response.data.error);
  }
};

const getLocalizaciones = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {
    agrupador_id: sessionStorage.getItem("agrupador_id"),
  };
  try {
    const response = await axios.post(
      `${baseUrl}/api/helpers/helper.php?getLocalizaciones`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      window.localizacionesData = response.data.content;
      const btn = document.getElementById("localizacion_select");
      if (btn && btn.tagName === "BUTTON") {
        if (!btn.dataset.selected) {
          btn.textContent = "Selecciona...";
        }
      } else if (btn) {
        btn.innerHTML = null;
        const option = document.createElement("option");
        option.value = 0;
        option.textContent = "Selecciona...";
        btn.appendChild(option);
        if (response.data.content.length > 0) {
          response.data.content.forEach((element) => {
            const option = document.createElement("option");
            option.value = element.id;
            option.textContent = element.nombre;
            btn.appendChild(option);
          });
        }
      }
    }
  } catch (err) {
    console.log("getLocalizaciones", err.response.data.error);
  }
};

const getRecambios = async (deep = 1) => {
  var baseUrl = "..";
  if (deep == 2) {
    baseUrl = "../..";
  }
  const data = {
    vehiculo_id: sessionStorage.getItem("vehiculo_id"),
    grupo_id: sessionStorage.getItem("grupo_id"),
  };
  try {
    const response = await axios.post(
      `${baseUrl}/api/recambios/recambio.php?getRecambios`,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      console.log("getRecambios=>", response.data.content);
      window.recambiosData = response.data.content;
      const btn = document.getElementById("recambio_select");
      if (btn && btn.tagName === "BUTTON") {
        if (!btn.dataset.selected) {
          btn.textContent = "Selecciona...";
        }
      } else if (btn) {
        btn.innerHTML = null;
        const option = document.createElement("option");
        option.value = 0;
        option.textContent = "Selecciona...";
        btn.appendChild(option);
        if (response.data.content.length > 0) {
          response.data.content.forEach((element) => {
            const option = document.createElement("option");
            option.value = element.id;
            option.textContent = `${element.nombre}(${element.stock})`;
            btn.appendChild(option);
          });
        }
      }
    }
  } catch (err) {
    console.log("getRecambios", err);
  }
};

window.versionKey = Date.now();
window.cacheBustUrl = (url) => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${window.versionKey}`;
};

const formatKilometersBadges = async () => {
  document.querySelectorAll('span[name="kms"]').forEach((span) => {
    let text = span.textContent.trim();
    if (!text) return;
    const hasDecimal = text.includes(",") || text.includes(".");
    const match = text.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:[,\.](\d+))?$/);
    if (!match) return;
    let integerPart = match[1].replace(/\./g, ""); // eliminar puntos de miles
    const decimalPart = match[2] || (hasDecimal ? "00" : "");
    integerPart = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    const formatted = decimalPart
      ? `${integerPart},${decimalPart.padEnd(2, "0").slice(0, 2)}`
      : integerPart;

    span.textContent = formatted;
  });
};

const removeSessionItems = (keys) => {
  const keyArray = Array.isArray(keys) ? keys : [keys];
  keyArray.forEach((key) => sessionStorage.removeItem(key));
};

const crearBackup = async () => {
  const urlEndpoint = "../../helpers/backup.php";
  try {
    const response = await fetch(urlEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        throw new Error(
          `Error de servidor (${response.status}): Respuesta no JSON.`
        );
      }
      throw new Error(
        `Error de servidor (${response.status}): ${
          errorData.message || "Error desconocido del backend"
        }`
      );
    }
    const data = await response.json();
    if (data.success) {
      console.log("✅ Backup finalizado con éxito:", data.message);
    } else {
      console.error("❌ Error lógico al realizar el backup:", data.message);
    }
  } catch (error) {
    console.error("❌ Fallo crítico en el backup:", error.message);
  }
};
