/** Configurazione Tailwind: `npm run build:css` genera css/app.css. */
export default {
    content: ['./index.html', './js/**/*.js'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Viola del logo (#A040F0).
                brand: { 50: '#faf5ff', 100: '#f3e8ff', 200: '#e9d5ff', 300: '#d8b4fe', 400: '#c084fc', 500: '#a040f0', 600: '#8b2fd6', 700: '#7322b8', 800: '#5b1a91', 900: '#4a1577', 950: '#2e0a4f' }
            }
        }
    }
};
