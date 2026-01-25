<?php
require_once __DIR__ . '/../helpers/helper.php';
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
    return $entity;
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
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}


function nueva_compra_recambio($params)
{
    $db = conectar();
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
    $stmt->execute([$params['fecha'], $params['recambio_id'], $params['precio'], $params['unidades'], $params['proveedor'], $params['observaciones']]);
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
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}






