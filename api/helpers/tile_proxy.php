<?php
$z = $_GET['z'] ?? 0;
$x = $_GET['x'] ?? 0;
$y = $_GET['y'] ?? 0;

$url = "https://tile.openstreetmap.org/{$z}/{$x}/{$y}.png";

$context = stream_context_create([
    'http' => [
        'timeout' => 10,
        'user_agent' => 'GesBike/1.0'
    ]
]);

$image = @file_get_contents($url, false, $context);
if ($image === false) {
    // tile not found, serve a blank/transparent tile
    $im = imagecreatetruecolor(256, 256);
    imagesavealpha($im, true);
    $transparent = imagecolorallocatealpha($im, 0, 0, 0, 127);
    imagefill($im, 0, 0, $transparent);
    header('Content-Type: image/png');
    imagepng($im);
    imagedestroy($im);
    exit;
}

header('Content-Type: image/png');
header('Access-Control-Allow-Origin: *');
header('Cache-Control: public, max-age=86400');
echo $image;
