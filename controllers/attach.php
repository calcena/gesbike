<?php
$root = dirname(__DIR__);
require_once $root . '/helpers/helper.php';
require_once $root . '/models/attach.php';

header('Content-Type: application/json');

/**
 * Comprime una imagen para que no exceda el tamaño máximo especificado (200KB por defecto)
 * 
 * @param string $sourcePath Ruta de la imagen original
 * @param string $targetPath Ruta donde guardar la imagen comprimida
 * @param int $maxSizeKB Tamaño máximo en KB (default: 200)
 * @return bool True si la compresión fue exitosa
 */
function compressImage($sourcePath, $targetPath, $maxSizeKB = 200) {
    $maxSizeBytes = $maxSizeKB * 1024;
    
    // Obtener información de la imagen
    $info = getimagesize($sourcePath);
    if ($info === false) {
        return false;
    }
    
    $mime = $info['mime'];
    
    // Crear imagen según el tipo
    switch ($mime) {
        case 'image/jpeg':
            $image = imagecreatefromjpeg($sourcePath);
            break;
        case 'image/png':
            $image = imagecreatefrompng($sourcePath);
            // Preservar transparencia para PNG
            imagealphablending($image, false);
            imagesavealpha($image, true);
            break;
        case 'image/gif':
            $image = imagecreatefromgif($sourcePath);
            break;
        case 'image/webp':
            $image = imagecreatefromwebp($sourcePath);
            break;
        default:
            return false;
    }
    
    if (!$image) {
        return false;
    }
    
    // Corregir orientación EXIF (solo JPEG)
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $exif = @exif_read_data($sourcePath);
        if (!empty($exif['Orientation'])) {
            switch ($exif['Orientation']) {
                case 2: imageflip($image, IMG_FLIP_HORIZONTAL); break;
                case 3: $image = imagerotate($image, 180, 0); break;
                case 4: imageflip($image, IMG_FLIP_VERTICAL); break;
                case 5: $image = imagerotate($image, -90, 0); imageflip($image, IMG_FLIP_HORIZONTAL); break;
                case 6: $image = imagerotate($image, -90, 0); break;
                case 7: $image = imagerotate($image, 90, 0); imageflip($image, IMG_FLIP_HORIZONTAL); break;
                case 8: $image = imagerotate($image, 90, 0); break;
            }
        }
    }
    
    // Obtener dimensiones originales
    $width = imagesx($image);
    $height = imagesy($image);
    
    // Calcular nuevo tamaño manteniendo ratio (máximo 1920px en el lado mayor)
    $maxDimension = 1920;
    if ($width > $maxDimension || $height > $maxDimension) {
        if ($width > $height) {
            $newWidth = $maxDimension;
            $newHeight = intval($height * $maxDimension / $width);
        } else {
            $newHeight = $maxDimension;
            $newWidth = intval($width * $maxDimension / $height);
        }
        
        // Redimensionar
        $resized = imagecreatetruecolor($newWidth, $newHeight);
        $white = imagecolorallocate($resized, 255, 255, 255);
        imagefill($resized, 0, 0, $white);
        
        imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
        imagedestroy($image);
        $image = $resized;
    }
    
    // Intentar diferentes niveles de calidad hasta obtener el tamaño deseado
    $quality = 90;
    $tempFile = $targetPath . '.temp';
    
    do {
        // Guardar imagen comprimida temporalmente
        switch ($mime) {
            case 'image/jpeg':
                imagejpeg($image, $tempFile, $quality);
                break;
            case 'image/png':
                // PNG usa compresión 0-9 (donde 9 es máxima compresión)
                $pngCompression = intval((100 - $quality) / 11);
                imagepng($image, $tempFile, $pngCompression);
                break;
            case 'image/gif':
                imagegif($image, $tempFile);
                break;
            case 'image/webp':
                imagewebp($image, $tempFile, $quality);
                break;
        }
        
        $fileSize = filesize($tempFile);
        
        // Si el archivo es menor que el máximo, moverlo y salir
        if ($fileSize <= $maxSizeBytes || $quality <= 30) {
            rename($tempFile, $targetPath);
            imagedestroy($image);
            return true;
        }
        
        // Reducir calidad y reintentar
        $quality -= 10;
        
    } while ($quality >= 30);
    
    // Si llegamos aquí, incluso con calidad 30 sigue siendo muy grande
    // Intentar redimensionar más
    $width = imagesx($image);
    $height = imagesy($image);
    $scaleFactor = 0.8;
    
    do {
        $newWidth = intval($width * $scaleFactor);
        $newHeight = intval($height * $scaleFactor);
        
        $resized = imagecreatetruecolor($newWidth, $newHeight);
        $white = imagecolorallocate($resized, 255, 255, 255);
        imagefill($resized, 0, 0, $white);
        
        imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
        
        switch ($mime) {
            case 'image/jpeg':
                imagejpeg($resized, $tempFile, 70);
                break;
            case 'image/png':
                imagepng($resized, $tempFile, 6);
                break;
            case 'image/gif':
                imagegif($resized, $tempFile);
                break;
            case 'image/webp':
                imagewebp($resized, $tempFile, 70);
                break;
        }
        
        $fileSize = filesize($tempFile);
        
        if ($fileSize <= $maxSizeBytes || $scaleFactor <= 0.3) {
            rename($tempFile, $targetPath);
            imagedestroy($image);
            imagedestroy($resized);
            return true;
        }
        
        imagedestroy($resized);
        $scaleFactor -= 0.1;
        
    } while ($scaleFactor >= 0.3);
    
    // Último recurso: forzar calidad mínima
    switch ($mime) {
        case 'image/jpeg':
            imagejpeg($image, $targetPath, 60);
            break;
        case 'image/png':
            imagepng($image, $targetPath, 9);
            break;
        case 'image/gif':
            imagegif($image, $targetPath);
            break;
        case 'image/webp':
            imagewebp($image, $targetPath, 60);
            break;
    }
    
    imagedestroy($image);
    @unlink($tempFile);
    
    return file_exists($targetPath) && filesize($targetPath) <= $maxSizeBytes * 1.5; // Permitir hasta 300KB como último recurso
}

/**
 * Genera un thumbnail (100px lado mayor) a partir de una imagen comprimida
 */
function generateThumbnail($sourcePath, $thumbPath, $maxDim = 100) {
    $info = getimagesize($sourcePath);
    if ($info === false) return false;
    $mime = $info['mime'];
    switch ($mime) {
        case 'image/jpeg': $src = imagecreatefromjpeg($sourcePath); break;
        case 'image/png':  $src = imagecreatefrompng($sourcePath); break;
        case 'image/gif':  $src = imagecreatefromgif($sourcePath); break;
        case 'image/webp': $src = imagecreatefromwebp($sourcePath); break;
        default: return false;
    }
    if (!$src) return false;
    $w = imagesx($src); $h = imagesy($src);
    if ($w > $h) { $nw = $maxDim; $nh = intval($h * $maxDim / $w); }
    else { $nh = $maxDim; $nw = intval($w * $maxDim / $h); }
    $thumb = imagecreatetruecolor($nw, $nh);
    $white = imagecolorallocate($thumb, 255, 255, 255);
    imagefill($thumb, 0, 0, $white);
    imagecopyresampled($thumb, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $result = imagejpeg($thumb, $thumbPath, 80);
    imagedestroy($src); imagedestroy($thumb);
    return $result;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
    exit;
}

if (!isset($_FILES['archivo']) || $_FILES['archivo']['error'] !== UPLOAD_ERR_OK) {
    $errors = [
        UPLOAD_ERR_INI_SIZE => 'El archivo excede el límite permitido.',
        UPLOAD_ERR_FORM_SIZE => 'El archivo excede el límite del formulario.',
        UPLOAD_ERR_PARTIAL => 'El archivo se subió parcialmente.',
        UPLOAD_ERR_NO_FILE => 'No se seleccionó ningún archivo.',
        UPLOAD_ERR_NO_TMP_DIR => 'Falta carpeta temporal.',
        UPLOAD_ERR_CANT_WRITE => 'Error al escribir en disco.',
        UPLOAD_ERR_EXTENSION => 'Extensión bloqueó la subida.',
    ];
    $code = $_FILES['archivo']['error'] ?? UPLOAD_ERR_NO_FILE;
    $msg = $errors[$code] ?? 'Error desconocido.';
    echo json_encode(['success' => false, 'message' => $msg]);
    exit;
}

$file = $_FILES['archivo'];

$allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
if (!in_array($file['type'], $allowedTypes)) {
    echo json_encode(['success' => false, 'message' => 'Solo imágenes permitidas.']);
    exit;
}

if ($file['size'] > 5 * 1024 * 1024) {
    echo json_encode(['success' => false, 'message' => 'Máx. 5 MB.']);
    exit;
}

$source = $_POST['source'];
$vehiculo_id = $_POST['vehiculo_id'] ?? null;
$mantenimiento_id = $_POST['mantenimiento_id'] ?? null;

switch ($source) {
    case 'recambio':
        $uploadDir = __DIR__ . '/../assets/images/Recambios/';
        $basePath = '../assets/images/Recambios/';
        break;
    case 'vehiculo':
        $uploadDir = __DIR__ . '/../assets/images/Vehiculos/';
        $basePath = '../assets/images/Vehiculos/';
        break;
    default:
        $uploadDir = __DIR__ . '/../attachments/';
        $basePath = '../attachments/';
        break;
}
if (!is_dir($uploadDir)) {
    if (!mkdir($uploadDir, 0755, true)) {
        echo json_encode(['success' => false, 'message' => 'No se pudo crear la carpeta de adjuntos']);
        exit;
    }
}

if (!$vehiculo_id && $source !== 'vehiculo') {
    echo json_encode(['success' => false, 'message' => 'vehiculo_id es requerido']);
    exit;
}

$ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
$uuid = new_guui_generator(); // asumo que está en helper.php
$safeName = $uuid . '.jpg'; // Forzar extensión jpg para mejor compresión
$targetPath = $uploadDir . $safeName;

// Comprimir imagen antes de guardar
if (!compressImage($file['tmp_name'], $targetPath, 200)) {
    echo json_encode(['success' => false, 'message' => 'Error al comprimir la imagen.']);
    exit;
}

// Generar thumbnail para selector
if ($source === 'vehiculo' || $source === 'recambio') {
    $thumbDir = $uploadDir . 'thumbs/';
    if (!is_dir($thumbDir)) mkdir($thumbDir, 0755, true);
    $thumbPath = $thumbDir . $safeName;
    generateThumbnail($targetPath, $thumbPath, 100);
}

// Limpiar archivo temporal
@unlink($file['tmp_name']);

try {
    switch ($source) {
        case 'adjunto':
            $adjuntoId = createAdjuntoModel([
                'guid' => $uuid,
                'nombre_original' => $file['name'],
                'ruta' => $safeName,
                'vehiculo_id' => (int) $vehiculo_id,
                'mantenimiento_id' => $mantenimiento_id
            ]);
            break;
        default:

            break;
    }
    echo json_encode([
        'success' => true,
        'message' => 'Archivo subido y registrado',
        'data' => [
            'id' => $adjuntoId ?? null,
            'guid' => $uuid,
            'file' => $safeName,
            'file_path' => $basePath . $safeName
        ]
    ]);

} catch (Exception $e) {
    // En producción, logea y no expongas el error
    error_log("Error BD adjunto: " . $e->getMessage());
    @unlink($targetPath); // intenta borrar archivo huérfano
    echo json_encode([
        'success' => false,
        'message' => $e->getMessage()
    ]);
}