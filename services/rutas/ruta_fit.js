// ========== FUNCIONALIDAD PARA ARCHIVOS FIT ==========

function setupFITUpload() {
  const fitInput = document.getElementById("fitFile");
  const loadingIndicator = document.getElementById("loading-indicator");

  if (!fitInput) return;

  fitInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const loading = loadingIndicator;
    if (loading) loading.style.display = "block";
    document.getElementById("output-container").innerHTML = "";

    try {
      const result = await uploadFITFile(file);
      if (result.success) {
        const container = document.getElementById("output-container");
        container.innerHTML = generarContenidoFIT(result.content);
        await getRutasByVehiculo();
        Swal.fire({
          text: "Ruta FIT guardada correctamente",
          icon: "success",
          timer: 2000,
          showConfirmButton: false,
        });
      }
    } catch (err) {
      console.error("Error FIT:", err);
      document.getElementById("output-container").innerHTML = `
        <div class="col-12">
          <div class="alert alert-danger">${err.message || "Error procesando archivo FIT"}</div>
        </div>
      `;
    } finally {
      if (loading) loading.style.display = "none";
      e.target.value = "";
    }
  });
}

function setupMultipleFITUpload() {
  const multipleInput = document.getElementById("fitMultipleFile");
  if (!multipleInput) return;

  multipleInput.addEventListener("change", handleMultipleFITFiles);
}

async function handleMultipleFITFiles(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  const loadingIndicator = document.getElementById("loading-indicator");
  if (loadingIndicator) loadingIndicator.style.display = "block";
  document.getElementById("output-container").innerHTML = "";

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    document.getElementById("output-container").innerHTML = `
      <div class="col-12 text-center">
        <p>Procesando ${i + 1}/${files.length}: ${file.name}</p>
        <div class="spinner-border text-primary" role="status"></div>
      </div>
    `;

    try {
      const result = await uploadFITFile(file, true);
      if (result.success) successCount++;
      else errorCount++;
    } catch (err) {
      console.error(`Error en ${file.name}:`, err);
      errorCount++;
    }
  }

  if (loadingIndicator) loadingIndicator.style.display = "none";

  await Swal.fire({
    title: "Procesamiento completado",
    html: `
      <div class="text-start">
        <p><strong>Total archivos procesados:</strong> ${files.length}</p>
        <p class="text-success"><strong>Correctos:</strong> ${successCount}</p>
        ${errorCount > 0 ? `<p class="text-danger"><strong>Errores:</strong> ${errorCount}</p>` : ""}
      </div>
    `,
    icon: errorCount === 0 ? "success" : "warning",
    confirmButtonText: "Aceptar",
  });

  await getRutasByVehiculo();
  e.target.value = "";
}

async function uploadFITFile(file, silent = false) {
  const vehiculoId = sessionStorage.getItem("vehiculo_id");
  if (!vehiculoId) {
    throw new Error("No hay vehiculo seleccionado");
  }

  const formData = new FormData();
  formData.append("fit_file", file);
  formData.append("vehiculo_id", vehiculoId);

  const response = await axios.post(
    getApiUrl("ruta_fit.php?uploadFit"),
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    }
  );

  if (!response.data.success) {
    throw new Error(response.data.error || "Error del servidor");
  }

  return response.data;
}

function generarContenidoFIT(data) {
  const hasHR = data.frecuencia_cardiaca_promedio != null;
  const hasPower = data.potencia_promedio_w != null && data.potencia_promedio_w > 0;
  return `
    <div class="ruta-details-captura" style="background: #fff; border: 2px solid #667eea; border-radius: 10px; padding: 15px; max-height: 400px; overflow-y: auto;">
      <h6 style="color: #667eea; font-weight: bold; margin-bottom: 10px;">
        <i class="fas fa-check-circle text-success"></i> Ruta FIT importada
      </h6>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Distancia</span>
        <span style="font-weight: 600;">${data.kms} km</span>
      </div>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Pulsaciones promedio</span>
        <span style="font-weight: 600;">${hasHR ? data.frecuencia_cardiaca_promedio + " bpm" : "N/A"}</span>
      </div>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Pulsaciones maximas</span>
        <span style="font-weight: 600;">${hasHR ? data.frecuencia_cardiaca_maxima + " bpm" : "N/A"}</span>
      </div>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Potencia promedio</span>
        <span style="font-weight: 600;">${hasPower ? data.potencia_promedio_w + " W" : "N/A"}</span>
      </div>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Calorias</span>
        <span style="font-weight: 600;">${data.calorias || "—"}</span>
      </div>
      <div class="detail-row-captura" style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee;">
        <span style="font-weight: 500;">Puntos guardados</span>
        <span style="font-weight: 600;">${data.pulsaciones_count}</span>
      </div>
    </div>
  `;
}

async function getPulsacionesByRuta(rutaId) {
  try {
    const response = await axios.post(
      getApiUrl("ruta_fit.php?getPulsaciones"),
      { data: { ruta_id: rutaId } },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.success) return response.data.content;
    return [];
  } catch (err) {
    console.error("Error cargando pulsaciones:", err);
    return [];
  }
}

async function getPulsacionesSummaryByRuta(rutaId) {
  try {
    const response = await axios.post(
      getApiUrl("ruta_fit.php?getPulsacionesSummary"),
      { data: { ruta_id: rutaId } },
      { headers: { "Content-Type": "application/json" } }
    );
    if (response.data.success) return response.data.content;
    return null;
  } catch (err) {
    console.error("Error cargando resumen pulsaciones:", err);
    return null;
  }
}
