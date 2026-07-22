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

