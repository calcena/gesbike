<?php
require_once __DIR__ . '/../repositories/ruta.php';

function create_ruta_gpx($params) {
    global $db;
    $entity = create_ruta_file($params);
    return $entity;
}

function get_rutas_vehiculo($params) {
    global $db;
    $entity = get_rutas_by_vehiculo($params);
    return $entity;
}

function get_ruta_id($params) {
    global $db;
    $entity = get_rutas_by_id($params);
    return $entity;
}

function crear_ruta_manual($params) {
    global $db;
    $entity = add_ruta_manual($params);
    return $entity;
}

function actualizar_ruta_manual($params) {
    global $db;
    $entity = update_ruta_manual($params);
    return $entity;
}

function eliminar_ruta_manual($params) {
    $entity = eliminar_ruta($params);
    return $entity;
}

function get_resumem_usuario($params) {
    global $db;
    $entity = resumem_usuario($params);
    return $entity;
}

function get_velocidades_mensuales($params) {
    global $db;
    $entity = get_velocidades_by_month($params);
    return $entity;
}

function get_rutas_chart($params) {
    global $db;
    return get_rutas_chart_data($params);
}










