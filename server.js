//Dependencias 
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);

// Configura Socket.IO para el servidor HTTP
const io = new Server(server);

// Configuracion de credenciales usuarios (simulamos base de datos)
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

// Configuración de la base de datos SQLite
const db = new sqlite3.Database('./chat.db', (err) => {
    if (err) {
        console.error('Error abriendo la base de datos:', err.message);
    } else {
        console.log('Conectado a la base de datos SQLite.');
        // Crear tabla de usuarios si no existe
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
    }
});

// Almacenamiento de sesiones activas por socket.id
let activeUsers = {};
let userSessions = {}; // Para controlar múltiples sesiones

//--------------------------------------------------------------------------------------------

// Servicios de archivos front-end
app.use(express.static(path.join(__dirname, 'public')));

// configurar express para parsear JSON
app.use(express.json());

// Ruta para registrar nuevos usuarios
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: "Usuario y contraseña requeridos" });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        
        db.run("INSERT INTO users (username, password) VALUES (?, ?)", 
            [username, hashedPassword], 
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ success: false, message: "El usuario ya existe" });
                    }
                    return res.status(500).json({ success: false, message: "Error del servidor" });
                }
                res.json({ success: true, message: "Usuario registrado exitosamente" });
            }
        );
    } catch (error) {
        res.status(500).json({ success: false, message: "Error del servidor" });
    }
});

// Ruta para manejar el login API REST
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Verificar si el usuario ya está conectado
    if (userSessions[username]) {
        return res.status(401).json({ 
            success: false, 
            message: "Este usuario ya tiene una sesión activa. No puedes iniciar sesión múltiples veces." 
        });
    }

    db.get("SELECT * FROM users WHERE username = ?", [username], async (err, row) => {
        if (err) {
            return res.status(500).json({ success: false, message: "Error del servidor" });
        }
        
        if (!row) {
            return res.status(401).json({ success: false, message: "Credenciales inválidas. Registrate para obtener una cuenta." });
        }

        const validPassword = await bcrypt.compare(password, row.password);
        if (validPassword) {
            // Marcar usuario como conectado
            userSessions[username] = true;
            return res.json({ 
                success: true, 
                username: username, 
                message: "Login exitoso" 
            });
        } else {
            return res.status(401).json({ success: false, message: "Credenciales inválidas" });
        }
    });
});

// Logíca de chat (Socket.IO)
io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado:', socket.id);

    // Evento para registrar el usuario al iniciar el chat (después del login)
    socket.on('set username', (username) => {
        // Verificar si el usuario ya está activo (doble verificación)
        if (activeUsers[username]) {
            socket.emit('login error', 'Este usuario ya tiene una sesión activa en otra pestaña/navegador.');
            socket.disconnect();
            return;
        }

        // Asocia el ID del socket con el nombre de usuario
        socket.username = username;
        activeUsers[username] = socket.id;

        // Avisa a todos quién se unió
        io.emit('user joined', `${username} se ha unido al chat.`);
        console.log(`Usuario registrado: ${username}`);
        
        // Enviar lista actualizada de usuarios a todos
        io.emit('users list', Object.keys(activeUsers));
    });

    // Evento para recibir mensajes
    socket.on('chat message', (msg) => {
        const sender = socket.username || 'Anónimo';
        console.log(`Mensaje de ${sender}: ${msg}`);
        
        // Retransmite el mensaje a todos los demás clientes (incluyéndose a sí mismo)
        io.emit('chat message', {
            username: sender,
            text: msg,
            timestamp: new Date().toLocaleTimeString()
        });
    });

    // Evento para mensaje privado
    socket.on('private message', (data) => {
        const { targetUser, message } = data;
        const sender = socket.username;
        
        console.log(`Mensaje privado de ${sender} a ${targetUser}: ${message}`);
        
        if (activeUsers[targetUser]) {
            // Enviar al usuario destino
            socket.to(activeUsers[targetUser]).emit('private message', {
                from: sender,
                message: message,
                timestamp: new Date().toLocaleTimeString(),
                isOwn: false
            });
            
            // También enviar al remitente (para ver su propio mensaje)
            socket.emit('private message', {
                from: sender,
                message: message,
                timestamp: new Date().toLocaleTimeString(),
                isOwn: true
            });
        }
    });

    // Evento cuando un usuario está escribiendo
    socket.on('typing start', (targetUser = null) => {
        const sender = socket.username;
        
        if (targetUser) {
            // Para chat privado
            if (activeUsers[targetUser]) {
                socket.to(activeUsers[targetUser]).emit('user typing', {
                    username: sender,
                    isTyping: true,
                    targetUser: targetUser
                });
            }
        } else {
            // Para chat global - avisa a todos excepto al que escribe
            socket.broadcast.emit('user typing', {
                username: sender,
                isTyping: true,
                targetUser: null
            });
        }
    });

    // Evento cuando un usuario deja de escribir
    socket.on('typing stop', (targetUser = null) => {
        const sender = socket.username;
        
        if (targetUser) {
            // Para chat privado
            if (activeUsers[targetUser]) {
                socket.to(activeUsers[targetUser]).emit('user typing', {
                    username: sender,
                    isTyping: false,
                    targetUser: targetUser
                });
            }
        } else {
            // Para chat global
            socket.broadcast.emit('user typing', {
                username: sender,
                isTyping: false,
                targetUser: null
            });
        }
    });

    // Evento para obtener lista de usuarios conectados
    socket.on('get users', () => {
        const users = Object.keys(activeUsers);
        socket.emit('users list', users);
    });

    // Evento cuando un cliente se desconecta
    socket.on('disconnect', () => {
        if (socket.username) {
            // Liberar la sesión del usuario
            delete activeUsers[socket.username];
            delete userSessions[socket.username];
            
            io.emit('user left', `${socket.username} ha abandonado el chat.`);
            io.emit('users list', Object.keys(activeUsers));
            console.log(`Usuario desconectado: ${socket.username}`);
        }
        console.log('Cliente desconectado:', socket.id);
    });

    // Manejar errores de autenticación
    socket.on('force logout', (username) => {
        if (userSessions[username]) {
            delete userSessions[username];
        }
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de chat corriendo en http://localhost:${PORT}`);
    console.log("¡Recuerda que esta IP deberá ser la pública de AWS/Azure!");
});