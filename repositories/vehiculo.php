<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_vehiculos_by_user_repo($params)
{
    $db = conectar();
    $usuario_id = $params['usuario_id'];
    $stmt = $db->prepare("
        SELECT
            v.*,
            COALESCE(uk.kms, v.kms_inicio) AS kms_actuales
        FROM vehiculos v
        LEFT JOIN ultimos_kms uk ON uk.vehiculo_id = v.id
        WHERE v.usuario_id = ?
        ORDER BY v.is_active DESC, v.fecha_compra DESC
    ");
    $stmt->execute([$usuario_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function get_vehiculo_by_id_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT *
        FROM vehiculos
        WHERE id = ?
    ");
    $stmt->execute([$params['vehiculo_id']]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}

function nuevo_vehiculo_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        INSERT INTO vehiculos (
            fecha_compra, anagrama, nombre, kms_inicio, imagen,
            observaciones, puntero, categoria, usuario_id,
            is_active, created_at
        ) VALUES (
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?,
            1, datetime('now')
        )
    ");
    $stmt->execute([
        $params['fecha_compra'],
        $params['anagrama'],
        $params['nombre'],
        $params['kms_inicio'],
        $params['imagen'] ?? '',
        $params['observaciones'] ?? '',
        $params['puntero'] ?? '',
        $params['categoria'] ?? '',
        $params['usuario_id']
    ]);
    return $db->lastInsertId();
}

function update_vehiculo_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        UPDATE vehiculos SET
            fecha_compra = ?,
            anagrama = ?,
            nombre = ?,
            kms_inicio = ?,
            imagen = ?,
            observaciones = ?,
            puntero = ?,
            categoria = ?,
            modified_at = datetime('now')
        WHERE id = ?
    ");
    $stmt->execute([
        $params['fecha_compra'],
        $params['anagrama'],
        $params['nombre'],
        $params['kms_inicio'],
        $params['imagen'],
        $params['observaciones'] ?? '',
        $params['puntero'] ?? '',
        $params['categoria'] ?? '',
        $params['vehiculo_id']
    ]);
    return $stmt->rowCount();
}

function eliminar_vehiculo_by_id_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        UPDATE vehiculos SET
            is_active = 0,
            deleted_at = datetime('now')
        WHERE id = ?
    ");
    $stmt->execute([$params['vehiculo_id']]);
    return $stmt->rowCount();
}

function motor_vehiculo($params)
{
    global $db;
    $db = conectar();
    $vehiculo_id = $params['vehiculo_id'];
    $stmt = $db->prepare("
        SELECT
            coalesce(id, 0) as motor_id,
            count(id)
        FROM motores
        WHERE vehiculo_id = ?
            AND is_active = 1
        LIMIT 1
    ");
    $stmt->execute([$vehiculo_id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}
