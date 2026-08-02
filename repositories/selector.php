<?php
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/archivo.php';
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
    $stmt = $db->prepare("
            select
            *,
            coalesce((select sum(unidades) from compras where recambio_id = r.id),0) - coalesce((select sum(unidades) from mantenimientos where recambio_id = r.id),0) as stock
            FROM
            recambios r
            where r.vehiculo_id = ?
            ");
    $stmt->execute([$vehiculo_id,]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Añadir stock de años archivados (hist/) y aplicar filtro de stock
    [$histCompras, $histMant] = hist_stock_por_recambio();
    $out = [];
    foreach ($entity as $r) {
        $rid = (int) $r['id'];
        $r['stock'] = (int) $r['stock'] + ($histCompras[$rid] ?? 0) - ($histMant[$rid] ?? 0);
        if (!$incluye_zeros && (int) $r['stock'] <= 0) {
            continue;
        }
        $out[] = $r;
    }
    return $out;
}







