<?php
/**
 * Migración histórica única: archiva los años cerrados (anteriores al año vigente)
 * de las tablas transaccionales a hist/{anio}/*.json.gz y los borra de app.db.
 *
 * Uso (CLI):
 *   php jobs/migrar_historico.php
 *
 * El año vigente (el más reciente con datos) se mantiene íntegro en SQLite.
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

echo "=== Migración histórica GesBike ===\n";

// 1. Pre-backup de seguridad (gzip del app.db actual)
$dbPath = dirname(__DIR__) . '/database/app.db';
$backupDir = dirname(__DIR__) . '/database/backups/';
if (!is_dir($backupDir)) {
    mkdir($backupDir, 0755, true);
}
$pre = $backupDir . 'pre_migracion_' . date('Ymd_His') . '.db.gz';
echo "Creando pre-backup de seguridad... ";
$src = @fopen($dbPath, 'rb');
if ($src) {
    $dst = @gzopen($pre, 'wb9');
    if ($dst) {
        while (!feof($src)) {
            gzwrite($dst, fread($src, 1048576));
        }
        gzclose($dst);
        fclose($src);
        echo "OK -> " . $pre . " (" . round(filesize($pre) / 1048576, 2) . " MB)\n";
    } else {
        fclose($src);
        echo "ERROR (no se pudo crear el gzip, se continúa igualmente)\n";
    }
} else {
    echo "ERROR (no se pudo leer app.db, se continúa igualmente)\n";
}

// 2. Años presentes en BD
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
    echo "No hay datos que migrar.\n";
    exit(0);
}

$anioVigente = max($anios); // El año más reciente con datos se mantiene en SQLite
$porArchivar = array_filter($anios, function ($a) use ($anioVigente) {
    return $a < $anioVigente;
});

if (empty($porArchivar)) {
    echo "Solo hay datos del año vigente ($anioVigente); nada que archivar.\n";
    exit(0);
}

echo "Años vigentes en BD: " . implode(', ', $anios) . "\n";
echo "Año que se mantiene en SQLite: $anioVigente\n";
echo "Años a archivar: " . implode(', ', $porArchivar) . "\n\n";

// 3. Archivado por año (idempotente: re-escribe los ficheros y limpia la BD)
$totales = ['rutas' => 0, 'gpx' => 0, 'pulsaciones' => 0, 'temperaturas' => 0, 'mantenimientos' => 0, 'adjuntos' => 0, 'compras' => 0, 'logs' => 0];
foreach ($porArchivar as $anio) {
    echo "Archivando $anio... ";
    $stats = archivar_anio($anio);
    echo json_encode($stats) . "\n";
    foreach ($totales as $k => $v) {
        $totales[$k] += $stats[$k];
    }
}

// 4. VACUUM + recálculo de ultimos_kms (totales BD + archivo)
echo "\nCompactando base de datos (VACUUM)... ";
try {
    $db->exec("VACUUM");
    echo "OK\n";
} catch (Exception $e) {
    echo "AVISO: " . $e->getMessage() . "\n";
}

echo "Recalculando ultimos_kms... ";
$n = hist_recalcular_ultimos_kms();
echo "OK ($n vehículos)\n";

// 5. Resumen final
echo "\n=== Resumen de la migración ===\n";
foreach ($totales as $k => $v) {
    echo sprintf("  %-14s %d\n", $k, $v);
}
$histSize = 0;
foreach (glob(dirname(__DIR__) . '/hist/*', GLOB_ONLYDIR) as $dir) {
    foreach (glob($dir . '/*') as $f) {
        $histSize += filesize($f);
    }
    foreach (glob($dir . '/*/*') as $f) {
        $histSize += filesize($f);
    }
}
echo sprintf("Tamaño hist/: %s\n", human_size($histSize));
echo sprintf("Tamaño app.db: %s\n", human_size(filesize($dbPath)));
echo "Migración completada.\n";

function human_size($bytes)
{
    if ($bytes >= 1048576) {
        return round($bytes / 1048576, 2) . ' MB';
    }
    if ($bytes >= 1024) {
        return round($bytes / 1024, 2) . ' KB';
    }
    return $bytes . ' B';
}
