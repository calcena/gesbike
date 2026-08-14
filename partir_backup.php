<?php
// Uso: php partir_backup.php [archivo] [bytes_por_parte]
// Crea database/backups/partes/app.db.gz.001, .002, ... para restaurar en el
// hosting con el botón "Extraer BD".
$src = $argv[1] ?? __DIR__ . '/database/app.db';
$partSize = isset($argv[2]) ? (int) $argv[2] : 2 * 1024 * 1024;

if (!is_file($src)) {
    fwrite(STDERR, 'No existe: ' . $src . PHP_EOL);
    exit(1);
}

$base = basename($src); // app.db
$outDir = __DIR__ . '/database/backups/partes';
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
echo sprintf("app.db.gz creado: %.1f MB (%.1f %% de %s)\n", $gzSize / 1048576, 100.0 * $gzSize / filesize($src), $base);

// 2) partir en bloques de $partSize
$in = fopen($gz, 'rb');
$n = 1;
$left = $partSize;
$out = null;
while (!feof($in)) {
    if ($out === null) {
        $parte = $outDir . sprintf('/%s.gz.%03d', $base, $n);
        $out = fopen($parte, 'wb');
        echo 'Creando ' . $parte . PHP_EOL;
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

$num = count(glob($outDir . '/' . $base . '.gz.*'));
$total = $num * $partSize;
echo 'Listo: ' . $num . ' partes en ' . $outDir . PHP_EOL;
echo 'Sube al hosting las partes ' . $base . '.gz.001 ... ' . sprintf('.%03d', $num) . ' (cada una ≤ ' . round($partSize / 1048576, 1) . ' MB) a la carpeta database/ y pulsa "Extraer BD".' . PHP_EOL;
