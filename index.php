<?php
require_once __DIR__ . '/helpers/config.php';
require_once __DIR__ . '/helpers/helper.php';
exit_session();
get_session_status();
debug_mode();
$_SESSION['base_path'] = dirname(__FILE__);
$_SESSION['base_project'] = dirname(__FILE__);

// Detectar si el usuario dejó un .zip, volúmenes .7z.001 o partes .gz.001 de restauración en database/
$hayZipRestaurar = false;
$hay7zRestaurar = false;
$hayGzRestaurar = false;
$zipDir = __DIR__ . '/database/';
if (is_dir($zipDir)) {
    $hayZipRestaurar = count(glob($zipDir . '*.zip')) > 0;
    $hay7zRestaurar = count(glob($zipDir . '*.7z.*')) > 0;
    $hayGzRestaurar = count(glob($zipDir . '*.gz.*')) > 0;
}
$hayBackupRestaurar = $hayZipRestaurar || $hay7zRestaurar || $hayGzRestaurar;
$esModoLocal = defined('APP_ENV') && APP_ENV === 'local';
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
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
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
                <div class="d-flex gap-2 align-items-stretch">
                    <button id="btn_acceder" class="btn login-btn" style="width:auto; flex:1 1 auto;" onclick="auth(document.getElementById('username').value, document.getElementById('pass').value)">
                        <i class="fas fa-sign-in-alt me-2"></i>Acceder
                    </button>
                    <?php if ($hayBackupRestaurar): ?>
                    <button type="button" class="btn btn-warning" style="flex:0 0 auto; height:48px; border-radius:12px; font-weight:600;" onclick="restaurarBackupZip()">
                        <i class="fas fa-file-zipper me-1"></i>Extraer BD
                    </button>
                    <?php endif; ?>
                </div>
                <?php if ($esModoLocal): ?>
                <div class="d-flex gap-2 align-items-stretch mt-2">
                    <button type="button" class="login-btn-util" onclick="partirBackup()">
                        <i class="fas fa-scissors me-2"></i>Partir backup (local)
                    </button>
                </div>
                <?php endif; ?>
                <div id="mensaje" class="login-message"></div>
                <span id="warn_credentials" class="mt-3 d-none text-danger fw-bolder"></span>
            </div>
            <div class="login-footer">
                <span class="login-version">v<?php echo APP_VERSION ?></span>
            </div>
        </div>
    </div>
    <script>
    function partirBackup() {
      if (typeof Swal === 'undefined') {
        alert('SweetAlert2 no está disponible');
        return;
      }
      Swal.fire({
        title: '¿Partir base de datos?',
        text: 'Se generará un backup comprimido (app.db.gz) de la base de datos local, partido en volúmenes app.db.gz.001, .002... dentro de database/backups/partes/. Luego podrás subir esas partes al hosting y pulsar allí "Extraer BD".',
        icon: 'info',
        showCancelButton: true,
        confirmButtonText: 'Partir',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (!result.isConfirmed) return;
        Swal.fire({ title: 'Partiendo...', text: 'Por favor, espera', didOpen: () => Swal.showLoading() });
        fetch('api/helpers/partir_backup.php', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(r => r.text())
          .then(txt => {
            let d;
            try {
              d = JSON.parse(txt);
            } catch (e) {
              Swal.fire('Error', 'El servidor no devolvió JSON válido:\n' + txt.substring(0, 300), 'error');
              return;
            }
            if (d.success) {
              Swal.fire('Listo', (d.partes || []).join('\n') + '\n\n' + (d.directorio || ''), 'success');
            } else {
              Swal.fire('Error', d.error, 'error');
            }
          })
          .catch(e => { Swal.fire('Error', 'Error al partir: ' + e, 'error'); });
      });
    }

    function restaurarBackupZip() {
      if (typeof Swal === 'undefined') {
        alert('SweetAlert2 no está disponible');
        return;
      }
      Swal.fire({
        title: '¿Restaurar base de datos?',
        text: 'Se extraerá el archivo .zip, los volúmenes .7z.001 o las partes .gz.001 que has dejado en el servidor y se sobrescribirá la base de datos actual. El archivo se eliminará tras la restauración.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Restaurar',
        cancelButtonText: 'Cancelar'
      }).then((result) => {
        if (!result.isConfirmed) return;
        Swal.fire({ title: 'Restaurando...', text: 'Por favor, espera', didOpen: () => Swal.showLoading() });
        fetch('api/helpers/restore_zip.php', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(r => r.text())
          .then(txt => {
            let d;
            try {
              d = JSON.parse(txt);
            } catch (e) {
              Swal.fire('Error', 'El servidor no devolvió JSON válido:\n' + txt.substring(0, 300), 'error');
              return;
            }
            if (d.success) {
              Swal.fire('Listo', 'BD restaurada: ' + (d.archivos || []).join(', '), 'success')
                .then(() => location.reload());
            } else {
              Swal.fire('Error', d.error, 'error');
            }
          })
          .catch(e => { Swal.fire('Error', 'Error al restaurar: ' + e, 'error'); });
      });
    }
    </script>
</body>

</html>
