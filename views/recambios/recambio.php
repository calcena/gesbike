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
    <link href="../../assets/css/recambios/recambio.css?<?php random_file_enumerator() ?>" rel="stylesheet"
        type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/recambios/recambio.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body id="mainBody" data-modo="<?php echo $modo; ?>" onload="initRecambiosNuevoEdit()">
    <div class="container mt-2">
        <div class="mt-2 w-100">
            <input type="file" id="input_foto_recambio" accept="image/*" style="display:none" onchange="uploadImage(this)">
            <img id="img_preview" src="" alt="" style="width: 150px; height: 120px; margin-left: 4rem; " class="invisible">
            <img class="icon-register-action" src="../../assets/images/icons/camara.png" alt="Subir foto" style="margin-left: 4rem;" onclick="document.getElementById('input_foto_recambio').click()">
        </div>
        <div class="mt-2">
            <label for="recambio_grupo"></label>
            <select class="form-select" name="recambio_grupo" id="recambio_grupo"></select>
        </div>
        <div  class="mt-2">
            <label for="recambio_referencia">Referencia</label>
            <input class="form-control field-required"  id="recambio_referencia" name="recambio_referencia" type="text" />
        </div>
        <div  class="mt-2">
            <label for="recambio_nombre">Nombre</label>
            <input class="form-control field-required" id="recambio_nombre" name="recambio_nombre" type="text" />
        </div>
        <div  class="mt-2">
            <label for="recambio_nombre">Observaciones</label>
            <textarea class="form-control" id="recambio_observaciones" name="recambio_observaciones" rows="5"></textarea>
        </div>
        <hr>
        <div class="w-100 d-flex justify-content-around">
            <img class="icon-register-action" src="../../assets/images/icons/cancelar_icon.png" alt="" onclick="cancelRecambioData()">
            <img class="icon-register-action" src="../../assets/images/icons/save.png" alt="" onclick ="saveRecambioData()">
        </div>
    </div>




</body>

</html>