<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_prediccion_by_combinacion($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT fecha, kms
        FROM mantenimientos
        WHERE vehiculo_id = ?
          AND operacion_id = ?
          AND grupo_id = ?
          AND localizacion_id = ?
          AND is_active = 1
        ORDER BY fecha ASC
    ");
    $stmt->execute([
        $params['vehiculo_id'],
        $params['operacion_id'],
        $params['grupo_id'],
        $params['localizacion_id']
    ]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $result = [
        'avg_dias' => null,
        'avg_km' => null,
        'proxima_fecha' => null,
        'proximos_kms' => null,
        'dias_usuario' => null,
        'km_usuario' => null,
        'total_registros' => count($rows),
    ];

    if (count($rows) >= 2) {
        $sumDias = 0;
        $sumKm = 0;
        $count = 0;
        for ($i = 1; $i < count($rows); $i++) {
            $fecha1 = strtotime($rows[$i - 1]['fecha']);
            $fecha2 = strtotime($rows[$i]['fecha']);
            $diffDias = ($fecha2 - $fecha1) / 86400;
            $diffKm = $rows[$i]['kms'] - $rows[$i - 1]['kms'];
            if ($diffDias > 0 && $diffKm >= 0) {
                $sumDias += $diffDias;
                $sumKm += $diffKm;
                $count++;
            }
        }
        if ($count > 0) {
            $result['avg_dias'] = round($sumDias / $count);
            $result['avg_km'] = round($sumKm / $count);
        }
    }

    $last = end($rows);
    if ($last && $result['avg_dias'] !== null) {
        $proximaFecha = date('Y-m-d', strtotime($last['fecha'] . ' + ' . $result['avg_dias'] . ' days'));
        $result['proxima_fecha'] = $proximaFecha;
        $result['proximos_kms'] = $last['kms'] + $result['avg_km'];
    }

    $stmt2 = $db->prepare("
        SELECT dias_usuario, km_usuario
        FROM programaciones
        WHERE vehiculo_id = ?
          AND operacion_id = ?
          AND grupo_id = ?
          AND localizacion_id = ?
          AND is_active = 1
        LIMIT 1
    ");
    $stmt2->execute([
        $params['vehiculo_id'],
        $params['operacion_id'],
        $params['grupo_id'],
        $params['localizacion_id']
    ]);
    $pref = $stmt2->fetch(PDO::FETCH_ASSOC);
    if ($pref) {
        $result['dias_usuario'] = $pref['dias_usuario'];
        $result['km_usuario'] = $pref['km_usuario'];
    }

    // Use last record from this combo for base calculation
    $base = $last;

    // If no records for this combo but user prefs exist, get last vehicle data
    if (!$base && ($result['dias_usuario'] || $result['km_usuario'])) {
        $stmt3 = $db->prepare("
            SELECT uk.kms, uk.fecha_actualizacion AS fecha
            FROM ultimos_kms uk
            WHERE uk.vehiculo_id = ?
            LIMIT 1
        ");
        $stmt3->execute([$params['vehiculo_id']]);
        $base = $stmt3->fetch(PDO::FETCH_ASSOC);
        if (!$base) {
            $stmt3 = $db->prepare("
                SELECT kms_inicio AS kms, fecha_compra AS fecha
                FROM vehiculos
                WHERE id = ?
                LIMIT 1
            ");
            $stmt3->execute([$params['vehiculo_id']]);
            $base = $stmt3->fetch(PDO::FETCH_ASSOC);
        }
    }

    // Apply user preferences (priority) over system calculation
    if ($result['dias_usuario'] && $base) {
        $result['proxima_fecha'] = date('Y-m-d', strtotime($base['fecha'] . ' + ' . $result['dias_usuario'] . ' days'));
    } elseif ($last && $result['avg_dias'] !== null) {
        $result['proxima_fecha'] = date('Y-m-d', strtotime($last['fecha'] . ' + ' . $result['avg_dias'] . ' days'));
    }
    if ($result['km_usuario'] && $base) {
        $result['proximos_kms'] = $base['kms'] + $result['km_usuario'];
    } elseif ($last && $result['avg_km'] !== null) {
        $result['proximos_kms'] = $last['kms'] + $result['avg_km'];
    }

    return $result;
}

function get_todas_predicciones($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT DISTINCT c.operacion_id, c.grupo_id, c.localizacion_id,
               COALESCE(o.nombre, '') AS operacion_nombre,
               COALESCE(o.imagen, '') AS operacion_imagen,
               COALESCE(g.nombre, '') AS grupo_nombre,
               COALESCE(g.imagen, '') AS grupo_imagen,
               COALESCE(l.nombre, '') AS localizacion_nombre,
               COALESCE(l.imagen, '') AS localizacion_imagen
        FROM (
            SELECT operacion_id, grupo_id, localizacion_id
            FROM mantenimientos
            WHERE vehiculo_id = ? AND is_active = 1
            UNION
            SELECT operacion_id, grupo_id, localizacion_id
            FROM programaciones
            WHERE vehiculo_id = ? AND is_active = 1
              AND (dias_usuario IS NOT NULL OR km_usuario IS NOT NULL)
        ) c
        LEFT JOIN operaciones o ON c.operacion_id = o.id
        LEFT JOIN grupos g ON c.grupo_id = g.id
        LEFT JOIN localizaciones l ON c.localizacion_id = l.id
        ORDER BY o.nombre, g.nombre, l.nombre
    ");
    $stmt->execute([$params['vehiculo_id'], $params['vehiculo_id']]);
    $combos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $resultados = [];
    foreach ($combos as $combo) {
        $pred = get_prediccion_by_combinacion([
            'vehiculo_id' => $params['vehiculo_id'],
            'operacion_id' => $combo['operacion_id'],
            'grupo_id' => $combo['grupo_id'],
            'localizacion_id' => $combo['localizacion_id'],
        ]);
        if ($pred['proxima_fecha'] || $pred['proximos_kms']) {
            $resultados[] = array_merge($combo, $pred);
        }
    }

    usort($resultados, function ($a, $b) {
        $fa = $a['proxima_fecha'] ?? '9999-12-31';
        $fb = $b['proxima_fecha'] ?? '9999-12-31';
        return strcmp($fa, $fb);
    });

    return $resultados;
}

function get_configuracion_combinaciones($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT DISTINCT c.operacion_id, c.grupo_id, c.localizacion_id,
               COALESCE(o.nombre, '') AS operacion_nombre,
               COALESCE(o.imagen, '') AS operacion_imagen,
               COALESCE(g.nombre, '') AS grupo_nombre,
               COALESCE(g.imagen, '') AS grupo_imagen,
               COALESCE(l.nombre, '') AS localizacion_nombre,
               COALESCE(l.imagen, '') AS localizacion_imagen,
               p.dias_usuario, p.km_usuario
        FROM (
            SELECT operacion_id, grupo_id, localizacion_id
            FROM mantenimientos
            WHERE vehiculo_id = ? AND is_active = 1
            UNION
            SELECT operacion_id, grupo_id, localizacion_id
            FROM programaciones
            WHERE vehiculo_id = ? AND is_active = 1
              AND (dias_usuario IS NOT NULL OR km_usuario IS NOT NULL)
        ) c
        LEFT JOIN operaciones o ON c.operacion_id = o.id
        LEFT JOIN grupos g ON c.grupo_id = g.id
        LEFT JOIN localizaciones l ON c.localizacion_id = l.id
        LEFT JOIN programaciones p ON p.vehiculo_id = ?
            AND p.operacion_id = c.operacion_id
            AND p.grupo_id = c.grupo_id
            AND p.localizacion_id = c.localizacion_id
            AND p.is_active = 1
        ORDER BY o.nombre, g.nombre, l.nombre
    ");
    $stmt->execute([$params['vehiculo_id'], $params['vehiculo_id'], $params['vehiculo_id']]);
    $combos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $resultados = [];
    foreach ($combos as $combo) {
        $pred = get_prediccion_by_combinacion([
            'vehiculo_id' => $params['vehiculo_id'],
            'operacion_id' => $combo['operacion_id'],
            'grupo_id' => $combo['grupo_id'],
            'localizacion_id' => $combo['localizacion_id'],
        ]);
        $resultados[] = array_merge($combo, [
            'avg_dias' => $pred['avg_dias'],
            'avg_km' => $pred['avg_km'],
            'total_registros' => $pred['total_registros'],
        ]);
    }

    return $resultados;
}

function save_programacion($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        INSERT INTO programaciones (vehiculo_id, operacion_id, grupo_id, localizacion_id, dias_usuario, km_usuario, created_at, is_active)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'), 1)
        ON CONFLICT(vehiculo_id, operacion_id, grupo_id, localizacion_id) DO UPDATE SET
            dias_usuario = excluded.dias_usuario,
            km_usuario = excluded.km_usuario,
            modified_at = datetime('now')
    ");
    $stmt->execute([
        $params['vehiculo_id'],
        $params['operacion_id'],
        $params['grupo_id'],
        $params['localizacion_id'],
        $params['dias_usuario'] ?? null,
        $params['km_usuario'] ?? null,
    ]);
    return $db->lastInsertId();
}
