<?php
require_once __DIR__ . '/../helpers/fit_parser.php';
require_once __DIR__ . '/../helpers/helper.php';

$gtsFile = __DIR__ . '/Zepp20260725183132.fit';
$bipFile = __DIR__ . '/Zepp20260729184611.fit';

// GTS Mini: reference values
$gts = (new FitParser())->parse($gtsFile, false);
echo "=== GTS MINI (reference) ===\n";
echo "Asc/Desc: {$gts['metros_ascenso']}/{$gts['metros_descenso']}\n";
echo "Subida: {$gts['pct_subida']}% Bajada: {$gts['pct_bajada']}% Plano: {$gts['pct_plano']}%\n";
echo "T_subida: {$gts['tiempo_subida']} T_bajada: {$gts['tiempo_bajada']} T_plano: {$gts['tiempo_plano']}\n";

// BIP Max: first parse to get coords
$bip0 = (new FitParser())->parse($bipFile, false);
echo "\n=== BIP MAX (first parse, no altitude) ===\n";
echo "Asc/Desc: {$bip0['metros_ascenso']}/{$bip0['metros_descenso']}\n";
echo "Subida: {$bip0['pct_subida']}% Bajada: {$bip0['pct_bajada']}% Plano: {$bip0['pct_plano']}%\n";

// Get coords
$coords = [];
$idxMap = [];
foreach ($bip0['pulsaciones'] as $i => $p) {
    if (!empty($p['lat']) && !empty($p['lon'])) {
        $coords[] = ['lat' => (float)$p['lat'], 'lon' => (float)$p['lon']];
        $idxMap[] = $i;
    }
}
echo "GPS points: " . count($coords) . "\n";

// Fetch API
echo "Fetching API elevations...\n";
$elevations = fetch_elevations_from_api($coords);
if (!$elevations) die("API failed\n");

// Smooth for chart (80pt) and for parser (20pt)
$elevChart = smooth_elevations($elevations, true);
$elevParser = smooth_elevations($elevations, false);

// Re-parse with injected altitudes (use 20pt for parser input)
echo "\n=== BIP MAX (re-parse with SRTM 20pt) ===\n";
$bip2 = (new FitParser())->parse($bipFile, false, $elevParser, $idxMap);
echo "Asc/Desc: {$bip2['metros_ascenso']}/{$bip2['metros_descenso']}\n";
echo "Subida: {$bip2['pct_subida']}% Bajada: {$bip2['pct_bajada']}% Plano: {$bip2['pct_plano']}%\n";
echo "T_subida: {$bip2['tiempo_subida']} T_bajada: {$bip2['tiempo_bajada']} T_plano: {$bip2['tiempo_plano']}\n";

// Compare
echo "\n=== COMPARISON ===\n";
echo "                GTS Mini  |  BIP Max (SRTM)\n";
echo "Subida:         {$gts['pct_subida']}%        |  {$bip2['pct_subida']}%\n";
echo "Bajada:         {$gts['pct_bajada']}%        |  {$bip2['pct_bajada']}%\n";
echo "Plano:          {$gts['pct_plano']}%        |  {$bip2['pct_plano']}%\n";
echo "T_subida:       {$gts['tiempo_subida']}   |  {$bip2['tiempo_subida']}\n";
echo "T_bajada:       {$gts['tiempo_bajada']}   |  {$bip2['tiempo_bajada']}\n";
echo "T_plano:        {$gts['tiempo_plano']}   |  {$bip2['tiempo_plano']}\n";