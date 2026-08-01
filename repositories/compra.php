<?php
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/archivo.php';
debug_mode();

function list_all_compras($params)
{
    $db = conectar();
    $recambio_id = $params['recambio_id'];
    $stmt = $db->prepare("
                                select
                                *
                                 FROM
                                 compras c
                                 where c.recambio_id = ?
                                 and is_active = 1
                                 order by fecha desc
                                 ");
    $stmt->execute([$recambio_id]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Añadir compras de años archivados
    $entity = array_merge($entity, hist_compras_por_recambio($recambio_id));
    foreach ($entity as $i => $row) {
        unset($entity[$i]['_anio']);
    }
    usort($entity, function ($a, $b) {
        return strcmp((string) ($b['fecha'] ?? ''), (string) ($a['fecha'] ?? ''));
    });
    return $entity;
}

function compra_by_id($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                select
                                *
                                FROM
                                compras c
                                where id= ?
                                ");
    $stmt->execute([$params['compra_id']]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($entity) {
        return $entity;
    }

    $found = hist_buscar_compra($params['compra_id']);
    if ($found) {
        [, $c] = $found;
        unset($c['_anio']);
        return $c;
    }
    return false;
}

function update_compra_repository($params)
{
    global $db;
    $db = conectar();
    $stmt = $db->prepare("
                                update compras
                                set fecha= ?,
                                precio = ?,
                                unidades = ?,
                                proveedor = ?,
                                observaciones = ?,
                                modified_at = CURRENT_TIMESTAMP
                                where id= ?
                                ");
    $stmt->execute([$params['fecha'], $params['precio'], $params['unidades'], $params['proveedor'], $params['observaciones'], $params['compra_id']]);
    if ($stmt->rowCount() > 0) {
        return compra_by_id($params);
    }

    // Compra archivada en hist/ → write-through
    $found = hist_buscar_compra($params['compra_id']);
    if ($found) {
        [$anio] = $found;
        hist_reescribir_registro($anio, 'compras', $params['compra_id'], [
            'fecha' => $params['fecha'],
            'precio' => $params['precio'],
            'unidades' => $params['unidades'],
            'proveedor' => $params['proveedor'],
            'observaciones' => $params['observaciones'],
            'modified_at' => date('Y-m-d H:i:s'),
        ]);
        return compra_by_id($params);
    }
    return false;
}


function nueva_compra_recambio($params)
{
    $db = conectar();
    $fecha = $params['fecha'];

    // Fecha en año archivado → write-through a hist/
    $anio = substr($fecha, 0, 4);
    if (hist_anio_archivado($anio)) {
        $id = hist_siguiente_id('compras');
        $row = [
            'id' => $id,
            'fecha' => $fecha,
            'recambio_id' => $params['recambio_id'],
            'precio' => $params['precio'],
            'unidades' => $params['unidades'],
            'proveedor' => $params['proveedor'],
            'observaciones' => $params['observaciones'],
            'created_at' => date('Y-m-d H:i:s'),
            'is_active' => 1,
        ];
        $rows = hist_leer_tabla($anio, 'compras');
        $rows[] = $row;
        hist_escribir_tabla($anio, 'compras', $rows);
        return $row;
    }

    $stmt = $db->prepare("
                                insert into compras (
                                fecha,
                                recambio_id,
                                precio,
                                unidades,
                                proveedor,
                                observaciones,
                                created_at,
                                is_active
                                )
                                values
                                (?,?,?,?,?,?, CURRENT_TIMESTAMP, 1)
                                ");
    $stmt->execute([$fecha, $params['recambio_id'], $params['precio'], $params['unidades'], $params['proveedor'], $params['observaciones']]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}


function borrar_compra_by_id($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                update compras
                                set is_active= 0,
                                deleted_at = CURRENT_TIMESTAMP
                                where id= ?
                                ");
    $stmt->execute([$params['compra_id']]);
    if ($stmt->rowCount() > 0) {
        return compra_by_id($params);
    }

    // Compra archivada en hist/ → write-through
    $found = hist_buscar_compra($params['compra_id']);
    if ($found) {
        [$anio] = $found;
        hist_reescribir_registro($anio, 'compras', $params['compra_id'], [
            'is_active' => 0,
            'deleted_at' => date('Y-m-d H:i:s'),
        ]);
        return compra_by_id($params);
    }
    return false;
}






