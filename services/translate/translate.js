const translate = async (source, level = 0) => {
  const token = document.querySelector('meta[name="api-key"]')?.content;
  const mensaje = document.getElementById("mensaje");

  try {
    const idioma = localStorage.getItem("huellas_intranet_language") || "es";
    switch (level) {
      case 0:
        basePath = "api/helpers/helper.php?translate";
        break;
      case 1:
        basePath = "../api/helpers/helper.php?translate";
        break;
      case 2:
        basePath = "../../api/helpers/helper.php?translate";
        break;
      case 3:
        basePath = "../../../api/helpers/helper.php?translate";
        break;
      case 4:
        basePath = "../../../../../api/helpers/helper.php?translate";
        break;
      case 5:
        basePath = "../../../../../../api/helpers/helper.php?translate";
        break;
    }

    const response = await axios.post(
      basePath,
      {
        source: source,
        language: idioma,
      },
      {
        headers: {
          "api-key": token,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("Traducciones: ", response.data.content);

    // ✅ Aplicar las traducciones al DOM
    aplicarTraducciones(response.data.content, idioma);

    // ✅ Registrar log solo si todo fue bien
    // const logData = {
    //   usuario: response.data.content?.idusuario || 0,
    //   modulo: "index.php",
    //   accion: "translate",
    //   mensaje: "Traducción obtenida con éxito",
    //   animal: 0,
    // };
    // await createLog(logData);
  } catch (error) {
    const err = error.response?.data?.error || "Error desconocido";
    if (mensaje) {
      mensaje.innerHTML = `<p class="error">${err}</p>`;
    }
    console.error("Error en translate:", err);
  }
};

// 🔧 Función auxiliar: aplicarTraducciones
function aplicarTraducciones(traducciones, idioma = "es") {
  if (!Array.isArray(traducciones)) {
    console.error("El formato de traducciones no es un array.");
    return;
  }

  traducciones.forEach((item) => {
    const elemento = document.getElementById(item.tag_id);

    if (!elemento && item.tag_type != "storage") {
      console.warn(
        `Elemento con ID "${item.tag_id}" no encontrado en el DOM del documento`
      );
      return;
    }

    const texto = item[idioma] ?? "<**>";

    if (texto === undefined) {
      console.warn(
        `No se encontró la traducción para el idioma "${idioma}" en el elemento "${item.tag_id}".`
      );
      return;
    }

    switch (item.tag_type) {
      case "button":
      case "label":
      case "span":
      case "div":
      case "th":
      case "a":
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
      case "p":
        elemento.textContent = texto;
        break;
      case "placeholder":
        elemento.placeholder = texto;
        break;
      case "title":
        elemento.title = texto;
        break;
      case "value":
        elemento.value = texto;
        break;
      case "alt":
        elemento.alt = texto;
        break;
      case "aria-label":
        elemento.setAttribute("aria-label", texto);
        break;
      case "storage":
        console.log("Estamos en storage");
        sessionStorage.setItem(item.tag_id, texto);
        break;
      default:
        console.warn(
          `tag_type "${item.tag_type}" no soportado para el elemento "${item.tag_id}".`
        );
    }
  });
}
