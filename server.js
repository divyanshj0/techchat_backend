// Import required packages
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const http = require('http'); 
require('dotenv').config();

const { Users, Channels, Messages,ChannelMembers, sequelize } = require('./config/supabase');
const { Op } = require('sequelize');
 
// Initialize the Express app
const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET;

// Use middleware
app.use(cors()); 
app.use(express.json()); 

// --- CREATE HTTP SERVER & SOCKET.IO ---
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "http://localhost:3000", // Update this to match your frontend URL
        methods: ["GET", "POST"]
    }
});

// --- MIDDLEWARE ---

// Middleware to verify JWT for Socket connections
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth.token;
        if (!token) return next(new Error('Authentication error'));

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await Users.findByPk(decoded.id, {
            attributes: ['id', 'username', 'avatar_color']
        });

        if (!user) return next(new Error('User not found'));
        socket.user = user; // Attach user to socket
        next();
    } catch (err) {
        next(new Error('Authentication error'));
    }
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username}`);

    // Join a channel room
    socket.on('join_channel', (channelId) => {
        socket.join(channelId);
        console.log(`User ${socket.user.username} joined channel: ${channelId}`);
    });

    // Handle sending messages
    socket.on('send_message', async (data) => {
        const { channelId, content } = data;
        
        try {
            // Save to Database
            const newMessage = await Messages.create({
                content,
                channel_id: channelId,
                user_id: socket.user.id
            });

            // Fetch the full message with sender details (for the frontend)
            const messageWithSender = await Messages.findByPk(newMessage.id, {
                include: [{
                    model: Users,
                    as: 'sender',
                    attributes: ['id', 'username', 'avatar_color', 'status']
                }]
            });

            // Broadcast to everyone in the channel (including sender)
            io.to(channelId).emit('receive_message', messageWithSender);
        } catch (error) {
            console.error('Error saving message:', error);
            socket.emit('error', 'Message could notqv be sent');
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Middleware to verify JWT and protect routes
const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        try {
            token = req.headers.authorization.split(' ')[1]; 
            const decoded = jwt.verify(token, JWT_SECRET);
            
            // Attach user to request, exclude password
            req.user = await Users.findByPk(decoded.id, {
                attributes: { exclude: ['password'] }
            });

            if (!req.user) {
                return res.status(401).json({ error: 'User not found' });
            }
            next(); 
        } catch (error) {
            console.error('Token verification failed:', error.message);
            res.status(401).json({ error: 'Not authorized, token failed' });
        }
    } else {
        res.status(401).json({ error: 'Not authorized, no token' });
    }
};

// --- ROUTES ---

app.get('/', (req, res) => {
    res.status(200).send('TechChat Backend is running!');
});

// --- AUTHENTICATION ROUTES ---

// POST /auth/signup
app.post('/auth/signup', async (req, res) => {
    try {
        const { username, email, password } = req.body;

        // Check if user exists
        const userExists = await Users.findOne({ 
            where: { [Op.or]: [{ email }, { username }] } 
        });
        
        if (userExists) {
            return res.status(409).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Random color for avatar
        const colors = ['bg-blue-600', 'bg-green-600', 'bg-red-600', 'bg-purple-600', 'bg-yellow-600'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const user = await Users.create({ 
            username, 
            email, 
            password: hashedPassword,
            avatar_color: randomColor,
            status: 'online'
        });

        // Generate Token
        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

        res.status(201).json({ 
            message: 'User created successfully',
            token,
            user: { id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color }
        });
    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// POST /auth/login
app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await Users.findOne({ where: { email } });

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        // Set status to online on login
        await user.update({ status: 'online' });

        const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
        
        res.status(200).json({ 
            token, 
            user: { id: user.id, username: user.username, email: user.email, avatar_color: user.avatar_color }
        });
    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// --- API ROUTES (Protected) ---
const apiRouter = express.Router();
apiRouter.use(protect);

// GET /api/users (Get online/all users for sidebar)
apiRouter.get('/users', async (req, res) => {
    try {
        const users = await Users.findAll({
            attributes: ['id', 'username', 'avatar_color', 'status']
        });
        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch users' });
    }
});

// GET /api/channels
apiRouter.get('/channels', async (req, res) => {
    try {
        const channels = await Channels.findAll({
            order: [['name', 'ASC']]
        });
        res.status(200).json(channels);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch channels' });
    }
});

// POST /api/channels
apiRouter.post('/channels', async (req, res) => {
    const { name, description, is_private } = req.body;
    try {
        const newChannel = await Channels.create({
            name,
            description,
            is_private: is_private || false,
            created_by: req.user.id
        });
        
        // Add creator as member
        await newChannel.addUser(req.user, { through: { role: 'admin' }});

        res.status(201).json(newChannel);
    } catch (error) {
        console.error(error);
        if(error.name === 'SequelizeUniqueConstraintError') {
            return res.status(400).json({ message: 'Channel name already exists' });
        }
        res.status(500).json({ message: 'Failed to create channel' });
    }
});
//Get user's joined Channels
apiRouter.get('/channels/join', async (req, res) => {
    try {
        const channels = await Channels.findAll({
            include: [{
                model: Users,
                where: { id: req.user.id },
                attributes: [],
                through: { attributes: [] }
            }],
            order: [['name', 'ASC']]
        });
        res.status(200).json(channels);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch channels' });
    }
});

// GET /api/members/:channelId
apiRouter.get('/members/:channelId',async(req,res)=>{
    const {channelId}=req.params;
    try{
        const members=await ChannelMembers.findAll({
            where:{channel_id:channelId},
            include: [
                {
                    model: Users,
                    attributes: ['id', 'username', 'avatar_color', 'status']
                }
            ],
            order: [
                ['role', 'ASC'],
                [{ model: Users }, 'username', 'ASC'] 
            ]
        });
        res.status(200).json(members);
    } catch(error){
        console.error(error);
        res.status(500).json({message:'Failed to fetch users'});
    }
})

// GET /api/messages/:channelId
apiRouter.get('/messages/:channelId', async (req, res) => {
    const { channelId } = req.params;
    try {
        const messages = await Messages.findAll({
            where: { channel_id: channelId },
            include: [
                { 
                    model: Users, 
                    as: 'sender',
                    attributes: ['id', 'username', 'avatar_color', 'status'] 
                }
            ],
            order: [['created_at', 'ASC']]
        });
        res.status(200).json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch messages' });
    }
});

// POST /api/messages/:channelId
apiRouter.post('/messages/:channelId', async (req, res) => {
    const { channelId } = req.params;
    const { content } = req.body;
    try {
        const newMessage = await Messages.create({
            content,
            channel_id: channelId,
            user_id: req.user.id
        });

        // Fetch full message with sender info to return to frontend
        const messageWithSender = await Messages.findByPk(newMessage.id, {
            include: [{ 
                model: Users, 
                as: 'sender',
                attributes: ['id', 'username', 'avatar_color', 'status'] 
            }]
        });

        res.status(201).json(messageWithSender);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to send message' });
    }
});

// Mount router
app.use('/api', apiRouter);

module.exports = app;