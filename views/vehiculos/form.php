<?php
require_once '../../helpers/helper.php';
require_once '../../helpers/config.php';
$GLOBALS['pathUrl'] = '../../';
$GLOBALS['navigation_deep'] = 1;
get_session_status();
debug_mode();
$modo = $_GET["modo"] ?? 'nuevo';
?>
<!DOCTYPE html>
<html lang="en">
<script>(function(){var t=sessionStorage.getItem('theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}})()</script>

<head>
    <meta http-equiv='cache-control' content='no-cache'>
    <meta http-equiv='expires' content='0'>
    <meta http-equiv='pragma' content='no-cache'>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="../../assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="../../assets/css/main/main.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/theme.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/vehiculos/vehiculo.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/vehiculos/vehiculo.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/theme/theme.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body id="mainBody" data-modo="<?php echo $modo; ?>" onload="initVehiculoForm(); initTheme()">
    <div class="container mt-2">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <img class="icon-menu" src="../../assets/images/icons/left.png" alt="" onclick="cancelarFormulario()">
            <h5 class="mb-0"><?php echo $modo === 'editar' ? 'Editar' : 'Nuevo'; ?> Vehículo</h5>
            <div style="width: 40px;"></div>
        </div>

        <div class="text-center mb-3">
            <div class="upload-container" onclick="document.getElementById('input_foto_vehiculo').click()">
                <img id="img_preview" src="" alt="Foto vehículo" class="upload-preview d-none">
                <div id="img_placeholder" class="upload-placeholder">
                    <i class="fas fa-camera fa-3x"></i>
                    <p class="mt-2 mb-0">Tocar para añadir foto</p>
                </div>
            </div>
            <input type="file" id="input_foto_vehiculo" accept="image/*" style="display:none" onchange="uploadImage(this)">
            <small class="text-muted d-block mt-1">Puedes hacer una foto o seleccionar de la galería</small>
        </div>

        <div class="mb-3">
            <label class="form-label">Nombre *</label>
            <input class="form-control field-required" id="vehiculo_nombre" type="text" placeholder="Nombre de la bicicleta">
        </div>

        <div class="mb-3">
            <label class="form-label">Anagrama *</label>
            <input class="form-control field-required" id="vehiculo_anagrama" type="text" placeholder="Identificador corto">
        </div>

        <div class="mb-3">
            <label class="form-label">Fecha de compra *</label>
            <input class="form-control field-required" id="vehiculo_fecha_compra" type="date">
        </div>

        <div class="mb-3">
            <label class="form-label">KMs iniciales</label>
            <input class="form-control" id="vehiculo_kms_inicio" type="number" value="0">
        </div>

        <div class="mb-3">
            <label class="form-label">Categoría</label>
            <select class="form-select" id="vehiculo_categoria">
                <option value="pulmonar">Pulmonar</option>
                <option value="electrica">Eléctrica</option>
            </select>
        </div>

        <div class="mb-3">
            <label class="form-label">Observaciones</label>
            <textarea class="form-control" id="vehiculo_observaciones" rows="3" placeholder="Notas adicionales..."></textarea>
        </div>

        <hr>
        <div class="d-flex justify-content-around mb-4">
            <img class="icon-register-action" src="../../assets/images/icons/cancelar_icon.png" alt="Cancelar" onclick="cancelarFormulario()">
            <img class="icon-register-action" src="../../assets/images/icons/save.png" alt="Guardar" onclick="guardarVehiculo()">
        </div>
    </div>
</body>

</html>
