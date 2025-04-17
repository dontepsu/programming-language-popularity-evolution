import { defineConfig } from 'vite';


export default defineConfig(({ mode }) => {
    const isProd = mode === 'production';

    return {
        base: '/programming-language-popularity-evolution/',
        // include GA to prod
        plugins: [{
            name: 'html-transform',
            apply: 'build',
            transformIndexHtml: (html) => {
                if (!isProd) return html;

                return html.replace(
                    '</head>',
`
    <!-- Google tag (gtag.js) -->
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-GZ1MFBJB3W"></script>
    <script>
        window.dataLayer = window.dataLayer || [];
        function gtag() { dataLayer.push(arguments); }
        gtag('js', new Date());

        gtag('config', 'G-GZ1MFBJB3W');
    </script>
</head>
`,
                );
            }
        }]
    }
});

