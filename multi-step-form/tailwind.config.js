/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			jakarta: ['"Plus Jakarta Sans"', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
  		},
  		boxShadow: {
  			card: '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 10px 25px -5px rgba(0, 0, 0, 0.04), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
  			glow: '0 8px 25px rgba(25,118,210,0.3)'
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			jfu: {
  				primary: '#1976D2',
  				light: '#42A5F5',
  				dark: '#1565C0',
  				sky: '#0091ff',
  				bg: '#f8fafc'
  			},
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		keyframes: {
  			'accordion-down': {
  				from: { height: '0' },
  				to: { height: 'var(--radix-accordion-content-height)' }
  			},
  			'accordion-up': {
  				from: { height: 'var(--radix-accordion-content-height)' },
  				to: { height: '0' }
  			},
  			'fade-in': {
  				from: { opacity: '0', transform: 'translateY(4px)' },
  				to: { opacity: '1', transform: 'none' }
  			},
  			'smooth-step-in': {
  				'0%': { opacity: '0', transform: 'translateY(8px) scale(0.995)' },
  				'100%': { opacity: '1', transform: 'translateY(0) scale(1)' }
  			},
  			'slide-left-in': {
  				'0%': { opacity: '0', transform: 'translateX(24px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			},
  			'slide-right-in': {
  				'0%': { opacity: '0', transform: 'translateX(-24px)' },
  				'100%': { opacity: '1', transform: 'translateX(0)' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'fade-in': 'fade-in 0.2s ease-out',
  			'smooth-step-in': 'smooth-step-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
  			'slide-left-in': 'slide-left-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
  			'slide-right-in': 'slide-right-in 0.28s cubic-bezier(0.16, 1, 0.3, 1)'
  		}
  	}
  },
  plugins: [],
}
