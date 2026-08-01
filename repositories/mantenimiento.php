<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
require_once __DIR__ . '/../helpers/archivo.php';

function mant_datos_vehiculo($db, $vehiculo_id)
{
    static $cache = [];
    if (isset($cache[$vehiculo_id])) {
        return $cache[$vehiculo_id];
    }
    $v = $db->prepare("SELECT puntero, anagrama, fecha_compra FROM vehiculos WHERE id = ?");
    $v->execute([$vehiculo_id]);
    $veh = $v->fetch(PDO::FETCH_ASSOC);
    if (!$veh) {
        $veh = ['puntero' => null, 'anagrama' => null, 'fecha_compra' => null];
    }
    $stmt = $db->prepare("SELECT COALESCE(SUM(kms), 0) FROM motores WHERE vehiculo_id = ?");
    $stmt->execute([$vehiculo_id]);
    $total_motor = (float) $stmt->fetchColumn();
    $stmt = $db->prepare("SELECT id FROM motores WHERE vehiculo_id = ? AND is_active = 1");
    $stmt->execute([$vehiculo_id]);
    $motor_active = $stmt->fetchColumn();
    return $cache[$vehiculo_id] = [$veh, $total_motor, $motor_active];
}

function mant_imagen($db, $tabla, $id)
{
    if ($id === null || $id === '' || $id === 0) {
        return null;
    }
    $stmt = $db->prepare("SELECT imagen FROM " . $tabla . " WHERE id = ?");
    $stmt->execute([$id]);
    return $stmt->fetchColumn();
}

function mant_edad_vehiculo($fecha, $fecha_compra)
{
    if (!$fecha || !$fecha_compra) {
        return ['years' => 0, 'months' => 0, 'tiempo_transcurrido' => ''];
    }
    $y = (int) substr($fecha, 0, 4);
    $m = (int) substr($fecha, 5, 2);
    $yc = (int) substr($fecha_compra, 0, 4);
    $mc = (int) substr($fecha_compra, 5, 2);
    $years = $y - $yc;
    $months = $m - $mc;
    $ajuste = ($m < $mc) ? 1 : 0;
    $months_adj = $months < 0 ? $months + 12 : $months;
    $years_adj = $years - $ajuste;
    if ($years === 0) {
        $tiempo = sprintf('%d meses', $months_adj);
    } else {
        $tiempo = sprintf('%d años y %d meses', $years_adj, $months_adj);
    }
    return ['years' => $years_adj, 'months' => $months_adj, 'tiempo_transcurrido' => $tiempo];
}

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

    // Añadir mantenimientos de años archivados (hist/)
    [$veh, $total_motor, $motor_active] = mant_datos_vehiculo($db, $vehiculo_id);
    foreach (hist_mantenimientos_por_vehiculo($vehiculo_id) as $m) {
        if (!(int) $m['is_active']) {
            continue;
        }
        $edad = mant_edad_vehiculo($m['fecha'], $veh['fecha_compra']);
        $entity[] = [
            'id' => $m['id'],
            'puntero' => $veh['puntero'],
            'vehiculo_nombre' => $veh['anagrama'],
            'vehiculo_id' => (int) $vehiculo_id,
            'operacion_id' => $m['operacion_id'],
            'grupo_id' => $m['grupo_id'],
            'localizacion_id' => $m['localizacion_id'],
            'precio' => $m['precio'] ?? null,
            'adjunto' => count(hist_adjuntos_por_mantenimiento($m['id'])),
            'kms' => $m['kms'],
            'fecha' => $m['fecha'],
            'total_kms_motor' => $total_motor,
            'motor_active' => $motor_active,
            'motor_id' => $m['motor_id'],
            'years' => $edad['years'],
            'months' => $edad['months'],
            'tiempo_transcurrido' => $edad['tiempo_transcurrido'],
            'img_operacion' => mant_imagen($db, 'operaciones', $m['operacion_id']),
            'img_grupo' => mant_imagen($db, 'grupos', $m['grupo_id']),
            'img_localizacion' => mant_imagen($db, 'localizaciones', $m['localizacion_id']),
            'unidades' => $m['unidades'] ?? null,
            'observaciones' => (string) ($m['observaciones'] ?? ''),
        ];
    }

    usort($entity, function ($a, $b) {
        $c = strcmp((string) ($b['fecha'] ?? ''), (string) ($a['fecha'] ?? ''));
        if ($c !== 0) {
            return $c;
        }
        $c = (int) ($b['kms'] ?? 0) <=> (int) ($a['kms'] ?? 0);
        if ($c !== 0) {
            return $c;
        }
        return (int) ($b['grupo_id'] ?? 0) <=> (int) ($a['grupo_id'] ?? 0);
    });
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

    // Fecha en año archivado → write-through a hist/
    $anio = substr($fecha, 0, 4);
    if (hist_anio_archivado($anio)) {
        $id = hist_siguiente_id('mantenimientos');
        $row = [
            'id' => $id,
            'vehiculo_id' => $vehiculo_id,
            'motor_id' => $motor_id,
            'fecha' => $fecha,
            'operacion_id' => $operacion_id,
            'grupo_id' => $grupo_id,
            'localizacion_id' => $localizacion_id,
            'recambio_id' => $recambio_id,
            'kms' => $kms,
            'unidades' => $und,
            'precio' => $precio,
            'observaciones' => $observaciones,
            'created_at' => date('Y-m-d H:i:s'),
            'is_active' => 1,
        ];
        $rows = hist_leer_tabla($anio, 'mantenimientos');
        $rows[] = $row;
        hist_escribir_tabla($anio, 'mantenimientos', $rows);
        return [
            'success' => true,
            'id' => $id
        ];
    }

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

    // Adjuntos de mantenimientos archivados
    $hist = hist_adjuntos_por_mantenimiento($mantenimiento_id);
    usort($hist, function ($a, $b) {
        return strcmp((string) ($b['created_at'] ?? ''), (string) ($a['created_at'] ?? ''));
    });
    return array_merge($entity, $hist);
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
        }
    } catch (PDOException $e) {
        error_log("Error al eliminar adjunto: " . $e->getMessage());
        return false;
    }

    // Adjunto en años archivados
    foreach (hist_anios_disponibles() as $anio) {
        $rows = hist_leer_tabla($anio, 'adjuntos');
        foreach ($rows as $i => $a) {
            if ((int) $a['id'] === (int) $adjunto_id) {
                array_splice($rows, $i, 1);
                hist_escribir_tabla($anio, 'adjuntos', $rows);
                return true;
            }
        }
    }
    return false;
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
    if ($entity) {
        return $entity;
    }

    $found = hist_buscar_mantenimiento($params['mantenimiento_id']);
    if ($found) {
        [$anio, $m] = $found;
        $g = $db->prepare("SELECT nombre FROM grupos WHERE id = ?");
        $g->execute([$m['grupo_id']]);
        if (!$g->fetchColumn()) {
            return false;
        }
        $rec = $db->prepare("SELECT nombre FROM recambios WHERE id = ?");
        $rec->execute([$m['recambio_id']]);
        $m['nombre_recambio'] = $rec->fetchColumn() ?: null;
        $m['Precio'] = $m['precio'] ?? null;
        $m['Unidades'] = $m['unidades'] ?? null;
        return $m;
    }
    return false;
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
    if ($stmt->rowCount() > 0) {
        return $stmt->rowCount();
    }

    // Mantenimiento archivado en hist/ → write-through
    $found = hist_buscar_mantenimiento($params['mantenimiento_id']);
    if ($found) {
        [$anio] = $found;
        hist_reescribir_registro($anio, 'mantenimientos', $params['mantenimiento_id'], [
            'vehiculo_id' => $params['vehiculo_id'],
            'fecha' => $params['fecha'],
            'operacion_id' => $params['operacion_id'],
            'grupo_id' => $params['grupo_id'],
            'localizacion_id' => $params['localizacion_id'],
            'kms' => $params['kms'],
            'unidades' => $params['und'],
            'precio' => $params['precio'],
            'observaciones' => $params['observaciones'],
            'modified_at' => date('Y-m-d H:i:s'),
        ]);
        return 1;
    }
    return 0;
}

function delete_mantenimiento_by_id($params)
{
    global $db;
    $db = conectar();
    $mantenimiento_id = $params['mantenimiento_id'];

    // Comprobar si existe en BD
    $stmt_chk = $db->prepare("SELECT id FROM mantenimientos WHERE id = ?");
    $stmt_chk->execute([$mantenimiento_id]);
    if ($stmt_chk->fetchColumn()) {
        $stmt_files = $db->prepare("
                                    SELECT
                                    ruta
                                    FROM
                                    adjuntos
                                    WHERE mantenimiento_id = ?
                                    ");
        $stmt_files->execute([$mantenimiento_id]);
        $entity = $stmt_files->fetchAll(PDO::FETCH_ASSOC);
        $stmt_ajto = $db->prepare("
                                    DELETE
                                    FROM
                                    adjuntos
                                    WHERE mantenimiento_id = ?
                                    ");
        $stmt_ajto->execute([$mantenimiento_id]);

        $stmt_mntm = $db->prepare("
                                    DELETE
                                    FROM
                                    mantenimientos
                                    WHERE id = ?
                                    ");
        $stmt_mntm->execute([$mantenimiento_id]);
        return $entity;
    }

    // Mantenimiento archivado en hist/
    $found = hist_buscar_mantenimiento($mantenimiento_id);
    if ($found) {
        [$anio] = $found;
        $files = hist_eliminar_adjuntos_mantenimiento($mantenimiento_id);
        hist_eliminar_registro($anio, 'mantenimientos', $mantenimiento_id);
        return $files;
    }
    return false;
}


function kms_by_grupo($params)
{
    $db = conectar();
    $kms_actuales = (float) $params['kms'];
    $grupo_id = (int) $params['grupo_id'];
    $vehiculo_id = (int) $params['vehiculo_id'];

    // Filas en BD
    $rows = [];
    $stmt = $db->prepare("SELECT * FROM mantenimientos WHERE vehiculo_id = ? AND grupo_id = ? AND is_active = 1");
    $stmt->execute([$vehiculo_id, $grupo_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Filas de años archivados
    foreach (hist_mantenimientos_por_vehiculo($vehiculo_id) as $m) {
        if ((int) $m['grupo_id'] !== $grupo_id || !(int) $m['is_active']) {
            continue;
        }
        $rows[] = $m;
    }

    $entity = [];
    $porLocalizacion = [];
    foreach ($rows as $m) {
        $loc = (int) $m['localizacion_id'];
        if (!isset($porLocalizacion[$loc])) {
            $porLocalizacion[$loc] = ['min_kms' => INF, 'ultima_fecha' => null, 'kms_ultima' => null];
        }
        $porLocalizacion[$loc]['min_kms'] = min($porLocalizacion[$loc]['min_kms'], (float) $m['kms']);
        if ($porLocalizacion[$loc]['ultima_fecha'] === null || strcmp((string) $m['fecha'], $porLocalizacion[$loc]['ultima_fecha']) > 0) {
            $porLocalizacion[$loc]['ultima_fecha'] = $m['fecha'];
            $porLocalizacion[$loc]['kms_ultima'] = (float) $m['kms'];
        }
    }

    foreach ($porLocalizacion as $loc => $g) {
        $ultima = $g['ultima_fecha'];
        $now = new DateTime();
        $d1 = new DateTime(substr($ultima, 0, 10));
        $diff = $d1->diff($now);
        $years = $diff->y;
        $months = $diff->m;
        if ($years === 0) {
            $tiempo = sprintf('%d meses', $months);
        } elseif ($months > 0) {
            $tiempo = sprintf('%d años y %d meses', $years, $months);
        } else {
            $tiempo = sprintf('%d años', $years);
        }

        $entity[] = [
            'localizacion' => (string) ($db->query("SELECT nombre FROM localizaciones WHERE id = " . $loc)->fetchColumn() ?: 'N/A'),
            'img_localizacion' => (string) ($db->query("SELECT imagen FROM localizaciones WHERE id = " . $loc)->fetchColumn() ?: ''),
            'kms' => $g['kms_ultima'],
            'kms_realizados' => max(0, $kms_actuales - $g['min_kms']),
            'ultima_fecha' => $ultima,
            'years' => $years,
            'months' => $months,
            'tiempo_transcurrido' => $tiempo,
        ];
    }
    return $entity;
}

function historico_mantenimientos_by_grupo($params)
{
    $db = conectar();
    $vehiculo_id = (int) $params['vehiculo_id'];
    $grupo_id = (int) $params['grupo_id'];
    $kms_actual = (float) $params['kms'];

    $operacion_id = (int) $db->query("SELECT id FROM operaciones WHERE nombre = 'Sustitución'")->fetchColumn();
    if (!$operacion_id) {
        $operacion_id = 0;
    }

    // Filas en BD
    $rows = [];
    $stmt = $db->prepare("SELECT * FROM mantenimientos WHERE vehiculo_id = ? AND grupo_id = ? AND is_active = 1 AND operacion_id = ?");
    $stmt->execute([$vehiculo_id, $grupo_id, $operacion_id]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Filas de años archivados
    foreach (hist_mantenimientos_por_vehiculo($vehiculo_id) as $m) {
        if ((int) $m['grupo_id'] !== $grupo_id || !(int) $m['is_active'] || (int) $m['operacion_id'] !== $operacion_id) {
            continue;
        }
        $rows[] = $m;
    }

    $fecha_compra = $db->prepare("SELECT fecha_compra FROM vehiculos WHERE id = ?");
    $fecha_compra->execute([$vehiculo_id]);
    $fecha_compra = $fecha_compra->fetchColumn();

    // Particiones por localizacion_id ordenadas por fecha ASC
    $particiones = [];
    foreach ($rows as $m) {
        $particiones[(int) $m['localizacion_id']][] = $m;
    }

    $entity = [];
    foreach ($particiones as $loc => $items) {
        usort($items, function ($a, $b) {
            return strcmp((string) ($a['fecha'] ?? ''), (string) ($b['fecha'] ?? ''));
        });
        $total = count($items);
        foreach ($items as $i => $m) {
            $proximo = $items[$i + 1] ?? null;

            $nom_loc = $db->prepare("SELECT nombre, imagen FROM localizaciones WHERE id = ?");
            $nom_loc->execute([$loc]);
            $loc_data = $nom_loc->fetch(PDO::FETCH_ASSOC);

            $nom_op = $db->prepare("SELECT nombre, imagen FROM operaciones WHERE id = ?");
            $nom_op->execute([$m['operacion_id']]);
            $op_data = $nom_op->fetch(PDO::FETCH_ASSOC);

            $rec_data = ['nombre' => null, 'referencia' => null, 'imagen' => null];
            if ($m['recambio_id']) {
                $nom_rec = $db->prepare("SELECT nombre, referencia, imagen FROM recambios WHERE id = ?");
                $nom_rec->execute([$m['recambio_id']]);
                $rec_data = $nom_rec->fetch(PDO::FETCH_ASSOC) ?: $rec_data;
            }

            if ($proximo) {
                $duracion_kms = (float) $proximo['kms'] - (float) $m['kms'];
                $duracion_tiempo = (int) floor((strtotime(substr($proximo['fecha'], 0, 10)) - strtotime(substr($m['fecha'], 0, 10))) / 86400) . ' días';
            } else {
                $duracion_kms = max(0, $kms_actual - (float) $m['kms']);
                $duracion_tiempo = (int) floor((time() - strtotime(substr($m['fecha'], 0, 10))) / 86400) . ' días';
            }

            if ($fecha_compra) {
                $dias = floor((strtotime(substr($m['fecha'], 0, 10)) - strtotime(substr($fecha_compra, 0, 10))) / 86400);
                $anos = (int) floor($dias / 365);
                $meses = (int) floor(($dias % 365) / 30.44);
                if ($dias < 0) {
                    $edad_vehiculo = '';
                } elseif ($anos === 0) {
                    $edad_vehiculo = $meses . ' meses';
                } else {
                    $edad_vehiculo = $anos . ' años y ' . $meses . ' meses';
                }
            } else {
                $edad_vehiculo = '';
            }

            $entity[] = [
                'id' => $m['id'],
                'fecha' => $m['fecha'],
                'operacion_id' => $m['operacion_id'],
                'localizacion_id' => $loc,
                'operacion_imagen' => $op_data['imagen'] ?? null,
                'operacion_nombre' => $op_data['nombre'] ?? null,
                'recambio_id' => $m['recambio_id'],
                'recambio' => $rec_data['nombre'] ?: 'N/A',
                'recambio_referencia' => $rec_data['referencia'],
                'recambio_imagen' => $rec_data['imagen'],
                'kms' => $m['kms'],
                'precio' => $m['precio'] ?? $m['Precio'] ?? null,
                'unidades' => $m['unidades'] ?? $m['Unidades'] ?? null,
                'observaciones' => (string) ($m['observaciones'] ?? ''),
                'localizacion' => strtoupper((string) ($loc_data['nombre'] ?? 'N/A')),
                'localizacion_imagen' => (string) ($loc_data['imagen'] ?? ''),
                'vehiculo_id' => $vehiculo_id,
                'fila_num' => $i + 1,
                'total_filas' => $total,
                'duracion_kms' => $duracion_kms,
                'duracion_tiempo' => $duracion_tiempo,
                'edad_vehiculo' => $edad_vehiculo,
            ];
        }
    }

    // Orden: localizacion_id ASC, fecha ASC
    usort($entity, function ($a, $b) {
        $c = (int) ($a['localizacion_id'] ?? 0) <=> (int) ($b['localizacion_id'] ?? 0);
        if ($c !== 0) {
            return $c;
        }
        return strcmp((string) ($a['fecha'] ?? ''), (string) ($b['fecha'] ?? ''));
    });
    return $entity;
}
