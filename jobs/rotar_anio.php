<?php
/**
 * Rotación anual: al cambiar de año, archiva el último año completo
 * (el más reciente con datos si ya no es el año en curso) a hist/{anio}/
 * y lo borra de app.db.
 *
 * Uso (CLI / cron, p.ej. cada 1 de enero):
 *   php jobs/rotar_anio.php
 *
 * Solo archiva UN año por ejecución (el año cerrado más reciente).
 */

if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => 'Este script solo puede ejecutarse por CLI']);
    exit;
}

// DB_PATH es relativa al directorio de trabajo. En el SAPI web, los scripts que
// conectan residen 2 niveles bajo la raíz (api/{modulo}/), de modo que
// ../../database/app.db resuelve a la BD real. Reproducimos ese CWD aquí
// ANTES de cargar la capa de conexión.
chdir(__DIR__ . '/../api/rutas');

require_once __DIR__ . '/../helpers/archivo.php';

echo "=== Rotación anual GesBike ===\n";

$db = conectar();
$anios = array_unique(array_merge(
    hist_anios_en_bd($db, 'rutas', 'fecha_inicio'),
    hist_anios_en_bd($db, 'mantenimientos', 'fecha'),
    hist_anios_en_bd($db, 'compras', 'fecha'),
    hist_anios_en_bd($db, 'adjuntos', 'created_at'),
    hist_anios_en_bd($db, 'logs', 'created_at')
));
sort($anios);

if (empty($anios)) {
    echo "No hay datos en la BD.\n";
    exit(0);
}

$anioEnCurso = (int) date('Y');
$maxAnio = max($anios);

// El año solo se archiva cuando ya no es el año en curso
$porArchivar = [];
foreach ($anios as $a) {
    if ($a < $anioEnCurso && !hist_anio_archivado($a)) {
        $porArchivar[] = $a;
    }
}

if (empty($porArchivar)) {
    echo "No hay años cerrados pendientes de archivar (año en curso: $anioEnCurso, años en BD: " . implode(', ', $anios) . ").\n";
    exit(0);
}

foreach ($porArchivar as $anio) {
    echo "Archivando $anio... ";
    $stats = archivar_anio($anio);
    echo json_encode($stats) . "\n";
}

echo "Compactando base de datos (VACUUM)... ";
try {
    $db->exec("VACUUM");
    echo "OK\n";
} catch (Exception $e) {
    echo "AVISO: " . $e->getMessage() . "\n";
}

echo "Recalculando ultimos_kms... ";
$n = hist_recalcular_ultimos_kms();
echo "OK ($n vehículos)\n";

echo "Rotación completada (año máximo restante en BD: " . ($maxAnio >= $anioEnCurso ? $anioEnCurso : $maxAnio) . ").\n";
