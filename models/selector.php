<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();
require_once __DIR__ . '/../repositories/selector.php';

function getVehiculosByUser($params)
{
    global $db;
    $entity = get_vehiculos_by_user($params);
    return $entity;
}

function getOperaciones($params)
{
    global $db;
    $entity = get_operaciones($params);
    return $entity;
}

function getGrupos($params)
{
    global $db;
    $entity = get_grupos($params);
    return $entity;
}

function getLocalizaciones($params)
{
    global $db;
    $entity = get_localizaciones($params);
    return $entity;
}

function getRecambios($params)
{
    global $db;
    $entity = get_recambios($params);
    return $entity;
}

