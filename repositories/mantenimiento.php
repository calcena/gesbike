<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
function get_list_mantenimientos($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $stmt = $db->prepare("
                                SELECT
                                    m.id,
                                    (select puntero from vehiculos where id= m.vehiculo_id) as puntero,
                                    (select anagrama from vehiculos where id= m.vehiculo_id) as vehiculo_nombre,
                                    m.vehiculo_id,
                                    m.operacion_id,
                                    m.grupo_id,
                                    m.localizacion_id,
                                    m.precio,
                                    (SELECT count(id) FROM adjuntos WHERE mantenimiento_id = m.id) AS adjunto,
                                    m.kms,
                                    m.fecha,
                                    (select coalesce(sum(kms),0) from motores where vehiculo_id = m.vehiculo_id) as total_kms_motor,
                                    (select id from motores where vehiculo_id = m.vehiculo_id and is_active = 1) as motor_active,
                                    m.motor_id,
                                    (strftime('%Y', m.fecha) - strftime('%Y', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) AS years,
                                    CASE
                                        WHEN (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) < 0 THEN
                                            (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) + 12
                                        ELSE
                                            (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id)))
                                    END AS months,
                                    CASE
                                        WHEN (strftime('%Y', m.fecha) - strftime('%Y', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) = 0 THEN
                                            printf('%d meses',
                                                CASE
                                                    WHEN (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) < 0 THEN
                                                        (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) + 12
                                                    ELSE
                                                        (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id)))
                                                END
                                            )
                                        ELSE
                                            printf('%d años y %d meses',
                                                (strftime('%Y', m.fecha) - strftime('%Y', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id)))
                                                - CASE WHEN strftime('%m', m.fecha) < strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id)) THEN 1 ELSE 0 END,
                                                CASE
                                                    WHEN (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) < 0 THEN
                                                        (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id))) + 12
                                                    ELSE
                                                        (strftime('%m', m.fecha) - strftime('%m', (SELECT fecha_compra FROM vehiculos WHERE id = m.vehiculo_id)))
                                                END
                                            )
                                    END AS tiempo_transcurrido,
                                    (SELECT imagen FROM operaciones WHERE id = m.operacion_id) AS img_operacion,
                                    (SELECT imagen FROM grupos WHERE id = m.grupo_id) AS img_grupo,
                                    (SELECT imagen FROM localizaciones WHERE id = m.localizacion_id) AS img_localizacion,
                                    m.unidades,
                                    COALESCE(m.observaciones, '') AS observaciones
                                FROM
                                    mantenimientos AS m
                                WHERE m.vehiculo_id= ?
                                and m.is_active = 1
                                ORDER BY m.fecha DESC, m.kms DESC, m.grupo_id DESC;
                                ");
    $stmt->execute([$vehiculo_id]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function create_new_mantenimiento($params)
{
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $motor_id = $params['motor_id'];
    $fecha = $params['fecha'];
    $operacion_id = $params['operacion_id'];
    $grupo_id = $params['grupo_id'];
    $localizacion_id = $params['localizacion_id'];
    $recambio_id = $params['recambio_id'];
    $kms = $params['kms'];
    $und = $params['und'];
    $precio = $params['precio'];
    $observaciones = $params['observaciones'];
    try {
        $stmt = $db->prepare("
                                    INSERT INTO mantenimientos (
                                        vehiculo_id,
                                        motor_id,
                                        fecha,
                                        operacion_id,
                                        grupo_id,
                                        localizacion_id,
                                        recambio_id,
                                        kms,
                                        unidades,
                                        precio,
                                        observaciones,
                                        created_at,
                                        is_active
                                    ) VALUES (
                                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,  datetime('now'), 1
                                    )
                                    ");

        $stmt->execute([
            $vehiculo_id,
            $motor_id,
            $fecha,
            $operacion_id,
            $grupo_id,
            $localizacion_id,
            $recambio_id,
            $kms,
            $und,
            $precio,
            $observaciones
        ]);
        $inserted_id = $db->lastInsertId();

        return [
            'success' => true,
            'id' => (int) $inserted_id
        ];

    } catch (PDOException $e) {
        error_log("Error al crear mantenimiento: " . $e->getMessage());
        return [
            'success' => false,
            'error' => 'Error al guardar el mantenimiento',
            'debug' => $e->getMessage()
        ];
    }
}

function get_adjuntos($params)
{
    global $db;
    $db = conectar();
    $mantenimiento_id = $params['mantenimiento_id'];
    $stmt = $db->prepare("
                                SELECT
                                *
                                FROM
                                adjuntos a
                                WHERE a.mantenimiento_id = ?
                                ORDER BY a.created_at DESC;
                                ");
    $stmt->execute([$mantenimiento_id]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function delete_attachment($params)
{
    global $db;
    $db = conectar();
    $adjunto_id = $params['adjunto_id'];

    try {
        $stmt = $db->prepare("
            DELETE FROM adjuntos
            WHERE id = ?
        ");
        $stmt->execute([$adjunto_id]);

        if ($stmt->rowCount() > 0) {
            return true;
        } else {
            return false;
        }

    } catch (PDOException $e) {
        // Log del error (opcional)
        error_log("Error al eliminar adjunto: " . $e->getMessage());
        return false;
    }
}

function mantenimiento_by_id($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                *,
                                (SELECT nombre FROM recambios where id= m.recambio_id) as nombre_recambio
                                FROM
                                mantenimientos m
                                INNER JOIN grupos g
                                on m.grupo_id = g.id
                                WHERE m.id = ?

                                ");
    $stmt->execute([$params['mantenimiento_id']]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}


function edit_mantenimiento_by_id($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                UPDATE mantenimientos
                                SET
                                vehiculo_id = ?,
                                fecha = ?,
                                operacion_id = ?,
                                grupo_id = ?,
                                localizacion_id = ?,
                                kms = ?,
                                unidades = ?,
                                precio =?,
                                observaciones = ?,
                                modified_at = datetime('now')
                                WHERE id = ?
                                ");
    $stmt->execute([
        $params['vehiculo_id'],
        $params['fecha'],
        $params['operacion_id'],
        $params['grupo_id'],
        $params['localizacion_id'],
        $params['kms'],
        $params['und'],
        $params['precio'],
        $params['observaciones'],
        $params['mantenimiento_id']
    ]);
    $entity = $stmt->rowCount();
    return $entity;
}

function delete_mantenimiento_by_id($params)
{
    global $db;
    $db = conectar();
    $stmt_files = $db->prepare("
                                SELECT
                                ruta
                                FROM
                                adjuntos
                                WHERE mantenimiento_id = ?
                                ");
    $stmt_files->execute([$params['mantenimiento_id']]);
    $entity = $stmt_files->fetchAll(PDO::FETCH_ASSOC);
    $stmt_ajto = $db->prepare("
                                DELETE
                                FROM
                                adjuntos
                                WHERE mantenimiento_id = ?
                                ");
    $stmt_ajto->execute([$params['mantenimiento_id']]);

    $stmt_mntm = $db->prepare("
                                DELETE
                                FROM
                                mantenimientos
                                WHERE id = ?
                                ");
    $stmt_mntm->execute([$params['mantenimiento_id']]);
    if ($stmt_files->rowCount() > 0) {
        return $entity;
    }
    return false;
}


function kms_by_grupo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT
                                (coalesce((SELECT nombre FROM localizaciones WHERE id = m.localizacion_id),'N/A')) AS localizacion,
                                           (coalesce((SELECT imagen FROM localizaciones WHERE id = m.localizacion_id),'')) AS img_localizacion,
                                            m.kms,
                                            MAX(? - m.kms, 0) AS kms_realizados,
                                            MAX(m.fecha) AS ultima_fecha,
                                            (strftime('%Y', date('now')) - strftime('%Y', MAX(m.fecha)))
                                                + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN -1 ELSE 0 END) AS years,
                                            (strftime('%m', date('now')) - strftime('%m', MAX(m.fecha))
                                                + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN 12 ELSE 0 END)) AS months,

                                            CASE
                                                WHEN (strftime('%Y', date('now')) - strftime('%Y', MAX(m.fecha)))
                                                    + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN -1 ELSE 0 END) = 0
                                                    THEN printf('%d meses',
                                                        (strftime('%m', date('now')) - strftime('%m', MAX(m.fecha))
                                                        + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN 12 ELSE 0 END))
                                                    )
                                                WHEN (strftime('%Y', date('now')) - strftime('%Y', MAX(m.fecha)))
                                                    + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN -1 ELSE 0 END) > 0
                                                    AND (strftime('%m', date('now')) - strftime('%m', MAX(m.fecha))
                                                    + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN 12 ELSE 0 END)) > 0
                                                    THEN printf('%d años y %d meses',
                                                        (strftime('%Y', date('now')) - strftime('%Y', MAX(m.fecha)))
                                                        + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN -1 ELSE 0 END),
                                                        (strftime('%m', date('now')) - strftime('%m', MAX(m.fecha))
                                                        + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN 12 ELSE 0 END))
                                                    )
                                                ELSE printf('%d años',
                                                        (strftime('%Y', date('now')) - strftime('%Y', MAX(m.fecha)))
                                                        + (CASE WHEN strftime('%m', date('now')) < strftime('%m', MAX(m.fecha)) THEN -1 ELSE 0 END)
                                                    )
                                            END AS tiempo_transcurrido
                                            FROM mantenimientos AS m
                                            WHERE m.grupo_id = ?
                                            AND m.vehiculo_id = ?
                                            AND is_active = 1
                                            GROUP BY localizacion_id;
                                ");
    $stmt->execute([$params['kms'],$params["grupo_id"],$params['vehiculo_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;

}

function historico_mantenimientos_by_grupo($params)
{

    $db = conectar();
    $stmt = $db->prepare("
                                WITH Numeracion AS (
                                    SELECT
                                        m.fecha,
                                        (SELECT nombre FROM operaciones WHERE id = m.operacion_id) AS operacion_nombre,
                                        (SELECT nombre FROM recambios WHERE id = m.recambio_id) AS recambio,
                                        m.kms,
                                        COALESCE(UPPER((SELECT nombre FROM localizaciones WHERE id = m.localizacion_id)), 'N/A') AS localizacion,
                                        m.vehiculo_id,
                                        m.localizacion_id,
                                        -- Traemos los KMS del siguiente registro
                                        LEAD(m.kms) OVER(PARTITION BY m.vehiculo_id, m.localizacion_id ORDER BY m.fecha ASC) AS kms_proximo,
                                        ROW_NUMBER() OVER(PARTITION BY m.vehiculo_id, m.localizacion_id ORDER BY m.fecha ASC) AS fila_num,
                                        COUNT(*) OVER(PARTITION BY m.vehiculo_id, m.localizacion_id) AS total_filas
                                    FROM
                                        mantenimientos AS m
                                    WHERE
                                        m.vehiculo_id = ?
                                        AND m.grupo_id = ?
                                )
                                SELECT
                                    n.fecha,
                                    n.operacion_nombre,
                                    COALESCE(n.recambio, 'N/A') AS recambio,
                                    n.kms,
                                    COALESCE(n.localizacion, '') AS localizacion,
                                    n.vehiculo_id,
                                    n.localizacion_id,
                                    n.fila_num,
                                    -- CÁLCULO DE DURACIÓN DEL RECAMBIO (SIEMPRE MIRA HACIA ADELANTE)
                                    CASE
                                        -- Si hay un registro siguiente, restamos Siguiente - Actual
                                        WHEN n.kms_proximo IS NOT NULL THEN (n.kms_proximo - n.kms)

                                        -- Si es el último (no hay siguiente), usamos los kms actuales del vehículo (?)
                                        ELSE
                                            CASE
                                                WHEN (? - n.kms) < 0 THEN 0
                                                ELSE (? - n.kms)
                                            END
                                    END AS diferencia_kms,

                                    -- Diferencia en tiempo (Edad del vehículo)
                                    CASE
                                        WHEN CAST((JULIANDAY(n.fecha) - JULIANDAY((SELECT fecha_compra FROM vehiculos WHERE id = n.vehiculo_id))) / 365 AS INTEGER) = 0 THEN
                                            CAST(((JULIANDAY(n.fecha) - JULIANDAY((SELECT fecha_compra FROM vehiculos WHERE id = n.vehiculo_id))) % 365) / 30.44 AS INTEGER) || ' meses'
                                        ELSE
                                            CAST((JULIANDAY(n.fecha) - JULIANDAY((SELECT fecha_compra FROM vehiculos WHERE id = n.vehiculo_id))) / 365 AS INTEGER) || ' años y ' ||
                                            CAST(((JULIANDAY(n.fecha) - JULIANDAY((SELECT fecha_compra FROM vehiculos WHERE id = n.vehiculo_id))) % 365) / 30.44 AS INTEGER) || ' meses'
                                    END AS diferencia_tiempo
                                FROM
                                    Numeracion AS n
                                ORDER BY
                                    n.localizacion_id, n.fecha ASC;
                                ");
    $stmt->execute([$params['vehiculo_id'], $params["grupo_id"],$params['kms'],$params['kms']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}








