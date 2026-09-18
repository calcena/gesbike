<?php
/**
 * Análisis comparativo de rutas GPX.
 * Detecta tramos coincidentes (mismo recorrido) entre dos rutas y compara
 * los tiempos de recorrido en cada tramo.
 *
 * Algoritmo:
 *  1. Simplificación de tracks a ~1 punto cada SIMPLIFY_STEP_M metros
 *     (conserva siempre el primer y último punto).
 *  2. Índice espacial tipo grid (celda de CELL_DEG grados) sobre la ruta B.
 *  3. Para cada punto de la ruta A se busca el punto más cercano de B dentro
 *     de una tolerancia EPSILON_M (ruido GPS). Matches consecutivos y
 *     monótonos (avance en el mismo sentido en ambas rutas) forman un tramo.
 *  4. Cada tramo se depura: elimina huecos grandes (pausas de B entre
 *     puntos de A) y tramos demasiado cortos.
 *
 * Todo el cálculo es en memoria y O(n + m) gracias al grid.
 */

const COMP_SIMPLIFY_STEP_M = 25;   // distancia entre puntos simplificados
const COMP_EPSILON_M = 30;         // tolerancia de coincidencia GPS
const COMP_CELL_DEG = 0.004;       // ~450 m de celda de grid
const COMP_MIN_TRAMO_M = 200;      // tramo mínimo para ser relevante
const COMP_MIN_VEL_KMH = 1.0;      // velocidad mínima para considerar avance
const COMP_MAX_GAP_MATCHES = 6;    // huecos consecutivos sin match antes de cerrar tramo

function comp_haversine_m($lat1, $lon1, $lat2, $lon2)
{
    $r = 6371000.0;
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 +
        cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 2 * $r * asin(min(1.0, sqrt($a)));
}

/**
 * Simplifica un track a puntos equidistantes ~COMP_SIMPLIFY_STEP_M y
 * normaliza el formato. Devuelve array de [lat, lon, t (timestamp s), km (dist acumulada)].
 */
function comp_simplificar_track(array $points): array
{
    $out = [];
    $dist = 0.0;
    $last = null;
    foreach ($points as $p) {
        $lat = isset($p['lat']) ? (float)$p['lat'] : null;
        $lon = isset($p['lon']) ? (float)$p['lon'] : null;
        if ($lat === null || $lon === null) continue;
        if (abs($lat) > 90 || abs($lon) > 180) continue;
        $t = null;
        if (!empty($p['time'])) {
            $ts = strtotime((string)$p['time']);
            if ($ts !== false) $t = (float)$ts;
        }
        if ($last !== null) {
            $dist += comp_haversine_m($last[0], $last[1], $lat, $lon);
        }
        $last = [$lat, $lon];
        if ($out === [] || $dist - $out[count($out) - 1][3] >= COMP_SIMPLIFY_STEP_M || $t === null) {
            if ($out !== [] && $t === null) {
                // Sin tiempo no se puede comparar: cierra el track aquí
                break;
            }
            $out[] = [$lat, $lon, $t, round($dist, 1)];
        }
    }
    return $out;
}

/**
 * Índice espacial: celda -> lista de índices de puntos de B.
 */
function comp_indice_espacial(array $b): array
{
    $grid = [];
    foreach ($b as $i => $pt) {
        $key = floor($pt[0] / COMP_CELL_DEG) . '_' . floor($pt[1] / COMP_CELL_DEG);
        $grid[$key][] = $i;
    }
    return $grid;
}

/**
 * Busca el punto de B más cercano dentro de una tolerancia.
 * Devuelve [índice, distancia_m] o null.
 */
function comp_match_punto(array $pt, array $b, array $grid, float $epsilon = COMP_EPSILON_M, int $desde = 0): ?array
{
    $lat = $pt[0];
    $lon = $pt[1];
    $cx = floor($lat / COMP_CELL_DEG);
    $cy = floor($lon / COMP_CELL_DEG);
    $r = (int)ceil($epsilon / 111320.0 / COMP_CELL_DEG) + 1;
    $best = null;
    $bestDist = $epsilon;
    for ($dx = -$r; $dx <= $r; $dx++) {
        for ($dy = -$r; $dy <= $r; $dy++) {
            $key = ($cx + $dx) . '_' . ($cy + $dy);
            if (!isset($grid[$key])) continue;
            foreach ($grid[$key] as $i) {
                if ($i < $desde) continue;
                $d = comp_haversine_m($lat, $lon, $b[$i][0], $b[$i][1]);
                if ($d < $bestDist) {
                    $best = $i;
                    $bestDist = $d;
                }
            }
        }
    }
    return $best === null ? null : [$best, $bestDist];
}

/**
 * Devuelve la velocidad (km/h) entre el punto idx-1 y idx de un track simplificado.
 */
function comp_vel_entre(array $track, int $idx): float
{
    if ($idx <= 0 || $idx >= count($track)) return 0.0;
    $dM = $track[$idx][3] - $track[$idx - 1][3];
    $dtS = $track[$idx][2] - $track[$idx - 1][2];
    if ($dtS <= 0) return 0.0;
    return ($dM / 1000.0) / ($dtS / 3600.0);
}

/**
 * Analiza dos tracks (arrays de track points con lat/lon/time) y devuelve
 * los tramos coincidentes con tiempos de recorrido de cada ruta.
 *
 * La ruta B se indexa en ambos sentidos (directo e invertido): si la ruta A
 * recorre un tramo en sentido contrario a como lo recorrió B, ese tramo se
 * detecta igualmente (delta de tiempo no directamente comparable, marcado
 * con sentido contrario).
 */
function comp_analizar_tramos(array $trackA, array $trackB, array $opts = []): array
{
    $epsilon = (float)($opts['epsilon_m'] ?? COMP_EPSILON_M);
    $minTramo = (float)($opts['min_tramo_m'] ?? COMP_MIN_TRAMO_M);
    $maxGap = (int)($opts['max_gap'] ?? COMP_MAX_GAP_MATCHES);

    $a = comp_simplificar_track($trackA);
    $b = comp_simplificar_track($trackB);
    if (count($a) < 2 || count($b) < 2) {
        return ['tramos' => [], 'resumen' => comp_resumen_vacio($a, $b)];
    }

    // B invertida (recorrida en sentido contrario): reordenar puntos y recalcular km
    $bRev = array_reverse($b);
    $km0 = $b[count($b) - 1][3];
    $bRev = array_map(fn($p) => [$p[0], $p[1], $p[2], $km0 - $p[3]], $bRev);

    $cand = [
        ['sentido' => 'directo', 'track' => $b],
        ['sentido' => 'contrario', 'track' => $bRev],
    ];
    $mejor = null;
    foreach ($cand as $c) {
        $r = comp_analizar_direccion($a, $c['track'], $epsilon, $minTramo, $maxGap, $c['sentido']);
        if ($mejor === null || $r['resumen']['total_coincidente_km'] > $mejor['resumen']['total_coincidente_km']) {
            $mejor = $r;
        }
    }
    return $mejor;
}

/**
 * Matching monótono de A sobre un track de B ya orientado.
 */
function comp_analizar_direccion(array $a, array $b, float $epsilon, float $minTramo, int $maxGap, string $sentido): array
{
    $grid = comp_indice_espacial($b);

    // 1. Matching punto a punto
    $matches = []; // por índice de A => índice de B o null
    $desdeB = 0;
    $desdeSinMatch = 0;
    foreach ($a as $ia => $pt) {
        $m = comp_match_punto($pt, $b, $grid, $epsilon, $desdeB);
        if ($m !== null && $m[0] < $desdeSinMatch) {
            // retroceso en B respecto a lo ya recorrido: no monótono
            $m = null;
        }
        $matches[$ia] = $m === null ? null : $m[0];
        if ($m !== null) {
            $desdeB = $m[0];
            $desdeSinMatch = $m[0];
        } else {
            $desdeSinMatch = max($desdeSinMatch, $desdeB - (int)ceil($epsilon / COMP_SIMPLIFY_STEP_M) - 1);
        }
    }

    // 2. Agrupar matches consecutivos en tramos (tolerando huecos cortos)
    $tramosRaw = [];
    $enTramo = false;
    $iniA = 0; $iniB = 0; $ultimoB = 0; $gap = 0;
    foreach ($matches as $ia => $ib) {
        if ($ib !== null) {
            if (!$enTramo) {
                $enTramo = true;
                $iniA = $ia;
                $iniB = $ib;
            } elseif ($ib <= $ultimoB) {
                // B se estanca o retrocede dentro del tramo: tramo degenerado, cierra
                if ($gap >= $maxGap) {
                    $tramosRaw[] = [$iniA, $prevA, $iniB, $ultimoB];
                    $enTramo = true;
                    $iniA = $ia;
                    $iniB = $ib;
                }
            }
            $ultimoB = $ib;
            $prevA = $ia;
            $gap = 0;
        } else {
            $gap++;
            if ($enTramo && $gap >= $maxGap) {
                $tramosRaw[] = [$iniA, $prevA, $iniB, $ultimoB];
                $enTramo = false;
            }
        }
    }
    if ($enTramo) {
        $tramosRaw[] = [$iniA, $prevA, $iniB, $ultimoB];
    }

    // 3. Filtrar y calcular tiempos
    $tramos = [];
    $bkm = [];
    foreach ($tramosRaw as [$i0a, $i1a, $i0b, $i1b]) {
        if ($i1a <= $i0a || $i1b <= $i0b) continue;
        $dist = ($a[$i1a][3] - $a[$i0a][3]) / 1000.0;
        if ($dist * 1000.0 < $minTramo) continue;
        $t0a = $a[$i0a][2]; $t1a = $a[$i1a][2];
        $t0b = $b[$i0b][2]; $t1b = $b[$i1b][2];
        $dta = $t1a - $t0a;
        $dtb = $t1b - $t0b;
        if ($dta <= 0 || $dtb <= 0) continue;

        $velA = $dist / ($dta / 3600.0);
        $velB = $dist / ($dtb / 3600.0);

        if (!isset($bkm[$i0b])) {
            $bkm[$i0b] = comp_km_b_original($b, $i0b, $sentido);
        }

        $tramos[] = [
            'km_inicio_a' => round($a[$i0a][3] / 1000.0, 2),
            'km_fin_a'    => round($a[$i1a][3] / 1000.0, 2),
            'km_inicio_b' => $bkm[$i0b],
            'km_fin_b'    => round($bkm[$i0b] + ($b[$i1b][3] - $b[$i0b][3]) / 1000.0, 2),
            'dist_km'     => round($dist, 2),
            't_a_s'       => (int)round($dta),
            't_b_s'       => (int)round($dtb),
            'delta_s'     => (int)round($dtb - $dta),
            'vel_a'       => round($velA, 1),
            'vel_b'       => round($velB, 1),
            'sentido'     => $sentido,
        ];
    }

    return ['tramos' => $tramos, 'resumen' => comp_resumen($tramos, $a, $b), 'sentido' => $sentido];
}

/**
 * Km original (en la ruta B sin invertir) de un punto de B invertida.
 */
function comp_km_b_original(array $b, int $i, string $sentido): float
{
    if ($sentido !== 'contrario') {
        return round($b[$i][3] / 1000.0, 2);
    }
    $totalB = $b[count($b) - 1][3];
    return round(($totalB - $b[$i][3]) / 1000.0, 2);
}

function comp_resumen_vacio(array $a, array $b): array
{
    $kmA = count($a) ? $a[count($a) - 1][3] / 1000.0 : 0.0;
    $kmB = count($b) ? $b[count($b) - 1][3] / 1000.0 : 0.0;
    return [
        'total_coincidente_km' => 0.0,
        'cobertura_a_pct' => 0.0,
        'cobertura_b_pct' => 0.0,
        'delta_total_s' => 0,
        't_total_a_s' => 0,
        't_total_b_s' => 0,
        'km_a' => round($kmA, 2),
        'km_b' => round($kmB, 2),
    ];
}

function comp_resumen(array $tramos, array $a, array $b): array
{
    $kmA = count($a) ? $a[count($a) - 1][3] / 1000.0 : 0.0;
    $kmB = count($b) ? $b[count($b) - 1][3] / 1000.0 : 0.0;
    $totalKm = 0.0; $deltaTotal = 0; $tA = 0; $tB = 0;
    foreach ($tramos as $t) {
        $totalKm += $t['dist_km'];
        $deltaTotal += $t['delta_s'];
        $tA += $t['t_a_s'];
        $tB += $t['t_b_s'];
    }
    return [
        'total_coincidente_km' => round($totalKm, 2),
        'cobertura_a_pct' => $kmA > 0 ? round($totalKm / $kmA * 100, 1) : 0.0,
        'cobertura_b_pct' => $kmB > 0 ? round($totalKm / $kmB * 100, 1) : 0.0,
        'delta_total_s' => $deltaTotal,
        't_total_a_s' => $tA,
        't_total_b_s' => $tB,
        'km_a' => round($kmA, 2),
        'km_b' => round($kmB, 2),
    ];
}
