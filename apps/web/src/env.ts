/** Build-time settings, set through VITE_* variables (see docker-compose.yaml and .env.example). */
const DEFAULT_BACKEND_URL = 'http://localhost:5000';

export const API_URL: string = import.meta.env.VITE_API_URL || DEFAULT_BACKEND_URL;
export const WS_URL: string = import.meta.env.VITE_WS_URL || DEFAULT_BACKEND_URL;
