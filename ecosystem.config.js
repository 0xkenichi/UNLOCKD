module.exports = {
    apps: [
        {
            name: "vestra-api",
            script: "./backend/server.js",
            env: { NODE_ENV: "production" }
        },
        {
            name: "vestra-asi",
            script: "./scripts/omega-agent/mettaclaw.js",
            watch: ["./scripts/omega-agent/brain"], // Restart if you change MeTTa logic
            autorestart: true,
            restart_delay: 4000
        }
    ]
};