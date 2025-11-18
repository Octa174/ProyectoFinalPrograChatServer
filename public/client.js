document.addEventListener('DOMContentLoaded', () => {
    // Mensaje de advertencia al cerrar la pestaña
    window.addEventListener('beforeunload', function (e) {
        const confirmationMessage = '⚠️ Advertencia: Si cierras esta pestaña, perderás todos los mensajes y no podrás ver el historial del chat.';
        
        (e || window.event).returnValue = confirmationMessage;
        return confirmationMessage;
    });

    // Mostrar mensaje permanente de advertencia
    const warningBanner = document.createElement('div');
    warningBanner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: #fff3cd;
        color: #856404;
        padding: 10px;
        text-align: center;
        border-bottom: 1px solid #ffeaa7;
        font-size: 14px;
        z-index: 1000;
    `;
    warningBanner.innerHTML = '⚠️ <strong>Advertencia:</strong> Este chat es efímero. Si cierras esta pestaña, perderás todos los mensajes.';
    document.body.appendChild(warningBanner);

    // Ajustar el contenido principal para no quedar debajo del banner
    document.body.style.paddingTop = '50px';

    const loginArea = document.getElementById('login-area');
    const chatArea = document.getElementById('chat-area');
    const loginForm = document.getElementById('login-form');
    const loginMessage = document.getElementById('login-message');
    const chatForm = document.getElementById('chat-form');
    const messageInput = document.getElementById('m');
    const messagesContainer = document.getElementById('messages');
    const welcomeHeader = document.getElementById('welcome-header');

    let username = '';
    let socket;
    let currentChat = 'global';
    let currentTarget = null;

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

        if (type === 'system') {
            // Mensaje del servidor (por ejemplo: "Usuario conectado")
            item.classList.add('system-msg');
            item.textContent = msg;
        } else if (type === 'private') {
            item.classList.add('msg', 'private-msg');
            if (msg.isOwn) {
                item.classList.add('me');
                item.innerHTML = `<strong>Tú (privado)</strong><br>${msg.message} <small>${msg.timestamp}</small>`;
            } else {
                item.classList.add('other');
                item.innerHTML = `<strong>${msg.from} (privado)</strong><br>${msg.message} <small>${msg.timestamp}</small>`;
            }
        } else {
            item.classList.add('msg');
            // Si el mensaje lo enviaste tú, va a la derecha
            if (msg.username === username) {
                item.classList.add('me');
                item.innerHTML = `<strong>Tú</strong><br>${msg.text} <small>${msg.timestamp}</small>`;
            } else {
                // Si lo envió otro, va a la izquierda
                item.classList.add('other');
                item.innerHTML = `<strong>${msg.username}</strong><br>${msg.text} <small>${msg.timestamp}</small>`;
            }
        }

        messagesContainer.appendChild(item);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Función para mostrar/ocultar el indicador de typing
    function showTypingIndicator(username, isTyping) {
        const indicator = document.getElementById('typing-indicator');
        const typingText = document.getElementById('typing-text');
        
        if (isTyping) {
            typingText.textContent = `${username} está escribiendo...`;
            indicator.style.display = 'block';
        } else {
            indicator.style.display = 'none';
        }
    }

    // Función para mostrar notificación
    function showNotification(fromUser, message) {
        // Verificar si el navegador soporta notificaciones
        if (!("Notification" in window)) {
            console.log("Este navegador no soporta notificaciones");
            return;
        }

        // Verificar si ya tenemos permiso
        if (Notification.permission === "granted") {
            createNotification(fromUser, message);
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    createNotification(fromUser, message);
                }
            });
        }
    }

    function createNotification(fromUser, message) {
        const notification = new Notification(`Mensaje privado de ${fromUser}`, {
            body: message.length > 50 ? message.substring(0, 50) + '...' : message,
            icon: '/favicon.ico', // Puedes cambiar por tu propio icono
            tag: 'chat-notification'
        });

        // Cerrar la notificación después de 5 segundos
        setTimeout(() => {
            notification.close();
        }, 5000);

        // Hacer click en la notificación para abrir el chat
        notification.onclick = function() {
            window.focus();
            if (currentChat !== 'private' || currentTarget !== fromUser) {
                switchToPrivateChat(fromUser);
            }
        };
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
                loginMessage.style.color = 'red';
            }

        } catch (error) {
            console.error('Error durante el login:', error);
            loginMessage.textContent = 'Error al intentar conectar con el servidor.';
            loginMessage.style.color = 'red';
        }
    });

    // --- Inicialización del Socket de Chat ---
    function initializeChatSocket() {
        socket = io(); 

        // Manejar error de sesión múltiple
        socket.on('login error', (errorMessage) => {
            alert(errorMessage);
            // Volver al login
            chatArea.style.display = 'none';
            loginArea.style.display = 'block';
            document.getElementById('show-register').parentElement.style.display = 'block';
            loginMessage.textContent = errorMessage;
            loginMessage.style.color = 'red';
        });

        // Almacenamiento de mensajes por chat
        const chatHistory = {
            global: [],
            private: {}
        };

        // 1. Informar al servidor nuestro nombre de usuario
        socket.emit('set username', username);

        // 2. Escuchar mensajes del sistema (usuarios unidos/dejaron)
        socket.on('user joined', (msg) => {
            addMessage(msg, 'system');
            chatHistory.global.push({ type: 'system', content: msg });
        });
        
        socket.on('user left', (msg) => {
            addMessage(msg, 'system');
            chatHistory.global.push({ type: 'system', content: msg });
        });

        // 3. Escuchar mensajes de chat global
        socket.on('chat message', (msg) => {
            chatHistory.global.push({ type: 'global', content: msg });
            if (currentChat === 'global') {
                addMessage(msg);
            }
        });

        // 4. Escuchar mensajes privados
        socket.on('private message', (msg) => {
            const otherUser = msg.isOwn ? currentTarget : msg.from;
            
            // Inicializar historial si no existe
            if (!chatHistory.private[otherUser]) {
                chatHistory.private[otherUser] = [];
            }
            
            chatHistory.private[otherUser].push({ type: 'private', content: msg });
            
            // Mostrar mensaje si estamos en el chat correspondiente
            if (currentChat === 'private' && currentTarget === otherUser) {
                addMessage(msg, 'private');
            } else if (!msg.isOwn) {
                // Mostrar notificación si no estamos en ese chat
                showNotification(msg.from, msg.message);
                // Actualizar lista de usuarios para mostrar notificación
                socket.emit('get users');
            }
        });

        // 5. Escuchar eventos de typing
        socket.on('user typing', (data) => {
            // Solo mostrar si es en el chat actual
            if ((currentChat === 'global' && !data.targetUser) || 
                (currentChat === 'private' && data.targetUser === username)) {
                showTypingIndicator(data.username, data.isTyping);
            }
        });

        // 6. Escuchar lista de usuarios
        socket.on('users list', (users) => {
            displayUsersList(users);
        });

        // 7. Solicitar lista de usuarios
        socket.emit('get users');

        // 8. Detectar cuando el usuario está escribiendo
        let typingTimer;
        const TYPING_TIMEOUT = 1000;
        
        messageInput.addEventListener('input', () => {
            if (currentChat === 'global') {
                socket.emit('typing start');
            } else {
                socket.emit('typing start', currentTarget);
            }
            
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                if (currentChat === 'global') {
                    socket.emit('typing stop');
                } else {
                    socket.emit('typing stop', currentTarget);
                }
            }, TYPING_TIMEOUT);
        });

        // 9. Enviar mensajes
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const text = messageInput.value;
            if (text) {
                // Emitir que dejó de escribir
                if (currentChat === 'global') {
                    socket.emit('typing stop');
                    socket.emit('chat message', text);
                } else {
                    socket.emit('typing stop', currentTarget);
                    socket.emit('private message', {
                        targetUser: currentTarget,
                        message: text
                    });
                }
                messageInput.value = '';
            }
        });

        // 10. Funciones para la UI del chat privado
        function displayUsersList(users) {
            const usersList = document.getElementById('users-list');
            usersList.innerHTML = '';
            
            users.forEach(user => {
                if (user !== username) {
                    const userElement = document.createElement('div');
                    userElement.className = 'user-item';
                    
                    // Contar mensajes no leídos
                    const unreadCount = chatHistory.private[user] ? 
                        chatHistory.private[user].filter(msg => 
                            msg.type === 'private' && !msg.content.isOwn && !msg.read
                        ).length : 0;
                    
                    userElement.innerHTML = `
                        <span>👤 ${user} ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}</span>
                        <button class="chat-private-btn" data-user="${user}">💬</button>
                    `;
                    usersList.appendChild(userElement);
                }
            });

            // Agregar event listeners a los botones de chat privado
            document.querySelectorAll('.chat-private-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const targetUser = e.target.getAttribute('data-user');
                    switchToPrivateChat(targetUser);
                });
            });
        }

        function switchToPrivateChat(targetUser) {
            currentChat = 'private';
            currentTarget = targetUser;
            document.getElementById('current-chat').textContent = `Chat con ${targetUser}`;
            document.getElementById('users-panel').style.display = 'none';
            document.getElementById('messages-area').style.display = 'block';
            
            // Mostrar botón de volver al global siempre
            document.getElementById('back-to-global').style.display = 'block';
            
            // Limpiar solo la visualización, no el historial
            messagesContainer.innerHTML = '';
            
            // Mostrar historial de mensajes para este chat
            if (chatHistory.private[targetUser]) {
                chatHistory.private[targetUser].forEach(msg => {
                    if (msg.type === 'private') {
                        addMessage(msg.content, 'private');
                    }
                });
            } else {
                // Inicializar historial si es la primera vez
                chatHistory.private[targetUser] = [];
                addMessage(`Iniciaste un chat privado con ${targetUser}`, 'system');
            }
            
            // Marcar mensajes como leídos
            if (chatHistory.private[targetUser]) {
                chatHistory.private[targetUser].forEach(msg => {
                    if (msg.type === 'private' && !msg.content.isOwn) {
                        msg.read = true;
                    }
                });
            }
            
            // Actualizar lista de usuarios para quitar notificaciones
            socket.emit('get users');
        }

        function switchToGlobalChat() {
            currentChat = 'global';
            currentTarget = null;
            document.getElementById('current-chat').textContent = 'Chat Global';
            document.getElementById('users-panel').style.display = 'none';
            document.getElementById('messages-area').style.display = 'block';
            
            // Ocultar botón de volver al global (ya estamos en global)
            document.getElementById('back-to-global').style.display = 'none';
            
            // Limpiar solo la visualización, no el historial
            messagesContainer.innerHTML = '';
            
            // Mostrar historial del chat global
            chatHistory.global.forEach(msg => {
                if (msg.type === 'system') {
                    addMessage(msg.content, 'system');
                } else if (msg.type === 'global') {
                    addMessage(msg.content);
                }
            });
        }

        // 11. Cargar historial inicial del chat global
        function loadInitialGlobalHistory() {
            chatHistory.global.forEach(msg => {
                if (msg.type === 'system') {
                    addMessage(msg.content, 'system');
                } else if (msg.type === 'global') {
                    addMessage(msg.content);
                }
            });
        }

        // Cargar mensajes iniciales del chat global
        loadInitialGlobalHistory();

        // 12. Event listeners para la UI
        document.getElementById('toggle-users').addEventListener('click', () => {
            document.getElementById('users-panel').style.display = 'block';
            document.getElementById('messages-area').style.display = 'none';
            socket.emit('get users');
        });

        document.getElementById('back-to-global').addEventListener('click', switchToGlobalChat);
        
        // Ocultar botón de volver al global al inicio (ya estamos en global)
        document.getElementById('back-to-global').style.display = 'none';
    }
});