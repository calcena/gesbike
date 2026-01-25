<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_vehiculos_by_user($params)
{
    $db = conectar();
    $stmt = $db->prepare("select
                                 *
                                 FROM
                                 vehiculos v
                                 where usuario_id = ?
                                 order by fecha_compra DESC
                                 ");
    $stmt->execute([$params['usuario_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function get_operaciones($params)
{
    global $db;
    $db = conectar();
    $stmt = $db->prepare("select
                                 *
                                 FROM
                                 operaciones o
                                 ");
    $stmt->execute([]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function get_grupos($params)
{
    global $db;
    $db = conectar();
    $stmt = $db->prepare("select
                                 *
                                 FROM
                                 grupos g
                                 ");
    $stmt->execute([]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function get_localizaciones($params)
{
    global $db;
    $db = conectar();
    $agrupador_id = $params['agrupador_id'];
    $stmt = $db->prepare("select
                                 *
                                 FROM
                                 localizaciones l
                                 where agrupador = ?
                                 ");
    $stmt->execute([$agrupador_id]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function get_recambios($params)
{
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $incluye_zeros = $params['incluye_zeros'];
    $sql = "
            select
            *,
            coalesce((select sum(unidades) from compras where recambio_id = r.id) - (select sum(unidades) from mantenimientos where recambio_id = r.id),0) as stock
            FROM
            recambios r
            where r.vehiculo_id = ?
            ";

    if (!$incluye_zeros) {
        $sql .= " and stock > 0";

    }
    $stmt = $db->prepare($sql);
    $stmt->execute([$vehiculo_id,]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}







