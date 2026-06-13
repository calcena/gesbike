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

<body onload="initGrupos(); initTheme()">
    <div class="container mt-2">
        <div class="d-flex justify-content-between align-items-center">
            <img class="icon-menu" src="../../assets/images/icons/left.png" alt="" onclick="gotoBack()">
            <h5 class="mb-0">Grupos</h5>
            <img class="icon-menu" src="../../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
        </div>
    </div>

    <div class="container mt-3">
        <div class="row" id="grupos-container">
        </div>
    </div>

    <div class="fab-button" onclick="nuevoGrupo()">
        <img src="../../assets/images/icons/add.png" alt="Añadir" class="fab-icon">
    </div>

    <div class="container footer-location text-center">
        <?php
        $source = 'main';
        include_once("../components/footer.php"); ?>
    </div>
    <?php include __DIR__ . '/../components/sidebar.php'; ?>

    <div class="offcanvas offcanvas-start" tabindex="-1" id="menuGrupo" aria-labelledby="menuGrupoLabel" style="width: 250px;">
        <div class="offcanvas-body p-0 mt-4">
            <div class="list-group list-group-flush">
                <button type="button" class="list-group-item list-group-item-action py-3" onclick="accionMenu('editar')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/pencil.png" alt=""> Editar
                </button>
                <button type="button" class="list-group-item list-group-item-action py-3" onclick="accionMenu('eliminar')">
                    <img class="icon-submenu-izquierda" src="../../assets/images/icons/papelera.png" alt=""> Eliminar
                </button>
            </div>
        </div>
    </div>
</body>

</html>
