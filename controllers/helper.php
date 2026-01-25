<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/helper.php';
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/helper.php';
debug_mode();

global $db;

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function handle_set_kilometros_by_vehiculo()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = setKilometrosByVehiculo($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => $e
        ]);
    }
}

function handle_get_kilometros_by_vehiculo()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = getKilometrosByVehiculo($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => $e
        ]);
    }
}


function handle_delete_file_attached()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = delete_file_attached($params);
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => $e
        ]);
    }
}




// === Enrutar según acción ===
switch ($action) {
    case 'setKilometrosByVehiculo':
        handle_set_kilometros_by_vehiculo();
        break;
    case 'getKilometrosByVehiculo':
        handle_get_kilometros_by_vehiculo();
        break;
    case 'deleteFileAttached':
        handle_delete_file_attached();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}











