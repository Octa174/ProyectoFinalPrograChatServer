document.addEventListener('DOMContentLoaded', () => {
    const loginArea = document.getElementById('login-area');
    const chatArea = document.getElementById('chat-area');
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('m');
    const messagesContainer = document.getElementById('messages');
    const welcomeHeader = document.getElementById('welcome-header');

    let username = '';
    let socket; // La variable del socket se inicializará después del login

    // Después de las declaraciones de variables, agrega:
const registerForm = document.getElementById('register-form');
const registerMessage = document.getElementById('register-message');
const showRegisterLink = document.getElementById('show-register');
const showLoginLink = document.getElementById('show-login');

// Alternar entre login y registro
showRegisterLink.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
    loginMessage.textContent = '';
});

showLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.style.display = 'none';
    loginForm.style.display = 'block';
    registerMessage.textContent = '';
});

// Manejo del Registro
registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputUser = document.getElementById('reg-username').value;
    const inputPass = document.getElementById('reg-password').value;

    registerMessage.textContent = 'Registrando...';

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username: inputUser, password: inputPass })
        });

        const data = await response.json();

        if (data.success) {
            registerMessage.textContent = '¡Registro exitoso! Ahora puedes iniciar sesión.';
            registerMessage.style.color = 'green';
            
            // Limpiar formulario y mostrar login
            document.getElementById('reg-username').value = '';
            document.getElementById('reg-password').value = '';
            setTimeout(() => {
                registerForm.style.display = 'none';
                loginForm.style.display = 'block';
                registerMessage.textContent = '';
            }, 2000);
        } else {
            registerMessage.textContent = data.message || 'Error en el registro';
            registerMessage.style.color = 'red';
        }

    } catch (error) {
        console.error('Error durante el registro:', error);
        registerMessage.textContent = 'Error al conectar con el servidor';
        registerMessage.style.color = 'red';
    }
});

    // Función auxiliar para añadir mensajes al contenedor
    function addMessage(msg, type = 'user') {
        const item = document.createElement('div');
        item.classList.add('msg');
        if (type === 'system') {
            item.classList.add('system-msg');
            item.textContent = msg;
        } else {
            item.innerHTML = `<strong>${msg.username}</strong> <span class="timestamp">(${msg.timestamp}):</span> ${msg.text}`;
        }
        messagesContainer.appendChild(item);
        // Desplazar hacia abajo
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // --- Manejo del Login ---
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputUser = document.getElementById('username').value;
        const inputPass = document.getElementById('password').value;

        loginMessage.textContent = '';

        try {
            // Petición al servidor para autenticar
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username: inputUser, password: inputPass })
            });

            const data = await response.json();

            if (data.success) {
                username = data.username;
                
                // Ocultar login y mostrar chat
                loginArea.style.display = 'none';
                chatArea.style.display = 'flex';
                document.getElementById('show-register').parentElement.style.display = 'none';
                welcomeHeader.textContent = `Bienvenido, ${username}`;
                
                // Iniciar la conexión de Socket.IO
                initializeChatSocket();
                
            } else {
                loginMessage.textContent = data.message || 'Error de conexión.';
            }

        } catch (error) {
            console.error('Error durante el login:', error);
            loginMessage.textContent = 'Error al intentar conectar con el servidor.';
        }
    });

    // --- Inicialización del Socket de Chat ---
    function initializeChatSocket() {
        // En un entorno de producción (AWS), Socket.IO se conectará automáticamente a la URL del host
        // Si fuera necesario especificar la IP pública: io('http://tu.ip.publica.a.w.s:3000');
        socket = io(); 

        // 1. Informar al servidor nuestro nombre de usuario
        socket.emit('set username', username);

        // 2. Escuchar mensajes del sistema (usuarios unidos/dejaron)
        socket.on('user joined', (msg) => {
            addMessage(msg, 'system');
        });
        socket.on('user left', (msg) => {
            addMessage(msg, 'system');
        });

        // 3. Escuchar mensajes de chat
        socket.on('chat message', (msg) => {
            addMessage(msg);
        });

        // 4. Enviar mensajes (Manejo del formulario del chat)
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = messageInput.value;
            if (text) {
                // Envía el mensaje al servidor
                socket.emit('chat message', text);
                messageInput.value = ''; // Limpia el input
            }
        });
    }

});