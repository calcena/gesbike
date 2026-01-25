<?php
define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
require_once ROOT_PATH . '/database/DatabaseConnection.php';
get_session_status();
debug_mode();

$headers = getallheaders();
global $db;
$db = conectar();
$action = !empty($_GET) ? array_keys($_GET)[0] : '';

switch ($action) {
    case 'setKilometrosByVehiculo':
    case 'getKilometrosByVehiculo':
        $controllerFile = ROOT_PATH . '/controllers/helper.php';
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
    case 'uploadFile':
        $controllerFile = ROOT_PATH . '/controllers/attach.php';
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
    case 'deleteFileAttached':
        $controllerFile = ROOT_PATH . '/helpers/helper.php';
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
    case 'translate':
        $controllerFile = ROOT_PATH . '/controllers/translate.php';
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
    case 'getVehiculosByUser':
    case 'getOperacion':
    case 'getGrupos':
    case 'getLocalizaciones':
    case 'getRecambiosByVehiculo':
        $controllerFile = ROOT_PATH . '/controllers/selector.php';
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
