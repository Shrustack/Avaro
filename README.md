# 🍽️ AVARO - Premium Restaurant Website

A modern, responsive, conversion-focused website for **Avaro**, a premium dining restaurant in Delhi, India.

## 📁 Project Structure

```
Avaro/
├── index.html          # Main HTML file with all sections
├── styles.css          # Complete responsive styling
├── script.js           # JavaScript for interactivity
└── README.md           # This file
```

## ✨ Features

### 🎯 Core Sections
- **Hero Section** - Eye-catching banner with CTAs (Book Table / Order on WhatsApp)
- **Menu Section** - 6 culinary categories with icons and pricing
- **About Section** - Restaurant story and why choose us
- **Gallery Section** - Grid layout with hover zoom effects (8 placeholders)
- **Testimonials** - Customer reviews with 5-star ratings
- **Special Offers** - Promotional deals with CTAs
- **Booking CTA** - Prominent reservation call-to-action
- **Contact Section** - Contact info, form, and Google Maps embed
- **Footer** - Navigation, social links, and copyright

### 🎨 Design Features
✅ **Dark Theme** - Premium black, gold, and warm tones
✅ **Premium Typography** - Playfair Display (headings) + Lato (body)
✅ **Smooth Animations** - Fade-ins, hover effects, bounce animations
✅ **Mobile-First Design** - Fully responsive (480px, 768px, desktop)
✅ **Sticky Navbar** - Fixed navigation with smooth scroll
✅ **Floating WhatsApp Button** - Always accessible for orders
✅ **Form Validation** - Email, phone number validation
✅ **Modal Booking** - Popup reservation form
✅ **Scroll Animations** - Elements fade in as you scroll

## 🚀 Quick Start

1. **Open the Website**
   - Simply open `index.html` in your web browser
   - No build process or dependencies needed

2. **Live Preview**
   - Use VS Code's Live Server extension:
     - Right-click `index.html` → "Open with Live Server"
   - Or open: `file:///path/to/Avaro/index.html`

3. **Run with Local Backend and Ollama**
   - Install dependencies:
     ```bash
     npm install
     ```
   - Start Ollama locally with a model you have installed, for example:
     ```bash
     ollama serve llama2
     ```
   - Start the backend server:
     ```bash
     npm start
     ```
   - Open `http://localhost:3000`

## 🤖 Avaro AI Assistant

This project includes a local assistant widget powered by Ollama. Once Ollama is running locally, use the chat widget in the bottom right corner to ask about:

- menu recommendations
- reservation availability
- special offers
- restaurant timings

If Ollama is not running, the assistant will show an error message and prompt you to start the local model.
## � Firebase Hosting Setup

This project is now ready for Firebase Hosting.

1. Install Node.js if you don't already have it.
2. Install Firebase CLI globally:
   ```bash
   npm install -g firebase-tools
   ```
3. Login to Firebase:
   ```bash
   firebase login
   ```
4. Initialize hosting (run from the project root):
   ```bash
   firebase init hosting
   ```
   - Choose an existing Firebase project or create a new one
   - Set the public directory to `.`
   - Answer `No` to rewriting all URLs to `index.html` unless you want SPA routing
5. Deploy your site:
   ```bash
   firebase deploy
   ```

The project includes `firebase.json` and `.firebaserc` so hosting is already configured.

## �📱 Responsive Breakpoints

| Device | Width | Optimized |
|--------|-------|-----------|
| Mobile | < 480px | ✅ Yes |
| Tablet | 480px - 768px | ✅ Yes |
| Desktop | > 768px | ✅ Yes |

## 🎯 Conversion Optimization

✅ **Two Prominent CTAs**
- "Book Your Table" (Primary - Gold button)
- "Order on WhatsApp" (Secondary - WhatsApp green)

✅ **Floating WhatsApp Button**
- Always visible for quick contact
- Bouncing animation to draw attention

✅ **Modal Booking Form**
- Captures: Name, Email, Phone, Date, Time, Guest Count
- Form validation and confirmation message

✅ **Contact Form**
- Multiple ways to get in touch
- All fields validated

✅ **Soft CTAs**
- Special Offers with "Claim" buttons
- Menu cards with pricing
- Gallery and testimonials build trust

## 🎨 Color Scheme

```
Primary Dark:    #0F0F0F (Almost Black)
Secondary Dark:  #1A1A1A (Dark Gray)
Accent Gold:     #D4AF37 (Premium Gold)
Accent Light:    #F4A261 (Warm Orange)
Text Light:      #F5F5F5 (Off-white)
Text Muted:      #B0B0B0 (Gray)
Success:         #4CAF50 (Green)
WhatsApp:        #25D366 (Green)
```

## 🔧 Customization Guide

### Change Restaurant Details
Edit in `index.html`:
```html
<!-- Navigation Logo -->
<span>AVARO</span>

<!-- Hero Section -->
<h1>Experience Flavours Like Never Before</h1>

<!-- Contact Info -->
<p>+91 98765 43210</p>
<p>hello@avaro.com</p>
<p>Connaught Place, New Delhi, India</p>

<!-- WhatsApp Number -->
<a href="https://wa.me/919876543210">
```

### Add Real Images
Replace placeholder divs with actual images:
```html
<!-- Before -->
<div class="placeholder-image">
    <i class="fas fa-image"></i>
</div>

<!-- After -->
<img src="path/to/image.jpg" alt="Dish Name">
```

### Update Colors
Modify CSS variables in `styles.css`:
```css
:root {
    --accent-gold: #D4AF37;      /* Change primary color */
    --accent-light: #F4A261;     /* Change secondary color */
    /* ... other colors ... */
}
```

### Add Google Maps Location
Replace the embed code in the Contact section:
```html
<iframe src="https://www.google.com/maps/embed?pb=YOUR_EMBED_CODE">
</iframe>
```

## 📧 Form Integration

### Backend Integration
Currently, forms show a success notification. To integrate with a backend:

**Contact Form:**
```javascript
// In script.js, modify contactForm submission
fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, phone, message })
})
```

**Booking Form:**
```javascript
// Similar implementation for /api/booking
```

## 🔐 Security Tips

- Add CSRF protection on backend
- Sanitize all form inputs
- Use HTTPS in production
- Never expose API keys in frontend

## 📊 Performance Optimizations

✅ CSS Grid and Flexbox for efficient layouts
✅ CSS animations instead of JavaScript
✅ Intersection Observer for scroll animations
✅ Minimal JavaScript for fast loading
✅ Font Awesome icons (lightweight SVG/font)

**Lighthouse Score Targets:**
- Performance: 90+
- Accessibility: 95+
- Best Practices: 95+
- SEO: 100

## 🌐 SEO Enhancements

- Semantic HTML5 structure
- Meta tags for sharing (add to `<head>`)
- Heading hierarchy (H1, H2, H3)
- Alt text for images (update as needed)
- Mobile-responsive viewport

### Add Meta Tags
```html
<meta name="description" content="Premium fine dining at Avaro in Delhi">
<meta name="keywords" content="restaurant, dining, Delhi, Indian food">
<meta property="og:title" content="Avaro - Premium Dining">
<meta property="og:image" content="path/to/preview-image.jpg">
```

## 🎬 Browser Compatibility

✅ Chrome/Edge (Latest)
✅ Firefox (Latest)
✅ Safari (Latest)
✅ Mobile Browsers (iOS Safari, Chrome Mobile)

## 📱 Mobile Enhancements

- Hamburger menu for mobile navigation
- Touch-friendly buttons (60px minimum)
- Optimized font sizes
- Stacked layout on small screens
- Floating WhatsApp button always accessible

## 💾 Deployment

### GitHub Pages
1. Push to GitHub repository
2. Enable GitHub Pages in settings
3. Access at: `https://username.github.io/Avaro`

### Netlify
1. Connect GitHub repository
2. Build command: (none - static site)
3. Publish directory: `/`
4. Deploy!

### Traditional Hosting
1. Upload files via FTP
2. Ensure `index.html` is in root
3. Access via your domain

## 🚀 Next Steps

1. **Replace Placeholder Images**
   - Add actual food and restaurant photos
   - Use high-quality images (compress for web)

2. **Connect WhatsApp Business**
   - Update phone number in links
   - Set up WhatsApp Business API

3. **Integrate Booking System**
   - Connect to restaurant management system
   - Add email confirmations
   - Implement calendar availability

4. **Add Analytics**
   ```html
   <!-- Add Google Analytics -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>
   ```

5. **Social Media Integration**
   - Update social links in footer
   - Add Instagram feed widget
   - Enable social sharing

## 📞 Support

For questions or improvements:
- Review the inline comments in code files
- Check CSS variable definitions
- Test on multiple devices

## 📄 License

This website template is ready for use by Avaro Restaurant.

---

## 🎯 Success Metrics

Track these KPIs to measure success:

| Metric | Target |
|--------|--------|
| Page Load Time | < 3s |
| Mobile Conversion Rate | > 5% |
| Bounce Rate | < 40% |
| Time on Site | > 2min |
| WhatsApp CTR | > 8% |
| Booking Form Completion | > 60% |

---

**Built with ❤️ for Avaro - Premium Dining Experience**
