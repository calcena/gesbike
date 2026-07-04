<?php
$zip = new ZipArchive;
if ($zip->open('app.db.zip') === TRUE) {
    $zip->extractTo('.');
    $zip->close();
    echo 'OK';
} else {
    echo 'Error';
}
?>
