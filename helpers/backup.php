<?php
session_start();
header('Content-Type: application/json');

// Definir la ruta base del proyecto
define('ROOT_PATH', dirname(__DIR__));

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
    $resultado = realizarBackupSQLite();

    if ($resultado['success']) {
        http_response_code(200);
    } else {
        http_response_code(500);
    }

    echo json_encode($resultado);
} else {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido.']);
}

exit; // Asegurarse de que no se ejecute nada más
?>
