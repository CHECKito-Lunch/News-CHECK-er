/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

const config = {
  darkMode: 'class', // statt 'media'
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      maxWidth: {
        'site': '1980px', // eigener Name
      },
    },
  },
  plugins: [typography],
};

export default config;