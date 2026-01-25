<?php
require_once '../../helpers/helper.php';
require_once '../../helpers/config.php';
$GLOBALS['pathUrl'] = '../../';
$GLOBALS['navigation_deep'] = 1;
get_session_status();
debug_mode();
$_SESSION['base_path'] = dirname(__FILE__);
$url = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on' ? "https://" : "http://";
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

<body onload="initRecambios()">
    <div class="container mt-2 d-flex justify-content-between">
        <img class="icon-menu" src="../../assets/images/icons/left.png" alt="" onclick="gotoBackMantenimientos()">
        <div class="w-100 ps-2 pe-2">
            <select id="vehiculo-select" name="" class="form-select mb-1"
                onchange="setVehiculo(this.value); selectRecambios()"></select>
        </div>
        <div class="form-check form-switch align-content-center">
            <input class="form-check-input" type="checkbox" id="check-recambios-cero"
                onchange="includeZeroStock(this.checked)">
        </div>
        <img class="icon-menu" src="../../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
    </div>
    <div class="container w-100 d-flex justify-content-center mt-2 mb-2">
        <img class="recambio-icon" src="../../assets/images/icons/add.png" alt="" onclick="accionMenu('nuevo')">
    </div>
    <div class="container mt-1">
        <div class="" id="main_cards">
        </div>
    </div>

    <!-- Footer y Sidebar -->
    <div class="container footer-location text-center">
        <?php
        $source = 'main';
        include_once("../components/footer.php");
        ?>
    </div>
    <?php include __DIR__ . '/../components/sidebar.php'; ?>

    <div class="offcanvas offcanvas-start" tabindex="-1" id="menuRecambio" aria-labelledby="menuRecambioLabel"
        style="width: 250px;">
        <div class="offcanvas-body p-0 mt-4">
            <div class="list-group list-group-flush">
                <button type="button" class="list-group-item list-group-item-action py-3"
                    onclick="accionMenu('editar')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/pencil.png" alt=""> Editar
                    Recambio
                </button>
                <button type="button" class="list-group-item list-group-item-action py-3"
                    onclick="accionMenu('eliminar')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/papelera.png" alt=""> Eliminar
                    Recambio
                </button>
                <button type="button" class="list-group-item list-group-item-action py-3"
                    onclick="accionMenu('comprar')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/purchase.png" alt=""> Comprar
                </button>
                <button type="button" class="list-group-item list-group-item-action py-3"
                    onclick="accionMenu('ver_compras')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/lista_compras.png" alt=""> Ver
                    Compras
                </button>
            </div>
        </div>
    </div>
</body>

</html>