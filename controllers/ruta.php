<?php

$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/ruta.php';

global $db;

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function handle_crear_ruta_gpx()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = create_ruta_gpx($params);
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

function handle_get_rutas_vehiculo()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = get_rutas_vehiculo($params);
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

function handle_get_ruta_by_id()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = get_ruta_id($params);
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

function handle_crear_ruta_manual()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = crear_ruta_manual($params);
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

function handle_actualizar_ruta_manual()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = actualizar_ruta_manual($params);
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

function handle_eliminar_ruta_manual()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = eliminar_ruta_manual($params);
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



function handle_get_resumem_usuario()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = get_resumem_usuario($params);
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
    case 'guardarRutaGPX':
        handle_crear_ruta_gpx();
        break;
    case 'getRutasByVehiculo':
        handle_get_rutas_vehiculo();
        break;
    case 'getRutasById':
        handle_get_ruta_by_id();
        break;
    case 'guardarRutaManual':
        handle_crear_ruta_manual();
        break;
    case 'actualizarRutaManual':
        handle_actualizar_ruta_manual();
        break;
    case 'eliminaRutaManual':
        handle_eliminar_ruta_manual();
        break;
    case 'getResumenBiker':
        handle_get_resumem_usuario();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}
