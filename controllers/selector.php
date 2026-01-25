<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/helper.php';
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/selector.php';
debug_mode();

global $db;

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function handle_get_vehiculo_by_user()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getVehiculosByUser($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas'
        ]);
    }
}

function handle_get_operaciones()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getOperaciones($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas'
        ]);
    }
}

function handle_get_grupos()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getGrupos($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas'
        ]);
    }
}

function handle_get_recambios()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getRecambios($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas ' . $e
        ]);
    }
}


function handle_get_localizaciones()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getLocalizaciones($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(401);
        echo json_encode([
            'success' => false,
            'error' => 'Credenciales inválidas'
        ]);
    }
}


// === Enrutar según acción ===
switch ($action) {
    case 'getVehiculosByUser':
        handle_get_vehiculo_by_user();
        break;
    case 'getOperacion':
        handle_get_operaciones();
        break;
    case 'getGrupos':
        handle_get_grupos();
        break;
    case 'getLocalizaciones':
        handle_get_localizaciones();
        break;
    case 'getRecambiosByVehiculo':
        handle_get_recambios();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}











