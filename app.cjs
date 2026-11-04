// Startup file for cPanel "Setup Node.js App" (Phusion Passenger).
// Passenger loads CommonJS entry points, so this simply starts the ESM server.
// Set SERVE_DIST=1 in the app's environment variables so it also serves the built website.
import('./server/index.mjs');
