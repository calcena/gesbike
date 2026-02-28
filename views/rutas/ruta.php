<?php
require_once '../../helpers/helper.php';
require_once '../../helpers/config.php';
$GLOBALS['pathUrl'] = '../../';
$GLOBALS['navigation_deep'] = 1;
get_session_status();
debug_mode();
$_SESSION['base_path'] = dirname(__FILE__);
$url = isset($_SERVER['HTTPS']) &&
    $_SERVER['HTTPS'] === 'on' ? "https://" : "http://";
$_SESSION['index_url'] = $url . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];

?>
<!DOCTYPE html>
<html lang="en">

<head>
    <meta http-equiv='cache-control' content='no-cache'>
    <meta http-equiv='expires' content='0'>
    <meta http-equiv='pragma' content='no-cache'>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="../../assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="../../assets/css/main/main.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/rutas/ruta.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/rutas/ruta.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://html2canvas.hertzen.com/dist/html2canvas.min.js"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body onload="initRutas()">
    <div class="container mt-2 d-flex justify-content-between align-items-center ps-0 !important" style="gap: 1rem;">
        <img class="icon-menu ms-2" src="../../assets/images/icons/left.png" alt="" onclick="gotoBackMantenimientos()">
        <select id="vehiculo-select" name="" class="form-select mb-1" onchange="cambiarVehiculo(this.value)">
        </select>
        <img class="icon-menu" src="../../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
    </div>
    <div class="container p-2">

        <!-- Pestañas (Nav Tabs) -->
        <ul class="nav nav-tabs" id="myTab" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active px-2 px-md-3" id="tab1-tab" data-bs-toggle="tab" data-bs-target="#tab1" type="button"
                    role="tab" aria-controls="tab1" aria-selected="true">
                    <span style="font-size: 22px" class="d-md-none">📋</span>
                    <span style="font-size: 25px" class="d-none d-md-inline">📋</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link px-2 px-md-3" id="tab2-tab" data-bs-toggle="tab" data-bs-target="#tab2" type="button"
                    role="tab" aria-controls="tab2" aria-selected="false" onclick="">
                    <span style="font-size: 22px" class="d-md-none">📌</span>
                    <span style="font-size: 25px" class="d-none d-md-inline">📌</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link px-2 px-md-3" id="tab3-tab" data-bs-toggle="tab" data-bs-target="#tab3" type="button"
                    role="tab" aria-controls="tab3" aria-selected="false" onclick="">
                    <span style="font-size: 22px" class="d-md-none">⌚</span>
                    <span style="font-size: 25px" class="d-none d-md-inline">⌚</span>
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link px-2 px-md-3" id="tab4-tab" data-bs-toggle="tab" data-bs-target="#tab4" type="button"
                    role="tab" aria-controls="tab4" aria-selected="false" onclick="getResumenBiker()">
                    <span style="font-size: 22px" class="d-md-none">📊</span>
                    <span style="font-size: 25px" class="d-none d-md-inline">📊</span>
                </button>
            </li>
            <li class="nav-item ms-auto d-flex align-items-end" role="presentation" style="padding-left: 5px;">
                <div class="input-group" style="margin-bottom: -1px;" id="searchContainer">
                    <!-- Icono de búsqueda visible en móvil -->
                    <span class="input-group-text d-md-none"
                          style="background: transparent; border: none; cursor: pointer; padding: 0 5px 8px 0;"
                          onclick="toggleSearchMobile()">
                        <i class="fas fa-search" style="font-size: 18px;"></i>
                    </span>
                    <!-- Input visible en desktop -->
                    <span class="input-group-text d-none d-md-flex"
                          style="background: transparent; border: none; padding: 0 5px 8px 0;">
                        <i class="fas fa-search" style="font-size: 14px;"></i>
                    </span>
                    <input type="text" id="searchRutas" class="form-control form-control-sm d-none d-md-block"
                        placeholder="Buscar..."
                        style="width: 110px; border-radius: 4px 4px 0 0; border-bottom: 2px solid #dee2e6; padding: 0.25rem 0.4rem; font-size: 0.8rem;"
                        onkeyup="filtrarRutas(this.value)">
                    <!-- Input móvil expandido -->
                    <input type="text" id="searchRutasMobile" class="form-control form-control-sm d-md-none"
                        placeholder="Buscar..."
                        style="width: 0; padding: 0; border: none; transition: all 0.3s ease; font-size: 0.8rem;"
                        onkeyup="filtrarRutas(this.value)">
                </div>
            </li>
        </ul>
        <!-- Contenido de las pestañas -->
        <div class="tab-content mt-3" id="myTabContent">
            <div class="tab-pane fade show active" id="tab1" role="tabpanel" aria-labelledby="tab1-tab">
                <div class="row" id="main_cards">
                </div>

            </div>
            <div class="tab-pane fade" id="tab2" role="tabpanel" aria-labelledby="tab2-tab">
                <div class="row">
                    <div class="w-50">
                        <label for="fecha">Fecha</label>
                        <input name="fecha" id="fecha_ruta" type="date" class="form-control">
                    </div>
                    <div class="w-50">
                        <label for="kms">Kms</label>
                        <input id="kms_ruta" type="number" step="0.1" class="form-control">
                    </div>
                </div>
                <div class="row mt-1">
                    <div class="w-100">
                        <label for="obs">Observaciones</label>
                        <textarea name="obs" id="obs_ruta" col="4" rows="4" class="form-control"></textarea>
                    </div>

                </div>
                <div class="row mt-2 justify-content-around">
                    <img class="action-icon" src="../../assets/images/icons/papelera.png" alt="">
                    <img class="action-icon" src="../../assets/images/icons/cancelar_icon.png" alt=""
                        onclick="cancelarEdicionRuta()" id="cancelar_btn" style="display: none;">
                    <img class="action-icon" src="../../assets/images/icons/validate_icon.png" alt=""
                        onclick="guardarRutaManual()" id="guardar_btn">
                </div>
            </div>
            <div class="tab-pane fade" id="tab3" role="tabpanel" aria-labelledby="tab3-tab">
                <div class="row">
                    <div class="col w-100 d-flex justify-content-around">
                        <label for="gpxFile" class="action-icon-wrapper" style="cursor: pointer;">
                            <img class="" height="60px" src="../../assets/images/icons/importar_gpx.png"
                                alt="Importar archivo GPX">
                        </label>
                        <input type="file" id="gpxFile" accept=".gpx" style="display: none;"
                            aria-label="Seleccionar archivo GPX" />
                        <label for="gpxMultipleFile" class="action-icon-wrapper" style="cursor: pointer;">
                            <img class="" height="60px" src="../../assets/images/icons/importar_varios_gpx.png"
                                alt="Importar multiples archivos GPX">
                        </label>
                        <input type="file" id="gpxMultipleFile" accept=".gpx" multiple style="display: none;"
                            aria-label="Seleccionar archivos GPX" />
                    </div>
                </div>
                <div class="row mt-3">
                    <div class="col-12">
                        <div id="loading-indicator" class="text-center" style="display: none;">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">Procesando GPX...</span>
                            </div>
                            <p class="mt-2">Procesando archivo GPX...</p>
                        </div>
                        <div id="output-container" class="row g-3"></div>
                    </div>
                </div>
            </div>
            <div class="tab-pane fade show" id="tab4" role="tabpanel" aria-labelledby="tab4-tab">
                <div class="accordion mt-0" id="accordionSummary">
                </div>

            </div>
        </div>
    </div>
    <div class="container footer-location text-center">
        <?php
        $source = 'main';
        include_once("../components/footer.php"); ?>
    </div>
    <?php include __DIR__ . '/../components/sidebar.php'; ?>
</body>

</html>