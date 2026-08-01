<?php
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/archivo.php';
debug_mode();

function adjunto_anio_mantenimiento($mantenimiento_id) {
    $hist = hist_buscar_mantenimiento($mantenimiento_id);
    if ($hist) {
        return (int) $hist[0];
    }
    $db = conectar();
    $stmt = $db->prepare("SELECT fecha FROM mantenimientos WHERE id = ?");
    $stmt->execute([$mantenimiento_id]);
    $fecha = $stmt->fetchColumn();
    return $fecha ? (int) substr($fecha, 0, 4) : null;
}

function createAdjunto($params) {
    $vehiculo_id = $params['vehiculo_id'];
    $mantenimiento_id = $params['mantenimiento_id'];
    $ruta = $params['ruta'];

    $anio = adjunto_anio_mantenimiento($mantenimiento_id);
    if ($anio && hist_anio_archivado($anio)) {
        $id = hist_siguiente_id('adjuntos');
        $row = [
            'id' => $id,
            'vehiculo_id' => (int) $vehiculo_id,
            'mantenimiento_id' => (int) $mantenimiento_id,
            'ruta' => $ruta,
            'created_at' => date('Y-m-d H:i:s'),
            'modified_at' => null,
            'deleted_at' => null,
            'is_active' => 1,
        ];
        $rows = hist_leer_tabla($anio, 'adjuntos');
        $rows[] = $row;
        hist_escribir_tabla($anio, 'adjuntos', $rows);
        return $id;
    }

    global $db;
    if (!isset($db)) {
        $db = conectar();
    }

    $stmt = $db->prepare("
        INSERT INTO adjuntos (
            vehiculo_id,
            mantenimiento_id,
            ruta,
            created_at,
            is_active
        ) VALUES (?, ?, ?, datetime('now'), 1)
    ");

    $stmt->execute([
        $vehiculo_id,
        $mantenimiento_id,
        $ruta
    ]);

    return $db->lastInsertId();
}

function createRecambioImage($params) {
    global $db;
    if (!isset($db)) {
        $db = conectar();
    }

    $imagen = $params['imagen'];
    $recambio_id = $params['recambio_id'];

    $stmt = $db->prepare("
        UPDATE  recambios
        SET imagen = ?
        where id= ?
    ");

    $stmt->execute([
        $imagen,
        $recambio_id
    ]);

    return $db->lastInsertId();
}