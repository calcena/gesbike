<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_recambio($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                SELECT * FROM (
                                SELECT
                                    r.*,
                                    (
                                    COALESCE((SELECT SUM(unidades) FROM compras WHERE recambio_id = r.id AND is_active = 1), 0)
                                    -
                                    COALESCE((SELECT SUM(unidades) FROM mantenimientos WHERE recambio_id = r.id AND is_active = 1), 0)
                                    ) AS stock
                                FROM
                                    recambios r
                                WHERE
                                    r.grupo_id = ?
                                    AND r.vehiculo_id = ?
                                    AND r.is_active = 1
                                ) AS tabla_stock
                                WHERE stock > 0;
                                 ");
    $stmt->execute([$params['grupo_id'], $params['vehiculo_id']]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}


function get_list_recambios($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $incluye_zeros = $params['incluye_zeros'];
    if ($incluye_zeros) {
        $stmt = $db->prepare("
                                select
                                 r.*,
                                ((select coalesce(sum(unidades),0) from compras where recambio_id = r.id AND is_active = 1) - (select coalesce(sum(unidades),0) from mantenimientos where recambio_id = r.id AND is_active = 1)) as stock,
								(select imagen from grupos where id = r.grupo_id) as img_grupo
                                FROM
                                recambios r
                                where  r.vehiculo_id = ?
                                and is_active = 1
                                 ");
    } else {
        $stmt = $db->prepare("
                                select
                                 r.*,
                                ((select coalesce(sum(unidades),0) from compras where recambio_id = r.id AND r.is_active = 1) - (select coalesce(sum(unidades),0) from mantenimientos where recambio_id = r.id AND r.is_active = 1)) as stock,
								(select imagen from grupos where id = r.grupo_id) as img_grupo
                                 FROM
                                 recambios r
                                 where  r.vehiculo_id = ?
                                 and stock > 0
                                 and is_active = 1
                                 ");
    }

    $stmt->execute([$vehiculo_id]);
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function set_kilometros_by_vehiculo($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $kms = $params['kms'];
    $sql = "
        INSERT INTO ultimos_kms (vehiculo_id, kms)
        VALUES (:vehiculo_id, :kms)
        ON CONFLICT(vehiculo_id)
        DO UPDATE SET
            kms = excluded.kms
    ";
    $stmt = $db->prepare($sql);
    $stmt->bindParam(':vehiculo_id', $vehiculo_id, PDO::PARAM_INT);
    $stmt->bindParam(':kms', $kms, PDO::PARAM_INT);
    $stmt->execute();
    return [
        'rows_affected' => $stmt->rowCount()
    ];
}


function nuevo_recambio($params)
{
    $db = conectar();
    $fecha = (string) $params["fecha"];
    $vehiculo_id = (int) $params['vehiculo_id'];
    $imagen = (string) $params['imagen'] ?? null;
    $grupo_id = (int) $params['grupo_id'];
    $referencia = (string) $params['referencia'];
    $nombre = (string) $params['nombre'];
    $observaciones = (string) $params['observaciones'] ?? null;

    $sql = "
        INSERT INTO recambios (created_at, imagen, grupo_id, referencia, nombre, observaciones, vehiculo_id, is_active)
        values
        (?,?,?,?,?,?,?, true)
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute([$fecha, $imagen, $grupo_id, $referencia, $nombre, $observaciones, $vehiculo_id]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}


function recambio_by_id($params)
{
    $db = conectar();
    $stmt = $db->prepare("
                                select
                                *
                                FROM
                                recambios r
                                where r.id = ?
                                and is_active = true
                                ");
    $stmt->execute([$params["recambio_id"]]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}


function update_recambio($params)
{
    $db = conectar();
    $sql = "
        update recambios
        set modified_at =?,
        imagen = ?,
        grupo_id = ?,
        referencia = ?,
        nombre = ?,
        observaciones = ?,
        vehiculo_id = ?
        where id = ?
    ";
    $stmt = $db->prepare($sql);
    $stmt->execute([$params["fecha"], $params['imagen'], $params['grupo_id'], $params['referencia'], $params['nombre'], $params['observaciones'], $params['vehiculo_id'], $params['recambio_id']]);
    $entity = $stmt->rowCount();
    return $entity;
}

function eliminar_recambio_by_id($params)
{
    $db = conectar();
    try {
        $db->beginTransaction();
        $sql1 = "UPDATE recambios SET is_active = 0, deleted_at = ? WHERE id = ?";
        $stmt1 = $db->prepare($sql1);
        $stmt1->execute([$params['fecha'], $params["recambio_id"]]);
        $sql2 = "UPDATE compras SET is_active = 0 , deleted_at= ? WHERE recambio_id = ?";
        $stmt2 = $db->prepare($sql2);
        $stmt2->execute([$params['fecha'], $params["recambio_id"]]);
        $db->commit();
        return [
            "success" => true,
            "cambios" => $stmt1->rowCount() + $stmt2->rowCount()
        ];
    } catch (Exception $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        return [
            "success" => false,
            "message" => "Error en SQLite: " . $e->getMessage()
        ];
    }
}







