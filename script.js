let db = null;

function initFirebase() {
    if (!window.firebase || !window.firebaseConfig) return;

    const config = window.firebaseConfig || {};
    const hasRealConfig = config.projectId && config.projectId !== 'demo-avaro' && config.apiKey && config.apiKey !== 'demo-key';

    if (!hasRealConfig) {
        return;
    }

    if (!firebase.apps.length) {
        firebase.initializeApp(config);
    }

    db = firebase.firestore();

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        try {
            db.useEmulator('localhost', 8080);
        } catch (error) {
            console.warn('Firestore emulator not available, continuing with Firebase cloud.', error);
        }
    }
}

function saveSubmission(collectionName, payload) {
    const storageKey = `${collectionName}-submissions`;
    const existing = JSON.parse(localStorage.getItem(storageKey) || '[]');
    existing.push({ ...payload, createdAt: new Date().toISOString() });
    localStorage.setItem(storageKey, JSON.stringify(existing));
}

async function saveToFirestore(collectionName, payload) {
    if (!db) throw new Error('Firebase is not configured for this site.');
    const reference = await db.collection(collectionName).add({
        ...payload,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    return { id: reference.id, ...payload };
}

async function createBookingInFirestore(payload) {
    const snapshot = await db.collection('bookings')
        .where('date', '==', payload.date)
        .where('time', '==', payload.time)
        .get();
    const occupied = new Set();
    snapshot.forEach((document) => {
        const booking = document.data();
        if (booking.status !== 'cancelled') (booking.seats || []).forEach((seat) => occupied.add(Number(seat)));
    });
    const guests = Number(payload.guests) || 1;
    const seats = [];
    for (let seat = 1; seat <= 40 && seats.length < guests; seat += 1) {
        if (!occupied.has(seat)) seats.push(seat);
    }
    if (seats.length !== guests) throw new Error(`No available seats remain for ${payload.date} at ${payload.time}.`);

    const booking = {
        ...payload,
        id: `AV-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        guests,
        seats,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('bookings').doc(booking.id).set(booking);
    return booking;
}

initFirebase();

// ==================== MOBILE MENU TOGGLE ====================
const hamburger = document.querySelector('.hamburger');
const navMenu = document.querySelector('.nav-menu');
const navLinks = document.querySelectorAll('.nav-link');

hamburger.addEventListener('click', () => {
    navMenu.classList.toggle('active');
    hamburger.classList.toggle('active');
});

// Close menu when a link is clicked
navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navMenu.classList.remove('active');
        hamburger.classList.remove('active');
    });
});

// ==================== MODAL FUNCTIONALITY ====================
const bookingModal = document.getElementById('booking-modal');
const closeModal = document.querySelector('.close-modal');

// Open modal when "Book Your Table" button is clicked
document.addEventListener('click', (e) => {
    if (e.target.textContent.includes('Book Your Table') || e.target.textContent.includes('Book Now')) {
        bookingModal.style.display = 'flex';
    }
});

// Close modal
closeModal.addEventListener('click', () => {
    bookingModal.style.display = 'none';
});

// ==================== ASSISTANT WIDGET ====================
const assistantToggle = document.querySelector('.assistant-toggle');
const assistantPanel = document.querySelector('.assistant-panel');
const assistantClose = document.querySelector('.assistant-close');
const assistantForm = document.querySelector('#assistant-form');
const assistantInput = document.querySelector('#assistant-input');
const assistantMessages = document.querySelector('.assistant-messages');

function appendAssistantMessage(role, text) {
    const message = document.createElement('div');
    message.className = `assistant-message ${role}`;
    message.textContent = text;
    assistantMessages.appendChild(message);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;
}

assistantToggle.addEventListener('click', () => {
    assistantPanel.classList.toggle('open');
    assistantInput.focus();
});

assistantClose.addEventListener('click', () => {
    assistantPanel.classList.remove('open');
});

assistantForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const prompt = assistantInput.value.trim();
    if (!prompt) return;

    appendAssistantMessage('user', prompt);
    assistantInput.value = '';
    assistantInput.disabled = true;

    const loadingMessage = document.createElement('div');
    loadingMessage.className = 'assistant-message assistant';
    loadingMessage.textContent = 'Thinking...';
    assistantMessages.appendChild(loadingMessage);
    assistantMessages.scrollTop = assistantMessages.scrollHeight;

    try {
        let result;
        try {
            const response = await fetch('/api/assistant', {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
            });
            result = await response.json();
        } catch (error) {
            const bookingRequest = /(book|booking|reserve|reservation|table|seat)/i.test(prompt);
            result = { success: true, assistant: bookingRequest ? 'I can help you reserve a table.' : 'Ask me about reservations, menu highlights, or opening times.' };
        }
        loadingMessage.remove();

        if (!result.success) {
            appendAssistantMessage('assistant', 'Sorry, I could not get an answer right now. Please try again later.');
            showNotification(result.message || 'Assistant request failed.', 'error');
            return;
        }

        if (/(book|booking|reserve|reservation|table|seat)/i.test(prompt)) {
            bookingModal.style.display = 'flex';
            appendAssistantMessage('assistant', `${result.assistant || 'I can help you reserve a table.'} Please complete the booking form that just opened.`);
        } else {
            appendAssistantMessage('assistant', result.assistant || 'I am here to help with your reservation and menu questions.');
        }
    } catch (error) {
        loadingMessage.remove();
        appendAssistantMessage('assistant', 'Unable to connect to the assistant. Please ensure Ollama is running locally.');
        showNotification('Assistant service unavailable. Start Ollama and try again.', 'error');
        console.error(error);
    } finally {
        assistantInput.disabled = false;
        assistantInput.focus();
    }
});

assistantPanel.addEventListener('click', (e) => {
    e.stopPropagation();
});

document.addEventListener('click', (e) => {
    if (!assistantPanel.contains(e.target) && !assistantToggle.contains(e.target)) {
        assistantPanel.classList.remove('open');
    }
});

// Close modal when clicking outside of it
window.addEventListener('click', (e) => {
    if (e.target === bookingModal) {
        bookingModal.style.display = 'none';
    }
});

// ==================== FORM VALIDATION ====================
const contactForm = document.getElementById('contact-form');
const bookingForm = document.getElementById('booking-form');

// Contact form validation
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const name = document.getElementById('name').value.trim();
        const email = document.getElementById('email').value.trim();
        const phone = document.getElementById('phone').value.trim();
        const message = document.getElementById('message').value.trim();

        if (!name || !email || !phone || !message) {
            showNotification('Please fill in all fields', 'error');
            return;
        }

        if (!isValidEmail(email)) {
            showNotification('Please enter a valid email', 'error');
            return;
        }

        if (!isValidPhone(phone)) {
            showNotification('Please enter a valid phone number', 'error');
            return;
        }

        try {
            let result;
            if (db) {
                await saveToFirestore('contactMessages', { name, email, phone, message, status: 'new' });
                result = { message: 'Thanks! We will get back to you shortly.' };
            } else {
                const response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone, message }) });
                result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || 'Unable to send message right now.');
            }

            showNotification(result.message || 'Thanks! We will get back to you shortly.', 'success');
            contactForm.reset();
        } catch (error) {
            console.error(error);
            showNotification(error.message || 'Unable to send message right now. Please try again later.', 'error');
        }
    });
}

// Booking form validation
if (bookingForm) {
    bookingForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(bookingForm);
        const payload = Object.fromEntries(formData.entries());
        const { name, email, phone, date, time, guests } = payload;

        if (!name || !email || !phone || !date || !time || !guests) {
            showNotification('Please fill in all booking details', 'error');
            return;
        }

        if (!isValidEmail(email)) {
            showNotification('Please enter a valid email', 'error');
            return;
        }

        if (!isValidPhone(phone)) {
            showNotification('Please enter a valid phone number', 'error');
            return;
        }

        try {
            let result;
            if (db) {
                result = { booking: await createBookingInFirestore(payload), message: 'Booking request received! We will confirm it soon.' };
            } else {
                const response = await fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.message || 'Unable to process your booking at the moment.');
            }

            const assignedSeats = result.booking?.seats ? ` Seats assigned: ${result.booking.seats.join(', ')}` : '';
            showNotification(`${result.message || 'Booking request received! We will confirm it soon.'}${assignedSeats}`, 'success');
            bookingForm.reset();
            bookingModal.style.display = 'none';
        } catch (error) {
            console.error(error);
            showNotification(error.message || 'Unable to process your booking at the moment. Please try again later.', 'error');
        }
    });
}

// ==================== EMAIL VALIDATION ====================
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ==================== PHONE VALIDATION ====================
function isValidPhone(phone) {
    // Accepts international format or just digits
    const phoneRegex = /^[\d\s\-\+\(\)]{10,}$/;
    return phoneRegex.test(phone);
}

// ==================== NOTIFICATION SYSTEM ====================
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 1rem 1.5rem;
        background-color: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        color: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        z-index: 3000;
        animation: slideInRight 0.3s ease;
        max-width: 400px;
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ==================== SMOOTH SCROLLING ====================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    });
});

// ==================== ACTIVE NAV LINK ON SCROLL ====================
window.addEventListener('scroll', () => {
    let current = '';
    const sections = document.querySelectorAll('section');

    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        const sectionHeight = section.clientHeight;
        if (scrollY >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });

    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').slice(1) === current) {
            link.classList.add('active');
        }
    });
});

// ==================== NAVBAR BACKGROUND ON SCROLL ====================
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    if (window.scrollY > 50) {
        navbar.style.backgroundColor = 'rgba(255, 248, 243, 0.98)';
        navbar.style.boxShadow = '0 2px 20px rgba(255, 107, 53, 0.15)';
    } else {
        navbar.style.backgroundColor = 'rgba(255, 248, 243, 0.98)';
        navbar.style.boxShadow = '0 2px 20px rgba(255, 107, 53, 0.1)';
    }
});

// ==================== HERO PARALLAX EFFECT ====================
const heroSection = document.querySelector('.hero');
if (heroSection) {
    heroSection.addEventListener('mousemove', (e) => {
        const x = (e.clientX - window.innerWidth / 2) / 30;
        const y = (e.clientY - window.innerHeight / 2) / 30;
        heroSection.style.backgroundPosition = `calc(50% + ${x}px) calc(50% + ${y}px)`;
    });

    heroSection.addEventListener('mouseleave', () => {
        heroSection.style.backgroundPosition = 'center';
    });
}

// ==================== SCROLL ANIMATIONS ====================
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe menu cards, testimonials, and other elements for animation
document.querySelectorAll('.menu-card, .testimonial-card, .offer-card, .gallery-slide, .choose-card').forEach(el => {
    el.style.opacity = '0';
    observer.observe(el);
});

// ==================== CAROUSEL SCROLLING ====================
function initCarousel(carouselEl, prevBtn, nextBtn, interval = 5000) {
    if (!carouselEl) return;

    const slideAmount = Math.min(carouselEl.clientWidth * 0.88, 500);

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            carouselEl.scrollBy({ left: -slideAmount, behavior: 'smooth' });
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            carouselEl.scrollBy({ left: slideAmount, behavior: 'smooth' });
        });
    }

    let autoScroll = null;

    const startAutoScroll = () => {
        clearInterval(autoScroll);
        autoScroll = setInterval(() => {
            if (carouselEl.scrollWidth - carouselEl.scrollLeft <= carouselEl.clientWidth + 10) {
                carouselEl.scrollTo({ left: 0, behavior: 'smooth' });
            } else {
                carouselEl.scrollBy({ left: slideAmount, behavior: 'smooth' });
            }
        }, interval);
    };

    const stopAutoScroll = () => clearInterval(autoScroll);

    startAutoScroll();
    carouselEl.addEventListener('mouseenter', stopAutoScroll);
    carouselEl.addEventListener('mouseleave', startAutoScroll);
}

initCarousel(document.querySelector('.gallery-slider'), document.querySelector('.gallery-prev'), document.querySelector('.gallery-next'), 5000);
initCarousel(document.querySelector('.choose-carousel'), null, null, 4500);
initCarousel(document.querySelector('.testimonial-carousel'), document.querySelector('.testimonial-prev'), document.querySelector('.testimonial-next'), 5200);
initCarousel(document.querySelector('.offers-carousel'), null, null, 4700);

// ==================== GALLERY LIGHTBOX (OPTIONAL ENHANCEMENT) ====================
document.querySelectorAll('.gallery-slide').forEach(item => {
    item.addEventListener('click', function() {
        // Optional gallery lightbox can be added here
        console.log('Gallery item clicked');
    });
});

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    console.log('Avaro Restaurant Website Loaded');
    
    // Add keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC key closes modal
        if (e.key === 'Escape') {
            bookingModal.style.display = 'none';
            navMenu.classList.remove('active');
        }
    });
});

// ==================== UTILITY: Add CSS Animation ====================
const style = document.createElement('style');
style.textContent = `
    @keyframes slideInRight {
        from {
            opacity: 0;
            transform: translateX(100px);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }

    @keyframes slideOutRight {
        from {
            opacity: 1;
            transform: translateX(0);
        }
        to {
            opacity: 0;
            transform: translateX(100px);
        }
    }

    .nav-link.active {
        color: var(--accent-gold);
    }

    .nav-link.active:after {
        width: 100%;
    }
`;
document.head.appendChild(style);

// ==================== SERVICE WORKER (OPTIONAL) ====================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Uncomment to enable service worker
        // navigator.serviceWorker.register('sw.js');
    });
}
