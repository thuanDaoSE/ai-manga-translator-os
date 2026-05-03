/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: '#121212',       /* Nền tổng */
        panel: '#1e1e1e',      /* Nền thanh công cụ */
        sidebar: '#1a1a1a',    /* Nền cột trái */
        primary: '#4caf50',    /* Xanh lá */
        secondary: '#2196f3',  /* Xanh dương */
        danger: '#f44336',     /* Đỏ */
        accent: '#9c27b0',     /* Tím Lens */
      }
    },
  },
  plugins: [],
}