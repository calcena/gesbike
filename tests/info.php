<?php
if (extension_loaded('pdo_sqlite')) {
    echo "✅ Extensión pdo_sqlite está cargada.\n";
} else {
    echo "❌ Extensión pdo_sqlite NO está cargada.\n";
}

if (extension_loaded('sqlite3')) {
    echo "✅ Extensión sqlite3 está cargada.\n";
} else {
    echo "❌ Extensión sqlite3 NO está cargada.\n";
}