<?php
require_once '../../helpers/helper.php';
require_once '../../helpers/config.php';
$GLOBALS['pathUrl'] = '../../';
$GLOBALS['navigation_deep'] = 1;
get_session_status();
debug_mode();
$modo = $_GET["modo"];
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
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="../../assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="../../assets/css/main/main.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/theme.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="../../assets/css/grupos/grupo.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/grupos/grupo.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/theme/theme.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body id="mainBody" data-modo="<?php echo $modo; ?>" onload="initGrupoForm(); initTheme()">
    <div class="container mt-2">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <img class="icon-menu" src="../../assets/images/icons/left.png" alt="" onclick="cancelarFormulario()">
            <h5 class="mb-0"><?php echo $modo === 'editar' ? 'Editar' : 'Nuevo'; ?> Grupo</h5>
            <div style="width: 40px;"></div>
        </div>

        <div class="mb-3">
            <label class="form-label">Nombre *</label>
            <input class="form-control field-required" id="grupo_nombre" type="text" placeholder="Nombre del grupo">
        </div>

        <div class="mb-3">
            <label class="form-label">Icono</label>
            <div class="icon-grid" id="icon-grid">
            </div>
            <input type="hidden" id="grupo_imagen" value="">
        </div>

        <div class="mb-3">
            <label class="form-label">Agrupador</label>
            <select class="form-select" id="grupo_agrupador">
                <option value="0">Ninguno</option>
            </select>
        </div>

        <div class="mb-3 form-check form-switch">
            <input class="form-check-input" type="checkbox" id="grupo_trazabilidad">
            <label class="form-check-label" for="grupo_trazabilidad">Trazabilidad</label>
        </div>

        <div class="mb-3 form-check form-switch">
            <input class="form-check-input" type="checkbox" id="grupo_vista_resumen">
            <label class="form-check-label" for="grupo_vista_resumen">Vista resumen</label>
        </div>

        <hr>
        <div class="w-100 d-flex justify-content-around">
            <img class="icon-register-action" src="../../assets/images/icons/cancelar_icon.png" alt="" onclick="cancelarFormulario()">
            <img class="icon-register-action" src="../../assets/images/icons/save.png" alt="" onclick="guardarGrupo()">
        </div>
    </div>
</body>

</html>
