<?php

$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/comando_voz.php';

global $db;

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function handle_get_comandos()
{
    try {
        $entity = getComandosVozActivos();
        echo json_encode([
            'success' => true,
            'content' => $entity
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode([
            'success' => false,
            'error' => 'Error al obtener comandos de voz'
        ]);
    }
}

switch ($action) {
    case 'getComandosVoz':
        handle_get_comandos();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}
