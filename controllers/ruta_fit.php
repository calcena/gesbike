<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/config.php';
require_once $root . '/helpers/helper.php';
require_once $root . '/helpers/fit_parser.php';
require_once $root . '/database/DatabaseConnection.php';
require_once $root . '/models/ruta.php';
require_once $root . '/models/ruta_fit.php';

global $db;

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

$action = defined('ACTION') ? ACTION : ($_GET ? array_keys($_GET)[0] : '');

function get_categoria_vehiculo($vehiculo_id)
{
    try {
        $db = conectar();
        $stmt = $db->prepare("SELECT categoria FROM vehiculos WHERE id = ?");
        $stmt->execute([$vehiculo_id]);
        $cat = $stmt->fetchColumn();
        return $cat !== false ? $cat : null;
    } catch (Exception $e) {
        return null;
    }
}

function handle_upload_fit()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
        return;
    }

    if (!isset($_FILES['fit_file'])) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No se envio archivo FIT']);
        return;
    }

    $file = $_FILES['fit_file'];
    $vehiculo_id = $_POST['vehiculo_id'] ?? null;

    if (!$vehiculo_id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'No hay vehiculo seleccionado']);
        return;
    }

    if ($file['error'] !== UPLOAD_ERR_OK) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Error en la subida: ' . $file['error']]);
        return;
    }

    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if ($ext !== 'fit') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'El archivo no tiene extension .fit']);
        return;
    }

    try {
        // Determinar la categoria del vehiculo. Si es 'estatica' (bicicleta
        // indoor), el FIT no trae GPS/velocidad/distancia reales y se analiza
        // con el modelo de estimacion indoor (potencia/velocidad/distancia).
        $categoria = get_categoria_vehiculo($vehiculo_id);
        $isIndoor = (strtolower((string) $categoria) === 'estatica');

        // Fecha de nacimiento del usuario para zonas de FC dinámicas (snapshot a la fecha de la ruta)
        $fechaNacimiento = null;
        if (!empty($_SESSION['user'])) {
            try {
                $dbU = conectar();
                $stU = $dbU->prepare("SELECT fecha_nacimiento FROM usuarios WHERE id = ?");
                $stU->execute([$_SESSION['user']]);
                $fechaNacimiento = $stU->fetchColumn();
            } catch (Exception $e) {
                $fechaNacimiento = null;
            }
        }

        $parser = new FitParser();
        $result = $parser->parse($file['tmp_name'], $isIndoor);

        // Recalcular zonas_fc con los rangos de la edad a la fecha de la ruta (snapshot).
        // Si no hay fecha de nacimiento se mantiene el cálculo por defecto del parser.
        if (!empty($fechaNacimiento) && !empty($result['pulsaciones'])) {
            $zonasDef = calcular_zonas_fc_por_edad($fechaNacimiento, $result['fecha_inicio']);
            if (!empty($zonasDef)) {
                $result['zonas_fc'] = zonas_fc_desde_pulsaciones($zonasDef, $result['pulsaciones']);
            }
        }

        $params = [
            'vehiculo_id' => $vehiculo_id,
            'fecha_inicio' => $result['fecha_inicio'],
            'fecha_fin' => $result['fecha_fin'],
            'tiempo_total' => $result['tiempo_total'],
            'tiempo_movimiento' => $result['tiempo_movimiento'],
            'kms' => $result['kms'],
            'metros_ascenso' => $result['metros_ascenso'],
            'metros_descenso' => $result['metros_descenso'],
            'altitud_maxima' => $result['altitud_maxima'],
            'velocidad_media' => $result['velocidad_media'],
            'velocidad_maxima' => $result['velocidad_maxima'],
            'potencia_promedio_w' => $result['potencia_promedio_w'],
            'calorias' => $result['calorias'],
            'pct_subida' => $result['pct_subida'],
            'pct_plano' => $result['pct_plano'],
            'pct_bajada' => $result['pct_bajada'],
            'tiempo_subida' => $result['tiempo_subida'],
            'tiempo_plano' => $result['tiempo_plano'],
            'tiempo_bajada' => $result['tiempo_bajada'],
            'gpx_data' => json_encode($result['track_points']),
            'origen' => $isIndoor ? 'fit_indoor' : 'gpx',
            'categoria' => $isIndoor ? 'estatica' : null,
            'estimado' => $isIndoor ? 1 : 0,
            'zonas_fc' => json_encode($result['zonas_fc'] ?? null),
        ];

        $ruta_id = create_ruta_file($params);

        $pulsacionesCount = 0;
        if (!empty($result['pulsaciones'])) {
            $pulsacionesCount = createRutaPulsacion($ruta_id, $result['pulsaciones']);
        }

        echo json_encode([
            'success' => true,
            'content' => [
                'ruta_id' => $ruta_id,
                'pulsaciones_count' => $pulsacionesCount,
                'kms' => $result['kms'],
                'fecha_inicio' => $result['fecha_inicio'],
                'frecuencia_cardiaca_promedio' => $result['frecuencia_cardiaca_promedio'],
                'frecuencia_cardiaca_maxima' => $result['frecuencia_cardiaca_maxima'],
                'potencia_promedio_w' => $result['potencia_promedio_w'],
                'velocidad_media' => $result['velocidad_media'],
                'velocidad_maxima' => $result['velocidad_maxima'],
                'calorias' => $result['calorias'],
                'indoor' => $isIndoor,
                'categoria' => $isIndoor ? 'estatica' : null,
                'estimado' => $isIndoor ? 1 : 0,
            ]
        ]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handle_get_pulsaciones()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];
    try {
        $entity = getRutaPulsacion($params['ruta_id']);
        echo json_encode(['success' => true, 'content' => $entity]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

function handle_get_pulsaciones_summary()
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => 'Metodo no permitido']);
        return;
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $params = $input['data'];
    try {
        $entity = getRutaPulsacionSummary($params['ruta_id']);
        echo json_encode(['success' => true, 'content' => $entity]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}

switch ($action) {
    case 'uploadFit':
        handle_upload_fit();
        break;
    case 'getPulsaciones':
        handle_get_pulsaciones();
        break;
    case 'getPulsacionesSummary':
        handle_get_pulsaciones_summary();
        break;
    default:
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Accion no soportada: ' . $action]);
}
