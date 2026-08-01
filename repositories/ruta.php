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
    // Calcular la suma total de kms para el vehiculo (BD + años archivados)
    $stmt = $db->prepare("SELECT COALESCE(SUM(kms), 0) as total_kms FROM rutas WHERE vehiculo_id = ? AND activo = 1");
    $stmt->execute([$vehiculo_id]);
    $total_kms = (float) $stmt->fetchColumn();
    $total_kms += hist_total_kms_vehiculo($vehiculo_id);
    
    // Tomar solo la parte entera sin redondear
    $total_kms = (int) $total_kms;
    
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

    // Añadir meses de años archivados (resumen precalculado por año)
    foreach (hist_anios_disponibles() as $anio) {
        $res = hist_leer_resumen($anio);
        if (!$res || empty($res['usuarios'])) {
            continue;
        }
        foreach ($res['usuarios'] as $row) {
            if ((int) $row['usuario_id'] === (int) $params['usuario_id']) {
                unset($row['usuario_id']);
                $entity[] = $row;
            }
        }
    }
    return $entity;
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







