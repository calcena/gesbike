<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/helper.php';
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/login.php';
get_session_status();
debug_mode();
global $db;

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function handle_login()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    if (empty($params['username']) || empty($params['pass'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Usuario y contraseña son requeridos']);
        return;
    }
    try {
        $entity = authentication($params);
        if (!$entity) {
            echo json_encode([
                'success' => false,
                'message' => 'Inicio de sesión exitoso',
                'error' => 'Usuario o claves incorrectas'
            ]);
        } else {
            $_SESSION['user'] = $entity['id'];
            echo json_encode([
                'success' => true,
                'message' => 'Inicio de sesión exitoso',
                'content' => $entity
            ]);
        }

    } catch (Exception $e) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

// === Enrutar según acción ===
switch ($action) {
    case 'auth':
        handle_login();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}
