<?php
define('ROOT_PATH', dirname(__DIR__));
define('BACKUP_LOG', ROOT_PATH . '/database/backups/backup_cli.log');

/* ================================================================
 * MODO CLI: ejecuta el backup real en un proceso PHP separado
 * (lanza el proceso web sin bloquearlo). El resultado se registra
 * en database/backups/backup_cli.log.
 * ================================================================ */
if (php_sapi_name() === 'cli' && realpath($argv[0] ?? '') === __FILE__) {
    ignore_user_abort(true);
    $resultado = realizarBackupSQLite();
    $logDir = dirname(BACKUP_LOG);
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $linea = date('Y-m-d H:i:s') . ' ' . json_encode($resultado) . "\n";
    if (file_put_contents(BACKUP_LOG, $linea, FILE_APPEND | LOCK_EX) === false) {
        // Si no se puede loguear, intentar en el directorio temporal del sistema
        @file_put_contents(sys_get_temp_dir() . '/backup_cli.log', $linea, FILE_APPEND);
    }
    exit(0);
}

session_start();
header('Content-Type: application/json');

function addDirToZip($zip, $dir, $baseDir)
{
    $files = glob($dir . '/*');
    foreach ($files as $file) {
        $relative = str_replace($baseDir . '/', '', $file);
        if (is_dir($file)) {
            addDirToZip($zip, $file, $baseDir);
        } else {
            $zip->addFile($file, $relative);
        }
    }
}

function php_cli_binary()
{
    if (defined('PHP_BINDIR') && PHP_BINDIR && is_file(rtrim(PHP_BINDIR, '/') . '/' . 'php')) {
        return rtrim(PHP_BINDIR, '/') . '/' . 'php';
    }
    // En algunos hostings PHP_BINDIR no contiene el binario; usar el PATH
    if (PHP_OS_FAMILY === 'Windows') {
        return 'php.exe';
    }
    return 'php';
}

function lanzar_backup_segundo_plano()
{
    $backupDir = ROOT_PATH . '/database/backups/';
    if (!is_dir($backupDir)) {
        @mkdir($backupDir, 0755, true);
    }
    $cmd = sprintf(
        '%s %s > %s 2>&1 &',
        escapeshellarg(php_cli_binary()),
        escapeshellarg(__FILE__),
        escapeshellarg(BACKUP_LOG)
    );
    if (function_exists('exec')) {
        @exec($cmd, $out, $code);
        if ($code === 0) {
            return true;
        }
    }
    if (function_exists('popen')) {
        $p = @popen($cmd, 'r');
        if (is_resource($p)) {
            @pclose($p);
            return true;
        }
    }
    if (function_exists('proc_open')) {
        $descriptors = [
            0 => ['file', '/dev/null', 'r'],
            1 => ['file', BACKUP_LOG, 'a'],
            2 => ['file', BACKUP_LOG, 'a'],
        ];
        $proc = @proc_open($cmd, $descriptors, $pipes);
        if (is_resource($proc)) {
            @proc_close($proc);
            return true;
        }
    }
    return false;
}

function realizarBackupSQLite()
{
    $dbPath = ROOT_PATH . '/database/app.db';
    $backupDir = ROOT_PATH . '/database/backups/';

    if (!file_exists($dbPath)) {
        return [
            'success' => false,
            'message' => "ERROR: No se encontró la base de datos en: " . $dbPath
        ];
    }
    
    if (!is_dir($backupDir)) {
        if (!mkdir($backupDir, 0755, true)) {
            return [
                'success' => false,
                'message' => "ERROR: No se pudo crear el directorio de backups: " . $backupDir
            ];
        }
    }

    if (!class_exists('ZipArchive')) {
        return [
            'success' => false,
            'message' => "ERROR: ZipArchive no disponible en el servidor"
        ];
    }

    $timestamp = date('Ymd_His');
    $destinationPath = rtrim($backupDir, '/') . '/backup_' . $timestamp . '.zip';

    // Snapshot consistente de la BD (evita copias corruptas con escrituras concurrentes)
    $tmpDb = rtrim($backupDir, '/') . '/.tmp_' . $timestamp . '.db';
    try {
        $pdo = new PDO('sqlite:' . $dbPath);
        $pdo->exec("VACUUM INTO '" . str_replace("'", "''", $tmpDb) . "'");
        $pdo = null;
    } catch (Exception $e) {
        @unlink($tmpDb);
        return [
            'success' => false,
            'message' => "ERROR: No se pudo crear el snapshot de la BD: " . $e->getMessage()
        ];
    }

    $zip = new ZipArchive();
    if ($zip->open($destinationPath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
        @unlink($tmpDb);
        return [
            'success' => false,
            'message' => "ERROR: No se pudo crear el archivo zip de backup"
        ];
    }

    // 1. Base de datos principal (app.db)
    $zip->addFile($tmpDb, 'app.db');

    // 2. Bases de datos auxiliares
    foreach (['gesbike.db', 'comandos_voz.db'] as $aux) {
        $auxPath = ROOT_PATH . '/database/' . $aux;
        if (file_exists($auxPath)) {
            $zip->addFile($auxPath, $aux);
        }
    }

    // 3. Histórico JSON (hist/)
    $histDir = ROOT_PATH . '/hist';
    if (is_dir($histDir)) {
        addDirToZip($zip, $histDir, ROOT_PATH);
    }

    $zip->close();
    @unlink($tmpDb);

    if (file_exists($destinationPath)) {
        $sizeMb = round(filesize($destinationPath) / 1048576, 2);
        return [
            'success' => true,
            'message' => "Backup comprimido realizado con éxito ({$sizeMb} MB).",
            'path' => $destinationPath,
            'size_mb' => $sizeMb
        ];
    } else {
        return [
            'success' => false,
            'message' => "ERROR: Falló la creación del backup comprimido"
        ];
    }
}

// --------------------------------------------------------

// 2. Procesamiento de la Petición
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Prioridad: lanzar en un proceso PHP separado para no bloquear el servidor.
    // Si el hosting no permite ejecutar procesos (exec/popen/proc_open), se
    // ejecuta de forma síncrona (comportamiento histórico).
    if (lanzar_backup_segundo_plano()) {
        http_response_code(200);
        echo json_encode([
            'success' => true,
            'message' => 'Backup iniciado en segundo plano'
        ]);
    } else {
        $resultado = realizarBackupSQLite();
        if ($resultado['success']) {
            http_response_code(200);
        } else {
            http_response_code(500);
        }
        echo json_encode($resultado);
    }
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido.']);
}

exit; // Asegurarse de que no se ejecute nada más
?>
