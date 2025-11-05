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
const USERS = {
    'clienteA': 'passA', // Usuario para la Computadora A
    'clienteB': 'passB'  // Usuario para la Computadora B
};

// Almacenamiento de sesiones activas por socket.id
let activeUsers = {};

//--------------------------------------------------------------------------------------------

// Servicios de archivos front-end
app.use(express.static(path.join(__dirname, 'public')));

// configurar express para parsear JSON
app.use(express.json());

// Ruta para manejar el login API REST
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Verificar credenciales
    if (USERS[username] && USERS[username] === password) {
        // En un proyecto real, se enviaría un Token JWT aquí
        return res.json({ success: true, username: username, message: "Login exitoso" });
    } else {
        return res.status(401).json({ success: false, message: "Credenciales inválidas" });
    }
});

// Logíca de chat (Socket.IO)
io.on('connection', (socket) => {
    console.log('Un cliente se ha conectado:', socket.id);

    // Evento para registrar el usuario al iniciar el chat (después del login)
    socket.on('set username', (username) => {
        // Asocia el ID del socket con el nombre de usuario
        socket.username = username;
        activeUsers[username] = socket.id;

        // Avisa a todos quién se unió
        io.emit('user joined', `${username} se ha unido al chat.`);
        console.log(`Usuario registrado: ${username}`);
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

    // Evento cuando un cliente se desconecta
    socket.on('disconnect', () => {
        if (socket.username) {
            delete activeUsers[socket.username];
            io.emit('user left', `${socket.username} ha abandonado el chat.`);
            console.log(`Usuario desconectado: ${socket.username}`);
        }
        console.log('Cliente desconectado:', socket.id);
    });
});

// Iniciar el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de chat corriendo en http://localhost:${PORT}`);
    console.log("¡Recuerda que esta IP deberá ser la pública de AWS/Azure!");
});



