// This line must be at the very top to load the .env file
require('dotenv').config();
require('pg');
const { Sequelize, DataTypes } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set!");
}

const sequelize = new Sequelize(databaseUrl, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false, // Required for Supabase connection
        },
    },
    logging: false, // Set to console.log to see SQL queries
});

// --- MODELS ---

// 1. Users Model
const Users = sequelize.define('Users', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    username: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
        validate: { isEmail: true }
    },
    password: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    avatar_color: {
        type: DataTypes.STRING,
        defaultValue: 'bg-blue-600',
    },
    status: {
        type: DataTypes.STRING,
        defaultValue: 'offline', // 'online', 'offline'
    }
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at'
});

// 2. Channels Model
const Channels = sequelize.define('Channels', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    is_private: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
    },
    created_by: {
        type: DataTypes.UUID, // Stores User ID of creator
        allowNull: false
    }
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

// 3. Messages Model
const Messages = sequelize.define('Messages', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    content: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    // Foreign keys (UserId and ChannelId) are added automatically by associations below
}, {
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false
});

// 4. Channel Members (Join Table)
const ChannelMembers = sequelize.define('ChannelMembers', {
    role: {
        type: DataTypes.STRING,
        defaultValue: 'member', // 'admin', 'moderator', 'member'
    }
}, { timestamps: false });


// --- RELATIONS ---

// Users <-> Messages (One-to-Many)
Users.hasMany(Messages, { foreignKey: 'user_id' });
Messages.belongsTo(Users, { foreignKey: 'user_id', as: 'sender' });

// Channels <-> Messages (One-to-Many)
Channels.hasMany(Messages, { foreignKey: 'channel_id' });
Messages.belongsTo(Channels, { foreignKey: 'channel_id' });

// Users <-> Channels (Many-to-Many via ChannelMembers)
Users.belongsToMany(Channels, { through: ChannelMembers, foreignKey: 'user_id' });
Channels.belongsToMany(Users, { through: ChannelMembers, foreignKey: 'channel_id' });


// --- SYNC DATABASE ---
// Use { alter: true } to update tables without deleting data
sequelize.sync({ alter: true })
    .then(() => console.log('✅ Database synced & tables created!'))
    .catch(error => console.log('❌ Error Syncing Database:', error));

// Test connection
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('☁️  Connected to Supabase Postgres successfully.');
    } catch (error) {
        console.error('Unable to connect to the database:', error);
    }
}

testConnection();

module.exports = {
    sequelize,
    Users,
    Channels,
    Messages,
    ChannelMembers
};