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

function handle_set_theme()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    if (empty($params['usuario_id']) || empty($params['theme'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'usuario_id y theme son requeridos']);
        return;
    }

    try {
        $db = conectar();
        $stmt = $db->prepare("UPDATE usuarios SET theme = ? WHERE id = ?");
        $stmt->execute([$params['theme'], $params['usuario_id']]);
        echo json_encode([
            'success' => true,
            'message' => 'Tema guardado'
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

function handle_set_fecha_nacimiento()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    if (empty($params['usuario_id'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'usuario_id es requerido']);
        return;
    }

    $fecha = isset($params['fecha_nacimiento']) ? trim($params['fecha_nacimiento']) : '';
    if ($fecha !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $fecha)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Formato de fecha inválido (AAAA-MM-DD)']);
        return;
    }

    try {
        $db = conectar();
        $stmt = $db->prepare("UPDATE usuarios SET fecha_nacimiento = ? WHERE id = ?");
        $stmt->execute([$fecha === '' ? null : $fecha, $params['usuario_id']]);
        echo json_encode([
            'success' => true,
            'message' => 'Fecha de nacimiento guardada'
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => $e->getMessage()
        ]);
    }
}

switch ($action) {
    case 'auth':
        handle_login();
        break;
    case 'setTheme':
        handle_set_theme();
        break;
    case 'setFechaNacimiento':
        handle_set_fecha_nacimiento();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}
