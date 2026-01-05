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

// Mount API Routes
app.use('/api', apiRoutes);

const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on http://127.0.0.1:${PORT}`));