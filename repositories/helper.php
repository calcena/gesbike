<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_kilometros_by_vehiculo($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $stmt = $db->prepare("select
                                 kms
                                 FROM
                                 ultimos_kms lk
                                 where lk.vehiculo_id = ?
                                 ");
    $stmt->execute([$vehiculo_id]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
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
