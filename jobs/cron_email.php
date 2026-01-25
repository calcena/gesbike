<?php
// cron_email.php - Versión optimizada para cron
ini_set('max_execution_time', 300); // 5 minutos
ini_set('display_errors', 0);
error_reporting(0);

// Log para debugging del cron
$log_file = __DIR__ . '/cron_log.txt';
file_put_contents($log_file, "Ejecución iniciada: " . date('Y-m-d H:i:s') . "\n", FILE_APPEND);

class SMTPClientFast {
    private $smtp_host = 'smtp.gmail.com';
    private $smtp_port = 587;
    private $username = 'david.calcena@gmail.com'; // CAMBIA
    private $password = 'edxr qsul nnhi uqzn'; // CAMBIA
    private $from_email = 'david.calcena@gmail.com';
    private $from_name = 'Sistema GesBike';
    private $timeout = 15; // Reducido para cron
    private $socket;

    public function connect() {
        $this->socket = @fsockopen($this->smtp_host, $this->smtp_port, $errno, $errstr, $this->timeout);
        if (!$this->socket) {
            throw new Exception("Error SMTP: $errstr ($errno)");
        }
        stream_set_timeout($this->socket, $this->timeout);
        $this->getResponse(); // Banner inicial
        return $this;
    }

    private function sendCommand($command) {
        if (!fputs($this->socket, $command . "\r\n")) {
            throw new Exception("Error enviando comando");
        }
        return $this->getResponse();
    }

    private function getResponse() {
        $response = '';
        $startTime = time();
        while (($str = fgets($this->socket, 4096)) !== false) {
            $response .= $str;
            if ((time() - $startTime) > $this->timeout) break;
            if (substr($str, 3, 1) == ' ') break;
        }
        return $response;
    }

    public function sendEmail($to, $subject, $message, $isHTML = false) {
        try {
            // EHLO
            $this->sendCommand("EHLO " . gethostname());

            // STARTTLS
            $this->sendCommand("STARTTLS");
            stream_socket_enable_crypto($this->socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);

            // EHLO again
            $this->sendCommand("EHLO " . gethostname());

            // Auth
            $this->sendCommand("AUTH LOGIN");
            $this->sendCommand(base64_encode($this->username));
            $response = $this->sendCommand(base64_encode($this->password));

            if (substr($response, 0, 3) != '235') {
                throw new Exception("Auth failed");
            }

            // Send email
            $this->sendCommand("MAIL FROM: <{$this->username}>");
            $this->sendCommand("RCPT TO: <$to>");
            $this->sendCommand("DATA");

            $headers = "From: {$this->from_name} <{$this->from_email}>\r\n";
            $headers .= "To: $to\r\n";
            $headers .= "Subject: $subject\r\n";
            $headers .= "Date: " . date('r') . "\r\n";
            $headers .= "MIME-Version: 1.0\r\n";
            $headers .= "Content-Type: " . ($isHTML ? "text/html" : "text/plain") . "; charset=UTF-8\r\n";

            $emailData = $headers . "\r\n" . $message . "\r\n.";
            $this->sendCommand($emailData);

            $this->sendCommand("QUIT");
            fclose($this->socket);

            return true;

        } catch (Exception $e) {
            if ($this->socket) @fclose($this->socket);
            throw $e;
        }
    }
}

function enviarEmailCron($destinatario, $asunto, $mensaje) {
    try {
        $smtp = new SMTPClientFast();
        $smtp->connect();
        return $smtp->sendEmail($destinatario, $asunto, $mensaje, false);
    } catch (Exception $e) {
        return false;
    }
}

// EJECUCIÓN PRINCIPAL DEL CRON
try {
    file_put_contents($log_file, "Iniciando envío de email...\n", FILE_APPEND);

    $resultado = enviarEmailCron(
        'david.calcena@outlook.com', // Cambia por tu email
        'Notificación Automática GesBike',
        'Este es un email automático enviado desde el cron job de GesBike.' . "\n" .
        'Fecha: ' . date('Y-m-d H:i:s') . "\n" .
        'Sistema funcionando correctamente.'
    );

    if ($resultado) {
        file_put_contents($log_file, "✅ Email enviado exitosamente\n", FILE_APPEND);
        // Respuesta simple para cron-job.org
        echo "OK - Email enviado " . date('Y-m-d H:i:s');
    } else {
        file_put_contents($log_file, "❌ Error enviando email\n", FILE_APPEND);
        echo "ERROR - Fallo en envío " . date('Y-m-d H:i:s');
    }

} catch (Exception $e) {
    file_put_contents($log_file, "❌ Excepción: " . $e->getMessage() . "\n", FILE_APPEND);
    echo "EXCEPTION - " . $e->getMessage();
}

file_put_contents($log_file, "Ejecución finalizada: " . date('Y-m-d H:i:s') . "\n\n", FILE_APPEND);
?>