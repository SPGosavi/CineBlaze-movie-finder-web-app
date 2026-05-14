import express from 'express';
import cors from 'cors';
import apiRoutes from './routes/api.js';

const app = express();

app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

app.use('/api', apiRoutes);

const PORT = process.env.PORT || 8000;

app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

const server = app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://127.0.0.1:${PORT}`));

const shutdown = () => {
    server.close(() => {
        console.log('Server closed cleanly');
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
