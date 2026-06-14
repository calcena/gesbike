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
    <link href="../../assets/css/agendas/agenda.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="../../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/agendas/agenda.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="../../services/theme/theme.js?<?php random_file_enumerator() ?>"></script>
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?> - Agendas</title>
</head>

<body onload="initAgendas(); initTheme()">
    <div class="container mt-2 d-flex justify-content-end align-items-center ps-0 !important" style="gap: 1rem;">
        <img class="icon-menu ms-2" src="../../assets/images/icons/left.png" alt="" onclick="gotoBack()">
        <div class="container p-2">
            <button id="vehiculo-select" class="form-select text-start" onclick="openVehiculoPicker(2)">
                Selecciona...
            </button>
        </div>
        <img class="icon-menu" src="../../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
    </div>

    <div class="container mt-2">
        <div class="row g-2" id="main-cards"></div>
    </div>

    <button id="fab-config" class="fab-config-btn" onclick="openConfiguracion()" title="Configurar preferencias">
        <i class="fas fa-cog"></i>
    </button>

    <div class="container footer-location text-center">
        <?php
        $source = 'main';
        include_once("../components/footer.php"); ?>
    </div>
    <?php include __DIR__ . '/../components/sidebar.php'; ?>
</body>

</html>
