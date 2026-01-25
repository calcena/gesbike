<?php
define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/config.php';
require_once ROOT_PATH . '/database/DatabaseConnection.php';

if (!defined('API_KEY_BACK') || API_KEY_BACK === '') {
    error_log("ERROR: API_KEY_BACK no está definida o está vacía");
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Configuración del servidor incompleta']);
    exit;
}

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$headers = getallheaders();
$provided_token = $headers['api-key'] ?? $headers['Api-Key'] ?? '';

function isValidSessionToken($token)
{
    return isset($_SESSION['api_token']) &&
        $_SESSION['api_token'] === $token &&
        ($_SESSION['token_expires'] ?? 0) > time();
}

function isValidStaticKey($key)
{
    return $key === (API_KEY_BACK ?? '');
}

if (!isValidSessionToken($provided_token) && !isValidStaticKey($provided_token)) {
    http_response_code(401);
    header('Content-Type: application/json');
    echo json_encode([
        'success' => false,
        'error' => 'Acceso no autorizado: credenciales inválidas'
    ]);
    exit;
}

global $db;

$db = conectar();

$action = !empty($_GET) ? array_keys($_GET)[0] : '';

switch ($action) {
    case 'add':
        $controllerFile = ROOT_PATH . '/controllers/log.php';
        if (!file_exists($controllerFile)) {
            http_response_code(500);
            header('Content-Type: application/json');
            echo json_encode([
                'success' => false,
                'error' => 'Controlador no encontrado: ' . $controllerFile
            ]);
            exit;
        }
        define('ACTION', $action);
        require_once $controllerFile;
        break;
    default:
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode([
            'success' => false,
            'error' => $e
        ]);
        exit;
}