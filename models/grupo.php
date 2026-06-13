<?php
require_once __DIR__ . '/../repositories/grupo.php';

function getGrupos($params)
{
    global $db;
    return get_grupos_repo($params);
}

function getGrupoById($params)
{
    global $db;
    return get_grupo_by_id_repo($params);
}

function nuevoGrupo($params)
{
    global $db;
    return nuevo_grupo_repo($params);
}

function editarGrupo($params)
{
    global $db;
    return update_grupo_repo($params);
}

function eliminarGrupo($params)
{
    global $db;
    return eliminar_grupo_repo($params);
}
