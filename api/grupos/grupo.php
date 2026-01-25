<?php
define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
require_once ROOT_PATH . '/database/DatabaseConnection.php';
debug_mode();
get_session_status();

$headers = getallheaders();

global $db;

$db = conectar();

$action = !empty($_GET) ? array_keys($_GET)[0] : '';

switch ($action) {
    case 'getListGrupos':
        $controllerFile = ROOT_PATH . '/controllers/grupo.php';
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



