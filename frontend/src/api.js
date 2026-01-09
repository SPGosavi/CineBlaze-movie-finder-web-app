import axios from 'axios';

const API_BASE_URL =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5001/api'
    : 'https://cineblaze-backend.onrender.com/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000
});

export default api;
