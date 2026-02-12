<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();



function get_rutas_by_id($params)
{
    global $db;
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                *
                                FROM rutas
                                WHERE id = ?
                            ");
    $stmt->execute([$params['ruta_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;

}

function eliminar_ruta($params)
{
    $db = conectar();
    
    // Obtener el vehiculo_id antes de eliminar
    $stmt = $db->prepare("SELECT vehiculo_id FROM rutas WHERE id = ?");
    $stmt->execute([$params['ruta_id']]);
    $vehiculo_id = $stmt->fetchColumn();
    
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




function get_rutas_by_vehiculo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                id,
                                vehiculo_id,
                                fecha_inicio,
                                fecha_fin,
                                tiempo_total,
                                tiempo_movimiento,
                                ROUND(kms, 1) as kms,
                                ROUND(SUM(kms) OVER (
                                        PARTITION BY vehiculo_id
                                        ORDER BY fecha_inicio ASC, id ASC
                                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                                    ), 1) as acumulado_kms,
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
                                activo
                                FROM rutas
                                WHERE activo = true
                                and vehiculo_id = ?
                                ORDER BY vehiculo_id, fecha_inicio DESC, id DESC;
                            ");
    $stmt->execute([$params['vehiculo_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}


function add_ruta_manual($params)
{
    $db = conectar();
    // 1. Intentar UPDATE
    $upd = $db->prepare("
        UPDATE rutas SET
            kms = ?,
            observaciones = ?,
            activo = 1,
            origen = 'manual'
        WHERE vehiculo_id = ? AND fecha_inicio = ?
    ");
    $upd->execute([
        (float) ($params['kms'] ?? 0.0),
        $params['observaciones'],
        $params['vehiculo_id'],
        $params['fecha']
    ]);

    if ($upd->rowCount() > 0) {
        // Existe → devolver ID
        $sel = $db->prepare("SELECT id FROM rutas WHERE vehiculo_id = ? AND fecha_inicio = ?");
        $sel->execute([$params['vehiculo_id'], $params['fecha']]);
        $ruta_id = (int) $sel->fetchColumn();
        
        // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
        actualizar_ultimos_kms($db, $params['vehiculo_id']);
        
        return $ruta_id;
    }

    // 2. Si no existe, INSERT
    $ins = $db->prepare("
        INSERT INTO rutas (
            vehiculo_id, fecha_inicio, kms, observaciones, activo, origen
        ) VALUES (?, ?, ?, ?, 1, 'manual')
    ");
    $ins->execute([
        $params['vehiculo_id'],
        $params['fecha'],
        (float) ($params['kms'] ?? 0.0),
        $params['observaciones'] ?? null,
    ]);

    $ruta_id = (int) $db->lastInsertId();
    
    // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
    actualizar_ultimos_kms($db, $params['vehiculo_id']);
    
    return $ruta_id;
}

function update_ruta_manual($params) {
    $db = conectar();
    
    $upd = $db->prepare("
        UPDATE rutas SET
            kms = ?,
            observaciones = ?,
            fecha_inicio = ?,
            activo = 1,
            origen = 'manual'
        WHERE id = ? AND vehiculo_id = ? AND origen = 'manual'
    ");
    
    $result = $upd->execute([
        (float) ($params['kms'] ?? 0.0),
        $params['observaciones'] ?? null,
        $params['fecha'],
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

function create_ruta_file($params)
{
    global $db;
    if (!isset($db)) {
        $db = conectar();
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
            activo = 1,
            origen = 'gpx'
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
            velocidad_media, velocidad_maxima, potencia_promedio_w, calorias, pct_subida, pct_plano, pct_bajada, tiempo_subida, tiempo_plano, tiempo_bajada,activo, origen
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? , ?, 1, 'gpx')
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
        $params['tiempo_bajada']
    ]);

    $ruta_id = (int) $db->lastInsertId();
    
    // Actualizar tabla ultimos_kms con la suma de kms del vehiculo
    actualizar_ultimos_kms($db, $params['vehiculo_id']);
    
    return $ruta_id;
}

function actualizar_ultimos_kms($db, $vehiculo_id) {
    // Calcular la suma total de kms para el vehiculo
    $stmt = $db->prepare("SELECT COALESCE(SUM(kms), 0) as total_kms FROM rutas WHERE vehiculo_id = ? AND activo = 1");
    $stmt->execute([$vehiculo_id]);
    $total_kms = $stmt->fetchColumn();
    
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
    ROUND(SUM(r1.kms), 2) AS total_kms_mes,
    COUNT(CASE WHEN v1.categoria = 'pulmonar' THEN r1.id END) AS rutas_mes_pulmonar,
    COUNT(CASE WHEN v1.categoria = 'electrica' THEN r1.id END) AS rutas_mes_electrica,

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
    return $entity;
}







