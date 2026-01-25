<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
function stock($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    if ($vehiculo_id == '0') {
        $stmt = $db->prepare("
                                    select
                                    (select puntero from vehiculos where id = r.vehiculo_id) as bullet_vehiculo,
                                    (select imagen from grupos where id= r.grupo_id) as grupo_imagen,
                                    coalesce(r.imagen, 'camara.png') as recambio_imagen,
                                    r.referencia,
                                    coalesce(r.observaciones,'') as observaciones,
                                    ((select coalesce(sum(unidades),0) from compras where recambio_id = r.id AND is_active = 1) - (select coalesce(sum(m.unidades),0) from mantenimientos as m where m.vehiculo_id=r.vehiculo_id and m.recambio_id = r.id AND is_active = 1))as unidades
                                    FROM
                                    recambios r
                                    where r.is_active = 1
                                    and unidades > 0;
                                    ");
        $stmt->execute();
    } else {
        $stmt = $db->prepare("
                                    select
                                    (select puntero from vehiculos where id = r.vehiculo_id) as bullet_vehiculo,
                                    (select imagen from grupos where id= r.grupo_id) as grupo_imagen,
                                    coalesce(r.imagen, 'camara.png') as recambio_imagen,
                                    r.referencia,
                                    coalesce(r.observaciones,'') as observaciones,
                                     ((select coalesce(sum(unidades),0) from compras where recambio_id = r.id AND is_active = 1) - (select coalesce(sum(m.unidades),0) from mantenimientos as m where m.vehiculo_id=r.vehiculo_id and m.recambio_id = r.id AND is_active = 1))as unidades
                                    FROM
                                    recambios r
                                    where r.vehiculo_id= ?
                                    and r.is_active = 1
                                    AND unidades > 0;
                                     ");
        $stmt->execute([$vehiculo_id]);

    }
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}




