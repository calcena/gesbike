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
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/compras/compra.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/hammer.js/2.0.8/hammer.min.js"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body id="mainBody" data-modo="<?php echo $modo; ?>" onload="initCompraNuevoEdit()">
    <div class="container mt-2">
        <div class="w-100 d-flex">
            <img class="icon-menu" src="../../assets/images/icons/left.png" alt="" onclick="gotoBackCompras()">
        </div>
        <div class="mt-4">
            <label for="compra_fecha">Fecha</label>
            <input class="form-control field-required" id="compra_fecha" name="compra_fecha" type="date" />
        </div>
        <div class="mt-2">
            <label for="compra_proveedor">Proveedor</label>
            <input class="form-control field-required" id="compra_proveedor" name="compra_proveedor" type="text" />
        </div>
        <div class="mt-2 row w-100 d-flex align-content-around">
            <div class="w-50">
                <label for="compra_unds">Unds</label>
                <input class="form-control field-required" id="compra_unds" name="compra_unds" type="number" />
            </div>
            <div class="w-50">
                <label for="compra_precio">Precio</label>
                <input class="form-control" id="compra_precio" name="compra_precio" type="number" />
            </div>
        </div>
        <div class="mt-2">
            <label for="compra_observaciones">Observaciones</label>
            <textarea class="form-control" id="compra_observaciones" name="compra_observaciones" rows="5"></textarea>
        </div>
        <hr>
        <div class="w-100 d-flex justify-content-around">
            <img class="icon-register-action" src="../../assets/images/icons/cancelar_icon.png" alt=""
                onclick="cancelCompraData()">
            <img class="icon-register-action" src="../../assets/images/icons/papelera.png" alt=""
                onclick="deleteCompraData()">
            <img class="icon-register-action" src="../../assets/images/icons/save.png" alt=""
                onclick="saveCompraData()">
        </div>
    </div>
</body>

</html>