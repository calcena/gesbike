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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="../../assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="../../assets/css/main/main.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/mantenimientos/mantenimiento.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body onload="initMantenimientos()">
    <div class="container mt-2 d-flex justify-content-end align-items-center ps-0 !important" style="gap: 1rem;">
        <img class="icon-menu ms-2" src="../../assets/images/icons/left.png" alt="" onclick="gotoBackMantenimientos()">
        <div class="container p-2">
            <select id="vehiculo-select" name="" class="form-select"
                onchange="setVehiculo(this.value)"></select>
        </div>
        <img class="icon-menu" src="../../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
    </div>

    <div class="container">
        <!-- Pestañas (Nav Tabs) -->
        <ul class="nav nav-tabs" id="myTab" role="tablist">
            <li class="nav-item" role="presentation">
                <button class="nav-link active" id="tab1-tab" data-bs-toggle="tab" data-bs-target="#tab1" type="button"
                    role="tab" aria-controls="tab1" aria-selected="true">
                    Datos
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link" id="tab2-tab" data-bs-toggle="tab" data-bs-target="#tab2" type="button"
                    role="tab" aria-controls="tab2" aria-selected="true">
                    Observaciones
                </button>
            </li>
            <li class="nav-item" role="presentation">
                <button class="nav-link disabled" id="tab3-tab" data-bs-toggle="tab" data-bs-target="#tab3"
                    type="button" role="tab" aria-controls="tab3" aria-selected="false" onclick="getListadoAdjuntos()">
                    Archivos
                </button>
            </li>
        </ul>
        <!-- Detalles -->
        <div class="tab-content mt-3" id="myTabContent">
            <div class="tab-pane fade show active" id="tab1" role="tabpanel" aria-labelledby="tab1-tab">
                <div class="row">
                    <div class="row mt-1">
                        <div class="w-50">
                            <label for="fecha" class="form-label">Fecha</label>
                            <input name="fecha" id="fecha_mantenimiento" type="date" class="form-control">
                        </div>
                        <div class="w-50">
                            <label class="form-label">Operación</label>
                            <select id="operacion_select" name="" class="form-select"
                                onchange="changeOperaciones(this.value)">
                            </select>
                        </div>
                    </div>
                </div>
                <div class="row mt-1">
                    <div class="w-50">
                        <label class="form-label">Grupo</label>
                        <select id="grupo_select" name="" class="form-select" onchange="changeGrupos()">
                        </select>
                    </div>
                    <div class="w-50">
                        <label class="form-label">Localización</label>
                        <select id="localizacion_select" name="" class="form-select">
                        </select>
                    </div>
                </div>
                <div class="row mt-1">
                    <div class="w-100">
                        <label class="form-label">Recambio</label>
                        <select id="recambio_select" name="" class="form-select"
                            onchange="changeRecambio(this.value)"></select>
                    </div>
                </div>
                <div class="row mt-1">
                    <div class="w-50">
                        <label class="form-label">Kms</label>
                        <input id="kms_mantenimiento" name="kms" type="number" class="form-control">
                    </div>
                    <div class="w-25">
                        <label for="und" class="form-label">Und</label>
                        <input id="unds_mantenimiento" name="und" type="number" class="form-control" required>
                    </div>
                    <div class="w-25">
                        <label for="und" class="form-label">Precio</label>
                        <input id="precio_mantenimiento" name="precio" type="number" class="form-control" disabled>
                    </div>
                </div>
                <div class="w-100 d-flex justify-content-around mt-2">
                    <img id="papelera_icon" class="action-icon d-none" src="../../assets/images/icons/papelera.png"
                        alt="" onclick="deleteMantenimiento()">
                    <img id="cancel_icon" class="action-icon" src="../../assets/images/icons/cancelar_icon.png" alt=""
                        onclick="cancelMantenimiento()"">
                    <img id="validate_save_icon" class="action-icon" src="../../assets/images/icons/guardar_icon.png"
                        alt="" onclick="validateMantenimiento()">
                </div>
            </div>
            <div class="tab-pane fade" id="tab2" role="tabpanel" aria-labelledby="tab2-tab">
                <div>
                    <textarea class="form-control" name="" id="observaciones_mantenimiento" cols="10"
                        rows="4"></textarea>
                </div>
            </div>
            <div class="tab-pane fade" id="tab3" role="tabpanel" aria-labelledby="tab3-tab">
                <!-- Imagen central (con margen inferior) -->
                <div class="row mb-3">
                    <div class="col d-flex justify-content-evenly">
                        <label class="action-icon cursor-pointer" title="Subir imagen">
                            <img class="action-icon" src="../../assets/images/icons/upload_file.png" alt="Subir imagen">
                            <input type="file" accept="image/*" style="display: none;"
                                onchange="handleFileUpload(this.files)">
                        </label>
                        <label class="action-icon p-1 cursor-pointer" title="Capturar imagen">
                            <img class="action-icon" src="../../assets/images/icons/camara.png" alt="Capturar imagen">
                            <input type="file" accept="image/*" capture="environment" style="display: none;"
                                onchange="handlePhotoUpload(this.files)">
                        </label>
                    </div>
                </div>
                <!-- Cards para mostrar el nombre del archivo y acciones-->
                <div class="row gap-2" id="main_cards">

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