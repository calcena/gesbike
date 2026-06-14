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
<script>(function(){var t=sessionStorage.getItem('theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}})()</script>

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
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
    <link href="assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="assets/css/login/login.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <link href="assets/css/theme.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
    <script src="assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/theme/theme.js?<?php random_file_enumerator() ?>"></script>
    <script src="services/login/login.js?<?php random_file_enumerator() ?>"></script>
    <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
</head>

<body onload="initLogin(); initTheme()">
    <div class="login-page">
        <div class="login-card">
            <div class="login-header">
                <img class="login-logo" src="./assets/images/logo.png?<?php random_file_enumerator() ?>" alt="GesBike">
                <h1 class="login-title"><?php echo APP_NAME ?></h1>
                <p class="login-subtitle">Accede a tu panel de control</p>
            </div>
            <div class="login-body">
                <div id="output"></div>
                <div class="form-group">
                    <div class="input-icon-wrapper">
                        <i class="fas fa-user input-icon"></i>
                        <input id="username" class="form-control login-input" type="text" placeholder="Usuario" autocomplete="username">
                    </div>
                </div>
                <div class="form-group">
                    <div class="input-icon-wrapper">
                        <i class="fas fa-lock input-icon"></i>
                        <input id="pass" class="form-control login-input" type="password" placeholder="Contraseña" autocomplete="current-password">
                    </div>
                </div>
                <button id="btn_acceder" class="btn login-btn" onclick="auth(document.getElementById('username').value, document.getElementById('pass').value)">
                    <i class="fas fa-sign-in-alt me-2"></i>Acceder
                </button>
                <div id="mensaje" class="login-message"></div>
                <span id="warn_credentials" class="mt-3 d-none text-danger fw-bolder"></span>
            </div>
            <div class="login-footer">
                <span class="login-version">v<?php echo APP_VERSION ?></span>
            </div>
        </div>
    </div>
</body>

</html>
