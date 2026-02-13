#!/usr/bin/env php
<?php
/**
 * Script para comprimir todas las imágenes existentes en la carpeta attachments
 * Uso: php compress_existing_images.php
 */

// Configuración
$attachmentsDir = __DIR__ . '/attachments/';
$maxSizeKB = 200;
$processedCount = 0;
$compressedCount = 0;
$errorCount = 0;

// Función para comprimir imagen (copiada de attach.php)
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
        
        $resized = imagecreatetruecolor($newWidth, $newHeight);
        
        if ($mime === 'image/png') {
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            $transparent = imagecolorallocatealpha($resized, 255, 255, 255, 127);
            imagefilledrectangle($resized, 0, 0, $newWidth, $newHeight, $transparent);
        }
        
        imagecopyresampled($resized, $image, 0, 0, 0, 0, $newWidth, $newHeight, $width, $height);
        imagedestroy($image);
        $image = $resized;
    }
    
    // Intentar diferentes niveles de calidad
    $quality = 90;
    $tempFile = $targetPath . '.temp';
    
    do {
        switch ($mime) {
            case 'image/jpeg':
                imagejpeg($image, $tempFile, $quality);
                break;
            case 'image/png':
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
        
        if ($fileSize <= $maxSizeBytes || $quality <= 30) {
            rename($tempFile, $targetPath);
            imagedestroy($image);
            return true;
        }
        
        $quality -= 10;
        
    } while ($quality >= 30);
    
    // Intentar redimensionar más
    $width = imagesx($image);
    $height = imagesy($image);
    $scaleFactor = 0.8;
    
    do {
        $newWidth = intval($width * $scaleFactor);
        $newHeight = intval($height * $scaleFactor);
        
        $resized = imagecreatetruecolor($newWidth, $newHeight);
        
        if ($mime === 'image/png') {
            imagealphablending($resized, false);
            imagesavealpha($resized, true);
            $transparent = imagecolorallocatealpha($resized, 255, 255, 255, 127);
            imagefilledrectangle($resized, 0, 0, $newWidth, $newHeight, $transparent);
        }
        
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
    
    return file_exists($targetPath);
}

// Verificar que la carpeta existe
if (!is_dir($attachmentsDir)) {
    echo "Error: No se encuentra la carpeta attachments/\n";
    echo "Ruta esperada: $attachmentsDir\n";
    exit(1);
}

echo "=== Compresión de imágenes existentes ===\n";
echo "Carpeta: $attachmentsDir\n";
echo "Tamaño máximo: {$maxSizeKB}KB\n\n";

// Extensiones de imagen soportadas
$imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Obtener todos los archivos de la carpeta
$files = scandir($attachmentsDir);

foreach ($files as $file) {
    // Ignorar directorios . y ..
    if ($file === '.' || $file === '..') {
        continue;
    }
    
    $filePath = $attachmentsDir . $file;
    
    // Verificar que es un archivo (no directorio)
    if (!is_file($filePath)) {
        continue;
    }
    
    // Obtener extensión
    $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
    
    // Verificar que es una imagen
    if (!in_array($ext, $imageExtensions)) {
        continue;
    }
    
    $processedCount++;
    $originalSize = filesize($filePath);
    $originalSizeKB = round($originalSize / 1024, 2);
    
    echo "Procesando: $file ({$originalSizeKB}KB) ... ";
    
    // Si ya es menor de 200KB, saltar
    if ($originalSize <= ($maxSizeKB * 1024)) {
        echo "✓ Ya está comprimida (menor de {$maxSizeKB}KB)\n";
        continue;
    }
    
    // Crear backup del archivo original
    $backupPath = $filePath . '.backup';
    if (!copy($filePath, $backupPath)) {
        echo "✗ Error al crear backup\n";
        $errorCount++;
        continue;
    }
    
    // Comprimir imagen
    $tempPath = $filePath . '.compressed';
    
    if (compressImage($filePath, $tempPath, $maxSizeKB)) {
        $newSize = filesize($tempPath);
        $newSizeKB = round($newSize / 1024, 2);
        $savings = round((($originalSize - $newSize) / $originalSize) * 100, 1);
        
        // Reemplazar archivo original con el comprimido
        if (rename($tempPath, $filePath)) {
            // Eliminar backup si todo salió bien
            @unlink($backupPath);
            echo "✓ Comprimida a {$newSizeKB}KB (ahorro: {$savings}%)\n";
            $compressedCount++;
        } else {
            // Restaurar backup si falló el reemplazo
            rename($backupPath, $filePath);
            @unlink($tempPath);
            echo "✗ Error al reemplazar archivo\n";
            $errorCount++;
        }
    } else {
        // Restaurar backup si falló la compresión
        rename($backupPath, $filePath);
        @unlink($tempPath);
        echo "✗ Error al comprimir\n";
        $errorCount++;
    }
}

echo "\n=== Resumen ===\n";
echo "Total imágenes procesadas: $processedCount\n";
echo "Imágenes comprimidas: $compressedCount\n";
echo "Errores: $errorCount\n";
echo "\nProceso completado.\n";
