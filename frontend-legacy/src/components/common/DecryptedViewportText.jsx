import React, { useEffect, useRef, useState } from 'react';

/**
 * DecryptedViewportText
 * 
 * An experimental typography component that encrypts its content (using Corrupted Terminal/Glitch)
 * when outside the main viewport, and dynamically decrypts it into a clean, technical font 
 * when scrolled into the middle of the screen.
 * 
 * @param {string} text - The original text to display
 * @param {string} decryptedClass - The CSS class for the readable font (e.g., 'font-decrypted')
 * @param {string} encryptedClass - The CSS class for the encrypted font (e.g., 'font-encrypted')
 * @param {string} rootMargin - The intersection margin controlling where decryption occurs.
 */
const DecryptedViewportText = ({
    text,
    decryptedClass = 'font-decrypted text-emerald-400',
    encryptedClass = 'font-encrypted text-slate-500 opacity-60',
    rootMargin = '-35% 0px -35% 0px',
    className = ''
}) => {
    const [isDecrypted, setIsDecrypted] = useState(false);
    const containerRef = useRef(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            ([entry]) => {
                // Decrypt only when intersecting the defined root margin (middle of screen)
                setIsDecrypted(entry.isIntersecting);
            },
            {
                root: null, // viewport
                rootMargin: rootMargin,
                threshold: 0.1, // trigger as soon as 10% enters the zone
            }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => {
            if (containerRef.current) {
                observer.unobserve(containerRef.current);
            }
        };
    }, [rootMargin]);

    return (
        <span
            ref={containerRef}
            className={`inline-block transition-all duration-300 ${isDecrypted ? decryptedClass : encryptedClass} ${className}`}
            style={!isDecrypted ? {
                // Apply optional glitching effects via inline styles when encrypted to really sell the terminal aesthetic
                letterSpacing: '0.05em',
                // Optional: add text shadow for chromatic aberration if you want
            } : {
                letterSpacing: '0',
            }}
        >
            {/* We could also scramble the actual letters here using a state interval if we want absolute madness, 
                but applying an aggressive encrypted font class does the heavy lifting instantly. */}
            {text}
        </span>
    );
};

export default DecryptedViewportText;
