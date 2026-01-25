// logData = {
//   usuario: 0,
//   animal: "",
//   modulo: "",
//   accion: "",
//   mensaje: "",
// };

const createLog = async (data, deep = 0) => {
  console.log("contenido de data", data);
  const token = document.querySelector('meta[name="api-key"]')?.content;
  var basePath = "";
  switch (deep) {
    case 1:
      basePath = "../api/log/log.php?add";
      break;
    case 2:
      basePath = "../../api/log/log.php?add";
      break;
    case 3:
      basePath = "../../../api/log/log.php?add";
      break;
    default:
      basePath = "api/log/log.php?add";
  }
  try {
    const response = await axios.post(
      basePath,
     {data},
      {
        headers: {
          "api-key": token,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    const err = error.response?.data?.error || "Error desconocido";
    mensaje.innerHTML = `<p class="error">${error}</p>`;
  }
};
