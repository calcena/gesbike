<?php
require_once __DIR__ . '/helpers/config.php';
require_once __DIR__ . '/helpers/helper.php';
exit_session();
get_session_status();
debug_mode();
$_SESSION['base_path'] = dirname(__FILE__);
$_SESSION['base_project'] = dirname(__FILE__);
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
    <meta name="apple-mobile-web-app-title" content="GesBike">
    <meta name="application-name" content="GesBike">
    <link rel="shortcut icon" href="favicon.ico" type="image/x-icon">
    <link rel="icon" sizes="192x192" href="assets/images/logo_192.png">
    <link rel="icon" sizes="512x512" href="assets/images/logo_512.png">
    <link rel="apple-touch-icon" href="assets/images/logo_192.png">
    <link href="assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="assets/css/login/login.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/login/login.js?<?php random_file_enumerator() ?>"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body onload="initLogin()">
    <div class="container">
        <div class="login-container">
            <div id="output"></div>
            <div><img class="avatar p-3" src="./assets/images/logo.png?<?php random_file_enumerator() ?>" /></div>
            <div class="form-box">
                <input id="username" name="username" type="text" placeholder="Usuario" autocomplete="username">
                <input id="pass" name="password" type="password" placeholder="Contraseña"
                    autocomplete="current-password">
                <button id="btn_acceder" class="btn login-button btn-block login"
                    onclick="auth(document.getElementById('username').value, document.getElementById('pass').value)">
                    Acceder
                </button>
            </div>
            <span id="warn_credentials" class="mt-3 d-none text-danger fw-bolder"></span>
        </div>
    </div>
    <div class="container text-center">
        <div class="mensaje-login" id="mensaje"></div>
    </div>
    <div class="container footer-location text-center">
        <?php
        $source = '';
        include_once("./views/components/footer.php");
        ?>
    </div>
</body>

</html>