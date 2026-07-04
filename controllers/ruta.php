<?php

$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/ruta.php';
require_once $root . '/models/ruta_fit.php';

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

        if ($entity && !empty($params['gpx_data'])) {
            $trackPoints = json_decode($params['gpx_data'], true);
            if (is_array($trackPoints) && count($trackPoints) > 0) {
                $pulsaciones = [];
                $totalKm = (float)($params['kms'] ?? 1);
                $totalMs = 0;
                if (!empty($params['fecha_inicio']) && !empty($params['fecha_fin'])) {
                    $start = new DateTime($params['fecha_inicio']);
                    $end = new DateTime($params['fecha_fin']);
                    $totalMs = ($end->getTimestamp() - $start->getTimestamp()) * 1000;
                }
                foreach ($trackPoints as $tp) {
                    $hr = $tp['hr'] ?? null;
                    $spd = $tp['speed'] ?? null;
                    $cad = $tp['cad'] ?? null;
                    if ($hr === null && $spd === null && $cad === null) continue;
                    $p = [
                        'pulsaciones' => $hr,
                        'cadencia' => $cad,
                        'potencia' => null,
                        'temperatura' => null,
                        'lat' => $tp['lat'] ?? null,
                        'lon' => $tp['lon'] ?? null,
                        'altitud' => $tp['ele'] ?? null,
                        'velocidad' => $spd,
                        'timestamp_fit' => $tp['time'] ?? null,
                        'kilometro' => 0,
                    ];
                    $pulsaciones[] = $p;
                }
                if (!empty($pulsaciones)) {
                    $startTs = !empty($trackPoints[0]['time']) ? strtotime($trackPoints[0]['time']) : 0;
                    foreach ($pulsaciones as &$pul) {
                        if (!empty($pul['timestamp_fit']) && $startTs > 0) {
                            $pulTs = strtotime($pul['timestamp_fit']);
                            $frac = $totalMs > 0 ? (($pulTs - $startTs) * 1000) / $totalMs : 0;
                            $pul['kilometro'] = round($frac * $totalKm, 3);
                        }
                    }
                    unset($pul);
                    createRutaPulsacion($entity, $pulsaciones);
                }
            }
        }

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

function handle_get_velocidades_mensuales()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];

    try {
        $entity = get_velocidades_mensuales($params);
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


function handle_get_rutas_chart()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];
    try {
        $entity = get_rutas_chart($params);
        echo json_encode(['success' => true, 'content' => $entity]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handle_guardar_temperaturas()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];
    try {
        $count = createRutaTemperatura($params['ruta_id'], $params['temperaturas']);
        echo json_encode(['success' => true, 'content' => ['saved' => $count]]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handle_get_temperaturas()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Método no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];
    try {
        $entity = getRutaTemperatura($params['ruta_id']);
        echo json_encode(['success' => true, 'content' => $entity]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
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
    case 'getVelocidadesMensuales':
        handle_get_velocidades_mensuales();
        break;
    case 'getRutasChartData':
        handle_get_rutas_chart();
        break;
    case 'guardarTemperaturas':
        handle_guardar_temperaturas();
        break;
    case 'getTemperaturas':
        handle_get_temperaturas();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Acción no soportada en este controlador']);
}
