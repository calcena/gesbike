<?php
require_once __DIR__ . '/../repositories/recambio.php';

function getRecambio($params) {
    global $db;
    $entity = get_recambio($params);
    return $entity;
}

function getListAllRecambios($params) {
    global $db;
    $entity = get_list_recambios($params);
    return $entity;
}

function crear_nuevo_recambio($params) {
    global $db;
    $entity = nuevo_recambio($params);
    return $entity;
}

function get_recambio_by_id($params) {
    global $db;
    $entity = recambio_by_id($params);
    return $entity;
}

function editar_recambio($params) {
    global $db;
    $entity = update_recambio($params);
    return $entity;
}

function eliminar_recambio($params) {
    global $db;
    $entity = eliminar_recambio_by_id($params);
    return $entity;
}









