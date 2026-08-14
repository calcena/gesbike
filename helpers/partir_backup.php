<?php
// Uso CLI: php helpers/partir_backup.php [archivo] [bytes_por_parte]
// Web:     requerido desde api/helpers/partir_backup.php y llamar partir_backup()
// Crea database/backups/partes/app.db.gz.001, .002, ... para restaurar en el
// hosting con el botón "Extraer BD".
function partir_backup($src = null, $partSize = 2 * 1024 * 1024)
{
    if ($src === null) {
        $src = dirname(__DIR__) . '/database/app.db';
    }
    if (!is_file($src)) {
        throw new RuntimeException('No existe: ' . $src);
    }

    $base = basename($src); // app.db
    $outDir = dirname(__DIR__) . '/database/backups/partes';
    if (!is_dir($outDir)) {
        mkdir($outDir, 0775, true);
    }
    foreach (glob($outDir . '/' . $base . '.gz.*') as $vieja) {
        @unlink($vieja);
    }

    // 1) gzip en streaming (sin cargar en memoria)
    $gz = $outDir . '/' . $base . '.gz';
    $in = fopen($src, 'rb');
    $g = gzopen($gz, 'wb9');
    while (!feof($in)) {
        gzwrite($g, fread($in, 1 << 20));
    }
    gzclose($g);
    fclose($in);
    $gzSize = filesize($gz);

    // 2) partir en bloques de $partSize
    $in = fopen($gz, 'rb');
    $n = 1;
    $left = $partSize;
    $out = null;
    $partes = [];
    while (!feof($in)) {
        if ($out === null) {
            $parte = $outDir . sprintf('/%s.gz.%03d', $base, $n);
            $out = fopen($parte, 'wb');
            $partes[] = $parte;
        }
        $buf = fread($in, min(1 << 20, $left));
        if ($buf === '') {
            break;
        }
        fwrite($out, $buf);
        $left -= strlen($buf);
        if ($left <= 0) {
            fclose($out);
            $out = null;
            $n++;
            $left = $partSize;
        }
    }
    if ($out !== null) {
        fclose($out);
    }
    fclose($in);
    @unlink($gz);

    return [
        'src' => $src,
        'dir' => $outDir,
        'gz_size' => $gzSize,
        'partes' => array_map('basename', $partes),
        'tamano_parte' => $partSize,
    ];
}

if (php_sapi_name() === 'cli' && realpath($_SERVER['argv'][0] ?? '') === __FILE__) {
    $src = $argv[1] ?? null;
    $partSize = isset($argv[2]) ? (int) $argv[2] : 2 * 1024 * 1024;
    try {
        $r = partir_backup($src, $partSize);
        $num = count($r['partes']);
        echo sprintf("%s.gz creado: %.1f MB (%.1f %% de %s)\n", basename($r['src']), $r['gz_size'] / 1048576, 100.0 * $r['gz_size'] / filesize($r['src']), basename($r['src']));
        foreach ($r['partes'] as $p) {
            echo 'Creando ' . $r['dir'] . '/' . $p . PHP_EOL;
        }
        echo 'Listo: ' . $num . ' partes en ' . $r['dir'] . PHP_EOL;
        echo 'Sube al hosting las partes ' . basename($r['src']) . '.gz.001 ... ' . sprintf('.%03d', $num) . ' (cada una ≤ ' . round($partSize / 1048576, 1) . ' MB) a la carpeta database/ y pulsa "Extraer BD".' . PHP_EOL;
    } catch (Exception $e) {
        fwrite(STDERR, $e->getMessage() . PHP_EOL);
        exit(1);
    }
}
