const initLogin = () => {
  sessionStorage.clear();
};

const auth = async (nombre, pass) => {
  const data = {
    username: nombre.toLowerCase(),
    pass: pass,
  };
  try {
    const response = await axios.post(
      "api/login/login.php?auth",
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    if (response.data.success) {
      sessionStorage.setItem("usuario_id", response.data.content.id);
      sessionStorage.setItem("login_parent", true);
      mensaje.innerHTML = `
                <p class="success">
                    ¡Bienvenido ${response.data.content.nombre}!
                    Redirigiendo...
                </p>`;
      setTimeout(() => {
        window.location.href = "views/main.php";
      }, 500);
    } else {
      mensaje.innerHTML = `<p class="error">${response.data.error}</p>`;
    }
  } catch (err) {
    console.log("login_error", err.response.data.error);
    mensaje.innerHTML = `<p class="error">${err.response.data.error}</p>`;
  }
};

window.addEventListener('load', () => {
    const userField = document.getElementById('username');
    const passField = document.getElementById('pass');
    let autoLoginEjecutado = false;

    const intentarLogin = () => {
        if (!autoLoginEjecutado && userField.value.length > 0 && passField.value.length > 0) {
            autoLoginEjecutado = true;
            console.log("Autologin disparado");
            auth(userField.value, passField.value);
            return true;
        }
        return false;
    };

    // 1. Intervalo estándar (para Firefox y escritorio)
    const interval = setInterval(() => {
        if (intentarLogin()) clearInterval(interval);
    }, 500);
    document.body.addEventListener('touchstart', () => {
        setTimeout(intentarLogin, 100);
    }, { once: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            setTimeout(intentarLogin, 500);
        }
    });
    [userField, passField].forEach(el => {
        el.addEventListener('focus', () => setTimeout(intentarLogin, 300));
    });
});
