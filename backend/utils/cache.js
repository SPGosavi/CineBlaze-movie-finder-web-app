import NodeCache from 'node-cache';

// Initialize Cache (Standard TTL: 1 hour = 3600 seconds)
const cache = new NodeCache({ stdTTL: 3600 });

export default cache;