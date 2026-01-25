<?php
require_once __DIR__ . '/../repositories/mantenimiento.php';

function getListMantenimiento($params)
{
    global $db;
    $entity = get_list_mantenimientos($params);
    return $entity;
}

function create_mantenimiento($params)
{
    global $db;
    $entity = create_new_mantenimiento($params);
    return $entity;
}

function get_list_attachments($params)
{
    global $db;
    $entity = get_adjuntos($params);
    return $entity;
}

function get_delete_attachments($params)
{
    global $db;
    $entity = delete_attachment($params);
    return $entity;
}

function get_mantenimiento_by_id($params)
{
    global $db;
    $entity = mantenimiento_by_id($params);
    return $entity;
}

function delete_mantenimiento($params)
{
    global $db;
    $entity = delete_mantenimiento_by_id($params);
    foreach ($entity as $item) {
        $file_path_name = "../../attachments/" . $item['ruta'];
        if (file_exists($file_path_name)) {
            unlink($file_path_name);
        }
    }
    return $entity;
}

function edit_mantenimiento($params)
{
    global $db;
    $entity = edit_mantenimiento_by_id($params);
    return $entity;
}

function get_kms_by_grupo($params)
{
    global $db;
    $entity = kms_by_grupo($params);
    return $entity;
}

function get_historico($params)
{
    global $db;
    $entity = historico_mantenimientos_by_grupo($params);
    return $entity;
}














