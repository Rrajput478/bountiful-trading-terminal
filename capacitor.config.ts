import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bountiful.trading',
  appName: 'Bountiful Trading Terminal',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    // Replace this URL with your actual Render.com deployment URL
    // You can also set it via the REPLACE_RENDER_URL placeholder in workflow
    url: 'https://bountiful-trading-terminal-1.onrender.com',
    cleartext: true, // Allow HTTP for local testing if needed
  },
};

export default config;