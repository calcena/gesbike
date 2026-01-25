<?php

function insert_log($log_data)
{
    global $db;
    $usuario = (int) $log_data['usuario'];
    $animal = $log_data['animal'] ?? null;
    $modulo = $log_data['modulo'] ?? null;
    $accion = $log_data['accion'] ?? null;
    $mensaje = $log_data['mensaje'] ?? null;
    $stmt = $db->prepare("
        INSERT INTO log (idusuario, id_animal, php, tipo, observaciones)
        VALUES (?, ?, ?, ?, ?)
    ");

    if (!$stmt) {
        throw new Exception("Error en la preparación de la consulta: " . $db->error);
    }

    $stmt->bind_param("issss", $usuario, $animal, $modulo, $accion, $mensaje);

    if (!$stmt->execute()) {
        throw new Exception("Error al insertar log: " . $stmt->error);
    }

    return $db->insert_id;
}