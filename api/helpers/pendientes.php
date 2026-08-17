<?php
// Endpoint de archivos pendientes: lista, lee y borra los archivos del
// directorio PENDING_UPLOADS_PATH (la carpeta pending_uploads/ del FTP vista
// por el servidor web). Lo usa el botón "Procesar pendientes" de tab3 (rutas).
// Devuelve SIEMPRE JSON puro.
while (ob_get_level() > 0) { ob_end_clean(); }
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
@set_time_limit(300);
ob_start();

define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
get_session_status();
debug_mode();

function pend_json_error($msg, $code = 500)
{
    while (ob_get_level() > 0) { ob_end_clean(); }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function pend_json_ok($payload = [])
{
    while (ob_get_level() > 0) { ob_end_clean(); }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(array_merge(['success' => true], $payload), JSON_UNESCAPED_UNICODE);
    exit;
}

$action = !empty($_GET) ? array_keys($_GET)[0] : '';
$dir = (defined('PENDING_UPLOADS_DIR') && PENDING_UPLOADS_DIR !== '')
    ? PENDING_UPLOADS_DIR
    : '/pending_uploads';

switch ($action) {
    case 'list':
        $files = [];
        if (is_dir($dir)) {
            foreach (glob($dir . '/*') as $f) {
                if (!is_file($f)) continue;
                $files[] = [
                    'name' => basename($f),
                    'size' => filesize($f),
                    'modified' => date('Y-m-d H:i:s', filemtime($f)),
                ];
            }
        }
        usort($files, function ($a, $b) {
            return strcmp($a['name'], $b['name']);
        });
        pend_json_ok(['files' => $files, 'dir' => $dir]);
        break;

    case 'content':
    case 'delete':
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            pend_json_error('Método no permitido', 405);
        }
        $input = json_decode(file_get_contents('php://input'), true);
        $name = basename($input['data']['file'] ?? '');
        if ($name === '') {
            pend_json_error('Falta el nombre del archivo', 400);
        }
        if (!is_dir($dir)) {
            pend_json_error("El directorio de pendientes no existe: $dir", 404);
        }
        $path = $dir . '/' . $name;
        if (!is_file($path)) {
            pend_json_error("Archivo no encontrado: $name", 404);
        }
        if ($action === 'content') {
            pend_json_ok(['name' => $name, 'content' => file_get_contents($path)]);
        }
        if (!@unlink($path)) {
            pend_json_error("No se pudo borrar el archivo: $name (permisos)", 500);
        }
        pend_json_ok(['deleted' => $name]);
        break;

    default:
        pend_json_error('Acción no válida', 400);
}