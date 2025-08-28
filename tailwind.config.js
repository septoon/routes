/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}","./public/index.html"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        primary: "#0C61FD"
      }
    }
  },
  plugins: [],
};
