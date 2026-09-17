<?php
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/archivo.php';
debug_mode();

function norm_fecha_inicio($f)
{
    return strpos($f, 'T') !== false ? $f : $f . 'T00:00:00.000Z';
}

function cmp_rutas_asc($a, $b)
{
    $c = strcmp(norm_fecha_inicio((string) ($a['fecha_inicio'] ?? '')), norm_fecha_inicio((string) ($b['fecha_inicio'] ?? '')));
    if ($c !== 0) {
        return $c;
    }
    return (int) ($a['id'] ?? 0) <=> (int) ($b['id'] ?? 0);
}

function cmp_rutas_desc($a, $b)
{
    return -1 * cmp_rutas_asc($a, $b);
}

function get_rutas_by_id($params)
{
    global $db;
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                r.*,
                                CASE WHEN EXISTS (
                                    SELECT 1 FROM ruta_pulsacion rp WHERE rp.ruta_id = r.id
                                ) THEN 1 ELSE 0 END as has_pulsaciones
                                FROM rutas r
                                WHERE r.id = ?
                            ");
    $stmt->execute([$params['ruta_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($entity)) {
        $found = hist_buscar_ruta($params['ruta_id']);
        if ($found) {
            [$anio, $r] = $found;
            $gpx = hist_leer_payload($anio, 'gpx', $r['id']);
            $r['gpx_data'] = $gpx !== null ? $gpx : null;
            $r['has_pulsaciones'] = (int) ($r['has_pulso'] ?? 0);
            $r['has_gpx'] = (int) ($r['has_gpx'] ?? ($gpx !== null ? 1 : 0));
            $entity = [$r];
        }
    }

    return $entity;

}

function eliminar_ruta($params)
{
    $db = conectar();
    
    // Obtener el vehiculo_id antes de eliminar
    $stmt = $db->prepare("SELECT vehiculo_id FROM rutas WHERE id = ?");
    $stmt->execute([$params['ruta_id']]);
    $vehiculo_id = $stmt->fetchColumn();
    
    if ($vehiculo_id) {
        $stmt = $db->prepare("
                                    delete from rutas
                                    where id = ?
                                ");
        $stmt->execute([$params['ruta_id']]);
        $deleted = $stmt->rowCount();
        
        // Actualizar tabla ultimos_kms si se eliminó correctamente
        if ($deleted > 0 && $vehiculo_id) {
            actualizar_ultimos_kms($db, $vehiculo_id);
        }
        
        return $deleted;
    }

    // Ruta archivada en hist/
    $found = hist_buscar_ruta($params['ruta_id']);
    if ($found) {
        [$anio, $r] = $found;
        hist_borrar_ruta_archivada($anio, $r['id']);
        actualizar_ultimos_kms($db, $r['vehiculo_id']);
        return 1;
    }

    return 0;
}




function get_rutas_by_vehiculo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                id,
                                vehiculo_id,
                                CASE 
                                    WHEN fecha_inicio LIKE '%T%' THEN fecha_inicio
                                    ELSE fecha_inicio || 'T00:00:00.000Z'
                                END as fecha_inicio,
                                fecha_fin,
                                tiempo_total,
                                tiempo_movimiento,
                                ROUND(kms, 1) as kms,
                                metros_ascenso,
                                metros_descenso,
                                altitud_maxima,
                                velocidad_media,
                                velocidad_maxima,
                                potencia_promedio_w,
                                calorias,
                                pct_subida,
                                pct_plano,
                                pct_bajada,
                                tiempo_subida,
                                tiempo_plano,
                                tiempo_bajada,
                                observaciones,
                                origen,
                                activo,
                                regulacion
                                FROM rutas
                                WHERE activo = true
                                and vehiculo_id = ?
                            ");
    $stmt->execute([$params['vehiculo_id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Añadir rutas de años archivados (hist/)
    $rows = array_merge($rows, hist_rutas_por_vehiculo($params['vehiculo_id']));

    // Redondear kms de rutas archivadas a 1 decimal para consistencia con rutas activas
    foreach ($rows as $i => $r) {
        if (isset($r['_anio']) && $r['_anio'] !== '') {
            $rows[$i]['kms'] = round((float) $r['kms'], 1);
        }
    }

    // Orden ascendente para acumulado_kms
    usort($rows, 'cmp_rutas_asc');
    $acum = 0.0;
    foreach ($rows as $i => $r) {
        $acum += (float) $r['kms'];
        $rows[$i]['fecha_inicio'] = norm_fecha_inicio((string) ($r['fecha_inicio'] ?? ''));
        $rows[$i]['acumulado_kms'] = round($acum, 1);
        unset($rows[$i]['_anio'], $rows[$i]['has_gpx'], $rows[$i]['has_pulso'], $rows[$i]['gpx_data']);
    }
    usort($rows, 'cmp_rutas_desc');

    return $rows;
}


function add_ruta_manual($params)
{
    $db = conectar();
    $regulacion = isset($params['regulacion']) ? (int) $params['regulacion'] : 0;
    $fecha = $params['fecha'];

    // Fecha en año archivado → write-through a hist/
    $anio = substr($fecha, 0, 4);
    if (hist_anio_archivado($anio)) {
        $ruta_id = hist_upsert_ruta_manual($anio, $params, $regulacion);
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        return $ruta_id;
    }

    // 1. Intentar UPDATE
    $upd = $db->prepare("
        UPDATE rutas SET
            kms = ?,
            observaciones = ?,
            regulacion = ?,
            activo = 1,
            origen = 'manual'
        WHERE vehiculo_id = ? AND fecha_inicio = ?
    ");
    $upd->execute([
        (float) ($params['kms'] ?? 0.0),
        $params['observaciones'],
        $regulacion,
        $params['vehiculo_id'],
        $fecha
    ]);

    if ($upd->rowCount() > 0) {
        // Existe → devolver ID
        $sel = $db->prepare("SELECT id FROM rutas WHERE vehiculo_id = ? AND fecha_inicio = ?");
        $sel->execute([$params['vehiculo_id'], $fecha]);
        $ruta_id = (int) $sel->fetchColumn();
        
        // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        
        return $ruta_id;
    }

    // 2. Si no existe, INSERT
    $ins = $db->prepare("
        INSERT INTO rutas (
            vehiculo_id, fecha_inicio, kms, observaciones, regulacion, activo, origen
        ) VALUES (?, ?, ?, ?, ?, 1, 'manual')
    ");
    $ins->execute([
        $params['vehiculo_id'],
        $fecha,
        (float) ($params['kms'] ?? 0.0),
        $params['observaciones'] ?? null,
        $regulacion,
    ]);

    $ruta_id = (int) $db->lastInsertId();
    
    // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
    actualizar_ultimos_kms($db, $params['vehiculo_id']);
    
    return $ruta_id;
}

function hist_upsert_ruta_manual($anio, $params, $regulacion)
{
    $rows = hist_leer_tabla($anio, 'rutas');
    foreach ($rows as $i => $r) {
        if ((int) $r['vehiculo_id'] === (int) $params['vehiculo_id'] && ($r['fecha_inicio'] ?? '') === $params['fecha']) {
            $rows[$i]['kms'] = (float) ($params['kms'] ?? 0.0);
            $rows[$i]['observaciones'] = $params['observaciones'] ?? null;
            $rows[$i]['regulacion'] = $regulacion;
            $rows[$i]['activo'] = 1;
            $rows[$i]['origen'] = 'manual';
            hist_escribir_tabla($anio, 'rutas', $rows);
            return (int) $r['id'];
        }
    }
    $id = hist_siguiente_id('rutas');
    $rows[] = [
        'id' => $id,
        'vehiculo_id' => (int) $params['vehiculo_id'],
        'fecha_inicio' => $params['fecha'],
        'fecha_fin' => null,
        'kms' => (float) ($params['kms'] ?? 0.0),
        'observaciones' => $params['observaciones'] ?? null,
        'regulacion' => $regulacion,
        'activo' => 1,
        'origen' => 'manual',
        'has_gpx' => 0,
        'has_pulso' => 0,
    ];
    hist_escribir_tabla($anio, 'rutas', $rows);
    return $id;
}

function update_ruta_manual($params) {
    $db = conectar();
    $regulacion = isset($params['regulacion']) ? (int) $params['regulacion'] : 0;
    
    // Comprobar si existe en la BD
    $stmt = $db->prepare("SELECT id FROM rutas WHERE id = ? AND vehiculo_id = ? AND origen = 'manual'");
    $stmt->execute([$params['id'], $params['vehiculo_id']]);
    $en_bd = $stmt->fetchColumn();

    if ($en_bd) {
        $upd = $db->prepare("
            UPDATE rutas SET
                kms = ?,
                observaciones = ?,
                fecha_inicio = ?,
                regulacion = ?,
                activo = 1,
                origen = 'manual'
            WHERE id = ? AND vehiculo_id = ? AND origen = 'manual'
        ");
        
        $result = $upd->execute([
            (float) ($params['kms'] ?? 0.0),
            $params['observaciones'] ?? null,
            $params['fecha'],
            $regulacion,
            $params['id'],
            $params['vehiculo_id']
        ]);
        
        if ($result && $upd->rowCount() > 0) {
            // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
            actualizar_ultimos_kms($db, $params['vehiculo_id']);
            
            return (int) $params['id'];
        }
        
        throw new Exception("No se pudo actualizar la ruta manual");
    }

    // Ruta archivada en hist/ → write-through
    $found = hist_buscar_ruta($params['id']);
    if ($found) {
        [$anio] = $found;
        hist_reescribir_registro($anio, 'rutas', $params['id'], [
            'kms' => (float) ($params['kms'] ?? 0.0),
            'observaciones' => $params['observaciones'] ?? null,
            'fecha_inicio' => $params['fecha'],
            'regulacion' => $regulacion,
            'activo' => 1,
            'origen' => 'manual',
        ]);
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        return (int) $params['id'];
    }

    throw new Exception("No se pudo actualizar la ruta manual");
}

function create_ruta_file($params)
{
    global $db;
    if (!isset($db)) {
        $db = conectar();
    }

    // Parametros opcionales (retrocompatibles con importaciones antiguas)
    $origen = $params['origen'] ?? 'gpx';
    $categoria = $params['categoria'] ?? null;
    $estimado = (int) ($params['estimado'] ?? 0);

    // Fecha en año archivado → write-through a hist/
    $anio = substr($params['fecha_inicio'], 0, 4);
    if (hist_anio_archivado($anio)) {
        $ruta_id = hist_upsert_ruta_gpx($anio, $params, $origen, $categoria, $estimado);
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        return $ruta_id;
    }

    // 1. Intentar UPDATE
    $upd = $db->prepare("
        UPDATE rutas SET
            tiempo_total = ?,
            tiempo_movimiento = ?,
            kms = ?,
            metros_ascenso = ?,
            metros_descenso = ?,
            altitud_maxima = ?,
            velocidad_media = ?,
            velocidad_maxima = ?,
            potencia_promedio_w = ?,
            calorias = ?,
            pct_subida = ?,
            pct_plano = ?,
            pct_bajada = ?,
            tiempo_subida = ?,
            tiempo_plano = ?,
            tiempo_bajada= ?,
            gpx_data = ?,
            categoria = ?,
            estimado = ?,
            zonas_fc = ?,
            activo = 1,
            origen = ?
        WHERE vehiculo_id = ? AND fecha_inicio = ?
    ");
    $upd->execute([
        $params['tiempo_total'] ?? null,
        $params['tiempo_movimiento'] ?? null,
        (float) ($params['kms'] ?? 0.0),
        (int) ($params['metros_ascenso'] ?? 0),
        (int) ($params['metros_descenso'] ?? 0),
        (int) ($params['altitud_maxima'] ?? 0),
        (float) ($params['velocidad_media'] ?? 0.0),
        (float) ($params['velocidad_maxima'] ?? 0.0),
        (int) ($params['potencia_promedio_w'] ?? 0),
        (int) ($params['calorias'] ?? 0),
        (int) ($params['pct_subida'] ?? 0),
        (int) ($params['pct_plano'] ?? 0),
        (int) ($params['pct_bajada'] ?? 0),
        $params['tiempo_subida'],
        $params['tiempo_plano'],
        $params['tiempo_bajada'],
        $params['gpx_data'] ?? null,
        $categoria,
        $estimado,
        $params['zonas_fc'] ?? null,
        $origen,
        $params['vehiculo_id'],
        $params['fecha_inicio']
    ]);

    if ($upd->rowCount() > 0) {
        // Existe → devolver ID
        $sel = $db->prepare("SELECT id FROM rutas WHERE vehiculo_id = ? AND fecha_inicio = ?");
        $sel->execute([$params['vehiculo_id'], $params['fecha_inicio']]);
        $ruta_id = (int) $sel->fetchColumn();
        
        // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        
        return $ruta_id;
    }

    // 2. Si no existe, INSERT
    $ins = $db->prepare("
        INSERT INTO rutas (
            vehiculo_id, fecha_inicio, fecha_fin, tiempo_total, tiempo_movimiento,
            kms, metros_ascenso, metros_descenso, altitud_maxima,
            velocidad_media, velocidad_maxima, potencia_promedio_w, calorias, pct_subida, pct_plano, pct_bajada, tiempo_subida, tiempo_plano, tiempo_bajada,
            gpx_data, categoria, estimado, zonas_fc, activo, origen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, ?, ?, ?, ?, 1, ?)
    ");
    $ins->execute([
        $params['vehiculo_id'],
        $params['fecha_inicio'],
        $params['fecha_fin'],
        $params['tiempo_total'] ?? null,
        $params['tiempo_movimiento'] ?? null,
        (float) ($params['kms'] ?? 0.0),
        (int) ($params['metros_ascenso'] ?? 0),
        (int) ($params['metros_descenso'] ?? 0),
        (int) ($params['altitud_maxima'] ?? 0),
        (float) ($params['velocidad_media'] ?? 0.0),
        (float) ($params['velocidad_maxima'] ?? 0.0),
        (int) ($params['potencia_promedio_w'] ?? 0),
        (int) ($params['calorias'] ?? 0),
        (int) ($params['pct_subida'] ?? 0),
        (int) ($params['pct_plano'] ?? 0),
        (int) ($params['pct_bajada'] ?? 0),
        $params['tiempo_subida'],
        $params['tiempo_plano'],
        $params['tiempo_bajada'],
        $params['gpx_data'] ?? null,
        $categoria,
        $estimado,
        $params['zonas_fc'] ?? null,
        $origen
    ]);

    $ruta_id = (int) $db->lastInsertId();
    
    // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
    actualizar_ultimos_kms($db, $params['vehiculo_id']);
    
    return $ruta_id;
}

function hist_upsert_ruta_gpx($anio, $params, $origen, $categoria, $estimado)
{
    $rows = hist_leer_tabla($anio, 'rutas');
    $idx = null;
    foreach ($rows as $i => $r) {
        if ((int) $r['vehiculo_id'] === (int) $params['vehiculo_id'] && ($r['fecha_inicio'] ?? '') === $params['fecha_inicio']) {
            $idx = $i;
            break;
        }
    }

    $gpx = $params['gpx_data'] ?? null;
    $has_gpx = !empty($gpx) && $gpx !== 'null' && $gpx !== '[]';

    $campos = [
        'vehiculo_id' => (int) $params['vehiculo_id'],
        'fecha_inicio' => $params['fecha_inicio'],
        'fecha_fin' => $params['fecha_fin'] ?? null,
        'tiempo_total' => $params['tiempo_total'] ?? null,
        'tiempo_movimiento' => $params['tiempo_movimiento'] ?? null,
        'kms' => (float) ($params['kms'] ?? 0.0),
        'metros_ascenso' => (int) ($params['metros_ascenso'] ?? 0),
        'metros_descenso' => (int) ($params['metros_descenso'] ?? 0),
        'altitud_maxima' => (int) ($params['altitud_maxima'] ?? 0),
        'velocidad_media' => (float) ($params['velocidad_media'] ?? 0.0),
        'velocidad_maxima' => (float) ($params['velocidad_maxima'] ?? 0.0),
        'potencia_promedio_w' => (int) ($params['potencia_promedio_w'] ?? 0),
        'calorias' => (int) ($params['calorias'] ?? 0),
        'pct_subida' => (int) ($params['pct_subida'] ?? 0),
        'pct_plano' => (int) ($params['pct_plano'] ?? 0),
        'pct_bajada' => (int) ($params['pct_bajada'] ?? 0),
        'tiempo_subida' => $params['tiempo_subida'] ?? null,
        'tiempo_plano' => $params['tiempo_plano'] ?? null,
        'tiempo_bajada' => $params['tiempo_bajada'] ?? null,
        'categoria' => $categoria,
        'estimado' => $estimado,
        'zonas_fc' => $params['zonas_fc'] ?? null,
        'activo' => 1,
        'origen' => $origen,
    ];

    if ($idx !== null) {
        $row = array_merge($rows[$idx], $campos);
        $row['has_gpx'] = $has_gpx ? 1 : 0;
        $rows[$idx] = $row;
        $ruta_id = (int) $row['id'];
    } else {
        $ruta_id = hist_siguiente_id('rutas');
        $campos['id'] = $ruta_id;
        $campos['has_gpx'] = $has_gpx ? 1 : 0;
        $campos['has_pulso'] = 0;
        $rows[] = $campos;
    }
    hist_escribir_tabla($anio, 'rutas', $rows);

    if ($has_gpx) {
        hist_escribir_payload($anio, 'gpx', $ruta_id, $gpx);
    } else {
        hist_borrar_payload($anio, 'gpx', $ruta_id);
    }

    return $ruta_id;
}

function actualizar_ultimos_kms($db, $vehiculo_id) {
    // Calcular la suma total de kms para el vehiculo (BD + años archivados).
    // IMPORTANTE: se redondea cada ruta a 1 decimal ANTES de sumar, igual que
    // acumulado_kms de tab1-tab (get_rutas_by_vehiculo), para que ambos coincidan.
    $total_kms = 0.0;

    // Rutas activas en BD (ROUND(kms, 1) igual que en el listado)
    $stmt = $db->prepare("SELECT kms FROM rutas WHERE vehiculo_id = ? AND activo = 1");
    $stmt->execute([$vehiculo_id]);
    while ($r = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $total_kms += round((float) $r['kms'], 1);
    }

    // Rutas de años archivados (hist/) con el mismo redondeo por ruta
    foreach (hist_rutas_por_vehiculo($vehiculo_id, true) as $r) {
        $total_kms += round((float) $r['kms'], 1);
    }

    // Redondear total a 1 decimal para coincidir con acumulado_kms de tab1-tab
    $total_kms = round($total_kms, 1);
    
    // Verificar si ya existe un registro para este vehiculo
    $stmt = $db->prepare("SELECT id FROM ultimos_kms WHERE vehiculo_id = ?");
    $stmt->execute([$vehiculo_id]);
    $existe = $stmt->fetchColumn();
    
    if ($existe) {
        // Actualizar registro existente
        $stmt = $db->prepare("UPDATE ultimos_kms SET kms = ?, fecha_actualizacion = datetime('now') WHERE vehiculo_id = ?");
        $stmt->execute([$total_kms, $vehiculo_id]);
    } else {
        // Insertar nuevo registro
        $stmt = $db->prepare("INSERT INTO ultimos_kms (vehiculo_id, kms, fecha_actualizacion) VALUES (?, ?, datetime('now'))");
        $stmt->execute([$vehiculo_id, $total_kms]);
    }
}

// function get_resumem_usuario($params)
// {
//     $db = conectar();
//     $stmt = $db->prepare("
//                                 SELECT
//                                 strftime('%Y', fecha_inicio) AS anio,
//                                 strftime('%m', fecha_inicio) AS mes,
//                                 CASE strftime('%m', fecha_inicio)
//                                     WHEN '01' THEN 'Enero'
//                                     WHEN '02' THEN 'Febrero'
//                                     WHEN '03' THEN 'Marzo'
//                                     WHEN '04' THEN 'Abril'
//                                     WHEN '05' THEN 'Mayo'
//                                     WHEN '06' THEN 'Junio'
//                                     WHEN '07' THEN 'Julio'
//                                     WHEN '08' THEN 'Agosto'
//                                     WHEN '09' THEN 'Septiembre'
//                                     WHEN '10' THEN 'Octubre'
//                                     WHEN '11' THEN 'Noviembre'
//                                     WHEN '12' THEN 'Diciembre'
//                                 END AS nombre_mes,
//                                 SUM(kms) AS total_mensual,
//                                 SUM(SUM(kms)) OVER (PARTITION BY strftime('%Y', fecha_inicio)) AS total_anual,
//                                 COUNT(*) AS num_rutas_mes,
//                                 SUM(COUNT(*)) OVER (PARTITION BY strftime('%Y', fecha_inicio)) AS num_rutas_anio
//                             FROM rutas
//                             WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE usuario_id = ?)
//                             GROUP BY strftime('%Y', fecha_inicio), strftime('%m', fecha_inicio)
//                             ORDER BY año DESC, mes DESC;
//                             ");
//     $stmt->execute([$params['usuario_id']]);
//     $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
//     return $entity;
// }

function resumem_usuario($params)
{
    $db = conectar();
    $stmt = $db->prepare("
SELECT
    strftime('%Y', r1.fecha_inicio) AS anio,
    strftime('%m', r1.fecha_inicio) AS mes,
    CASE strftime('%m', r1.fecha_inicio)
        WHEN '01' THEN 'Enero' WHEN '02' THEN 'Febrero' WHEN '03' THEN 'Marzo'
        WHEN '04' THEN 'Abril' WHEN '05' THEN 'Mayo'    WHEN '06' THEN 'Junio'
        WHEN '07' THEN 'Julio' WHEN '08' THEN 'Agosto'  WHEN '09' THEN 'Septiembre'
        WHEN '10' THEN 'Octubre' WHEN '11' THEN 'Noviembre' WHEN '12' THEN 'Diciembre'
    END AS mes_nombre,
    COUNT(r1.id) AS rutas_mes,
    ROUND(SUM(CASE WHEN v1.categoria = 'electrica' THEN r1.kms ELSE 0 END), 2) AS kms_mes_electrica,
    ROUND(SUM(CASE WHEN v1.categoria = 'pulmonar' THEN r1.kms ELSE 0 END), 2) AS kms_mes_pulmonar,
    ROUND(SUM(CASE WHEN v1.categoria = 'estatica' THEN r1.kms ELSE 0 END), 2) AS kms_mes_estatica,
    ROUND(SUM(r1.kms), 2) AS total_kms_mes,
    COUNT(CASE WHEN v1.categoria = 'pulmonar' THEN r1.id END) AS rutas_mes_pulmonar,
    COUNT(CASE WHEN v1.categoria = 'electrica' THEN r1.id END) AS rutas_mes_electrica,
    COUNT(CASE WHEN v1.categoria = 'estatica' THEN r1.id END) AS rutas_mes_estatica,

    -- Totales del año correspondiente a la fila
    (SELECT COUNT(id) FROM rutas WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE usuario_id = v1.usuario_id) AND strftime('%Y', fecha_inicio) = strftime('%Y', r1.fecha_inicio)) AS rutas_anio,
    ROUND((SELECT SUM(kms) FROM rutas WHERE vehiculo_id IN (SELECT id FROM vehiculos WHERE usuario_id = v1.usuario_id) AND strftime('%Y', fecha_inicio) = strftime('%Y', r1.fecha_inicio)), 2) AS total_anual_kms_global

FROM rutas r1
INNER JOIN vehiculos v1 ON r1.vehiculo_id = v1.id
WHERE v1.usuario_id = ?
GROUP BY anio, strftime('%m', r1.fecha_inicio)
ORDER BY anio DESC, strftime('%m', r1.fecha_inicio) DESC;
                                ");
    $stmt->execute([$params['usuario_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Cargar categorías de vehículos del usuario para clasificar rutas archivadas
    $categoriasVehiculo = [];
    $stmtV = $db->query("SELECT id, categoria FROM vehiculos WHERE usuario_id = " . (int) $params['usuario_id']);
    while ($v = $stmtV->fetch(PDO::FETCH_ASSOC)) {
        $categoriasVehiculo[(int) $v['id']] = $v['categoria'];
    }

    // Fusionar rutas de años archivados (hist/) calculando desde los datos crudos
    // Esto asegura que modificaciones a regularizaciones de años anteriores
    // se reflejen inmediatamente sin depender del fichero resumen.json.gz precalculado
    $allRows = $entity;

    foreach (hist_anios_disponibles() as $anio) {
        $rutasAnio = hist_leer_tabla($anio, 'rutas');
        foreach ($rutasAnio as $r) {
            // Filtrar solo rutas que pertenecen al usuario actual
            $vehId = (int) $r['vehiculo_id'];
            if (!isset($categoriasVehiculo[$vehId])) {
                // Si no conocemos la categoría, intentar obtenerla de la BD
                $stmtV2 = $db->prepare("SELECT categoria FROM vehiculos WHERE id = ?");
                $stmtV2->execute([$vehId]);
                $catRow = $stmtV2->fetch(PDO::FETCH_ASSOC);
                $categoriasVehiculo[$vehId] = $catRow['categoria'] ?? '';
            }
            $cat = $categoriasVehiculo[$vehId] ?? '';

            // Saltar si la categoría no es conocida o la ruta no pertenece al usuario
            // (vehiculos de otros usuarios pueden aparecer en hist/ pero no deberían contar aquí)
            if ($cat === '') continue;

            // Extraer año/mes del fecha_inicio archivado
            $fecha = (string) ($r['fecha_inicio'] ?? '');
            if ($fecha === '') continue;
            $anioR = substr($fecha, 0, 4);
            $mesR = substr($fecha, 5, 2);

            // Buscar si ya existe una entrada para este año/mes en el entity
            $indice = null;
            foreach ($allRows as $i => $row) {
                if ((int) $row['anio'] === (int) $anioR && (int) $row['mes'] === (int) $mesR) {
                    $indice = $i;
                    break;
                }
            }

            if ($indice !== null) {
                // Acumular kms y counts en la entrada existente
                $row =& $allRows[$indice];
                $catKey = 'kms_mes_'.$cat;
                $row[$catKey] = (
                    (float) ($row[$catKey] ?? 0)
                    + (float) $r['kms']
                );
                $row['total_kms_mes'] = (
                    (float) ($row['total_kms_mes'] ?? 0) + (float) $r['kms']
                );
                // Incrementar counts dependiendo de la categoría
                switch ($cat) {
                    case 'electrica':
                        $row['rutas_mes_electrica'] = ((int) ($row['rutas_mes_electrica'] ?? 0)) + 1;
                        break;
                    case 'pulmonar':
                        $row['rutas_mes_pulmonar'] = ((int) ($row['rutas_mes_pulmonar'] ?? 0)) + 1;
                        break;
                    case 'estatica':
                        $row['rutas_mes_estatica'] = ((int) ($row['rutas_mes_estatica'] ?? 0)) + 1;
                        break;
                }
                $row['rutas_mes'] = ((int) ($row['rutas_mes'] ?? 0)) + 1;
                unset($row);
            } else {
                // Crear nueva entrada para este año/mes
                $mesesMap = ['01' => 'Enero', '02' => 'Febrero', '03' => 'Marzo', '04' => 'Abril', '05' => 'Mayo', '06' => 'Junio',
                             '07' => 'Julio', '08' => 'Agosto', '09' => 'Septiembre', '10' => 'Octubre', '11' => 'Noviembre', '12' => 'Diciembre'];
                $mesNombre = $mesesMap[$mesR] ?? 'Desconocido';
                $kmsCat = 0; $rutasCat = 0;
                if ($cat === 'electrica') { $kmsCat = (float) $r['kms']; $rutasCat = 1; }
                elseif ($cat === 'pulmonar') { $kmsCat = (float) $r['kms']; $rutasCat = 1; }
                elseif ($cat === 'estatica') { $kmsCat = (float) $r['kms']; $rutasCat = 1; }
                $allRows[] = [
                    'anio' => $anioR,
                    'mes' => $mesR,
                    'mes_nombre' => $mesNombre,
                    'rutas_mes' => 1,
                    'kms_mes_electrica' => $cat === 'electrica' ? (float) $r['kms'] : 0,
                    'kms_mes_pulmonar' => $cat === 'pulmonar' ? (float) $r['kms'] : 0,
                    'kms_mes_estatica' => $cat === 'estatica' ? (float) $r['kms'] : 0,
                    'total_kms_mes' => (float) $r['kms'],
                    'rutas_mes_electrica' => $cat === 'electrica' ? 1 : 0,
                    'rutas_mes_pulmonar' => $cat === 'pulmonar' ? 1 : 0,
                    'rutas_mes_estatica' => $cat === 'estatica' ? 1 : 0,
                    'total_anual_kms_global' => 0,
                    'rutas_anio' => 0,
                ];
            }
        }
    }

    // Calcular totales anuales a partir de los datos combinados
    $totalesAnio = [];
    foreach ($allRows as $row) {
        $anioKey = (int) $row['anio'];
        if (!isset($totalesAnio[$anioKey])) {
            $totalesAnio[$anioKey] = ['rutas_anio' => 0, 'total_anual_kms_global' => 0.0];
        }
        $totalesAnio[$anioKey]['rutas_anio'] += (int) ($row['rutas_mes'] ?? 0);
        $totalesAnio[$anioKey]['total_anual_kms_global'] += (float) ($row['total_kms_mes'] ?? 0);
    }

    // Anotar totals en cada fila
    foreach ($allRows as &$row) {
        $anioKey = (int) $row['anio'];
        if (isset($totalesAnio[$anioKey])) {
            $row['rutas_anio'] = $totalesAnio[$anioKey]['rutas_anio'];
            $row['total_anual_kms_global'] = $totalesAnio[$anioKey]['total_anual_kms_global'];
        }
    }
    unset($row);

    // Re-ordenar todo (BD + histórico) por año DESC, mes DESC
    usort($allRows, function ($a, $b) {
        $anioA = (int)($a['anio'] ?? 0);
        $anioB = (int)($b['anio'] ?? 0);
        if ($anioA !== $anioB) return $anioB - $anioA;
        
        // Extraer mes: si existe 'mes' úsalo, si no, deriva de 'mes_nombre'
        $mesesMap = ['Enero'=>1, 'Febrero'=>2, 'Marzo'=>3, 'Abril'=>4, 'Mayo'=>5, 'Junio'=>6,
                     'Julio'=>7, 'Agosto'=>8, 'Septiembre'=>9, 'Octubre'=>10, 'Noviembre'=>11, 'Diciembre'=>12];
        $mesA = isset($a['mes']) && $a['mes'] !== '' ? (int)$a['mes'] : ($mesesMap[$a['mes_nombre'] ?? ''] ?? 0);
        $mesB = isset($b['mes']) && $b['mes'] !== '' ? (int)$b['mes'] : ($mesesMap[$b['mes_nombre'] ?? ''] ?? 0);
        return $mesB - $mesA;
    });

    return $allRows;
}

function get_rutas_chart_data($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT
            fecha_inicio,
            ROUND(kms, 1) as kms,
            ROUND(SUM(kms) OVER (PARTITION BY vehiculo_id ORDER BY fecha_inicio ASC, id ASC), 1) as acumulado_kms,
            metros_ascenso,
            metros_descenso,
            velocidad_media,
            velocidad_maxima,
            potencia_promedio_w,
            tiempo_total,
            calorias,
            regulacion
        FROM rutas
        WHERE activo = 1 AND vehiculo_id = ?
        ORDER BY fecha_inicio ASC, id ASC
    ");
    $stmt->execute([$params['vehiculo_id']]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Añadir rutas de años archivados
    foreach (hist_rutas_por_vehiculo($params['vehiculo_id']) as $r) {
        $rows[] = [
            'fecha_inicio' => $r['fecha_inicio'],
            'kms' => round((float) $r['kms'], 1),
            'acumulado_kms' => 0,
            'metros_ascenso' => $r['metros_ascenso'],
            'metros_descenso' => $r['metros_descenso'],
            'velocidad_media' => $r['velocidad_media'],
            'velocidad_maxima' => $r['velocidad_maxima'],
            'potencia_promedio_w' => $r['potencia_promedio_w'],
            'tiempo_total' => $r['tiempo_total'],
            'calorias' => $r['calorias'],
            'regulacion' => $r['regulacion'],
        ];
    }

    usort($rows, 'cmp_rutas_asc');
    $acum = 0.0;
    foreach ($rows as $i => $r) {
        $acum += (float) $r['kms'];
        $rows[$i]['acumulado_kms'] = round($acum, 1);
    }
    return $rows;
}

function create_temperaturas_repo($ruta_id, $temperaturas)
{
    // Ruta archivada en hist/ → write-through
    $found = hist_buscar_ruta($ruta_id);
    if ($found) {
        [$anio] = $found;
        $rows = [];
        foreach ($temperaturas as $t) {
            $rows[] = [
                'ruta_id' => (int) $ruta_id,
                'kilometro' => $t['kilometro'] ?? null,
                'lat' => $t['lat'] ?? null,
                'lon' => $t['lon'] ?? null,
                'temperatura' => $t['temperatura'] ?? null,
                'lluvia' => $t['lluvia'] ?? 0,
                'hora' => $t['hora'] ?? null,
            ];
        }
        hist_escribir_payload_array($anio, 'temp', $ruta_id, $rows);
        return count($temperaturas);
    }

    $db = conectar();
    $db->beginTransaction();
    try {
        $del = $db->prepare("DELETE FROM ruta_temperatura WHERE ruta_id = ?");
        $del->execute([$ruta_id]);

        $ins = $db->prepare("INSERT INTO ruta_temperatura (ruta_id, kilometro, lat, lon, temperatura, lluvia, hora) VALUES (?, ?, ?, ?, ?, ?, ?)");
        foreach ($temperaturas as $t) {
            $ins->execute([
                $ruta_id,
                $t['kilometro'] ?? null,
                $t['lat'] ?? null,
                $t['lon'] ?? null,
                $t['temperatura'] ?? null,
                $t['lluvia'] ?? 0,
                $t['hora'] ?? null
            ]);
        }
        $db->commit();
        return count($temperaturas);
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function get_temperaturas_repo($ruta_id)
{
    $db = conectar();
    $stmt = $db->prepare("SELECT id, ruta_id, kilometro, lat, lon, temperatura, lluvia, hora, created_at FROM ruta_temperatura WHERE ruta_id = ? ORDER BY kilometro ASC");
    $stmt->execute([$ruta_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!empty($rows)) {
        return $rows;
    }

    $found = hist_buscar_ruta($ruta_id);
    if ($found) {
        [$anio] = $found;
        $rows = hist_leer_payload_array($anio, 'temp', $ruta_id) ?: [];
        usort($rows, function ($a, $b) {
            return (float) ($a['kilometro'] ?? 0) <=> (float) ($b['kilometro'] ?? 0);
        });
        return $rows;
    }
    return [];
}

function get_velocidades_by_month($params)
{
    $db = conectar();
    $stmt = $db->prepare("
SELECT
    strftime('%Y-%m', r.fecha_inicio) AS mes_anio,
    v.id AS vehiculo_id,
    v.nombre AS vehiculo_nombre,
    v.anagrama AS vehiculo_anagrama,
    ROUND(AVG(r.velocidad_media), 1) AS velocidad_media_promedio,
    ROUND(MAX(r.velocidad_maxima), 1) AS velocidad_maxima_maxima
FROM rutas r
INNER JOIN vehiculos v ON r.vehiculo_id = v.id
WHERE r.activo = 1
  AND v.usuario_id = ?
  AND r.velocidad_media IS NOT NULL
  AND r.velocidad_maxima IS NOT NULL
GROUP BY strftime('%Y-%m', r.fecha_inicio), r.vehiculo_id
ORDER BY mes_anio ASC, v.nombre ASC;
                                ");
    $stmt->execute([$params['usuario_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Añadir velocidades de años archivados (resumen precalculado por año)
    $vehiculos_usuario = $db->query("SELECT id FROM vehiculos WHERE usuario_id = " . (int) $params['usuario_id'])->fetchAll(PDO::FETCH_COLUMN);
    foreach (hist_anios_disponibles() as $anio) {
        $res = hist_leer_resumen($anio);
        if (!$res || empty($res['velocidades'])) {
            continue;
        }
        foreach ($res['velocidades'] as $v) {
            if (in_array((int) $v['vehiculo_id'], array_map('intval', $vehiculos_usuario), true)) {
                $entity[] = $v;
            }
        }
    }

    usort($entity, function ($a, $b) {
        $c = strcmp((string) ($a['mes_anio'] ?? ''), (string) ($b['mes_anio'] ?? ''));
        if ($c !== 0) {
            return $c;
        }
        return strcmp((string) ($a['vehiculo_nombre'] ?? ''), (string) ($b['vehiculo_nombre'] ?? ''));
    });
    return $entity;
}







