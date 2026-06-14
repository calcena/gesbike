<?php
require_once __DIR__ . '/../repositories/vehiculo.php';

function getVehiculos($params) {
    global $db;
    return get_vehiculos_by_user_repo($params);
}

function getVehiculoById($params) {
    global $db;
    return get_vehiculo_by_id_repo($params);
}

function crearVehiculo($params) {
    global $db;
    $id = nuevo_vehiculo_repo($params);
    return ['success' => true, 'id' => (int) $id];
}

function editarVehiculo($params) {
    global $db;
    $rows = update_vehiculo_repo($params);
    return ['success' => true, 'rows' => $rows];
}

function eliminarVehiculo($params) {
    global $db;
    $rows = eliminar_vehiculo_by_id_repo($params);
    return ['success' => true, 'rows' => $rows];
}

function getMotorVehiculo($params) {
    global $db;
    return motor_vehiculo($params);
}

function getAllMotores($params) {
    global $db;
    return get_all_motores_by_vehiculo($params);
}

function bajaMotor($params) {
    global $db;
    return baja_motor_vehiculo($params);
}

function nuevoMotor($params) {
    global $db;
    return nuevo_motor_vehiculo($params);
}
