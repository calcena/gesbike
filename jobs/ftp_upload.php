<?php
/**
 * Subida de archivos al FTP del servidor compartido (carpeta /pending_uploads/).
 *
 * Dual CLI/web: define la función ftp_upload_file() y solo ejecuta el bloque
 * CLI cuando se lanza directamente desde terminal. Los datos del FTP se leen
 * de las constantes FTP_* definidas en el .env (helpers/config.php).
 *
 * Uso CLI:
 *   php jobs/ftp_upload.php <archivo_local> [directorio_remoto]
 *
 * Ejemplo:
 *   php jobs/ftp_upload.php tests/Bicicleta.gpx /pending_uploads/
 */

$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/helpers/helper.php';

function ftp_config_ok()
{
    return defined('FTP_HOST') && FTP_HOST !== ''
        && defined('FTP_USER') && FTP_USER !== ''
        && defined('FTP_PASS');
}

/**
 * Sube un archivo local al FTP en el directorio remoto indicado.
 *
 * @param string      $localPath  Ruta absoluta/relativa del archivo local.
 * @param string|null $remoteName Nombre con el que se guarda en el FTP
 *                                (por defecto: basename($localPath)).
 * @param string|null $remoteDir  Directorio remoto (por defecto: FTP_PENDING_DIR).
 * @return array ['success' => bool, 'message'|'error' => string, 'remoto' => string]
 */
function ftp_upload_file($localPath, $remoteName = null, $remoteDir = null)
{
    if (!is_file($localPath)) {
        return ['success' => false, 'error' => "No existe el archivo local: $localPath"];
    }
    if (!ftp_config_ok()) {
        return ['success' => false, 'error' => 'FTP no configurado en .env (FTP_HOST/FTP_USER/FTP_PASS)'];
    }

    if ($remoteName === null) {
        $remoteName = basename($localPath);
    }
    if ($remoteDir === null) {
        $remoteDir = (defined('FTP_PENDING_DIR') && FTP_PENDING_DIR !== '') ? FTP_PENDING_DIR : '/pending_uploads/';
    }

    $host = FTP_HOST;
    $port = (defined('FTP_PORT') && FTP_PORT !== '') ? (int) FTP_PORT : 21;
    $timeout = 30;

    $conn = @ftp_connect($host, $port, $timeout);
    if (!$conn) {
        return ['success' => false, 'error' => "No se pudo conectar al FTP $host:$port"];
    }

    if (!@ftp_login($conn, FTP_USER, FTP_PASS)) {
        ftp_close($conn);
        return ['success' => false, 'error' => 'Credenciales FTP incorrectas (FTP_USER/FTP_PASS)'];
    }

    $passive = !defined('FTP_PASSIVE') || FTP_PASSIVE === ''
        || strtolower(FTP_PASSIVE) === 'true' || FTP_PASSIVE === '1';
    ftp_pasv($conn, $passive);

    // Crear el directorio remoto (y los intermedios) si no existe
    $dirs = explode('/', $remoteDir);
    $current = '';
    foreach ($dirs as $d) {
        if ($d === '' || $d === '.') {
            continue;
        }
        $current .= '/' . $d;
        if (!@ftp_chdir($conn, $current)) {
            if (!@ftp_mkdir($conn, $current)) {
                ftp_close($conn);
                return ['success' => false, 'error' => "No se pudo crear el directorio remoto: $current"];
            }
        }
    }

    $dest = rtrim($remoteDir, '/') . '/' . $remoteName;
    if (!@ftp_put($conn, $dest, $localPath, FTP_BINARY)) {
        ftp_close($conn);
        return ['success' => false, 'error' => "Fallo al subir el archivo a $dest"];
    }

    // Verificar que el servidor haya persistido el archivo: algunos hostings
    // (p. ej. InfinityFree) responden 226 a STOR en directorios no escribibles
    // de la raíz FTP sin guardar nada. Comprobar presencia real en el listado.
    $confirmado = false;
    $lista = @ftp_nlist($conn, rtrim($remoteDir, '/'));
    if (is_array($lista)) {
        foreach ($lista as $item) {
            if (basename($item) === $remoteName) {
                $confirmado = true;
                break;
            }
        }
    }
    if (!$confirmado) {
        $mensaje = "El servidor FTP no ha persistido el archivo en $dest (directorio remoto: $remoteDir). "
            . "Revisa FTP_PENDING_DIR en el .env: la raíz FTP del hosting puede no ser escribible "
            . "(en InfinityFree el webroot real es /htdocs).";
        error_log("[ftp_upload] FALLO VERIFICACIÓN: $mensaje");
        ftp_close($conn);
        return ['success' => false, 'error' => $mensaje];
    }

    $tamano = @ftp_size($conn, $dest);
    ftp_close($conn);

    return [
        'success' => true,
        'message' => "Archivo subido correctamente a $dest",
        'remoto' => $dest,
        'tamano' => $tamano,
    ];
}

// === Bloque CLI (solo cuando se ejecuta directamente) ===
if (php_sapi_name() === 'cli' && isset($argv) && realpath($argv[0]) === __FILE__) {
    if (empty($argv[1])) {
        fwrite(STDERR, "Uso: php jobs/ftp_upload.php <archivo_local> [directorio_remoto]\n");
        exit(1);
    }
    $res = ftp_upload_file($argv[1], null, $argv[2] ?? null);
    echo json_encode($res, JSON_UNESCAPED_UNICODE) . "\n";
    exit($res['success'] ? 0 : 1);
}