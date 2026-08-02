<?php
/**
 * Capa de archivo histórico: hist/{anio}/{tabla}.json.gz
 *
 * Estructura (granularidad doble):
 *   hist/{anio}/rutas.json.gz            metadatos de rutas (sin gpx_data)
 *   hist/{anio}/mantenimientos.json.gz   filas de mantenimientos
 *   hist/{anio}/compras.json.gz          filas de compras
 *   hist/{anio}/adjuntos.json.gz         filas de adjuntos
 *   hist/{anio}/logs.json.gz             filas de logs
 *   hist/{anio}/resumen.json.gz          agregados precalculados (resumen biker + velocidades)
 *   hist/{anio}/gpx/{ruta_id}.json.gz    payload track points (string JSON)
 *   hist/{anio}/pulso/{ruta_id}.json.gz  pulsaciones FIT
 *   hist/{anio}/temp/{ruta_id}.json.gz   temperaturas
 */
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/config.php';
require_once __DIR__ . '/../database/DatabaseConnection.php';

if (!defined('HIST_ROOT')) {
    define('HIST_ROOT', rtrim(dirname(__DIR__), '/') . '/hist');
}

/* ========== Rutas de fichero ========== */

function hist_anio_dir($anio)
{
    return HIST_ROOT . '/' . (int) $anio;
}

function hist_tabla_file($anio, $tabla)
{
    return hist_anio_dir($anio) . '/' . $tabla . '.json.gz';
}

function hist_payload_file($anio, $tipo, $ruta_id)
{
    return hist_anio_dir($anio) . '/' . $tipo . '/' . (int) $ruta_id . '.json.gz';
}

function hist_anios_disponibles()
{
    $anios = [];
    foreach (glob(HIST_ROOT . '/*', GLOB_ONLYDIR) as $dir) {
        $b = basename($dir);
        if (ctype_digit($b)) {
            $anios[] = (int) $b;
        }
    }
    sort($anios);
    return $anios;
}

function hist_anio_archivado($anio)
{
    $anio = (int) $anio;
    if ($anio <= 0) {
        return false;
    }
    return is_dir(hist_anio_dir($anio));
}

function hist_siguiente_id($tabla)
{
    $permitidas = ['rutas', 'mantenimientos', 'compras', 'adjuntos', 'logs'];
    if (!in_array($tabla, $permitidas)) {
        throw new Exception("Tabla no permitida para hist_siguiente_id");
    }
    $db = conectar();
    $max = (int) $db->query("SELECT COALESCE(MAX(id), 0) FROM " . $tabla)->fetchColumn();
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, $tabla) as $r) {
            $max = max($max, (int) $r['id']);
        }
    }
    $nuevo = $max + 1;
    try {
        $stmt = $db->prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = ?");
        $stmt->execute([$nuevo, $tabla]);
        if ($stmt->rowCount() === 0) {
            $db->prepare("INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)")->execute([$tabla, $nuevo]);
        }
    } catch (Exception $e) {
        // No bloquear si la tabla no usa AUTOINCREMENT
    }
    return $nuevo;
}

function hist_total_kms_vehiculo($vehiculo_id)
{
    $total = 0.0;
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'rutas') as $r) {
            if ((int) $r['vehiculo_id'] === (int) $vehiculo_id && (int) $r['activo'] === 1) {
                $total += (float) $r['kms'];
            }
        }
    }
    return $total;
}

function hist_recalcular_ultimos_kms()
{
    $db = conectar();
    $ids = $db->query("SELECT id FROM vehiculos")->fetchAll(PDO::FETCH_COLUMN);
    $stmt = $db->prepare("SELECT COALESCE(SUM(kms), 0) FROM rutas WHERE vehiculo_id = ? AND activo = 1");
    $n = 0;
    foreach ($ids as $vid) {
        $stmt->execute([$vid]);
        $total = (int) ((float) $stmt->fetchColumn() + hist_total_kms_vehiculo($vid));
        $chk = $db->prepare("SELECT id FROM ultimos_kms WHERE vehiculo_id = ?");
        $chk->execute([$vid]);
        if ($chk->fetchColumn()) {
            $db->prepare("UPDATE ultimos_kms SET kms = ?, fecha_actualizacion = datetime('now') WHERE vehiculo_id = ?")->execute([$total, $vid]);
        } else {
            $db->prepare("INSERT INTO ultimos_kms (vehiculo_id, kms, fecha_actualizacion) VALUES (?, ?, datetime('now'))")->execute([$vid, $total]);
        }
        $n++;
    }
    return $n;
}

function hist_anios_en_bd($db, $tabla, $campo)
{
    $rows = $db->query("SELECT DISTINCT substr(" . $campo . ", 1, 4) FROM " . $tabla . " WHERE " . $campo . " IS NOT NULL AND " . $campo . " != ''")->fetchAll(PDO::FETCH_COLUMN);
    return array_map('intval', $rows);
}

function hist_eliminar_adjuntos_mantenimiento($mantenimiento_id)
{
    $files = [];
    foreach (hist_anios_disponibles() as $anio) {
        $rows = hist_leer_tabla($anio, 'adjuntos');
        $cambios = false;
        foreach ($rows as $i => $a) {
            if ((int) $a['mantenimiento_id'] === (int) $mantenimiento_id) {
                $files[] = $a;
                array_splice($rows, $i, 1);
                $cambios = true;
            }
        }
        if ($cambios) {
            hist_escribir_tabla($anio, 'adjuntos', $rows);
        }
    }
    return $files;
}

/* ========== Lectura / escritura de tablas ========== */

function hist_leer_tabla($anio, $tabla)
{
    global $__hist_cache;
    if (!isset($__hist_cache)) {
        $__hist_cache = [];
    }
    $key = (int) $anio . ':' . $tabla;
    if (array_key_exists($key, $__hist_cache)) {
        return $__hist_cache[$key];
    }
    $file = hist_tabla_file($anio, $tabla);
    if (!file_exists($file)) {
        return $__hist_cache[$key] = [];
    }
    $raw = @gzdecode(@file_get_contents($file));
    if ($raw === false) {
        return $__hist_cache[$key] = [];
    }
    $data = json_decode($raw, true);
    return $__hist_cache[$key] = is_array($data) ? $data : [];
}

function hist_escribir_tabla($anio, $tabla, $rows)
{
    global $__hist_cache;
    $dir = hist_anio_dir($anio);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $file = hist_tabla_file($anio, $tabla);
    $gz = gzencode(json_encode(array_values($rows), JSON_UNESCAPED_UNICODE), 9);
    $tmp = $file . '.tmp' . getmypid();
    if (@file_put_contents($tmp, $gz) === false) {
        trigger_error('hist_escribir_tabla: no se pudo escribir ' . $tmp, E_USER_WARNING);
        return 0;
    }
    if (!@rename($tmp, $file)) {
        trigger_error('hist_escribir_tabla: no se pudo renombrar ' . $tmp . ' -> ' . $file, E_USER_WARNING);
        @unlink($tmp);
        return 0;
    }
    // 0664 explícito: los ficheros creados por www-data (umask 022 → 644)
    // impedirían la escritura posterior del grupo (CLI, otros usuarios)
    @chmod($file, 0664);
    unset($__hist_cache[(int) $anio . ':' . $tabla]);
    return is_array($rows) ? count($rows) : 0;
}

/* ========== Payloads por ruta ========== */

function hist_leer_payload($anio, $tipo, $ruta_id)
{
    $file = hist_payload_file($anio, $tipo, $ruta_id);
    if (!file_exists($file)) {
        return null;
    }
    $raw = @gzdecode(@file_get_contents($file));
    return $raw === false ? null : $raw;
}

function hist_leer_payload_array($anio, $tipo, $ruta_id)
{
    $raw = hist_leer_payload($anio, $tipo, $ruta_id);
    if ($raw === null) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function hist_escribir_payload($anio, $tipo, $ruta_id, $contenido)
{
    $dir = hist_anio_dir($anio) . '/' . $tipo;
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $file = hist_payload_file($anio, $tipo, $ruta_id);
    $gz = gzencode($contenido, 9);
    $tmp = $file . '.tmp' . getmypid();
    if (@file_put_contents($tmp, $gz) === false) {
        trigger_error('hist_escribir_payload: no se pudo escribir ' . $tmp, E_USER_WARNING);
        return;
    }
    if (!@rename($tmp, $file)) {
        trigger_error('hist_escribir_payload: no se pudo renombrar ' . $tmp . ' -> ' . $file, E_USER_WARNING);
        @unlink($tmp);
        return;
    }
    @chmod($file, 0664);
}

function hist_escribir_payload_array($anio, $tipo, $ruta_id, $rows)
{
    hist_escribir_payload($anio, $tipo, $ruta_id, json_encode(array_values($rows), JSON_UNESCAPED_UNICODE));
}

function hist_borrar_payload($anio, $tipo, $ruta_id)
{
    @unlink(hist_payload_file($anio, $tipo, $ruta_id));
}

/* ========== Agregados precalculados (resumen biker + velocidades) ========== */

function hist_leer_resumen($anio)
{
    $file = hist_anio_dir($anio) . '/resumen.json.gz';
    if (!file_exists($file)) {
        return null;
    }
    $raw = @gzdecode(@file_get_contents($file));
    if ($raw === false) {
        return null;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function hist_escribir_resumen($anio, $usuarios, $velocidades)
{
    $dir = hist_anio_dir($anio);
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $file = $dir . '/resumen.json.gz';
    $gz = gzencode(json_encode(['usuarios' => $usuarios, 'velocidades' => $velocidades], JSON_UNESCAPED_UNICODE), 9);
    $tmp = $file . '.tmp' . getmypid();
    if (@file_put_contents($tmp, $gz) !== false) {
        @rename($tmp, $file);
        @chmod($file, 0664);
    }
}

/* ========== Búsquedas y fusión ========== */

function hist_buscar_ruta($ruta_id)
{
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'rutas') as $r) {
            if ((int) $r['id'] === (int) $ruta_id) {
                return [$anio, $r];
            }
        }
    }
    return null;
}

function hist_rutas_por_vehiculo($vehiculo_id, $solo_activas = true)
{
    $out = [];
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'rutas') as $r) {
            if ((int) $r['vehiculo_id'] !== (int) $vehiculo_id) {
                continue;
            }
            if ($solo_activas && !(int) $r['activo']) {
                continue;
            }
            $r['_anio'] = $anio;
            $out[] = $r;
        }
    }
    return $out;
}

function hist_buscar_mantenimiento($id)
{
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'mantenimientos') as $m) {
            if ((int) $m['id'] === (int) $id) {
                return [$anio, $m];
            }
        }
    }
    return null;
}

function hist_mantenimientos_por_vehiculo($vehiculo_id)
{
    $out = [];
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'mantenimientos') as $m) {
            if ((int) $m['vehiculo_id'] !== (int) $vehiculo_id) {
                continue;
            }
            $m['_anio'] = $anio;
            $out[] = $m;
        }
    }
    return $out;
}

function hist_adjuntos_por_mantenimiento($mantenimiento_id)
{
    $out = [];
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'adjuntos') as $a) {
            if ((int) $a['mantenimiento_id'] === (int) $mantenimiento_id && (int) $a['is_active'] === 1) {
                $out[] = $a;
            }
        }
    }
    return $out;
}

function hist_buscar_compra($id)
{
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'compras') as $c) {
            if ((int) $c['id'] === (int) $id) {
                return [$anio, $c];
            }
        }
    }
    return null;
}

function hist_compras_por_recambio($recambio_id)
{
    $out = [];
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'compras') as $c) {
            if ((int) $c['recambio_id'] !== (int) $recambio_id) {
                continue;
            }
            if (!(int) $c['is_active']) {
                continue;
            }
            $c['_anio'] = $anio;
            $out[] = $c;
        }
    }
    return $out;
}

/* ========== Stock de recambios (compras - usos) en años archivados ========== */

function hist_stock_por_recambio()
{
    $compras = [];
    $mantenimientos = [];
    foreach (hist_anios_disponibles() as $anio) {
        foreach (hist_leer_tabla($anio, 'compras') as $c) {
            if (!(int) $c['is_active']) {
                continue;
            }
            $rid = (int) $c['recambio_id'];
            $compras[$rid] = ($compras[$rid] ?? 0) + (int) ($c['unidades'] ?? 0);
        }
        foreach (hist_leer_tabla($anio, 'mantenimientos') as $m) {
            if (!(int) $m['is_active']) {
                continue;
            }
            $rid = (int) ($m['recambio_id'] ?? 0);
            if ($rid <= 0) {
                continue;
            }
            $mantenimientos[$rid] = ($mantenimientos[$rid] ?? 0) + (int) ($m['unidades'] ?? 0);
        }
    }
    return [$compras, $mantenimientos];
}

/* ========== Write-through: reescritura de registros archivados ========== */

function hist_reescribir_registro($anio, $tabla, $id, $nuevo)
{
    $rows = hist_leer_tabla($anio, $tabla);
    foreach ($rows as $i => $r) {
        if ((int) $r['id'] === (int) $id) {
            $rows[$i] = array_merge($r, $nuevo);
            hist_escribir_tabla($anio, $tabla, $rows);
            return true;
        }
    }
    return false;
}

function hist_eliminar_registro($anio, $tabla, $id)
{
    $rows = hist_leer_tabla($anio, $tabla);
    foreach ($rows as $i => $r) {
        if ((int) $r['id'] === (int) $id) {
            array_splice($rows, $i, 1);
            hist_escribir_tabla($anio, $tabla, $rows);
            return true;
        }
    }
    return false;
}

function hist_borrar_ruta_archivada($anio, $ruta_id)
{
    hist_eliminar_registro($anio, 'rutas', $ruta_id);
    hist_borrar_payload($anio, 'gpx', $ruta_id);
    hist_borrar_payload($anio, 'pulso', $ruta_id);
    hist_borrar_payload($anio, 'temp', $ruta_id);
}

/* ========== Archivado anual (rotación) ========== */

function archivar_anio($anio)
{
    $db = conectar();
    $anio = (int) $anio;
    $stats = [
        'rutas' => 0, 'gpx' => 0, 'pulsaciones' => 0, 'temperaturas' => 0,
        'mantenimientos' => 0, 'adjuntos' => 0, 'compras' => 0, 'logs' => 0
    ];

    // 1. Rutas (metadatos) + payloads (gpx, pulso, temp)
    $stmt = $db->prepare("SELECT * FROM rutas WHERE substr(fecha_inicio,1,4) = ?");
    $stmt->execute([(string) $anio]);
    $rutas = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $meta = [];
    $ids = [];
    foreach ($rutas as $r) {
        $ids[] = (int) $r['id'];
        $has_gpx = !empty($r['gpx_data']) && $r['gpx_data'] !== 'null' && $r['gpx_data'] !== '[]';
        if ($has_gpx) {
            hist_escribir_payload($anio, 'gpx', $r['id'], $r['gpx_data']);
            $stats['gpx']++;
        }
        unset($r['gpx_data']);
        $r['has_gpx'] = $has_gpx ? 1 : 0;
        $r['has_pulso'] = 0;
        $meta[] = $r;
        $stats['rutas']++;
    }

    if (!empty($ids)) {
        $placeholders = implode(',', array_fill(0, count($ids), '?'));

        // Pulsaciones → pulso/{ruta_id}.json.gz
        $stmt = $db->prepare("SELECT * FROM ruta_pulsacion WHERE ruta_id IN ($placeholders)");
        $stmt->execute($ids);
        $pulsoPorRuta = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $p) {
            $pulsoPorRuta[(int) $p['ruta_id']][] = $p;
            $stats['pulsaciones']++;
        }
        foreach ($pulsoPorRuta as $rid => $rows) {
            hist_escribir_payload_array($anio, 'pulso', $rid, $rows);
        }

        // Temperaturas → temp/{ruta_id}.json.gz
        $stmt = $db->prepare("SELECT * FROM ruta_temperatura WHERE ruta_id IN ($placeholders)");
        $stmt->execute($ids);
        $tempPorRuta = [];
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $t) {
            $tempPorRuta[(int) $t['ruta_id']][] = $t;
            $stats['temperaturas']++;
        }
        foreach ($tempPorRuta as $rid => $rows) {
            hist_escribir_payload_array($anio, 'temp', $rid, $rows);
        }

        // Marcar has_pulso en metadatos
        foreach ($meta as $i => $m) {
            if (isset($pulsoPorRuta[(int) $m['id']])) {
                $meta[$i]['has_pulso'] = 1;
            }
        }
    }

    hist_escribir_tabla($anio, 'rutas', $meta);

    // 2. Mantenimientos (normalizando Precio/Unidades a minúsculas)
    $stmt = $db->prepare("SELECT * FROM mantenimientos WHERE substr(fecha,1,4) = ?");
    $stmt->execute([(string) $anio]);
    $mant = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $m) {
        $m['precio'] = $m['Precio'] ?? null;
        $m['unidades'] = $m['Unidades'] ?? null;
        unset($m['Precio'], $m['Unidades']);
        $mant[] = $m;
        $stats['mantenimientos']++;
    }
    hist_escribir_tabla($anio, 'mantenimientos', $mant);

    // 3. Adjuntos
    $stmt = $db->prepare("SELECT * FROM adjuntos WHERE substr(created_at,1,4) = ?");
    $stmt->execute([(string) $anio]);
    $adj = $stmt->fetchAll(PDO::FETCH_ASSOC);
    hist_escribir_tabla($anio, 'adjuntos', $adj);
    $stats['adjuntos'] = count($adj);

    // 4. Compras
    $stmt = $db->prepare("SELECT * FROM compras WHERE substr(fecha,1,4) = ?");
    $stmt->execute([(string) $anio]);
    $comp = $stmt->fetchAll(PDO::FETCH_ASSOC);
    hist_escribir_tabla($anio, 'compras', $comp);
    $stats['compras'] = count($comp);

    // 5. Logs
    $stmt = $db->prepare("SELECT * FROM logs WHERE substr(created_at,1,4) = ?");
    $stmt->execute([(string) $anio]);
    $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    hist_escribir_tabla($anio, 'logs', $logs);
    $stats['logs'] = count($logs);

    // 6. Resumen precalculado (resumen biker + velocidades mensuales)
    archivar_resumen($anio, $meta);

    // 7. Borrar de la BD (solo si se escribió el fichero de rutas)
    // IMPORTANTE: comparar contra literal TEXTO ('2021'), nunca entero (2021):
    // SQLite no aplica conversión numérica a resultados de expresión, y
    // TEXT != INTEGER por orden de storage class → 0 filas afectadas.
    if (file_exists(hist_tabla_file($anio, 'rutas'))) {
        $anioTxt = "'" . (int) $anio . "'";
        $db->exec("DELETE FROM ruta_pulsacion WHERE ruta_id IN (SELECT id FROM rutas WHERE substr(fecha_inicio,1,4) = $anioTxt)");
        $db->exec("DELETE FROM ruta_temperatura WHERE ruta_id IN (SELECT id FROM rutas WHERE substr(fecha_inicio,1,4) = $anioTxt)");
        $db->exec("DELETE FROM rutas WHERE substr(fecha_inicio,1,4) = $anioTxt");
        $db->exec("DELETE FROM mantenimientos WHERE substr(fecha,1,4) = $anioTxt");
        $db->exec("DELETE FROM adjuntos WHERE substr(created_at,1,4) = $anioTxt");
        $db->exec("DELETE FROM compras WHERE substr(fecha,1,4) = $anioTxt");
        $db->exec("DELETE FROM logs WHERE substr(created_at,1,4) = $anioTxt");
    }

    return $stats;
}

function archivar_resumen($anio, $rutasMeta)
{
    $db = conectar();

    // Mapa de vehículos: id → [usuario_id, categoria, nombre, anagrama]
    $veh = [];
    foreach ($db->query("SELECT id, usuario_id, categoria, nombre, anagrama FROM vehiculos")->fetchAll(PDO::FETCH_ASSOC) as $v) {
        $veh[(int) $v['id']] = $v;
    }

    $MESES = ['01' => 'Enero', '02' => 'Febrero', '03' => 'Marzo', '04' => 'Abril', '05' => 'Mayo', '06' => 'Junio',
        '07' => 'Julio', '08' => 'Agosto', '09' => 'Septiembre', '10' => 'Octubre', '11' => 'Noviembre', '12' => 'Diciembre'];

    $porUsuario = [];
    $velocidades = [];

    foreach ($rutasMeta as $r) {
        $vid = (int) $r['vehiculo_id'];
        if (!isset($veh[$vid])) {
            continue;
        }
        $v = $veh[$vid];
        $uid = (int) $v['usuario_id'];
        $fecha = substr((string) $r['fecha_inicio'], 0, 10);
        $mes = substr($fecha, 5, 2);
        $kms = (float) $r['kms'];
        $cat = $v['categoria'] ?? '';

        if (!isset($porUsuario[$uid][$mes])) {
            $porUsuario[$uid][$mes] = [
                'anio' => (int) $anio,
                'mes_nombre' => $MESES[$mes],
                'rutas_mes' => 0,
                'kms_mes_electrica' => 0.0,
                'kms_mes_pulmonar' => 0.0,
                'kms_mes_estatica' => 0.0,
                'total_kms_mes' => 0.0,
                'rutas_mes_pulmonar' => 0,
                'rutas_mes_electrica' => 0,
                'rutas_mes_estatica' => 0,
                'rutas_anio' => 0,
                'total_anual_kms_global' => 0.0,
            ];
        }
        $row =& $porUsuario[$uid][$mes];
        $row['rutas_mes']++;
        if ($cat === 'electrica') { $row['kms_mes_electrica'] += $kms; $row['rutas_mes_electrica']++; }
        elseif ($cat === 'pulmonar') { $row['kms_mes_pulmonar'] += $kms; $row['rutas_mes_pulmonar']++; }
        elseif ($cat === 'estatica') { $row['kms_mes_estatica'] += $kms; $row['rutas_mes_estatica']++; }
        $row['total_kms_mes'] += $kms;
        unset($row);

        // Velocidades mensuales por vehículo
        $mesAnio = $anio . '-' . $mes;
        $key = $mesAnio . '|' . $vid;
        if (!isset($velocidades[$key])) {
            $velocidades[$key] = [
                'mes_anio' => $mesAnio,
                'vehiculo_id' => $vid,
                'vehiculo_nombre' => $v['nombre'],
                'vehiculo_anagrama' => $v['anagrama'],
                'velocidad_media_promedio' => [],
                'velocidad_maxima_maxima' => null,
            ];
        }
        if ($r['velocidad_media'] !== null && $r['velocidad_maxima'] !== null) {
            $velocidades[$key]['velocidad_media_promedio'][] = (float) $r['velocidad_media'];
            $velocidades[$key]['velocidad_maxima_maxima'] = max($velocidades[$key]['velocidad_maxima_maxima'] ?? 0, (float) $r['velocidad_maxima']);
        }
    }

    // Totales anuales y forma final por usuario
    $usuarios = [];
    foreach ($porUsuario as $uid => $meses) {
        $rutasAnio = 0;
        $kmsAnio = 0.0;
        foreach ($meses as $row) {
            $rutasAnio += $row['rutas_mes'];
            $kmsAnio += $row['total_kms_mes'];
        }
        foreach ($meses as $row) {
            $row['usuario_id'] = $uid;
            $row['rutas_anio'] = $rutasAnio;
            $row['total_anual_kms_global'] = round($kmsAnio, 2);
            $row['kms_mes_electrica'] = round($row['kms_mes_electrica'], 2);
            $row['kms_mes_pulmonar'] = round($row['kms_mes_pulmonar'], 2);
            $row['kms_mes_estatica'] = round($row['kms_mes_estatica'], 2);
            $row['total_kms_mes'] = round($row['total_kms_mes'], 2);
            $usuarios[] = $row;
        }
    }

    $velFinal = [];
    foreach ($velocidades as $v) {
        $velFinal[] = [
            'mes_anio' => $v['mes_anio'],
            'vehiculo_id' => $v['vehiculo_id'],
            'vehiculo_nombre' => $v['vehiculo_nombre'],
            'vehiculo_anagrama' => $v['vehiculo_anagrama'],
            'velocidad_media_promedio' => empty($v['velocidad_media_promedio']) ? null : round(array_sum($v['velocidad_media_promedio']) / count($v['velocidad_media_promedio']), 1),
            'velocidad_maxima_maxima' => $v['velocidad_maxima_maxima'] !== null ? round($v['velocidad_maxima_maxima'], 1) : null,
        ];
    }

    hist_escribir_resumen($anio, $usuarios, $velFinal);
}
