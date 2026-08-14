<?php
// Descartar cualquier salida previa bufferizada (warnings de arranque PHP,
// avisos de extensiones, etc.) y entregar SIEMPRE JSON limpio.
while (ob_get_level() > 0) { ob_end_clean(); }
ini_set('display_errors', '0');
ini_set('display_startup_errors', '0');
@set_time_limit(300);
ob_start();

define('ROOT_PATH', dirname(dirname(__DIR__)));
require_once ROOT_PATH . '/helpers/helper.php';
require_once ROOT_PATH . '/helpers/config.php';
get_session_status();
debug_mode();

$dbDir = rtrim(ROOT_PATH . '/database/', '/') . '/';
$permitidos = ['app.db', 'gesbike.db', 'comandos_voz.db'];

$disabled = array_map('trim', explode(',', (string) ini_get('disable_functions')));
$canExec = !in_array('exec', $disabled, true);
$canShell = !in_array('shell_exec', $disabled, true);

function json_error($msg, $code = 500)
{
    while (ob_get_level() > 0) { ob_end_clean(); }
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

function run7z($cmd)
{
    global $canExec;
    $out = [];
    if ($canExec) {
        exec($cmd . ' 2>&1', $out, $code);
        return [$out, $code];
    }
    $raw = @shell_exec($cmd . ' 2>&1');
    $out = $raw === null ? [] : explode("\n", trim($raw));
    $text = implode("\n", $out);
    $code = (strpos($text, 'Everything is Ok') !== false) ? 0 : 1;
    return [$out, $code];
}

function rm_rf($dir)
{
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $f) {
        $f->isDir() ? @rmdir($f->getPathname()) : @unlink($f->getPathname());
    }
    @rmdir($dir);
}

// Borra archivos con reintentos y devuelve los que NO se pudieron eliminar.
// Si el hosting deja restos (permisos del FTP, sticky bit...), se neutralizan
// truncándolos a 0 bytes y se avisa en la respuesta.
function borrar_si_puede(array $rutas)
{
    $fallidos = [];
    foreach ($rutas as $ruta) {
        if (!is_file($ruta) && !is_link($ruta)) continue;
        if (@unlink($ruta)) continue;
        @chmod($ruta, 0644);
        if (@unlink($ruta)) continue;
        $fh = @fopen($ruta, 'wb');
        if ($fh !== false) {
            fclose($fh);
        }
        $fallidos[] = basename($ruta);
    }
    return $fallidos;
}

// ---------------------------------------------------------------------------
// Candidatos: .zip sueltos, juegos de partes .7z.001/.002/... o partes gzip
// .gz.001/.002/... (y .bz2 si la extensión bzip2 está disponible).
// El gzip es un flujo continuo: concatenando las partes se reconstruye el .gz
// y PHP lo descomprime con las funciones gz* (zlib, siempre disponible), sin
// necesitar binarios externos.
// Se elige el MÁS RECIENTE por fecha de modificación (evita que zips legacy
// como app.db.zip tracked en git prevalezcan sobre lo que acaba de dejar el
// usuario).
// ---------------------------------------------------------------------------
$candidatos = [];
foreach (glob($dbDir . '*.zip') as $z) {
    $candidatos[] = ['tipo' => 'zip', 'ruta' => $z, 'mtime' => filemtime($z)];
}
foreach (glob($dbDir . 'backups/*.zip') as $z) {
    $candidatos[] = ['tipo' => 'zip', 'ruta' => $z, 'mtime' => filemtime($z)];
}

$grupos = [];
foreach (array_merge(glob($dbDir . '*.7z.*'), glob($dbDir . 'backups/*.7z.*')) as $p) {
    if (preg_match('/^(.*\.7z)\.(\d+)$/', $p, $m)) {
        $grupos['7z'][$m[1]][(int) $m[2]] = $p;
    }
}
foreach (array_merge(glob($dbDir . '*.gz.*'), glob($dbDir . 'backups/*.gz.*')) as $p) {
    if (preg_match('/^(.*\.gz)\.(\d+)$/', $p, $m)) {
        $grupos['gz'][$m[1]][(int) $m[2]] = $p;
    }
}
if (function_exists('bzopen')) {
    foreach (array_merge(glob($dbDir . '*.bz2.*'), glob($dbDir . 'backups/*.bz2.*')) as $p) {
        if (preg_match('/^(.*\.bz2)\.(\d+)$/', $p, $m)) {
            $grupos['bz2'][$m[1]][(int) $m[2]] = $p;
        }
    }
}
foreach ($grupos as $tipo => $g) {
    foreach ($g as $base => $lista) {
        ksort($lista, SORT_NUMERIC);
        $candidatos[] = [
            'tipo' => $tipo,
            'base' => $base,
            'partes' => array_values($lista),
            'mtime' => filemtime(reset($lista)),
        ];
    }
}

if (empty($candidatos)) {
    json_error('No se encontró ningún archivo .zip, .7z.001 ni .gz.001 para restaurar en ' . $dbDir, 404);
}
usort($candidatos, function ($a, $b) {
    return $b['mtime'] - $a['mtime'];
});
$cand = $candidatos[0];

$extraidos = [];

// ---------------------------------------------------------------------------
// ZIP (ZipArchive)
// ---------------------------------------------------------------------------
if ($cand['tipo'] === 'zip') {
    $zipPath = $cand['ruta'];

    if (!class_exists('ZipArchive')) {
        json_error('ZipArchive no disponible en el servidor');
    }

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== true) {
        json_error('No se pudo abrir el archivo .zip');
    }

    // Extraer únicamente: bases de datos (app.db, gesbike.db, comandos_voz.db)
    // y el histórico JSON (hist/**) preservando subcarpetas
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $nombre = $zip->getNameIndex($i);

        // Protección contra rutas peligrosas
        if (strpos($nombre, '..') !== false || $nombre === '' || $nombre[0] === '/') {
            continue;
        }

        if (in_array(basename($nombre), $permitidos, true)) {
            // Unlink previo: ZipArchive::extractTo puede fallar (EPERM/EACCES) al
            // sobrescribir un fichero existente creado por otro usuario (permisos 644)
            $destino = $dbDir . basename($nombre);
            if (file_exists($destino) && !@unlink($destino)) {
                continue;
            }
            if ($zip->extractTo($dbDir, $nombre)) {
                $extraidos[] = basename($nombre);
            }
        } elseif (strpos($nombre, 'hist/') === 0) {
            $destinoHist = ROOT_PATH . '/' . $nombre;
            if (file_exists($destinoHist) && !@unlink($destinoHist)) {
                continue;
            }
            if ($zip->extractTo(ROOT_PATH . '/', $nombre)) {
                $extraidos[] = $nombre;
            }
        }
    }
    $zip->close();

    // Borrar el .zip del servidor tras extraerlo
    $restos = borrar_si_puede([$zipPath]);
}

// ---------------------------------------------------------------------------
// 7Z en volúmenes (.7z.001, .7z.002, ...): ensamblar y descomprimir
// ---------------------------------------------------------------------------
elseif ($cand['tipo'] === '7z') {
    $ensamblado = $cand['base'];

    // 1) Ensamblar partes en orden numérico (001 < 002 < ... < 010 < 011)
    $fh = fopen($ensamblado, 'wb');
    if ($fh === false) {
        json_error('No se pudo crear el archivo .7z ensamblado');
    }
    foreach ($cand['partes'] as $parte) {
        $in = fopen($parte, 'rb');
        if ($in === false) {
            fclose($fh);
            json_error('No se pudo leer la parte ' . basename($parte));
        }
        while (!feof($in)) {
            fwrite($fh, fread($in, 1 << 20));
        }
        fclose($in);
    }
    fclose($fh);
    @chmod($ensamblado, 0664);

    // 2) Localizar binario 7z (p7zip)
    $exe = null;
    foreach (['/usr/bin/7z', '/usr/bin/7za', '/usr/bin/7zr', '/usr/local/bin/7z', '/usr/local/bin/7za', '/usr/local/bin/7zr'] as $c) {
        if (is_executable($c)) { $exe = $c; break; }
    }
    if ($exe === null && $canShell) {
        $r = trim((string) @shell_exec('command -v 7z 2>/dev/null'));
        if ($r !== '') $exe = $r;
    }
    if ($exe === null) {
        json_error('El servidor no dispone del binario 7z (p7zip) para descomprimir el .7z. Usa en su lugar partes .gz (app.db.gz.001, app.db.gz.002...), que PHP descomprime sin binarios.');
    }
    if (!$canExec && !$canShell) {
        json_error('exec/shell_exec están deshabilitados en el servidor: imposible ejecutar 7z');
    }

    // 3) Verificar integridad (detecta partes incompletas/corruptas)
    list($tOut, $tCode) = run7z(escapeshellarg($exe) . ' t ' . escapeshellarg($ensamblado) . ' -y');
    if ($tCode !== 0) {
        @unlink($ensamblado);
        json_error('El archivo .7z está incompleto o corrupto (¿faltan partes?). Verificado con ' . $exe);
    }

    // 4) Extraer a un directorio temporal y copiar SOLO lo permitido
    $tmp = $dbDir . 'tmp_7z_' . uniqid();
    if (!mkdir($tmp, 0775, true)) {
        @unlink($ensamblado);
        json_error('No se pudo crear el directorio temporal de extracción');
    }
    list($xOut, $xCode) = run7z(escapeshellarg($exe) . ' x ' . escapeshellarg($ensamblado) . ' -o' . escapeshellarg($tmp) . ' -y');
    if ($xCode !== 0) {
        rm_rf($tmp);
        @unlink($ensamblado);
        json_error('Error al descomprimir el .7z: ' . implode(' ', array_slice($xOut, -3)));
    }

    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($tmp, FilesystemIterator::SKIP_DOTS)
    );
    foreach ($it as $archivo) {
        if (!$archivo->isFile()) continue;
        $rel = str_replace('\\', '/', substr($archivo->getPathname(), strlen($tmp) + 1));
        if ($rel === '' || strpos($rel, '..') !== false) continue;

        if (in_array(basename($rel), $permitidos, true)) {
            $destino = $dbDir . basename($rel);
            if (file_exists($destino) && !@unlink($destino)) continue;
            if (@copy($archivo->getPathname(), $destino)) {
                $extraidos[] = basename($rel);
            }
        } elseif (($pos = strpos($rel, 'hist/')) !== false) {
            $parte = substr($rel, $pos);
            $destinoHist = ROOT_PATH . '/' . $parte;
            if (!is_dir(dirname($destinoHist)) && !@mkdir(dirname($destinoHist), 0775, true)) continue;
            if (file_exists($destinoHist) && !@unlink($destinoHist)) continue;
            if (@copy($archivo->getPathname(), $destinoHist)) {
                $extraidos[] = $parte;
            }
        }
    }
    rm_rf($tmp);

    // 5) Limpiar partes, ensamblado y temporal
    $restos = borrar_si_puede(array_merge($cand['partes'], [$ensamblado]));
    rm_rf($tmp);
}

// ---------------------------------------------------------------------------
// GZIP en volúmenes (.gz.001, .gz.002, ...) o .gz único: ensamblar y
// descomprimir con las funciones gz* de PHP (zlib, sin binarios externos).
// BZIP2 (.bz2.NNN) si bzopen está disponible.
// ---------------------------------------------------------------------------
else {
    $tipo = $cand['tipo']; // 'gz' | 'bz2'
    $nombreDb = preg_replace('/\.(gz|bz2)$/', '', basename($cand['base']));
    if (!in_array($nombreDb, $permitidos, true)) {
        json_error('El archivo debe llamarse ' . implode(', ', array_map(fn ($n) => $n . '.' . $tipo, $permitidos)) . ' (no ' . $nombreDb . ').');
    }

    $ensamblado = $cand['base'];

    // Ensamblar partes en orden numérico solo si son varias (o no existe aún)
    if (count($cand['partes']) > 1 || !file_exists($ensamblado)) {
        $fh = fopen($ensamblado, 'wb');
        if ($fh === false) {
            json_error('No se pudo crear el archivo .' . $tipo . ' ensamblado');
        }
        foreach ($cand['partes'] as $parte) {
            $in = fopen($parte, 'rb');
            if ($in === false) {
                fclose($fh);
                json_error('No se pudo leer la parte ' . basename($parte));
            }
            while (!feof($in)) {
                fwrite($fh, fread($in, 1 << 20));
            }
            fclose($in);
        }
        fclose($fh);
        @chmod($ensamblado, 0664);
    }

    // Descomprimir en streaming (1 MB por lectura) hacia la BD destino
    $destino = $dbDir . $nombreDb;
    if ($tipo === 'gz') {
        $in = @gzopen($ensamblado, 'rb');
    } else {
        $in = @bzopen($ensamblado, 'r');
    }
    if ($in === false) {
        @unlink($ensamblado);
        json_error('El archivo .' . $tipo . ' está corrupto o incompleto (¿faltan partes?).');
    }
    if (file_exists($destino) && !@unlink($destino)) {
        @unlink($ensamblado);
        json_error('No se pudo sobrescribir ' . $nombreDb);
    }
    $out = fopen($destino, 'wb');
    if ($out === false) {
        @unlink($ensamblado);
        json_error('No se pudo escribir ' . $nombreDb);
    }
    $ok = true;
    while (true) {
        $bloque = $tipo === 'gz' ? @gzread($in, 1 << 20) : @bzread($in, 1 << 20);
        if ($bloque === false || $bloque === '') break;
        if (fwrite($out, $bloque) === false) { $ok = false; break; }
    }
    fclose($out);
    if ($tipo === 'gz') { @gzclose($in); } else { @bzclose($in); }

    // Limpiar partes y ensamblado
    $restos = borrar_si_puede(array_merge($cand['partes'], [$ensamblado]));

    if (!$ok) {
        borrar_si_puede([$destino]);
        json_error('Error de escritura al descomprimir ' . $nombreDb);
    }
    $extraidos[] = $nombreDb;
}

// ---------------------------------------------------------------------------
// Resultado común
// ---------------------------------------------------------------------------
if (empty($extraidos)) {
    json_error('El archivo no contiene una base de datos válida (app.db)');
}

// Normalizar permisos 0664 en lo extraído (grupo www-data siempre escribible)
foreach ($extraidos as $extraido) {
    $p = in_array(basename($extraido), $permitidos, true)
        ? $dbDir . basename($extraido)
        : ROOT_PATH . '/' . $extraido;
    @chmod($p, 0664);
}

while (ob_get_level() > 0) { ob_end_clean(); }
header('Content-Type: application/json; charset=utf-8');
if (!empty($restos)) {
    echo json_encode([
        'success' => true,
        'message' => 'Base de datos restaurada correctamente, pero no se pudieron eliminar: ' . implode(', ', $restos) . '. Bórralos manualmente.',
        'archivos' => $extraidos,
        'restantes' => $restos,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
echo json_encode([
    'success' => true,
    'message' => 'Base de datos restaurada correctamente.',
    'archivos' => $extraidos,
], JSON_UNESCAPED_UNICODE);
exit;
