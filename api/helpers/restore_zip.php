<?php
define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
get_session_status();
debug_mode();

$dbDir = rtrim(ROOT_PATH . '/database/', '/') . '/';

// El usuario deja el .zip en la misma ubicación (carpeta de la base de datos)
$zips = glob($dbDir . '*.zip');
if (empty($zips)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'No se encontró ningún archivo .zip para restaurar en ' . $dbDir
    ]);
    exit;
}
$zipPath = $zips[0];

if (!class_exists('ZipArchive')) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'ZipArchive no disponible en el servidor']);
    exit;
}

$zip = new ZipArchive();
if ($zip->open($zipPath) !== true) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'No se pudo abrir el archivo .zip']);
    exit;
}

// Extraer únicamente los ficheros de base de datos a la misma ubicación
$permitidos = ['app.db', 'gesbike.db'];
$extraidos = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $nombre = $zip->getNameIndex($i);
    if (in_array(basename($nombre), $permitidos, true)) {
        if ($zip->extractTo($dbDir, $nombre)) {
            $extraidos[] = basename($nombre);
        }
    }
}
$zip->close();

if (empty($extraidos)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'El .zip no contiene una base de datos válida (app.db)'
    ]);
    exit;
}

// Borrar el .zip del servidor tras extraerlo
@unlink($zipPath);

header('Content-Type: application/json');
echo json_encode([
    'success' => true,
    'message' => 'Base de datos restaurada correctamente.',
    'archivos' => $extraidos,
]);
exit;
