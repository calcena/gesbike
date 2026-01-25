<?php

// === CONFIGURACIÓN: Cambia a false en producción ===
define('ENABLE_DEBUG', true);

// === INICIO: Configuración básica ===
$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/log.php';

global $db;

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = defined('ACTION') ? ACTION : (!empty($_GET) ? array_keys($_GET)[0] : '');

// === FUNCIONES DE DEBUG ===
function debug_log($message) {
    if (ENABLE_DEBUG) {
        error_log("[LOG DEBUG] " . date('Y-m-d H:i:s') . " | " . print_r($message, true));
    }
}

function debug_response($data) {
    $data['debug'] = 'Este mensaje solo aparece en modo desarrollo';
    return $data;
}

// === MANEJADOR: Crear log ===
function handle_create_log() {
    // 1. Método permitido
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }

    // 2. Leer cuerpo de la petición
    $inputRaw = file_get_contents('php://input');

    debug_log("Raw input recibido: " . ($inputRaw ?: 'vacío'));

    if (empty($inputRaw)) {
        debug_log("Error: No se recibió cuerpo en la petición");
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No se recibió cuerpo']);
        return;
    }

    // 3. Decodificar JSON
    $input = json_decode($inputRaw, true);

    if (json_last_error() !== JSON_ERROR_NONE) {
        debug_log("Error JSON: " . json_last_error_msg());
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'JSON inválido',
            'detail' => ENABLE_DEBUG ? json_last_error_msg() : null
        ]);
        return;
    }

    debug_log("JSON decodificado: " . print_r($input, true));

    // 4. Validar estructura: debe tener { "data": { ... } }
    if (!isset($input['data'])) {
        debug_log("Error: Falta clave 'data' en el JSON");
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Dato "data" no encontrado',
            'received_keys' => ENABLE_DEBUG ? array_keys($input) : null
        ]);
        return;
    }

    $data = $input['data'];

    if (!is_array($data)) {
        debug_log("Error: 'data' no es un objeto");
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'El valor de "data" debe ser un objeto']);
        return;
    }

    try {
        $log_id = create_log($data);

        debug_log("Log insertado con ID: $log_id");

        echo json_encode(debug_response([
            'success' => true,
            'message' => 'Log insertado correctamente',
            'log_id' => $log_id
        ]));
    } catch (Exception $e) {
        debug_log("Error en create_log(): " . $e->getMessage());
        http_response_code(500);
        echo json_encode(debug_response([
            'success' => false,
            'error' => 'Error al registrar el log',
            'detail' => ENABLE_DEBUG ? $e->getMessage() : null
        ]));
    }
}

// === ENRUTAMIENTO ===
switch ($action) {
    case 'add':
        handle_create_log();
        break;

    default:
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error' => 'Acción no soportada',
            'available' => ['add']
        ]);
        break;
}