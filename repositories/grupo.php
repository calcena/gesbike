<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function get_grupos_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT
            g.*
        FROM grupos g
        WHERE g.is_active = 1
        ORDER BY g.nombre ASC
    ");
    $stmt->execute();
    $entity = $stmt->fetchAll(PDO::FETCH_ASSOC);
    return $entity;
}

function get_grupo_by_id_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        SELECT
            g.*
        FROM grupos g
        WHERE g.id = ? AND g.is_active = 1
    ");
    $stmt->execute([$params['id']]);
    $entity = $stmt->fetch(PDO::FETCH_ASSOC);
    return $entity;
}

function nuevo_grupo_repo($params)
{
    $db = conectar();
    $now = date('Y-m-d H:i:s');
    $stmt = $db->prepare("
        INSERT INTO grupos (nombre, imagen, agrupador_id, trazabilidad, vista_resumen, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
    ");
    $stmt->execute([
        $params['nombre'],
        $params['imagen'],
        $params['agrupador_id'] ?? 0,
        $params['trazabilidad'] ?? 0,
        $params['vista_resumen'] ?? 0,
        $now
    ]);
    return $db->lastInsertId();
}

function update_grupo_repo($params)
{
    $db = conectar();
    $now = date('Y-m-d H:i:s');
    $stmt = $db->prepare("
        UPDATE grupos
        SET nombre = ?,
            imagen = ?,
            agrupador_id = ?,
            trazabilidad = ?,
            vista_resumen = ?,
            modified_at = ?
        WHERE id = ? AND is_active = 1
    ");
    $stmt->execute([
        $params['nombre'],
        $params['imagen'],
        $params['agrupador_id'] ?? 0,
        $params['trazabilidad'] ?? 0,
        $params['vista_resumen'] ?? 0,
        $now,
        $params['id']
    ]);
    return $stmt->rowCount();
}

function eliminar_grupo_repo($params)
{
    $db = conectar();
    $stmt = $db->prepare("
        UPDATE grupos
        SET is_active = 0, deleted_at = ?
        WHERE id = ? AND is_active = 1
    ");
    $stmt->execute([date('Y-m-d H:i:s'), $params['id']]);
    return $stmt->rowCount();
}
