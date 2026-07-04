<?php
require_once __DIR__ . '/../helpers/fit_parser.php';

$parser = new FitParser();
$result = $parser->parse(__DIR__ . '/Zepp20260702185857.fit');

echo "Records: " . count($result['track_points']) . "\n";
echo "Pulsaciones: " . count($result['pulsaciones']) . "\n\n";

echo "First 3 track points:\n";
foreach (array_slice($result['track_points'], 0, 3) as $i => $tp) {
    echo "  #$i: " . json_encode($tp) . "\n";
}

echo "\nFirst 3 pulsaciones:\n";
foreach (array_slice($result['pulsaciones'], 0, 3) as $i => $p) {
    echo "  #$i: " . json_encode($p) . "\n";
}

echo "\nSample track point with HR (from record #100+):\n";
foreach (array_slice($result['track_points'], 95, 10) as $tp) {
    if (isset($tp['hr']) && $tp['hr'] !== null && $tp['hr'] > 80) {
        echo "  " . json_encode($tp) . "\n";
        break;
    }
}

echo "\nSummary:\n";
echo "  fecha_inicio: {$result['fecha_inicio']}\n";
echo "  fecha_fin: {$result['fecha_fin']}\n";
echo "  kms: {$result['kms']}\n";
echo "  tiempo_total: {$result['tiempo_total']}\n";
echo "  velocidad_media: {$result['velocidad_media']}\n";
echo "  velocidad_maxima: {$result['velocidad_maxima']}\n";
echo "  metros_ascenso: {$result['metros_ascenso']}\n";
echo "  metros_descenso: {$result['metros_descenso']}\n";
echo "  altitud_maxima: {$result['altitud_maxima']}\n";
echo "  frecuencia_cardiaca_promedio: {$result['frecuencia_cardiaca_promedio']}\n";
echo "  frecuencia_cardiaca_maxima: {$result['frecuencia_cardiaca_maxima']}\n";
echo "  calorias: {$result['calorias']}\n";
echo "  potencia_promedio_w: {$result['potencia_promedio_w']}\n";
