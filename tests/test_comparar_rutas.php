<?php
// Test del algoritmo de comparación de tramos.
// Uso: php tests/test_comparar_rutas.php [archivoA.gpx archivoB.gpx]
require_once __DIR__ . '/../helpers/analisis_rutas.php';

function gpx_a_track($file) {
    $xml = simplexml_load_file($file);
    if ($xml === false) throw new Exception("GPX no válido: $file");
    $out = [];
    foreach ($xml->xpath('//*[local-name()="trkpt"]') as $pt) {
        $time = $pt->xpath('./*[local-name()="time"]');
        $out[] = [
            'lat' => (float)$pt['lat'],
            'lon' => (float)$pt['lon'],
            'time' => $time ? (string)$time[0] : null,
        ];
    }
    return $out;
}

$fails = 0;
function check($cond, $label) {
    global $fails;
    echo ($cond ? "OK   " : "FALLO") . " - $label\n";
    if (!$cond) $fails++;
}

// ---- Caso 1: subtramo perfecto (mismo recorrido grabado dos veces) ----
$a = gpx_a_track(__DIR__ . '/Bicicleta_1.gpx');
$b = gpx_a_track(__DIR__ . '/Bicicleta.gpx');
$res = comp_analizar_tramos($a, $b);
$r = $res['resumen'];
check(count($res['tramos']) === 1, "subtramo perfecto: 1 tramo (hay " . count($res['tramos']) . ")");
if (count($res['tramos']) === 1) {
    $t = $res['tramos'][0];
    check(abs($t['dist_km'] - 1.31) < 0.05, "dist_km ~ 1.31 ({$t['dist_km']})");
    check($t['t_a_s'] === $t['t_b_s'], "t_a == t_b (mismo track): {$t['t_a_s']}s vs {$t['t_b_s']}s");
    check($t['delta_s'] === 0, "delta = 0s ({$t['delta_s']}s)");
    check(abs($t['vel_a'] - $t['vel_b']) < 0.1, "velocidades iguales: {$t['vel_a']} vs {$t['vel_b']} km/h");
}
check($r['cobertura_a_pct'] > 95, "cobertura sobre A ~100% ({$r['cobertura_a_pct']}%)");
check($r['cobertura_b_pct'] < 15, "cobertura sobre B parcial ({$r['cobertura_b_pct']}%)");

// ---- Caso 2: solapamiento parcial con desfase de salida ----
$a2 = gpx_a_track(__DIR__ . '/Bicicleta_2.gpx');
$res2 = comp_analizar_tramos($a2, $b);
$r2 = $res2['resumen'];
check(count($res2['tramos']) >= 1, "solapamiento parcial: >=1 tramo (hay " . count($res2['tramos']) . ")");
check($r2['cobertura_a_pct'] > 90, "cobertura A alta ({$r2['cobertura_a_pct']}%)");
check($r2['total_coincidente_km'] > 15, "km coincidentes > 15 ({$r2['total_coincidente_km']})");

// ---- Caso 3: rutas que solo se cruzan puntualmente (cruce < tramo minimo) ----
// Bicicleta_1 vs Bicicleta_2 comparten ~125 m en un cruce: con umbral por
// defecto (200 m) no debe haber tramos.
$res3 = comp_analizar_tramos($a, $a2);
check(count($res3['tramos']) === 0, "cruce puntual: 0 tramos con umbral 200 m (hay " . count($res3['tramos']) . ")");

// ---- Caso 4 sintetico: mismo track, velocidad distinta, delta exacta ----
$a2s = [];
for ($i = 0; $i < 400; $i++) {
    $a2s[] = ['lat' => 41.5 + $i * 0.0001, 'lon' => 2.3 + $i * 0.0001, 'time' => date('c', 1700000000 + $i * 10)];
}
$b2s = [];
for ($i = 0; $i < 400; $i++) {
    $b2s[] = ['lat' => 41.5 + $i * 0.0001, 'lon' => 2.3 + $i * 0.0001, 'time' => date('c', 1700000000 + $i * 12)];
}
$r4 = comp_analizar_tramos($a2s, $b2s);
$delta = $r4['resumen']['delta_total_s'];
$esperado = 400 * 12 - 399 * 10; // 796 s
check(abs($delta - $esperado) <= 30, "sintetico: delta ~ {$esperado}s ({$delta}s)");
check(count($r4['tramos']) === 1, "sintetico: 1 tramo (hay " . count($r4['tramos']) . ")");
check(abs($r4['resumen']['total_coincidente_km'] - 5.53) < 0.5, "sintetico: km coincidentes ~5.53 ({$r4['resumen']['total_coincidente_km']})");

// ---- Caso 5: sin tiempos -> 0 tramos, sin errores ----
$sinT = array_map(fn($p) => ['lat' => $p['lat'], 'lon' => $p['lon']], array_slice($a2s, 0, 100));
$res5 = comp_analizar_tramos($sinT, $sinT);
check(count($res5['tramos']) === 0, "sin tiempos: 0 tramos");

echo $fails === 0 ? "\nTODOS LOS TESTS OK\n" : "\n$fails TESTS FALLIDOS\n";
exit($fails === 0 ? 0 : 1);
