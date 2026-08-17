<?php
// Endpoint de subida al FTP del servidor compartido (/pending_uploads/).
// Recibe el archivo por POST multipart (campo "file") y delega en
// jobs/ftp_upload.php::ftp_upload_file(). Devuelve SIEMPRE JSON puro.
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

if (!defined('APP_ENV') || APP_ENV !== 'local') {
    ftp_json_error('Operación solo disponible en modo local (APP_ENV=local)', 403);
}

function ftp_json_error($msg, $code = 500)
{
    while (ob_get_level() > 0) { ob_end_clean(); }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    ftp_json_error('Método no permitido', 405);
}

if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
    $detalle = !empty($_FILES['file']['error']) ? (' (código ' . $_FILES['file']['error'] . ')') : '';
    ftp_json_error('No se recibió ningún archivo o falló su subida' . $detalle, 400);
}

// Sanitizar el nombre remoto (solo [A-Za-z0-9._-])
$name = basename($_FILES['file']['name']);
$name = preg_replace('/[^A-Za-z0-9._\-]/', '_', $name);
if ($name === '') {
    $name = 'archivo_' . time() . '.bin';
}

require_once ROOT_PATH . '/jobs/ftp_upload.php';
$res = ftp_upload_file($_FILES['file']['tmp_name'], $name);

@unlink($_FILES['file']['tmp_name']);

while (ob_get_level() > 0) { ob_end_clean(); }
header('Content-Type: application/json; charset=utf-8');
if (!$res['success']) {
    http_response_code(502);
}
echo json_encode($res, JSON_UNESCAPED_UNICODE);