<?php
require_once __DIR__ . '/../helpers/fit_parser.php';
$filepath = $argv[1] ?? __DIR__ . '/Zepp20260729184611.fit';
$parser = new FitParser();
$ref = new ReflectionClass($parser);
$recProp = $ref->getProperty('records');
$recProp->setAccessible(true);

$result = $parser->parse($filepath, false);
$records = $recProp->getValue($parser);

// Check field 85 across ALL records
$f85values = [];
foreach ($records as $i => $rec) {
    if (isset($rec[85]) && $rec[85] !== null) {
        $f85values[] = $rec[85];
        if (count($f85values) >= 10) break;
    }
}
echo "Field 85 values (first 10): " . json_encode($f85values) . "\n";

// Check if field 85 varies over the route
$all85 = [];
$nonZero85 = 0;
foreach ($records as $i => $rec) {
    if ($i > 200) break;
    if (isset($rec[85]) && $rec[85] !== null) {
        $all85[] = $rec[85];
        if ($rec[85] != 0) $nonZero85++;
    }
}
echo "Field 85 non-zero count in first 200 records: $nonZero85\n";
echo "Field 85 unique values: " . json_encode(array_unique($all85)) . "\n";

// Also check raw timestamp field
$tsCount = 0;
foreach ($records as $i => $rec) {
    if (isset($rec[253]) && $rec[253] !== null) $tsCount++;
}
echo "Records with timestamp field (253): $tsCount\n";

// Check what other fields might exist
$allFieldNums = [];
foreach ($records as $i => $rec) {
    foreach ($rec as $k => $v) {
        if ($v !== null) $allFieldNums[$k] = ($allFieldNums[$k] ?? 0) + 1;
    }
}
ksort($allFieldNums);
echo "All field numbers across records:\n";
foreach ($allFieldNums as $k => $cnt) {
    echo "  field[$k]: $cnt records\n";
}
echo "\nTotal records: " . count($records) . "\n";