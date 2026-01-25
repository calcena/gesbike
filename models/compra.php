<?php
require_once __DIR__ . '/../repositories/compra.php';

function get_list_all_compras($params)
{
    global $db;
    $entity = list_all_compras($params);
    return $entity;
}

function get_compra_by_id($params)
{
    global $db;
    $entity = compra_by_id($params);
    return $entity;
}

function nueva_compra($params)
{
    global $db;
    $entity = nueva_compra_recambio($params);
    return $entity;
}

function update_compra_by_id($params)
{
    global $db;
    $entity = update_compra_repository($params);
    return $entity;
}

function borrar_compra($params)
{
    global $db;
    $entity = borrar_compra_by_id($params);
    return $entity;
}
















