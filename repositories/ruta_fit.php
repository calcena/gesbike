<?php
require_once __DIR__ . '/../helpers/helper.php';
debug_mode();

function create_pulsaciones_repo($ruta_id, $pulsaciones)
{
    $db = conectar();
    $db->beginTransaction();
    try {
        $del = $db->prepare("DELETE FROM ruta_pulsacion WHERE ruta_id = ?");
        $del->execute([$ruta_id]);

        $ins = $db->prepare("INSERT INTO ruta_pulsacion (ruta_id, kilometro, lat, lon, pulsaciones, cadencia, potencia, temperatura, altitud, velocidad, timestamp_fit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        foreach ($pulsaciones as $p) {
            $ins->execute([
                $ruta_id,
                $p['kilometro'] ?? null,
                $p['lat'] ?? null,
                $p['lon'] ?? null,
                $p['pulsaciones'] ?? null,
                $p['cadencia'] ?? null,
                $p['potencia'] ?? null,
                $p['temperatura'] ?? null,
                $p['altitud'] ?? null,
                $p['velocidad'] ?? null,
                $p['timestamp_fit'] ?? null
            ]);
        }
        $db->commit();
        return count($pulsaciones);
    } catch (Exception $e) {
        $db->rollBack();
        throw $e;
    }
}

function get_pulsaciones_repo($ruta_id)
{
    $db = conectar();
    $stmt = $db->prepare("SELECT id, ruta_id, kilometro, lat, lon, pulsaciones, cadencia, potencia, temperatura, altitud, velocidad, timestamp_fit, created_at FROM ruta_pulsacion WHERE ruta_id = ? ORDER BY kilometro ASC");
    $stmt->execute([$ruta_id]);
    return $stmt->fetchAll(PDO::FETCH_ASSOC);
}

function get_pulsaciones_summary_repo($ruta_id)
{
    $db = conectar();
    $stmt = $db->prepare("SELECT MIN(pulsaciones) as min_hr, MAX(pulsaciones) as max_hr, ROUND(AVG(pulsaciones), 0) as avg_hr, COUNT(*) as total_samples FROM ruta_pulsacion WHERE ruta_id = ? AND pulsaciones IS NOT NULL");
    $stmt->execute([$ruta_id]);
    return $stmt->fetch(PDO::FETCH_ASSOC);
}
