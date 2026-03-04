import React, { useEffect, useRef, useState } from 'react';
import Globe from 'react-globe.gl';

export default function GlobalUserMap({ isConnected, onComplete }) {
    const globeRef = useRef();
    const [places, setPlaces] = useState([]);

    useEffect(() => {
        // Generate mock random users across the globe
        const mockPlaces = [...Array(30).keys()].map(() => ({
            lat: (Math.random() - 0.5) * 180,
            lng: (Math.random() - 0.5) * 360,
            size: Math.random() / 3,
            color: '#3b82f6',
        }));
        setPlaces(mockPlaces);
    }, []);

    useEffect(() => {
        if (isConnected) {
            // Fetch user's approx location via a free IP API or just drop a specific pin to simulate it
            fetch('https://ipapi.co/json/')
                .then(res => res.json())
                .then(data => {
                    const userDot = {
                        lat: data.latitude,
                        lng: data.longitude,
                        size: 1,
                        color: '#f1c572',
                        name: 'You'
                    };
                    setPlaces(prev => [...prev, userDot]);

                    if (globeRef.current) {
                        globeRef.current.pointOfView({ lat: data.latitude, lng: data.longitude, altitude: 2 }, 2000);
                    }

                    onComplete({ lat: data.latitude, lng: data.longitude, city: data.city, country: data.country_name });
                })
                .catch(() => {
                    // Fallback location
                    const fallback = { lat: 1.3521, lng: 103.8198, size: 1, color: '#f1c572', name: 'You (Fallback)' };
                    setPlaces(prev => [...prev, fallback]);
                    if (globeRef.current) {
                        globeRef.current.pointOfView({ lat: fallback.lat, lng: fallback.lng, altitude: 2 }, 2000);
                    }
                    onComplete({ lat: 1.3521, lng: 103.8198, city: 'Singapore', country: 'Singapore' });
                });
        }
    }, [isConnected, onComplete]);

    return (
        <div className="demo-globe-container" style={{ height: '400px', width: '100%', position: 'relative' }}>
            {!isConnected && (
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                    <div className="button-group">
                        <p>Please connect your wallet using the header button to enter the protocol.</p>
                    </div>
                </div>
            )}

            <Globe
                ref={globeRef}
                globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
                backgroundColor="rgba(0,0,0,0)"
                pointsData={places}
                pointAltitude="size"
                pointColor="color"
                width={800}
                height={400}
            />
        </div>
    );
}
