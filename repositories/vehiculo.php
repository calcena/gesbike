<?php

function motor_vehiculo($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $stmt = $db->prepare("
                                select
                                coalesce(id, 0) as motor_id,
                                count(id)
                                from motores
                                where vehiculo_id = ?
                                and is_active = 1
                                LIMIT 1
                                 ");
    $stmt->execute([ $vehiculo_id]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}






