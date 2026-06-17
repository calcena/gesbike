<?php
require_once '../helpers/helper.php';
require_once '../helpers/config.php';
$GLOBALS['pathUrl'] = '../';
$GLOBALS['navigation_deep'] = 0;
get_session_status();
debug_mode();
$_SESSION['base_path'] = dirname(__FILE__);
$url = isset($_SERVER['HTTPS']) &&
  $_SERVER['HTTPS'] === 'on' ? "https://" : "http://";
$_SESSION['index_url'] = $url . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
?>
<!DOCTYPE html>
<html lang="en">
<script>(function(){var t=sessionStorage.getItem('theme');if(t==='dark'){document.documentElement.setAttribute('data-theme','dark')}})()</script>

<head>
  <meta http-equiv='cache-control' content='no-cache'>
  <meta http-equiv='expires' content='0'>
  <meta http-equiv='pragma' content='no-cache'>
  <meta charset="UTF-8">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link href="../assets/css/bootstrap/bootstrap.min.css" rel="stylesheet" type="text/css">
  <link href="../assets/css/style.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
  <link href="../assets/css/theme.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
  <link href="../assets/css/main/main.css?<?php random_file_enumerator() ?>" rel="stylesheet" type="text/css">
  <script src="../assets/js/axios/axios.min.js?<?php random_file_enumerator() ?>"></script>
  <script src="../assets/js/bootstrap/bootstrap.min.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/helpers/helper.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/main/main.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/components/sitebar.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/translate/translate.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/theme/theme.js?<?php random_file_enumerator() ?>"></script>
  <script src="../services/logs/logs.js?<?php random_file_enumerator() ?>"></script>
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <title><?php echo APP_NAME . '_' . APP_VERSION ?></title>
  <style>
    #voice-indicator {
      position: fixed;
      bottom: 20px;
      left: 20px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: var(--fab-bg, linear-gradient(135deg, #667eea, #764ba2));
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      transition: transform 0.2s;
    }
    #voice-indicator.active {
      animation: voice-pulse 1s infinite;
    }
    @keyframes voice-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(102, 126, 234, 0.7); }
      50% { box-shadow: 0 0 0 12px rgba(102, 126, 234, 0); }
    }
    #voice-indicator i {
      color: #fff;
      font-size: 18px;
    }
  </style>
</head>

<body onload="initMain(); initTheme(); initVoiceRecognition()">
  <div class="container mt-2">
    <div class="container mt-2 d-flex justify-content-end align-items-center ps-0 !important" style="gap: 1rem;">
      <button class="form-select w-100 text-start" id="vehiculo-select" onclick="openVehiculoPicker(1)">
        Selecciona...
      </button>
      <img class="icon-menu" src="../assets/images/icons/menu.png" alt="" onclick="showLateralMenu()">
    </div>
  </div>
  <div class="container mt-2">
    <div class="row row-cols-1 gap-2" id="main-cards">
    </div>
  </div>
  <div class="container footer-location text-center">
    <?php
    $source = 'main';
    include_once("components/footer.php"); ?>
  </div>
  <?php include __DIR__ . '/components/sidebar.php'; ?>
  <div id="voice-indicator" onclick="toggleVoiceRecognition()" title="Comandos de voz">
    <i class="fas fa-microphone"></i>
  </div>
  <script>
    let voiceRecognition = null;
    let voiceListening = false;
    let voiceCommandsLoaded = false;
    window.voiceCommands = [];

    async function initVoiceRecognition() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) return;

      if (voiceRecognition) {
        try { voiceRecognition.abort(); } catch(e) {}
        voiceRecognition = null;
      }

      if (!voiceCommandsLoaded) {
        await loadVoiceCommands();
      }

      function normalizeStr(s) {
        return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      }

      function speak(text, cb) {
        stopVoiceRecognition();
        speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'es-ES';
        utter.rate = 0.9;
        if (cb) utter.onend = cb;
        speechSynthesis.speak(utter);
      }

      function restartVoiceAfterSpeak() {
        setTimeout(startVoiceRecognition, 1500);
      }

      function playAudioNotFound() {
        speak('Comando no encontrado', restartVoiceAfterSpeak);
      }

      function seleccionarVehiculoPorNombre(nombre) {
        const v = (window.vehiculosData || []).find(ve =>
          normalizeStr(ve.nombre).includes(normalizeStr(nombre))
        );
        if (!v) return false;
        sessionStorage.setItem("vehiculo_id", v.id);
        const btn = document.getElementById("vehiculo-select");
        if (btn) {
          btn.textContent = v.nombre;
          btn.dataset.selected = v.id;
        }
        window.paginaActual = 1;
        getListMantenimientosByVehiculo();
        getMotorVehiculo();
        speak('Bicicleta ' + v.nombre + ' seleccionada', restartVoiceAfterSpeak);
        return true;
      }

      voiceRecognition = new SpeechRecognition();
      voiceRecognition.lang = 'es-ES';
      voiceRecognition.continuous = true;
      voiceRecognition.interimResults = false;
      voiceRecognition.maxAlternatives = 3;

      voiceRecognition.onresult = function(event) {
        let matched = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = normalizeStr(event.results[i][0].transcript).trim();
          for (const cmd of window.voiceCommands) {
            if (!transcript.includes(normalizeStr(cmd.frase))) continue;
            matched = true;
            stopVoiceRecognition();

            if (cmd.url === 'internal:cancelar') {
              speak(cmd.respuesta || 'Se cancela micro');
              return;
            }

            if (cmd.url.startsWith('internal:selectVehiculo:')) {
              const vehiculoNombre = cmd.url.replace('internal:selectVehiculo:', '');
              if (!seleccionarVehiculoPorNombre(vehiculoNombre)) {
                playAudioNotFound();
              }
              return;
            }

            if (cmd.respuesta) {
              speak(cmd.respuesta, function() {
                window.location.href = cmd.url;
              });
            } else {
              window.location.href = cmd.url;
            }
            return;
          }
        }
        if (!matched) {
          playAudioNotFound();
        }
      };

      voiceRecognition.onerror = function(event) {
        if (event.error === 'aborted') return;
        if (event.error === 'no-speech') return;
        voiceListening = false;
        document.getElementById('voice-indicator').classList.remove('active');
        if (voiceListening === false && voiceRecognition) {
          setTimeout(startVoiceRecognition, 2000);
        }
      };

      voiceRecognition.onend = function() {
        if (voiceListening && voiceRecognition) {
          setTimeout(function() {
            try { voiceRecognition.start(); } catch(e) {}
          }, 500);
        }
      };

      startVoiceRecognition();
    }

    async function loadVoiceCommands() {
      try {
        const res = await axios.post(
          '../api/comandos_voz/comando_voz.php?getComandosVoz',
          {},
          { headers: { 'Content-Type': 'application/json' } }
        );
        if (res.data.success && Array.isArray(res.data.content)) {
          window.voiceCommands = res.data.content;
          voiceCommandsLoaded = true;
        }
      } catch (e) {
        console.warn('Error loading voice commands:', e);
      }
    }

    function startVoiceRecognition() {
      if (!voiceRecognition) return;
      voiceListening = true;
      document.getElementById('voice-indicator').classList.add('active');
      try { voiceRecognition.start(); } catch(e) {}
    }

    function stopVoiceRecognition() {
      voiceListening = false;
      document.getElementById('voice-indicator').classList.remove('active');
      if (voiceRecognition) {
        try { voiceRecognition.stop(); } catch(e) {}
      }
    }

    function toggleVoiceRecognition() {
      if (voiceListening) {
        stopVoiceRecognition();
      } else {
        startVoiceRecognition();
      }
    }

    window.addEventListener('pageshow', function(e) {
      if (e.persisted) {
        initVoiceRecognition();
      }
    });

    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible' && voiceRecognition && voiceListening) {
        try { voiceRecognition.start(); } catch(e) {
          initVoiceRecognition();
        }
      }
    });

    window.addEventListener('beforeunload', function() {
      if (voiceRecognition) {
        try { voiceRecognition.abort(); } catch(e) {}
        voiceRecognition = null;
      }
      voiceListening = false;
    });
  </script>
</body>


</html>