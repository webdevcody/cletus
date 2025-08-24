// Theme detection and management utility
export function initializeTheme() {
  const updateTheme = () => {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const htmlElement = document.documentElement
    
    if (isDark) {
      htmlElement.classList.add('dark')
    } else {
      htmlElement.classList.remove('dark')
    }
  }
  
  // Set initial theme
  updateTheme()
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateTheme)
}