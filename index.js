// --- imports ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const dialogflow = require('@google-cloud/dialogflow');
const { v4: uuidv4 } = require('uuid');
const textToSpeech = require('@google-cloud/text-to-speech');

// --- config ---
const PORT = 8000;
const app = express();

// --- middleware / static ---
app.use(express.static(__dirname + '/public')); // html
app.use(express.static(__dirname + '/assets')); // css, js, images
app.use(express.json()); // to parse JSON request bodies

// --- in-memory store (demo only) ---
let messages = []; // { id:number, text:string, createdAt:string }
let nextId = 1;

// --- CRUD routes ---
// CREATE  (POST /api/messages)
app.post('/api/messages', (req, res) => { 
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'text is required'});
    }
    // create message
    const msg = { id: nextId++, text: text.trim(), createdAt: new Date().toISOString() };
    messages.push(msg);
    res.status(201).json(msg);
    console.log('Messages:', messages);
    // Limit to last 10 messages
    if (messages.length > 10) {
        messages.shift();
    }
});

// READ    (GET /api/messages)
app.get('/api/messages', (req, res) => { 
    res.json(messages);
});
// READ    (GET /api/messages/:id)
app.get('/api/messages/:id', (req, res) => {
    const id = Number(req.params.id);
    const msg = messages.find(m => m.id === id);
    if (!msg) 
        return res.status(404).json({ error: 'Message not found' });
    res.json(msg);
});
// UPDATE  (PUT /api/messages/:id
app.put('/api/messages/:id', (req, res) => {  
    const id = Number(req.params.id);
    const { text } = req.body;
    if (typeof text !== 'string' || !text.trim()) {
        return res.status(400).json({ error: 'text is required'});
    }
    const idx = messages.findIndex(m => m.id === id);
    if (idx === -1)
        return res.status(404).json({ error: 'Message not found' });
    messages[idx].text = text.trim();
    res.json(messages[idx]);
});
// DELETE  (DELETE /api/messages/:id)
app.delete('/api/messages/:id', (req, res) => { 
    const id = Number(req.params.id);
    const idx = messages.findIndex(m => m.id === id);
    if (idx === -1)
        return res.status(404).json({ error: 'Message not found' });
    const deleted = messages.splice(idx, 1);
    res.json(deleted);
});

// --- create HTTP + socket.io server ---
const server = http.createServer(app);
const io = new Server(server);

// --- Dialogflow setup ---
const projectId = 'agent-smith-y9ld'; // from Dialogflow agent settings
const sessionClient = new dialogflow.SessionsClient({
    keyFilename: __dirname + '/dialogflow-key.json',
});

// --- socket events ---
io.on('connection', (socket) => {
    console.log('[server] client connected', socket.id);
    const sessionId = uuidv4();

socket.on('chat message', async (text) => {
    console.log('[server] received:', text);
    try {
    const sessionPath = sessionClient.projectAgentSessionPath(projectId, sessionId);
    const request = {
        session: sessionPath,
        queryInput: {
        text: { text, languageCode: 'en-US' },
        },
    };
        const [response] = await sessionClient.detectIntent(request);
        const result = response.queryResult;

        const botReply = result.fulfillmentText || '(no reply)'; // fallback so you see *something*
        console.log('[server] replying:', botReply);
        socket.emit('bot reply', botReply);
    } catch (error) {
        console.error('Dialogflow error (full):', error)
        console.error('Dialogflow error:', error.message);
        socket.emit('bot reply', 'Sorry, I had trouble understanding that.');
    }
    });
});

// --- Google Cloud TTS setup ---
const ttsClient = new textToSpeech.TextToSpeechClient({
  keyFilename: __dirname + '/dialogflow-key.json', // same key file you already use
});

app.post('/api/tts', async (req, res) => {
try {
    const { text } = req.body;
    
    const [response] = await ttsClient.synthesizeSpeech({
    input: { text },
      // 👇 choose the exact voice you like from Dialogflow console
    voice: { languageCode: 'en-US', name: 'en-US-Wavenet-D' },
    audioConfig: { audioEncoding: 'MP3' },
    });

    res.json({ audioContent: response.audioContent.toString('base64') });
} catch (err) {
    console.error('TTS error:', err.message);
    res.status(500).json({ error: 'TTS failed' });
}
});


// --- start server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
