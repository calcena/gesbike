<?php
/**
 * Dump estructurado de todos los mensajes de un FIT, enfocado en buscar
 * cualquier campo de altitud (2, 78, developer fields, etc.)
 */
require_once __DIR__ . '/../helpers/fit_parser.php';

$filepath = $argv[1] ?? __DIR__ . '/Zepp20260729184611.fit';
if (!file_exists($filepath)) die("Not found: $filepath\n");

$data = file_get_contents($filepath);
$len = strlen($data);
$off = ord($data[0]); // header size

// Parse all definitions and data
$defs = [];
$msgTypes = [0=>'file_id',18=>'session',19=>'lap',20=>'record',21=>'course',
             206=>'developer_data_id',207=>'field_description'];
$seenDevFields = [];

while ($off < $len - 2) {
    $hdr = ord($data[$off]);
    $isDef = ($hdr >> 7) & 1;
    $local = $hdr & 0x0F;
    $off++;

    if ($isDef) {
        $reserved = ord($data[$off]); $arch = ord($data[$off+1]);
        $global = unpack('v', substr($data, $off+2, 2))[1];
        $nFields = ord($data[$off+4]);
        $off += 5;
        
        $fields = [];
        for ($i = 0; $i < $nFields; $i++) {
            $fd = ord($data[$off]); $sz = ord($data[$off+1]); $bt = ord($data[$off+2]);
            $fields[] = ['def'=>$fd, 'size'=>$sz, 'type'=>$bt, 'name'=>fieldName($global, $fd)];
            $off += 3;
        }
        // Check for developer fields
        $nDev = 0;
        if ($off + 1 < $len - 2) {
            // Try to read developer field count (might be at the end of def msg)
            // Actually we can't know without parsing... just flag it
        }
        
        $name = $msgTypes[$global] ?? "gmsg_$global";
        $defs[$local] = ['global'=>$global, 'name'=>$name, 'fields'=>$fields];
        
        echo "DEF [$local] $name (gmsg=$global) $nFields fields";
        $altField = null;
        foreach ($fields as $f) {
            if ($f['def'] == 2 || $f['def'] == 78) $altField = $f;
        }
        if ($altField) echo " ** HAS ALTITUDE field {$altField['def']} **";
        echo "\n";

    } else {
        $def = $defs[$local] ?? null;
        if (!$def) { $off += 1; continue; }
        
        $global = $def['global'];
        $vals = [];
        foreach ($def['fields'] as $f) {
            $fd = $f['def']; $sz = $f['size'];
            if ($off + $sz > $len - 2) break;
            $raw = substr($data, $off, $sz);
            $val = decodeValue($raw, $f['type']);
            $vals[$fd] = $val;
            $off += $sz;
        }
        
        if ($global == 206) { // developer_data_id
            echo "DEV_DATA_ID: " . json_encode($vals) . "\n";
        } elseif ($global == 207) { // field_description
            echo "FIELD_DESC: " . json_encode($vals) . "\n";
            if (isset($vals[1]) && isset($vals[2])) {
                $seenDevFields[$vals[1]] = $vals[2];
            }
        } elseif ($global == 20) { // record
            static $rc = 0; $rc++;
            $hasAlt = (isset($vals[2]) && $vals[2] !== null) || (isset($vals[78]) && $vals[78] !== null);
            $hasLat = isset($vals[0]) && $vals[0] !== null;
            $hasLon = isset($vals[1]) && $vals[1] !== null;
            
            if ($rc <= 3 || ($hasAlt && $rc <= 10)) {
                $present = []; foreach ($vals as $k=>$v) { if ($v !== null) $present[] = $k; }
                $altStr = '';
                if (isset($vals[2]) && $vals[2] !== null) $altStr .= " alt2=" . round($vals[2]/5-500,1);
                if (isset($vals[78]) && $vals[78] !== null) $altStr .= " alt78=" . round($vals[78]/5-500,1);
                $latStr = $hasLat ? round($vals[0]*180/2147483648,6) : '';
                $lonStr = $hasLon ? round($vals[1]*180/2147483648,6) : '';
                echo "REC #$rc fields=[" . implode(',',$present) . "]$altStr lat=$latStr lon=$lonStr\n";
            }
            
            // Also check developer data fields for altitude
            // Search for any field with value that could be altitude
            // Check if any field numbers >= 80 or custom fields
            
            if ($rc > 50 && !$hasAlt) {
                static $warned = false;
                if (!$warned) { echo "... no altitude in first 50 records, stopping\n"; $warned = true; }
                break;
            }
        } elseif ($global == 18) { // session
            echo "SESSION: " . json_encode(array_filter($vals, fn($v)=>$v!==null)) . "\n";
        } elseif ($global == 19) { // lap
            static $lc = 0; $lc++;
            echo "LAP #$lc: fields=[" . implode(',', array_keys(array_filter($vals, fn($v)=>$v!==null))) . "]\n";
        } elseif ($global == 0) { // file_id
            echo "FILE_ID: " . json_encode($vals) . "\n";
        } else {
            // Print other message types
            $present = array_keys(array_filter($vals, fn($v)=>$v!==null));
            echo "{$def['name']}: fields=[$present]\n";
        }
    }
}

function decodeValue($raw, $type) {
    $len = strlen($raw);
    switch ($type) {
        case 0: return ord($raw); // enum
        case 1: $v = ord($raw); return $v >= 128 ? $v-256 : $v;
        case 2: return ord($raw);
        case 3: $v = unpack('v',$raw)[1]; return $v >= 32768 ? $v-65536 : $v;
        case 4: return unpack('v',$raw)[1];
        case 5: $v = unpack('V',$raw)[1]; return $v >= 2147483648 ? $v-4294967296 : $v;
        case 6: return unpack('V',$raw)[1];
        case 7: return rtrim($raw,"\0");
        case 8: return unpack('f',$raw)[1];
        case 9: return unpack('d',$raw)[1];
        default: return bin2hex($raw);
    }
}

function fieldName($gmsg, $fdef) {
    $names = [
        20 => [0=>'lat',1=>'lon',2=>'altitude',3=>'heart_rate',4=>'cadence',
               5=>'distance',6=>'speed',7=>'power',8=>'compressed_speed_distance',
               9=>'grade',10=>'resistance',11=>'cycle_length',12=>'temperature',
               13=>'temp2',14=>'speed_1s',15=>'cycles',16=>'total_cycles',
               17=>'compressed_accumulated_power',18=>'accumulated_power',19=>'timestamp',
               28=>'enhanced_speed',29=>'enhanced_altitude',
               73=>'enhanced_speed',78=>'enhanced_altitude',
               253=>'timestamp'],
        18 => [0=>'timestamp',1=>'start_time',2=>'start_position_lat',3=>'start_position_lon',
               4=>'end_position_lat',5=>'end_position_lon',6=>'total_elapsed_time',
               7=>'total_timer_time',8=>'total_distance',9=>'total_ascent',
               10=>'total_descent',11=>'total_calories',12=>'avg_speed',13=>'max_speed',
               14=>'avg_heart_rate',15=>'max_heart_rate',16=>'avg_cadence',17=>'max_cadence',
               18=>'avg_power',19=>'max_power',20=>'total_ascent_power',21=>'total_descent_power',
               22=>'total_ascent',23=>'total_descent',
               30=>'avg_altitude',31=>'max_altitude',32=>'min_altitude',
               253=>'timestamp'],
        19 => [0=>'timestamp',1=>'start_time',2=>'start_position_lat',3=>'start_position_lon',
               4=>'end_position_lat',5=>'end_position_lon',6=>'total_elapsed_time',
               7=>'total_timer_time',8=>'total_distance',9=>'total_ascent',
               10=>'total_descent',11=>'total_ascent',12=>'total_descent',
               13=>'total_calories',14=>'avg_speed',15=>'max_speed',
               16=>'avg_heart_rate',17=>'max_heart_rate',18=>'avg_cadence',
               19=>'max_cadence',20=>'avg_power',21=>'max_power',
               22=>'total_ascent_power',23=>'total_descent_power',
               253=>'timestamp'],
    ];
    return $names[$gmsg][$fdef] ?? "f$fdef";
}