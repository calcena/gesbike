<?php
require_once __DIR__ . '/../helpers/helper.php';
require_once __DIR__ . '/../helpers/archivo.php';
debug_mode();

function create_pulsaciones_repo($ruta_id, $pulsaciones)
{
    // Ruta archivada en hist/ → write-through
    $found = hist_buscar_ruta($ruta_id);
    if ($found) {
        [$anio] = $found;
        $rows = [];
        foreach ($pulsaciones as $p) {
            $rows[] = [
                'ruta_id' => (int) $ruta_id,
                'kilometro' => $p['kilometro'] ?? null,
                'lat' => $p['lat'] ?? null,
                'lon' => $p['lon'] ?? null,
                'pulsaciones' => $p['pulsaciones'] ?? null,
                'cadencia' => $p['cadencia'] ?? null,
                'potencia' => $p['potencia'] ?? null,
                'temperatura' => $p['temperatura'] ?? null,
                'altitud' => $p['altitud'] ?? null,
                'velocidad' => $p['velocidad'] ?? null,
                'timestamp_fit' => $p['timestamp_fit'] ?? null,
            ];
        }
        hist_escribir_payload_array($anio, 'pulso', $ruta_id, $rows);
        hist_reescribir_registro($anio, 'rutas', $ruta_id, ['has_pulso' => 1]);
        return count($pulsaciones);
    }

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
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    if (!empty($rows)) {
        return $rows;
    }

    $found = hist_buscar_ruta($ruta_id);
    if ($found) {
        [$anio] = $found;
        $rows = hist_leer_payload_array($anio, 'pulso', $ruta_id) ?: [];
        usort($rows, function ($a, $b) {
            return (float) ($a['kilometro'] ?? 0) <=> (float) ($b['kilometro'] ?? 0);
        });
        return $rows;
    }
    return [];
}

function get_pulsaciones_summary_repo($ruta_id)
{
    $db = conectar();
    $stmt = $db->prepare("SELECT MIN(pulsaciones) as min_hr, MAX(pulsaciones) as max_hr, ROUND(AVG(pulsaciones), 0) as avg_hr, COUNT(*) as total_samples FROM ruta_pulsacion WHERE ruta_id = ? AND pulsaciones IS NOT NULL");
    $stmt->execute([$ruta_id]);
    $summary = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($summary && $summary['total_samples'] > 0) {
        return $summary;
    }

    $found = hist_buscar_ruta($ruta_id);
    if ($found) {
        [$anio] = $found;
        $rows = hist_leer_payload_array($anio, 'pulso', $ruta_id) ?: [];
        $valores = [];
        foreach ($rows as $p) {
            if ($p['pulsaciones'] !== null) {
                $valores[] = (int) $p['pulsaciones'];
            }
        }
        if (!empty($valores)) {
            return [
                'min_hr' => min($valores),
                'max_hr' => max($valores),
                'avg_hr' => round(array_sum($valores) / count($valores)),
                'total_samples' => count($valores),
            ];
        }
    }
    return $summary ?: ['min_hr' => null, 'max_hr' => null, 'avg_hr' => null, 'total_samples' => 0];
}
