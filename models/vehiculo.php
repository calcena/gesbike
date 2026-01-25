<?php
require_once __DIR__ . '/../repositories/vehiculo.php';


function getMotorVehiculo($params) {
    global $db;
    $entity = motor_vehiculo($params);
    return $entity;
}



