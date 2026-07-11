<?php
define('FIT_EPOCH_OFFSET', 631065600);
define('FIT_SEMICIRCLES_TO_DEG', 180.0 / 2147483648.0);

define('FIT_MESG_FILE_ID', 0);
define('FIT_MESG_SESSION', 18);
define('FIT_MESG_LAP', 19);
define('FIT_MESG_RECORD', 20);

define('FIT_FIELD_LAT', 0);
define('FIT_FIELD_LON', 1);
define('FIT_FIELD_ALTITUDE', 2);
define('FIT_FIELD_HEART_RATE', 3);
define('FIT_FIELD_CADENCE', 4);
define('FIT_FIELD_DISTANCE', 5);
define('FIT_FIELD_SPEED', 6);
define('FIT_FIELD_POWER', 7);
define('FIT_FIELD_GRADE', 9);
define('FIT_FIELD_TEMP', 13);
define('FIT_FIELD_ENHANCED_SPEED', 73);
define('FIT_FIELD_ENHANCED_ALTITUDE', 78);
define('FIT_FIELD_TIMESTAMP', 253);

// Physics constants for power estimation (same as GPX in ruta.js)
define('FIT_MASS', 63);          // Total mass cyclist + bike (kg)
define('FIT_G', 9.81);           // Gravity (m/s²)
define('FIT_RHO_AIR', 1.208);    // Air density at ~20°C (kg/m³)
define('FIT_CDA', 0.42);         // Drag coefficient × frontal area (m²)
define('FIT_CRR', 0.018);        // Rolling resistance coefficient
define('FIT_DRIVETRAIN_LOSS', 0.05); // Drivetrain loss fraction

// Indoor (bicicleta estatica) estimation constants
define('FIT_INDOOR_GROSS_EFFICIENCY', 0.24); // Eficiencia mecanica bruta del ciclismo (~20-25%)
define('FIT_KCAL_TO_JOULES', 4184);          // 1 kcal = 4184 J
define('FIT_INDOOR_HR_REST_DEFAULT', 60);    // FC reposo por defecto si no hay datos
define('FIT_INDOOR_WATT_PER_HRR', 2.2);      // W por ppm sobre reposo (fallback sin calorias)

class FitParser
{
    private $data = '';
    private $dataLen = 0;
    private $offset = 0;
    private $definitions = [];
    private $records = [];
    private $session = null;
    private $lap = null;
    private $fileId = null;

    public function parse($filepath, $indoor = false)
    {
        if (!file_exists($filepath)) {
            throw new Exception("FIT file not found: $filepath");
        }
        $this->data = file_get_contents($filepath);
        $this->dataLen = strlen($this->data);
        if ($this->dataLen < 14) {
            throw new Exception("FIT file too small");
        }
        $this->parseHeader();
        $this->parseRecords();
        return $indoor ? $this->buildIndoorResult() : $this->buildResult();
    }

    // Devuelve el sub_sport de la sesion (ej: 6 = indoor_cycling) si esta disponible
    public function getSubSport()
    {
        return ($this->session && isset($this->session[6]) && $this->session[6] !== null)
            ? $this->session[6] : null;
    }

    private function readU8($o) { return ord($this->data[$o]); }
    private function readU16LE($o) { return unpack('v', substr($this->data, $o, 2))[1]; }
    private function readU32LE($o) { return unpack('V', substr($this->data, $o, 4))[1]; }
    private function readU16BE($o) { return unpack('n', substr($this->data, $o, 2))[1]; }
    private function readU32BE($o) { return unpack('N', substr($this->data, $o, 4))[1]; }

    private function parseHeader()
    {
        $headerSize = $this->readU8(0);
        $magic = substr($this->data, 8, 4);
        if ($magic !== '.FIT') {
            throw new Exception("Invalid FIT file");
        }
        $this->offset = $headerSize;
    }

    private function parseRecords()
    {
        while ($this->offset < $this->dataLen - 2) {
            $header = $this->readU8($this->offset);
            $this->offset++;

            if ($header & 0x80) {
                // Compressed timestamp DATA message (ALWAYS data, never definition)
                // bits 5-6: local message type (2 bits, 0-3)
                // bits 0-4: time offset (5 bits)
                // The timestamp field (field 253) is NOT in the data payload — it's encoded in the header.
                $localType = ($header >> 5) & 0x3;
                $this->parseDataMessage($localType, true);
                continue;
            }

            // Normal message (bit 7 = 0)
            $isDefinition = ($header >> 6) & 1;
            $isDevData = ($header >> 5) & 1;
            $localType = $header & 0x0F;

            if ($isDefinition) {
                $this->parseDefinitionMessage($localType, $isDevData);
            } else {
                $this->parseDataMessage($localType, false);
            }
        }
    }

    private function parseDefinitionMessage($localType, $isDevData = false)
    {
        $reserved = $this->readU8($this->offset); $this->offset++;
        $architecture = $this->readU8($this->offset); $this->offset++;
        $globalMsgNum = ($architecture == 0) ? $this->readU16LE($this->offset) : $this->readU16BE($this->offset);
        $this->offset += 2;
        $numFields = $this->readU8($this->offset); $this->offset++;

        $fields = [];
        $totalSize = 0;
        for ($i = 0; $i < $numFields; $i++) {
            $fNum = $this->readU8($this->offset);
            $fSize = $this->readU8($this->offset + 1);
            $fType = $this->readU8($this->offset + 2);
            $this->offset += 3;
            $fields[] = ['num' => $fNum, 'size' => $fSize, 'type' => $fType];
            $totalSize += $fSize;
        }

        // Developer field definitions (when is_developer_data flag is set in HEADER)
        // Each dev field definition: field_number(1) + size(1) + dev_data_index(1)
        if ($isDevData) {
            $numDev = $this->readU8($this->offset); $this->offset++;
            for ($i = 0; $i < $numDev; $i++) {
                $this->offset++; // skip field_number
                $devSize = $this->readU8($this->offset); $this->offset++; // read size
                $this->offset++; // skip dev_data_index
                $totalSize += $devSize;
            }
        }

        // Record timestamp field size for compressed timestamp messages
        $tsFieldSize = 0;
        foreach ($fields as $f) {
            if ($f['num'] === 253) {
                $tsFieldSize = $f['size'];
                break;
            }
        }

        $this->definitions[$localType] = [
            'arch' => $architecture,
            'global' => $globalMsgNum,
            'fields' => $fields,
            'totalSize' => $totalSize,
            'timestampFieldSize' => $tsFieldSize,
        ];
    }

    private function parseDataMessage($localType, $isCompressed = false)
    {
        if (!isset($this->definitions[$localType])) {
            // Can't recover without a definition — skip remaining data
            $this->offset = $this->dataLen;
            return;
        }
        $defn = $this->definitions[$localType];
        $dataSize = $defn['totalSize'];

        if ($isCompressed && isset($defn['timestampFieldSize'])) {
            $dataSize -= $defn['timestampFieldSize'];
        }

        $this->decodeAndStore($defn, $dataSize, $isCompressed);
    }

    private function decodeAndStore($defn, $byteCount, $isCompressed = false)
    {
        if ($this->offset + $byteCount > $this->dataLen) return;

        $arch = $defn['arch'];
        $globalMsgNum = $defn['global'];
        $savedOffset = $this->offset;

        $fieldValues = [];
        foreach ($defn['fields'] as $field) {
            // In compressed timestamp messages, field 253 (timestamp) is NOT in the data payload
            if ($isCompressed && $field['num'] === 253) {
                continue;
            }
            $rawBytes = substr($this->data, $this->offset, $field['size']);
            $this->offset += $field['size'];
            $fieldValues[$field['num']] = $this->decodeField($rawBytes, $field['type'], $arch);
        }

        // Ensure we consumed exactly byteCount bytes
        $this->offset = $savedOffset + $byteCount;

        switch ($globalMsgNum) {
            case FIT_MESG_FILE_ID: $this->fileId = $fieldValues; break;
            case FIT_MESG_RECORD: $this->records[] = $fieldValues; break;
            case FIT_MESG_SESSION: $this->session = $fieldValues; break;
            case FIT_MESG_LAP: $this->lap = $fieldValues; break;
        }
    }

    private function decodeField($raw, $baseType, $arch)
    {
        $size = strlen($raw);
        if ($size === 0) return null;

        switch ($baseType) {
            case 0x00: // enum
                $v = ord($raw[0]); return ($v == 0xFF || $size < 1) ? null : $v;
            case 0x01: // sint8
                $v = unpack('c', $raw[0])[1]; return ($v == 0x7F) ? null : $v;
            case 0x02: // uint8
                $v = ord($raw[0]); return ($v == 0xFF || $size < 1) ? null : $v;
            case 0x0A: // uint8z
                $v = ord($raw[0]); return ($v == 0x00 || $size < 1) ? null : $v;
            case 0x07: // string
                return rtrim($raw, "\0");
            case 0x0B: // byte
                return $raw;
            case 0x83: // sint16
                $v = ($arch == 0) ? unpack('v', $raw)[1] : unpack('n', $raw)[1];
                if ($v >= 0x8000) $v -= 0x10000;
                return ($v == 0x7FFF || $size < 2) ? null : $v;
            case 0x84: // uint16
                $v = ($arch == 0) ? unpack('v', $raw)[1] : unpack('n', $raw)[1];
                return ($v == 0xFFFF || $size < 2) ? null : $v;
            case 0x85: // sint32
                $v = ($arch == 0) ? unpack('V', $raw)[1] : unpack('N', $raw)[1];
                if ($v >= 0x80000000) $v -= 0x100000000;
                return ($v == 0x7FFFFFFF || $size < 4) ? null : $v;
            case 0x86: // uint32
                $v = ($arch == 0) ? unpack('V', $raw)[1] : unpack('N', $raw)[1];
                return ($v == 0xFFFFFFFF || $size < 4) ? null : $v;
            case 0x88: // float32
                if ($size < 4) return null;
                $v = ($arch == 0) ? unpack('f', $raw)[1] : unpack('f', strrev($raw))[1];
                return is_finite($v) ? $v : null;
            case 0x89: // float64
                if ($size < 8) return null;
                $v = ($arch == 0) ? unpack('d', $raw)[1] : unpack('d', strrev($raw))[1];
                return is_finite($v) ? $v : null;
            case 0x8C: // uint16z
                $v = ($arch == 0) ? unpack('v', $raw)[1] : unpack('n', $raw)[1];
                return ($v == 0x0000 || $size < 2) ? null : $v;
            case 0x8D: // uint32z
                $v = ($arch == 0) ? unpack('V', $raw)[1] : unpack('N', $raw)[1];
                return ($v == 0x00000000 || $size < 4) ? null : $v;
            default:
                return null;
        }
    }

    private function buildResult()
    {
        if (empty($this->records)) {
            throw new Exception("No record messages found in FIT file");
        }

        $trackPoints = [];
        $hrValues = [];
        $latValues = [];
        $lonValues = [];
        $speedValues = [];
        $altValues = [];
        $powerValues = [];
        $cadenceValues = [];
        $tempValues = [];
        $timestamps = [];
        $distValues = [];

        $totalDist = 0;
        $prevLat = null;
        $prevLon = null;
        $prevAlt = null;
        $totalTimeMoving = 0;
        $ascent = 0;
        $descent = 0;
        $maxAlt = 0;
        $distSubida = 0;
        $distBajada = 0;
        $distPlano = 0;
        $tiempoSubida = 0;
        $tiempoBajada = 0;
        $tiempoPlano = 0;
        $totalPowerSec = 0;
        $maxSpeed = 0;
        $prevTs = null;

        foreach ($this->records as $rec) {
            $ts = null;
            if (isset($rec[FIT_FIELD_TIMESTAMP]) && $rec[FIT_FIELD_TIMESTAMP] !== null) {
                $ts = $rec[FIT_FIELD_TIMESTAMP] + FIT_EPOCH_OFFSET;
                $timestamps[] = $ts;
            }

            $lat = null;
            $lon = null;
            if (isset($rec[FIT_FIELD_LAT], $rec[FIT_FIELD_LON]) && $rec[FIT_FIELD_LAT] !== null && $rec[FIT_FIELD_LON] !== null) {
                $lat = $rec[FIT_FIELD_LAT] * FIT_SEMICIRCLES_TO_DEG;
                $lon = $rec[FIT_FIELD_LON] * FIT_SEMICIRCLES_TO_DEG;
                if ($lat != 0 && $lon != 0) {
                    $latValues[] = $lat;
                    $lonValues[] = $lon;
                } else {
                    $lat = null;
                    $lon = null;
                }
            }

            $hr = null;
            if (isset($rec[FIT_FIELD_HEART_RATE]) && $rec[FIT_FIELD_HEART_RATE] !== null) {
                $hr = $rec[FIT_FIELD_HEART_RATE];
                $hrValues[] = $hr;
            }

            $alt = null;
            if (isset($rec[FIT_FIELD_ENHANCED_ALTITUDE]) && $rec[FIT_FIELD_ENHANCED_ALTITUDE] !== null) {
                $alt = $rec[FIT_FIELD_ENHANCED_ALTITUDE] / 5.0 - 500;
            } elseif (isset($rec[FIT_FIELD_ALTITUDE]) && $rec[FIT_FIELD_ALTITUDE] !== null) {
                $alt = $rec[FIT_FIELD_ALTITUDE] / 5.0 - 500;
            }
            if ($alt !== null) {
                $altValues[] = $alt;
                if ($alt > $maxAlt) $maxAlt = $alt;
            }

            $speed = null;
            if (isset($rec[FIT_FIELD_ENHANCED_SPEED]) && $rec[FIT_FIELD_ENHANCED_SPEED] !== null) {
                $speed = $rec[FIT_FIELD_ENHANCED_SPEED] / 1000.0;
            } elseif (isset($rec[FIT_FIELD_SPEED]) && $rec[FIT_FIELD_SPEED] !== null) {
                $speed = $rec[FIT_FIELD_SPEED] / 1000.0;
            }
            if ($speed !== null) {
                $speedValues[] = $speed;
                if ($speed > $maxSpeed) $maxSpeed = $speed;
            }

            $dist = null;
            if (isset($rec[FIT_FIELD_DISTANCE]) && $rec[FIT_FIELD_DISTANCE] !== null) {
                $dist = $rec[FIT_FIELD_DISTANCE] / 100.0;
                $distValues[] = $dist;
            }

            $power = null;
            if (isset($rec[FIT_FIELD_POWER]) && $rec[FIT_FIELD_POWER] !== null) {
                $power = $rec[FIT_FIELD_POWER];
                $powerValues[] = $power;
            }

            $cadence = null;
            if (isset($rec[FIT_FIELD_CADENCE]) && $rec[FIT_FIELD_CADENCE] !== null) {
                $cadence = $rec[FIT_FIELD_CADENCE];
                $cadenceValues[] = $cadence;
            }

            $temp = null;
            if (isset($rec[FIT_FIELD_TEMP]) && $rec[FIT_FIELD_TEMP] !== null) {
                $temp = $rec[FIT_FIELD_TEMP];
                $tempValues[] = $temp;
            }

            if ($prevLat !== null && $prevLon !== null && $lat !== null && $lon !== null) {
                $d = $this->haversine($prevLat, $prevLon, $lat, $lon);
                $totalDist += $d;

                $dt = ($ts !== null && $prevTs !== null) ? $ts - $prevTs : 1;
                if ($dt <= 0) $dt = 1;

                $sp = ($speed !== null) ? $speed : ($dt > 0 ? $d / $dt : 0);
                if ($sp > 0.2778) $totalTimeMoving += $dt;

                $dAlt = null;
                if ($prevAlt !== null && $alt !== null) {
                    $dAlt = $alt - $prevAlt;
                    if ($dAlt > 0) { $ascent += $dAlt; $distSubida += $d; $tiempoSubida += max(0, $dt); }
                    elseif ($dAlt < 0) { $descent += abs($dAlt); $distBajada += $d; $tiempoBajada += max(0, $dt); }
                    else { $distPlano += $d; $tiempoPlano += max(0, $dt); }
                } else {
                    $distPlano += $d;
                    $tiempoPlano += max(0, $dt);
                }

                // Estimate power from physics if no real sensor data (same as GPX)
                if ($power === null && $dt > 0 && $sp > 0 && $d > 0) {
                    $v = $sp;
                    $slope = ($dAlt !== null && $d > 0) ? $dAlt / $d : 0;
                    $PAero = 0.5 * FIT_RHO_AIR * FIT_CDA * pow($v, 3);
                    $PGrav = FIT_MASS * FIT_G * $v * $slope;
                    $PRoll = FIT_MASS * FIT_G * FIT_CRR * $v;
                    $estimatedPower = ($PAero + $PGrav + $PRoll) / (1 - FIT_DRIVETRAIN_LOSS);
                    $speedKmh = $v * 3.6;
                    $slopePct = $slope * 100;
                    if ($slopePct < -8 && $speedKmh > 5 && $speedKmh < 25) {
                        $estimatedPower = max(50, $estimatedPower);
                    }
                    $power = round(max(0, $estimatedPower));
                    $powerValues[] = $power;
                }

                if ($power !== null && $dt > 0) $totalPowerSec += $power * $dt;
            }

            if ($lat !== null && $lon !== null) {
                $tp = ['lat' => round($lat, 6), 'lon' => round($lon, 6)];
                if ($alt !== null) $tp['ele'] = round($alt, 1);
                if ($ts !== null) $tp['time'] = date('c', $ts);
                if ($hr !== null) $tp['hr'] = $hr;
                if ($speed !== null) $tp['speed'] = round($speed * 3.6, 1);
                if ($cadence !== null) $tp['cad'] = $cadence;
                if ($power !== null) $tp['power'] = $power;
                $trackPoints[] = $tp;
            }

            $prevLat = $lat;
            $prevLon = $lon;
            $prevAlt = $alt;
            $prevTs = $ts;
        }

        // Session data - FIT session field numbers may vary by device/profile
        // Standard: field 5=distance, 7=elapsed_time, 8=timer_time, 9=ascent, 10=descent
        // Some devices (Amazfit etc) use different numbering. We try standard first,
        // then fall back to computed values from track points if values look wrong.
        $sessionDist = $sessionAscent = $sessionDescent = $sessionCalories = null;
        $sessionAvgHr = $sessionMaxHr = $sessionTotalTime = $sessionTimerTime = null;
        if ($this->session) {
            $s = $this->session;
            if (isset($s[7]) && $s[7] !== null) $sessionTotalTime = $s[7] / 1000.0;
            if (isset($s[8]) && $s[8] !== null) $sessionTimerTime = $s[8] / 1000.0;
            if (isset($s[5]) && $s[5] !== null) $sessionDist = $s[5] / 100000.0;
            if (isset($s[11]) && $s[11] !== null) $sessionCalories = $s[11];
            if (isset($s[16]) && $s[16] !== null) $sessionAvgHr = $s[16];
            if (isset($s[17]) && $s[17] !== null) $sessionMaxHr = $s[17];

            // Ascent/descent: try standard fields 9/10, validate range
            if (isset($s[9]) && $s[9] !== null && $s[9] > 0 && $s[9] < 10000) $sessionAscent = $s[9];
            if (isset($s[10]) && $s[10] !== null && $s[10] > 0 && $s[10] < 10000) $sessionDescent = $s[10];

            // If standard fields gave unreasonable values, try alternative field numbers
            if ($sessionAscent === null || $sessionAscent > 10000) {
                if (isset($s[22]) && $s[22] !== null && $s[22] > 0 && $s[22] < 10000) $sessionAscent = $s[22];
            }
            if ($sessionDescent === null || $sessionDescent > 10000) {
                if (isset($s[23]) && $s[23] !== null && $s[23] > 0 && $s[23] < 10000) $sessionDescent = $s[23];
            }
        }

        $kms = !empty($distValues) ? round(end($distValues) / 1000.0, 3) : round($totalDist / 1000.0, 3);
        if ($sessionDist !== null && $kms == 0) $kms = round($sessionDist, 3);

        $finalAscent = ($sessionAscent !== null) ? (int)$sessionAscent : round($ascent);
        $finalDescent = ($sessionDescent !== null) ? (int)$sessionDescent : round($descent);
        $finalMaxAlt = round($maxAlt);

        $duration = (!empty($timestamps)) ? end($timestamps) - $timestamps[0] : 0;
        if ($sessionTotalTime !== null) $duration = (int)$sessionTotalTime;
        $timerTime = ($sessionTimerTime !== null) ? (int)$sessionTimerTime : (int)$totalTimeMoving;

        $tiempoTotal = $this->formatDuration($duration);
        $tiempoMovimiento = $this->formatDuration($timerTime);
        $velMedia = ($timerTime > 0) ? round(($kms * 1000 / $timerTime) * 3.6, 1) : 0;
        $velMaxima = round($maxSpeed * 3.6, 1);
        $avgPower = (!empty($powerValues) && $duration > 0) ? round($totalPowerSec / $duration) : 0;
        $calorias = ($sessionCalories !== null) ? (int)$sessionCalories : 0;

        $totalFlatDist = $distSubida + $distBajada + $distPlano;
        $pctSubida = ($totalFlatDist > 0) ? round(($distSubida / $totalFlatDist) * 100) : 0;
        $pctBajada = ($totalFlatDist > 0) ? round(($distBajada / $totalFlatDist) * 100) : 0;
        $pctPlano = max(0, 100 - $pctSubida - $pctBajada);

        $fechaInicio = (!empty($timestamps)) ? date('c', $timestamps[0]) : null;
        $fechaFin = (!empty($timestamps)) ? date('c', end($timestamps)) : null;

        $avgHr = (!empty($hrValues)) ? round(array_sum($hrValues) / count($hrValues)) : null;
        $maxHr = (!empty($hrValues)) ? max($hrValues) : null;
        if ($sessionAvgHr !== null) $avgHr = (int)$sessionAvgHr;
        if ($sessionMaxHr !== null) $maxHr = (int)$sessionMaxHr;

        // Build pulsaciones for DB
        $pulsaciones = [];
        $cumDist = 0;
        $prevLat2 = null;
        $prevLon2 = null;
        $prevTs2 = null;
        $prevAlt2 = null;
        foreach ($this->records as $rec) {
            $lat2 = $lon2 = $hr2 = $ts2 = $cad2 = $pwr2 = $tmp2 = $alt2 = $spd2 = null;
            $ts2_unix = null;

            if (isset($rec[FIT_FIELD_LAT], $rec[FIT_FIELD_LON]) && $rec[FIT_FIELD_LAT] !== null && $rec[FIT_FIELD_LON] !== null) {
                $lat2 = $rec[FIT_FIELD_LAT] * FIT_SEMICIRCLES_TO_DEG;
                $lon2 = $rec[FIT_FIELD_LON] * FIT_SEMICIRCLES_TO_DEG;
                if ($lat2 == 0 && $lon2 == 0) { $lat2 = $lon2 = null; }
            }
            if (isset($rec[FIT_FIELD_HEART_RATE]) && $rec[FIT_FIELD_HEART_RATE] !== null) $hr2 = $rec[FIT_FIELD_HEART_RATE];
            if (isset($rec[FIT_FIELD_TIMESTAMP]) && $rec[FIT_FIELD_TIMESTAMP] !== null) {
                $ts2_unix = $rec[FIT_FIELD_TIMESTAMP] + FIT_EPOCH_OFFSET;
                $ts2 = date('c', $ts2_unix);
            }
            if (isset($rec[FIT_FIELD_CADENCE]) && $rec[FIT_FIELD_CADENCE] !== null) $cad2 = $rec[FIT_FIELD_CADENCE];
            if (isset($rec[FIT_FIELD_POWER]) && $rec[FIT_FIELD_POWER] !== null) $pwr2 = $rec[FIT_FIELD_POWER];
            if (isset($rec[FIT_FIELD_TEMP]) && $rec[FIT_FIELD_TEMP] !== null) $tmp2 = $rec[FIT_FIELD_TEMP];
            if (isset($rec[FIT_FIELD_ENHANCED_ALTITUDE]) && $rec[FIT_FIELD_ENHANCED_ALTITUDE] !== null) $alt2 = $rec[FIT_FIELD_ENHANCED_ALTITUDE] / 5.0 - 500;
            elseif (isset($rec[FIT_FIELD_ALTITUDE]) && $rec[FIT_FIELD_ALTITUDE] !== null) $alt2 = $rec[FIT_FIELD_ALTITUDE] / 5.0 - 500;
            if (isset($rec[FIT_FIELD_ENHANCED_SPEED]) && $rec[FIT_FIELD_ENHANCED_SPEED] !== null) $spd2 = ($rec[FIT_FIELD_ENHANCED_SPEED] / 1000.0) * 3.6;
            elseif (isset($rec[FIT_FIELD_SPEED]) && $rec[FIT_FIELD_SPEED] !== null) $spd2 = ($rec[FIT_FIELD_SPEED] / 1000.0) * 3.6;

            $d = 0;
            $dt = 1;
            if ($prevLat2 !== null && $lat2 !== null && $prevLon2 !== null && $lon2 !== null) {
                $d = $this->haversine($prevLat2, $prevLon2, $lat2, $lon2);
                $cumDist += $d;
                if ($ts2_unix !== null && $prevTs2 !== null) {
                    $dt = $ts2_unix - $prevTs2;
                    if ($dt <= 0) $dt = 1;
                }
            }

            // Estimate power if no real sensor data (same as first loop)
            if ($pwr2 === null && $dt > 0 && $d > 0) {
                $spd_ms = $spd2 !== null ? $spd2 / 3.6 : $d / $dt;
                if ($spd_ms > 0) {
                    $dAlt2 = ($prevAlt2 !== null && $alt2 !== null) ? $alt2 - $prevAlt2 : 0;
                    $slope = $d > 0 ? $dAlt2 / $d : 0;
                    $v = $spd_ms;
                    $PAero = 0.5 * FIT_RHO_AIR * FIT_CDA * pow($v, 3);
                    $PGrav = FIT_MASS * FIT_G * $v * $slope;
                    $PRoll = FIT_MASS * FIT_G * FIT_CRR * $v;
                    $estimatedPower = ($PAero + $PGrav + $PRoll) / (1 - FIT_DRIVETRAIN_LOSS);
                    $speedKmh = $v * 3.6;
                    $slopePct = $slope * 100;
                    if ($slopePct < -8 && $speedKmh > 5 && $speedKmh < 25) {
                        $estimatedPower = max(50, $estimatedPower);
                    }
                    $pwr2 = round(max(0, $estimatedPower));
                }
            }

            $pulsaciones[] = [
                'kilometro' => round($cumDist / 1000.0, 3),
                'lat' => $lat2,
                'lon' => $lon2,
                'pulsaciones' => $hr2,
                'cadencia' => $cad2,
                'potencia' => $pwr2,
                'temperatura' => $tmp2,
                'altitud' => $alt2 !== null ? round($alt2, 1) : null,
                'velocidad' => $spd2 !== null ? round($spd2, 1) : null,
                'timestamp_fit' => $ts2,
            ];
            $prevLat2 = $lat2;
            $prevLon2 = $lon2;
            $prevTs2 = $ts2_unix;
            $prevAlt2 = $alt2;
        }

        return [
            'fecha_inicio' => $fechaInicio,
            'fecha_fin' => $fechaFin,
            'tiempo_total' => $tiempoTotal,
            'tiempo_movimiento' => $tiempoMovimiento,
            'kms' => $kms,
            'metros_ascenso' => $finalAscent,
            'metros_descenso' => $finalDescent,
            'altitud_maxima' => $finalMaxAlt,
            'velocidad_media' => $velMedia,
            'velocidad_maxima' => $velMaxima,
            'potencia_promedio_w' => $avgPower,
            'calorias' => $calorias,
            'pct_subida' => $pctSubida,
            'pct_plano' => $pctPlano,
            'pct_bajada' => $pctBajada,
            'tiempo_subida' => $this->formatDuration((int)$tiempoSubida),
            'tiempo_plano' => $this->formatDuration((int)$tiempoPlano),
            'tiempo_bajada' => $this->formatDuration((int)$tiempoBajada),
            'frecuencia_cardiaca_promedio' => $avgHr,
            'frecuencia_cardiaca_maxima' => $maxHr,
            'track_points' => $trackPoints,
            'pulsaciones' => $pulsaciones,
        ];
    }

    /**
     * Analisis para bicicleta estatica (indoor).
     * No hay GPS/velocidad/distancia reales: se estiman a partir de la
     * frecuencia cardiaca, las calorias y el tiempo del ejercicio.
     *
     * Modelo:
     *  1. Potencia media mecanica estimada desde calorias:
     *       P_media = (kcal * 4184 * eficiencia) / tiempo_total
     *     (fallback a FC si no hay calorias)
     *  2. Curva de potencia por segundo ponderada por la reserva de FC
     *     (FC - FC_reposo). Los tramos sin senal (corte) se rellenan con la
     *     reserva media, de modo que la distancia sigue acumulando en todo
     *     el ejercicio.
     *  3. Velocidad virtual en llano resolviendo la fisica: P = f(v).
     *  4. Distancia = integral de v * dt.
     */
    private function buildIndoorResult()
    {
        if (empty($this->records)) {
            throw new Exception("No record messages found in FIT file");
        }

        // 1. Recolectar registros (timestamp, FC, cadencia)
        $recs = [];
        $timestamps = [];
        $hrValues = [];
        foreach ($this->records as $rec) {
            $ts = (isset($rec[FIT_FIELD_TIMESTAMP]) && $rec[FIT_FIELD_TIMESTAMP] !== null)
                ? $rec[FIT_FIELD_TIMESTAMP] + FIT_EPOCH_OFFSET : null;
            $hr = (isset($rec[FIT_FIELD_HEART_RATE]) && $rec[FIT_FIELD_HEART_RATE] !== null)
                ? $rec[FIT_FIELD_HEART_RATE] : null;
            $cad = (isset($rec[FIT_FIELD_CADENCE]) && $rec[FIT_FIELD_CADENCE] !== null)
                ? $rec[FIT_FIELD_CADENCE] : null;
            if ($ts !== null) $timestamps[] = $ts;
            if ($hr !== null) $hrValues[] = $hr;
            $recs[] = ['ts' => $ts, 'hr' => $hr, 'cad' => $cad];
        }

        // 2. Datos de sesion (calorias, tiempos, FC)
        $sessionCalories = $sessionTotalTime = $sessionTimerTime = null;
        $sessionAvgHr = $sessionMaxHr = null;
        if ($this->session) {
            $s = $this->session;
            if (isset($s[7]) && $s[7] !== null) $sessionTotalTime = $s[7] / 1000.0;
            if (isset($s[8]) && $s[8] !== null) $sessionTimerTime = $s[8] / 1000.0;
            if (isset($s[11]) && $s[11] !== null) $sessionCalories = $s[11];
            if (isset($s[16]) && $s[16] !== null) $sessionAvgHr = $s[16];
            if (isset($s[17]) && $s[17] !== null) $sessionMaxHr = $s[17];
        }

        // 3. Tiempo total del ejercicio (elapsed)
        $startTs = !empty($timestamps) ? $timestamps[0] : null;
        $endTs = !empty($timestamps) ? end($timestamps) : null;
        $elapsed = ($startTs !== null && $endTs !== null) ? ($endTs - $startTs) : 0;
        if ($sessionTotalTime !== null && $sessionTotalTime > 0) $elapsed = (int) $sessionTotalTime;
        if ($elapsed <= 0) $elapsed = max(1, count($recs));
        $timerTime = ($sessionTimerTime !== null && $sessionTimerTime > 0) ? (int) $sessionTimerTime : $elapsed;

        // 4. FC reposo, media y maxima
        $avgHr = (!empty($hrValues)) ? round(array_sum($hrValues) / count($hrValues)) : null;
        $maxHr = (!empty($hrValues)) ? max($hrValues) : null;
        if ($sessionAvgHr !== null) $avgHr = (int) $sessionAvgHr;
        if ($sessionMaxHr !== null) $maxHr = (int) $sessionMaxHr;
        $hrRest = (!empty($hrValues)) ? min($hrValues) : FIT_INDOOR_HR_REST_DEFAULT;
        $hrRest = max(40, min(90, (int) $hrRest));

        // 5. Potencia media mecanica estimada
        $calorias = ($sessionCalories !== null) ? (int) $sessionCalories : 0;
        $avgPower = 0;
        if ($calorias > 0 && $elapsed > 0) {
            $mechWork = $calorias * FIT_KCAL_TO_JOULES * FIT_INDOOR_GROSS_EFFICIENCY;
            $avgPower = $mechWork / $elapsed;
        } elseif ($avgHr !== null) {
            // Fallback: sin calorias, estimar desde la reserva media de FC
            $avgPower = max(0, ($avgHr - $hrRest)) * FIT_INDOOR_WATT_PER_HRR;
        }

        // 6. Reserva de FC por registro (relleno de cortes de senal con la media)
        $reserveByRec = [];
        $reserveSamples = [];
        foreach ($recs as $r) {
            if ($r['hr'] !== null) {
                $res = max(0, $r['hr'] - $hrRest);
                $reserveByRec[] = $res;
                $reserveSamples[] = $res;
            } else {
                $reserveByRec[] = null; // se rellena despues
            }
        }
        $avgReserve = (!empty($reserveSamples)) ? array_sum($reserveSamples) / count($reserveSamples) : 0;
        foreach ($reserveByRec as $i => $res) {
            if ($res === null) $reserveByRec[$i] = $avgReserve;
        }

        // 7. dt por registro
        $dts = [];
        $n = count($recs);
        for ($i = 0; $i < $n; $i++) {
            $dt = 1;
            if ($i < $n - 1 && $recs[$i]['ts'] !== null && $recs[$i + 1]['ts'] !== null) {
                $dt = $recs[$i + 1]['ts'] - $recs[$i]['ts'];
                if ($dt <= 0 || $dt > 60) $dt = 1;
            }
            $dts[] = $dt;
        }

        // 8. Factor de escala para que la media de potencia = avgPower
        $weightedReserve = 0;
        for ($i = 0; $i < $n; $i++) $weightedReserve += $reserveByRec[$i] * $dts[$i];
        $useHrCurve = ($weightedReserve > 0 && $avgPower > 0);
        $k = $useHrCurve ? ($avgPower * $elapsed) / $weightedReserve : 0;

        // 9. Integrar velocidad -> distancia y construir pulsaciones
        $pulsaciones = [];
        $cumDistM = 0;
        $maxSpeedMs = 0;
        for ($i = 0; $i < $n; $i++) {
            $powerI = $useHrCurve ? ($k * $reserveByRec[$i]) : $avgPower;
            $vMs = $this->solveFlatSpeed($powerI);
            $cumDistM += $vMs * $dts[$i];
            if ($vMs > $maxSpeedMs) $maxSpeedMs = $vMs;

            $tsIso = ($recs[$i]['ts'] !== null) ? date('c', $recs[$i]['ts']) : null;
            $pulsaciones[] = [
                'kilometro' => round($cumDistM / 1000.0, 3),
                'lat' => null,
                'lon' => null,
                'pulsaciones' => $recs[$i]['hr'],
                'cadencia' => $recs[$i]['cad'],
                'potencia' => round(max(0, $powerI)),
                'temperatura' => null,
                'altitud' => null,
                'velocidad' => round($vMs * 3.6, 1),
                'timestamp_fit' => $tsIso,
            ];
        }

        $kms = round($cumDistM / 1000.0, 3);
        $velMedia = ($elapsed > 0) ? round(($cumDistM / $elapsed) * 3.6, 1) : 0;
        $velMaxima = round($maxSpeedMs * 3.6, 1);

        $fechaInicio = ($startTs !== null) ? date('c', $startTs) : null;
        $fechaFin = ($endTs !== null) ? date('c', $endTs) : null;

        return [
            'fecha_inicio' => $fechaInicio,
            'fecha_fin' => $fechaFin,
            'tiempo_total' => $this->formatDuration((int) $elapsed),
            'tiempo_movimiento' => $this->formatDuration((int) $timerTime),
            'kms' => $kms,
            'metros_ascenso' => 0,
            'metros_descenso' => 0,
            'altitud_maxima' => 0,
            'velocidad_media' => $velMedia,
            'velocidad_maxima' => $velMaxima,
            'potencia_promedio_w' => round($avgPower),
            'calorias' => $calorias,
            'pct_subida' => 0,
            'pct_plano' => 100,
            'pct_bajada' => 0,
            'tiempo_subida' => $this->formatDuration(0),
            'tiempo_plano' => $this->formatDuration((int) $elapsed),
            'tiempo_bajada' => $this->formatDuration(0),
            'frecuencia_cardiaca_promedio' => $avgHr,
            'frecuencia_cardiaca_maxima' => $maxHr,
            'track_points' => [],
            'pulsaciones' => $pulsaciones,
            'indoor' => true,
            'categoria' => 'estatica',
            'estimado' => 1,
        ];
    }

    /**
     * Resuelve la velocidad en llano (m/s) para una potencia dada usando el
     * modelo fisico (aero + rodadura), mediante biseccion.
     */
    private function solveFlatSpeed($power)
    {
        if ($power <= 0) return 0.0;
        $target = $power * (1 - FIT_DRIVETRAIN_LOSS);
        $lo = 0.0;
        $hi = 25.0; // 90 km/h tope teorico
        for ($i = 0; $i < 40; $i++) {
            $mid = ($lo + $hi) / 2;
            $f = 0.5 * FIT_RHO_AIR * FIT_CDA * $mid * $mid * $mid + FIT_MASS * FIT_G * FIT_CRR * $mid;
            if ($f < $target) $lo = $mid; else $hi = $mid;
        }
        return ($lo + $hi) / 2;
    }

    private function haversine($lat1, $lon1, $lat2, $lon2)
    {
        $R = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat/2)*sin($dLat/2) + cos(deg2rad($lat1))*cos(deg2rad($lat2))*sin($dLon/2)*sin($dLon/2);
        return $R * 2 * atan2(sqrt($a), sqrt(1-$a));
    }

    private function formatDuration($seconds)
    {
        $h = floor($seconds / 3600);
        $m = floor(($seconds % 3600) / 60);
        $s = $seconds % 60;
        return sprintf('%02d:%02d:%02d', $h, $m, $s);
    }
}
