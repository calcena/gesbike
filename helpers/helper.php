<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);
if (!function_exists('getallheaders')) {
    function getallheaders()
    {
        $headers = [];
        foreach ($_SERVER as $name => $value) {
            if (substr($name, 0, 5) === 'HTTP_') {
                // Convertir HTTP_ACCEPT_ENCODING → Accept-Encoding
                $headerName = str_replace(' ', '-', ucwords(strtolower(str_replace('_', ' ', substr($name, 5)))));
                $headers[$headerName] = $value;
            } elseif ($name === 'CONTENT_TYPE') {
                $headers['Content-Type'] = $value;
            } elseif ($name === 'CONTENT_LENGTH') {
                $headers['Content-Length'] = $value;
            }
        }
        return $headers;
    }
}

function random_file_enumerator()
{
    echo time();
}

function cacheBustUrl($url)
{
    $separator = (strpos($url, '?') !== false) ? '&' : '?';
    return $url . $separator . 'v=' . time();
}

function exit_session()
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_unset();
        session_destroy();
    }
}

function get_session_status()
{
    if (session_status() === PHP_SESSION_NONE) {
        session_start();
    }
}

function debug_mode()
{
    if (APP_ENV == "local" || APP_ENV == "dev") {
        ini_set('display_errors', 1);
        ini_set('display_startup_errors', 1);
        error_reporting(E_ALL);
    }
}

function show_envoironment_message()
{
    if (APP_ENV == "local") {
        echo '<div class="container">';
        echo '<div class="bg-primary">';
        echo '<h2 style="text-align: center;color: white;">Entorno LOCAL</h2>';
        echo '</div>';
        echo '</div>';
    }
    if (APP_ENV == "qa" || APP_ENV == "dev") {
        echo '<div class="container">';
        echo '<div class="bg-danger">';
        echo '<h2 style="text-align: center;color: white;">Entorno de DESARROLLO/QA</h2>';
        echo '</div>';
        echo '</div>';
    }
}

function new_guui_generator()
{
    $bytes = random_bytes(16);
    $bytes[6] = chr(ord($bytes[6]) & 0x0f | 0x40); // set version to 0100
    $bytes[8] = chr(ord($bytes[8]) & 0x3f | 0x80); // set variant to 10xx
    $hex = bin2hex($bytes);
    return sprintf(
        '%08s-%04s-%04s-%04s-%12s',
        substr($hex, 0, 8),
        substr($hex, 8, 4),
        substr($hex, 12, 4),
        substr($hex, 16, 4),
        substr($hex, 20, 12)
    );
}


function check_security()
{
    // En el caso de no existir sesión redirigimos
    if (!isset($_SESSION['user'])) {
        header('Location: /index.php');
        exit;
    }
}

// --- Zonas de ritmo cardíaco dinámicas (segun fecha de nacimiento) ---

// Bandas de porcentaje de la FC máxima (estilo Zeep):
// Z1 50-60%, Z2 60-70%, Z3 70-80%, Z4 80-90%, Z5 90-100%
function hr_zonas_bandas()
{
    return [
        ['zona' => 'Moderado',  'lo' => 50, 'hi' => 60],
        ['zona' => 'Intensivo', 'lo' => 60, 'hi' => 70],
        ['zona' => 'Aeróbico', 'lo' => 70, 'hi' => 80],
        ['zona' => 'Anaeróbico', 'lo' => 80, 'hi' => 90],
        ['zona' => 'VO2 Max',  'lo' => 90, 'hi' => 100],
    ];
}

// Edad (años cumplidos) en $fechaRef a partir de $fechaNac (YYYY-MM-DD).
// Devuelve null si no se puede calcular.
function edad_desde_fecha($fechaNac, $fechaRef = null)
{
    if (empty($fechaNac)) return null;
    $nac = DateTime::createFromFormat('Y-m-d', substr(trim($fechaNac), 0, 10));
    if (!$nac) return null;
    if (empty($fechaRef)) {
        $ref = new DateTime();
    } else {
        try {
            $ref = new DateTime(trim($fechaRef));
        } catch (Exception $e) {
            $ref = new DateTime();
        }
    }
    if (!$ref) return null;
    return (int) $ref->diff($nac)->y;
}

// Devuelve la definición de zonas ([{zona,min,max}]) para la edad
// correspondiente a la fecha de nacimiento en la fecha de referencia.
// HRmáx = 220 - edad. Devuelve null si no hay fecha de nacimiento.
function calcular_zonas_fc_por_edad($fechaNac, $fechaRef = null)
{
    $edad = edad_desde_fecha($fechaNac, $fechaRef);
    if ($edad === null) return null;
    $hrMax = max(1, 220 - $edad);
    $bands = hr_zonas_bandas();
    $n = count($bands);
    return array_map(function ($b, $i) use ($hrMax, $n) {
        $min = max(1, (int) round($b['lo'] / 100 * $hrMax));
        $max = ($i === $n - 1) ? $hrMax : (int) round($b['hi'] / 100 * $hrMax);
        return ['zona' => $b['zona'], 'min' => $min, 'max' => $max];
    }, $bands, array_keys($bands));
}

// Calcula el tiempo (segundos) y porcentaje en cada zona a partir del
// array de pulsaciones y una definición de zonas [{zona,min,max}].
// El tiempo por registro se obtiene de la diferencia de timestamps.
function zonas_fc_desde_pulsaciones($zonasDef, $pulsaciones)
{
    if (!is_array($zonasDef) || !is_array($pulsaciones)) return [];
    $segundos = array_fill(0, count($zonasDef), 0);
    $total = 0;
    $prevTs = null;
    $lastZone = null;
    $firstTs = null;
    $lastTs = null;

    foreach ($pulsaciones as $p) {
        $ts = null;
        if (!empty($p['timestamp_fit'])) {
            $t = strtotime($p['timestamp_fit']);
            if ($t !== false) $ts = $t;
        }
        $zoneIdx = null;
        $hr = isset($p['pulsaciones']) ? (int) $p['pulsaciones'] : 0;
        if ($hr > 0) {
            foreach ($zonasDef as $i => $z) {
                if ($hr >= $z['min'] && $hr <= $z['max']) {
                    $zoneIdx = $i;
                    break;
                }
            }
        }
        if ($ts !== null && $prevTs !== null) {
            $dt = $ts - $prevTs;
            if ($dt > 0 && $dt <= 600) {
                if ($zoneIdx === null) $zoneIdx = $lastZone;
                if ($zoneIdx !== null) {
                    $segundos[$zoneIdx] += $dt;
                    $total += $dt;
                    $lastZone = $zoneIdx;
                }
            }
        }
        if ($ts !== null) {
            if ($firstTs === null) $firstTs = $ts;
            $lastTs = $ts;
            $prevTs = $ts;
        }
    }

    // Porcentaje ABSOLUTO: respecto al tiempo total de la sesión
    // (último - primer timestamp), igual que en Zepp.
    $span = ($lastTs !== null && $firstTs !== null) ? ($lastTs - $firstTs) : 0;

    $result = [];
    foreach ($zonasDef as $i => $z) {
        $pct = $span > 0 ? round(($segundos[$i] / $span) * 100) : 0;
        $result[] = [
            'zona'     => $z['zona'],
            'min'      => $z['min'],
            'max'      => $z['max'],
            'segundos' => $segundos[$i],
            'porcentaje' => $pct,
        ];
    }
    return $result;
}

/**
 * Consulta la API gratuita de Open Elevation para obtener altitudes a partir
 * de coordenadas GPS. Envía hasta 5000 puntos por lote para evitar límites.
 * @param array $coords [['lat'=>float, 'lon'=>float], ...]
 * @return float[]|null  Array de altitudes en metros (mismo orden) o null si falla
 */
function fetch_elevations_from_api($coords)
{
    if (empty($coords)) return null;

    $batchSize = 5000;
    $allElevations = [];
    $total = count($coords);

    for ($start = 0; $start < $total; $start += $batchSize) {
        $batch = array_slice($coords, $start, $batchSize);
        $locations = array_map(function ($c) {
            return ['latitude' => $c['lat'], 'longitude' => $c['lon']];
        }, $batch);

        $payload = json_encode(['locations' => $locations]);
        $context = stream_context_create([
            'http' => [
                'method'  => 'POST',
                'header'  => "Content-Type: application/json\r\n",
                'content' => $payload,
                'timeout' => 30,
            ],
        ]);

        $response = @file_get_contents('https://api.open-elevation.com/api/v1/lookup', false, $context);
        if ($response === false) return null;

        $data = json_decode($response, true);
        if (!isset($data['results'])) return null;

        $batchElevations = array_map(function ($r) {
            return isset($r['elevation']) ? (float) $r['elevation'] : 0;
        }, $data['results']);

        $allElevations = array_merge($allElevations, $batchElevations);
        usleep(200000); // 200ms entre lotes para no saturar
    }

    return $allElevations;
}

/**
 * Suavizado por media móvil para eliminar escalones SRTM.
 * SRTM tiene resolución ~30m, los puntos GPS del BIP Max cada ~5m.
 * Las transiciones entre celdas SRTM crean saltos de hasta 100m.
 * Con ~4400 puntos en 22km, una ventana de 80 cubre ~400m (~13 celdas),
 * suficiente para convertir escalones en un perfil continuo.
 * Si se solicitan datos para el gráfico (chart=true), se usa ventana
 * más amplia para máxima suavidad visual.
 */
function smooth_elevations($elevations, $chart = false)
{
    $n = count($elevations);
    if ($n < 5) return $elevations;
    // Para el gráfico: ventana fija de 80pts (~400m, ~13 celdas SRTM)
    // Para métricas (porcentajes): ventana de 20pts (~100m, ~3 celdas)
    $window = $chart ? 80 : 20;
    $half = (int)($window / 2);
    $out = [];
    for ($i = 0; $i < $n; $i++) {
        $sum = 0; $c = 0;
        for ($j = max(0, $i - $half); $j <= min($n - 1, $i + $half); $j++) {
            $sum += $elevations[$j];
            $c++;
        }
        $out[] = $sum / $c;
    }
    return $out;
}

/**
 * Calcula métricas de elevación (ascenso, descenso, altitud máxima, porcentajes
 * de subida/bajada/llano) a partir de un array de puntos con distancia y las
 * altitudes obtenidas de la API.
 *
 * @param array $pulsaciones  Array de puntos con 'kilometro' (km) y 'timestamp_fit'
 * @param float[] $elevations Array de altitudes (m) en el mismo orden que $pulsaciones
 * @return array
 */
function compute_elevation_metrics($pulsaciones, $elevations)
{
    $count = min(count($pulsaciones), count($elevations));
    if ($count < 2) {
        return [
            'metros_ascenso' => 0, 'metros_descenso' => 0, 'altitud_maxima' => 0,
            'pct_subida' => 0, 'pct_bajada' => 0, 'pct_plano' => 100,
            'tiempo_subida' => '00:00:00', 'tiempo_plano' => '00:00:00', 'tiempo_bajada' => '00:00:00',
        ];
    }

    $ascent = 0; $descent = 0; $maxAlt = 0;
    $prevAlt = null; $prevKm = null; $prevTs = null;
    $distSubida = 0; $distBajada = 0; $distPlano = 0;
    $tiempoSubida = 0; $tiempoBajada = 0; $tiempoPlano = 0;
    $segDist = 0; $segAlt = 0; $segTime = 0;
    $segGradeThreshold = 2; $segMinDist = 30;

    for ($i = 0; $i < $count; $i++) {
        $alt = $elevations[$i];
        if ($alt > $maxAlt) $maxAlt = $alt;

        $km = isset($pulsaciones[$i]['kilometro']) ? (float) $pulsaciones[$i]['kilometro'] : null;
        $ts = null;
        if (!empty($pulsaciones[$i]['timestamp_fit'])) {
            $t = strtotime($pulsaciones[$i]['timestamp_fit']);
            if ($t !== false) $ts = $t;
        }

        if ($prevKm !== null && $km !== null && $prevAlt !== null && $alt !== null) {
            $dDist = ($km - $prevKm) * 1000;
            $dAlt = $alt - $prevAlt;
            $dTime = ($ts !== null && $prevTs !== null) ? $ts - $prevTs : 0;

            if ($dAlt > 0) $ascent += $dAlt;
            else $descent += abs($dAlt);

            if ($dDist > 0 && $dDist < 500) {
                $segDist += $dDist;
                $segAlt += $dAlt;
                $segTime += $dTime;
            }

            if ($segDist >= $segMinDist && $segDist > 0) {
                $grade = $segAlt / $segDist;
                if ($grade > $segGradeThreshold / 100) {
                    $distSubida += $segDist; $tiempoSubida += $segTime;
                } elseif ($grade < -$segGradeThreshold / 100) {
                    $distBajada += $segDist; $tiempoBajada += $segTime;
                } else {
                    $distPlano += $segDist; $tiempoPlano += $segTime;
                }
                $segDist = 0; $segAlt = 0; $segTime = 0;
            }
        }

        $prevKm = $km; $prevAlt = $alt; $prevTs = $ts;
    }

    if ($segDist >= $segMinDist && $segDist > 0) {
        $grade = $segAlt / $segDist;
        if ($grade > $segGradeThreshold / 100) {
            $distSubida += $segDist; $tiempoSubida += $segTime;
        } elseif ($grade < -$segGradeThreshold / 100) {
            $distBajada += $segDist; $tiempoBajada += $segTime;
        } else {
            $distPlano += $segDist; $tiempoPlano += $segTime;
        }
    }

    // Los % se calculan sobre TIEMPO para que sean coherentes con los
    // tiempo_subida/tiempo_bajada/tiempo_plano mostrados (por distancia, la
    // bajada saldría sobrevalorada porque se rueda más rápido).
    $total = $tiempoSubida + $tiempoBajada + $tiempoPlano;
    $pctSubida = $total > 0 ? round(($tiempoSubida / $total) * 100) : 0;
    $pctBajada = $total > 0 ? round(($tiempoBajada / $total) * 100) : 0;
    $pctPlano = max(0, 100 - $pctSubida - $pctBajada);

    $fmt = function ($s) {
        return $s > 0 ? sprintf('%02d:%02d:%02d', floor($s/3600), floor(($s%3600)/60), $s%60) : '00:00:00';
    };

    return [
        'metros_ascenso' => (int) round($ascent),
        'metros_descenso' => (int) round($descent),
        'altitud_maxima' => (int) round($maxAlt),
        'pct_subida' => $pctSubida,
        'pct_bajada' => $pctBajada,
        'pct_plano' => $pctPlano,
        'tiempo_subida' => $fmt($tiempoSubida),
        'tiempo_plano' => $fmt($tiempoPlano),
        'tiempo_bajada' => $fmt($tiempoBajada),
    ];
}

