<?php
define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
get_session_status();
debug_mode();

$dbDir = rtrim(ROOT_PATH . '/database/', '/') . '/';

// El usuario deja el .zip en la misma ubicación (carpeta de la base de datos)
// o en database/backups/ (zips generados por el propio backup comprimido).
// IMPORTANTE: se elige el .zip MÁS RECIENTE (por fecha de modificación),
// no el primero alfabéticamente (evita que zips legacy como app.db.zip
// prevalezcan sobre el que acaba de dejar el usuario).
$zips = glob($dbDir . '*.zip');
$zipsBackups = glob($dbDir . 'backups/*.zip');
if (empty($zips) && empty($zipsBackups)) {
    http_response_code(404);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'No se encontró ningún archivo .zip para restaurar en ' . $dbDir
    ]);
    exit;
}
$candidatos = !empty($zips) ? $zips : $zipsBackups;
usort($candidatos, function ($a, $b) {
    return filemtime($b) - filemtime($a);
});
$zipPath = $candidatos[0];

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

// Extraer únicamente: bases de datos (app.db, gesbike.db, comandos_voz.db)
// y el histórico JSON (hist/**) preservando subcarpetas
$permitidos = ['app.db', 'gesbike.db', 'comandos_voz.db'];
$extraidos = [];
for ($i = 0; $i < $zip->numFiles; $i++) {
    $nombre = $zip->getNameIndex($i);

    // Protección contra rutas peligrosas
    if (strpos($nombre, '..') !== false || $nombre === '' || $nombre[0] === '/') {
        continue;
    }

    if (in_array(basename($nombre), $permitidos, true)) {
        // Unlink previo: ZipArchive::extractTo puede fallar (EPERM/EACCES) al
        // sobrescribir un fichero existente creado por otro usuario (permisos 644)
        $destino = $dbDir . basename($nombre);
        if (file_exists($destino) && !@unlink($destino)) {
            continue;
        }
        if ($zip->extractTo($dbDir, $nombre)) {
            $extraidos[] = basename($nombre);
        }
    } elseif (strpos($nombre, 'hist/') === 0) {
        $destinoHist = ROOT_PATH . '/' . $nombre;
        if (file_exists($destinoHist) && !@unlink($destinoHist)) {
            continue;
        }
        if ($zip->extractTo(ROOT_PATH . '/', $nombre)) {
            $extraidos[] = $nombre;
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

// Normalizar permisos 0664 en lo extraído (grupo www-data siempre escribible)
foreach ($extraidos as $extraido) {
    $p = in_array(basename($extraido), $permitidos, true)
        ? $dbDir . basename($extraido)
        : ROOT_PATH . '/' . $extraido;
    @chmod($p, 0664);
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
