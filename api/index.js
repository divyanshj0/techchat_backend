const express = require('express');
const cors = require('cors');
const supabase = require('../config/supabase');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// --- ROUTES ---

// 1. Get All Channels
app.get('/api/channels', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('channels')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Create a Channel
app.post('/api/channels', async (req, res) => {
  const { name, description, is_private, created_by } = req.body;

  try {
    // Validate input
    if (!name) return res.status(400).json({ error: 'Channel name is required' });

    const { data, error } = await supabase
      .from('channels')
      .insert([{ name, description, is_private, created_by }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Get Messages for a Channel
app.get('/api/messages/:channelId', async (req, res) => {
  const { channelId } = req.params;

  try {
    // Join with the users table to get sender details
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        user_id,
        users (
          username,
          avatar_color,
          status
        )
      `)
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Transform response to match frontend structure (flatten 'users' to 'sender')
    const formattedData = data.map(msg => ({
      id: msg.id,
      content: msg.content,
      created_at: msg.created_at,
      user_id: msg.user_id,
      sender: msg.users // Supabase returns joined data in a nested object
    }));

    res.json(formattedData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Send a Message
app.post('/api/messages/:channelId', async (req, res) => {
  const { channelId } = req.params;
  const { content, user_id } = req.body;

  try {
    if (!content || !user_id) {
      return res.status(400).json({ error: 'Content and user_id are required' });
    }

    const { data, error } = await supabase
      .from('messages')
      .insert([{ content, user_id, channel_id: channelId }])
      .select();

    if (error) throw error;
    res.status(201).json(data[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('TechChat Express API is running');
});

// Export the app for Vercel Serverless Functions
module.exports = app;