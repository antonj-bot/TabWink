import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
export default defineConfig({
	plugins: [react()],
	server: {
		port: 5173,
		proxy: {
			'/ask': 'http://127.0.0.1:8000',
			'/search': 'http://127.0.0.1:8000',
			'/vin': 'http://127.0.0.1:8000',
			'/ocr': 'http://127.0.0.1:8000'
		}
	}
})
