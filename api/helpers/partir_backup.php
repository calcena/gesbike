<?php
// Partir la BD local en partes .gz.00x (solo APP_ENV=local).
// Mismo patrón de salida limpia que restore_zip.php: SIEMPRE JSON puro.
while (ob_get_level() > 0) { ob_end_clean(); }
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
@set_time_limit(300);
ob_start();

define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/config.php';
require_once ROOT_PATH . '/helpers/helper.php';
get_session_status();
debug_mode();

function json_error_pb($msg, $code = 500)
{
    while (ob_get_level() > 0) { ob_end_clean(); }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

// Solo en modo local: es una herramienta de mantenimiento del desarrollador,
// nunca debe estar disponible en producción.
if (!defined('APP_ENV') || APP_ENV !== 'local') {
    json_error_pb('Operación solo disponible en modo local (APP_ENV=local)', 403);
}
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_error_pb('Método no permitido', 405);
}

require_once ROOT_PATH . '/helpers/partir_backup.php';

try {
    $r = partir_backup();
} catch (Exception $e) {
    json_error_pb($e->getMessage(), 500);
}

while (ob_get_level() > 0) { ob_end_clean(); }
header('Content-Type: application/json; charset=utf-8');
echo json_encode([
    'success' => true,
    'message' => count($r['partes']) . ' partes generadas a partir de ' . basename($r['src']),
    'partes' => $r['partes'],
    'directorio' => $r['dir'],
], JSON_UNESCAPED_UNICODE);
exit;
